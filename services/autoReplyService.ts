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

    // Update rule
    static async updateRule(id: string, userId: string, data: Partial<IAutoReply>): Promise<IAutoReply | null> {
        return await storage.saveItem('autoreplies', { ...data, _id: id, userId });
    }

    /**
     * Core Logic: Check message against rules and return response if match found.
     * Supports multiple keywords separated by specific delimiters (comma).
     */
    static async getResponse(userId: string, messageContent: string, sessionId?: string): Promise<string | null> {
        if (!messageContent) return null;

        // 1. Fetch active rules for this user
        const allRules: IAutoReply[] = await storage.getItems('autoreplies', { userId });
        const activeRules = allRules.filter(r => r.isActive);
        console.log(`[AutoReplyService] Found ${activeRules.length} active rules for user ${userId}. Checking against content: "${messageContent}"`);

        const contentLower = messageContent.toLowerCase().trim();

        for (const rule of activeRules) {
            // Optional: Check session binding
            if (rule.sessionId && rule.sessionId !== sessionId) continue;

            // Support multiple keywords split by comma
            // e.g. "hi, hello, welcome" -> ["hi", "hello", "welcome"]
            const keywords = rule.keyword.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);

            for (const kw of keywords) {
                if (rule.matchType === 'exact') {
                    if (contentLower === kw) {
                        return rule.response;
                    }
                } else if (rule.matchType === 'contains') {
                    if (contentLower.includes(kw)) {
                        return rule.response;
                    }
                }
            }
        }

        return null;
    }
}
