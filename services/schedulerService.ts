import { storage } from './storage.js';
import { SessionService } from './sessionService.js';
import { IScheduledCampaign } from '../models/ScheduledCampaign.js';

export class SchedulerService {
    private static checkInterval: NodeJS.Timeout | null = null;
    private static isProcessing = false;

    // Start the scheduler loop
    static init() {
        if (this.checkInterval) return;

        console.log('Starting Scheduler Service...');

        // precise interval of 1 minute, but we check every 30s to be safe
        this.checkInterval = setInterval(() => {
            this.processDueCampaigns();
        }, 30 * 1000);

        // Initial check on startup
        this.processDueCampaigns();
    }

    // Main Loop: Find pending campaigns that are due
    static async processDueCampaigns() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            const now = new Date();

            // Find campaigns that are 'pending' and time strings are <= now
            // OR 'active' campaigns (in case of server restart)
            const campaigns = await storage.getItems('scheduled_campaigns', {
                status: { $in: ['pending', 'active'] },
                scheduledTime: { $lte: now }
            });

            for (const campaign of campaigns) {
                await this.executeCampaign(campaign);
            }

        } catch (error) {
            console.error('Scheduler Error:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    // Execute a single campaign
    static async executeCampaign(campaign: IScheduledCampaign) {
        console.log(`[Scheduler] Processing Campaign: ${campaign.title} (${campaign._id.toString()})`);

        // Mark as active if pending
        if (campaign.status === 'pending') {
            await storage.saveItem('scheduled_campaigns', { _id: campaign._id, status: 'active' });
            campaign.status = 'active';
        }

        const session = SessionService.getSession(campaign.sessionId);

        // Connection Check
        if (!session || session.engine.currentStatus !== 'CONNECTED') {
            console.warn(`[Scheduler] Session disconnected for campaign ${campaign._id.toString()}. Pausing.`);
            // Optionally pause or retry later. For now, we skip to retry next cycle.
            // If we want to pause:
            // await storage.saveItem('scheduled_campaigns', { _id: campaign._id, status: 'paused' });
            return;
        }

        // Variable Replacer (Same as CampaignService)
        const replaceVariables = (text: string) => {
            if (!text) return text;
            return text.replace(/{{id}}/g, () => Math.floor(Math.random() * 900000 + 100000).toString());
        };

        let processedCount = 0;

        // Iterate recipients
        for (let i = 0; i < campaign.recipients.length; i++) {
            const recipient = campaign.recipients[i];

            // Reload fresh campaign state to check for 'paused' or 'stopped' signal
            const freshCampaign = await storage.getItem('scheduled_campaigns', { _id: campaign._id });
            if (!freshCampaign || freshCampaign.status === 'paused' || freshCampaign.status === 'stopped') {
                console.log(`[Scheduler] Campaign ${campaign._id.toString()} was ${freshCampaign?.status}. Stopping execution.`);
                return; // Stop this loop
            }

            // Skip already processed
            if (recipient.status !== 'pending') continue;

            try {
                // Apply Delay (if not first message in this immediate loop)
                // Note: If resuming, we might want a delay before the first one too.
                if (processedCount > 0) {
                    const delay = Math.floor(Math.random() * (campaign.maxDelay - campaign.minDelay + 1) + campaign.minDelay);
                    await new Promise(resolve => setTimeout(resolve, delay * 1000));
                }

                // Send Message
                const personalizedContent = campaign.messageType === 'text' ? replaceVariables(campaign.content) : campaign.content;
                const personalizedCaption = replaceVariables(campaign.caption || '');

                // Send via Engine
                await session.engine.send(recipient.number, campaign.messageType, personalizedContent, personalizedCaption);

                // Update Local & DB State
                recipient.status = 'sent';
                campaign.progress.sent++;
                processedCount++;

                // We save progress incrementally (e.g. every message or every 5)
                // Saving every message safeguards against crashes best.
                await this.updateRecipientStatus(campaign._id.toString(), i, 'sent');
                await this.updateProgress(campaign._id.toString(), campaign.progress);

            } catch (error: any) {
                console.error(`[Scheduler] Failed to send to ${recipient.number}:`, error.message);
                recipient.status = 'failed';
                recipient.error = error.message;
                campaign.progress.failed++;
                processedCount++;

                await this.updateRecipientStatus(campaign._id.toString(), i, 'failed', error.message);
                await this.updateProgress(campaign._id.toString(), campaign.progress);
            }
        }

        // Completion Check
        const isComplete = campaign.recipients.every(r => r.status !== 'pending');
        if (isComplete) {
            console.log(`[Scheduler] Campaign ${campaign._id} Completed.`);
            await storage.saveItem('scheduled_campaigns', { _id: campaign._id, status: 'completed' });
        }
    }

    // Helper to update specific recipient in array (Atomic-ish)
    static async updateRecipientStatus(campaignId: string, recipientIndex: number, status: string, error?: string) {
        // Mongoose specific update for array item
        const update: any = {};
        update[`recipients.${recipientIndex}.status`] = status;
        if (error) update[`recipients.${recipientIndex}.error`] = error;

        // Use direct mongoose model if possible or storage raw update (not exposed easily)
        // Since storage.saveItem replaces the whole doc or sets fields, we'll just save the whole doc for now.
        // For performance in huge campaigns, we'd use Model.updateOne but for now:
        const campaign = await storage.getItem('scheduled_campaigns', { _id: campaignId });
        if (campaign) {
            campaign.recipients[recipientIndex].status = status;
            if (error) campaign.recipients[recipientIndex].error = error;
            await storage.saveItem('scheduled_campaigns', campaign);
        }
    }

    static async updateProgress(campaignId: string, progress: any) {
        // Optimistic update
        await storage.saveItem('scheduled_campaigns', { _id: campaignId, progress });
    }
}
