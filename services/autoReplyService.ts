import { storage } from './storage.js';
import { IAutoReply } from '../models/AutoReply.js';

export class AutoReplyService {

    // Create new rule
    static async createRule(data: IAutoReply): Promise<IAutoReply> {
        return await storage.saveItem('autoreplies', { ...data, isActive: true, createdAt: new Date() });
    }

    // Get rules for user
    static async getRules(userId: string): Promise<IAutoReply[]> {
        return await storage.getItems('autoreplies', { userId });
    }

    // Delete rule
    static async deleteRule(id: string, userId: string): Promise<boolean> {
        try {
            await storage.deleteItem('autoreplies', { _id: id, userId });
            return true;
        } catch (e) {
            return false;
        }
    }

    // Toggle status
    static async toggleRule(id: string, userId: string, isActive: boolean): Promise<boolean> {
        const rule = await storage.getItem('autoreplies', { _id: id, userId });
        if (!rule) return false;

        rule.isActive = isActive;
        await storage.saveItem('autoreplies', rule);
        return true;
    }

    /**
     * Core Logic: Check message against rules and return response if match found.
     */
    static async getResponse(userId: string, messageContent: string, sessionId?: string): Promise<string | null> {
        if (!messageContent) return null;

        // 1. Fetch active rules for this user
        // Optimization: In a real DB, we would query { userId, isActive: true } directly.
        // For file storage, we filter in memory.
        const allRules: IAutoReply[] = await storage.getItems('autoreplies', { userId });
        const activeRules = allRules.filter(r => r.isActive);
        console.log(`[AutoReplyService] Found ${activeRules.length} active rules for user ${userId}. Checking against content: "${messageContent}"`);

        const contentLower = messageContent.toLowerCase().trim();

        for (const rule of activeRules) {
            // Optional: Check session binding
            if (rule.sessionId && rule.sessionId !== sessionId) continue;

            const keywordLower = rule.keyword.toLowerCase().trim();

            if (rule.matchType === 'exact') {
                if (contentLower === keywordLower) {
                    return rule.response;
                }
            } else if (rule.matchType === 'contains') {
                if (contentLower.includes(keywordLower)) {
                    return rule.response;
                }
            }
        }

        return null;
    }
}
