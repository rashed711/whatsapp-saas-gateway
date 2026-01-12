import { storage } from './storage.js';
export class AutoReplyService {
    // Create new rule
    static async createRule(data) {
        return await storage.saveItem('autoreplies', { ...data, isActive: true, createdAt: new Date() });
    }
    // Get rules for user
    static async getRules(userId) {
        return await storage.getItems('autoreplies', { userId });
    }
    // Delete rule
    static async deleteRule(id, userId) {
        try {
            await storage.deleteItem('autoreplies', { _id: id, userId });
            return true;
        }
        catch (e) {
            return false;
        }
    }
    // Toggle status
    static async toggleRule(id, userId, isActive) {
        const rule = await storage.getItem('autoreplies', { _id: id, userId });
        if (!rule)
            return false;
        rule.isActive = isActive;
        await storage.saveItem('autoreplies', rule);
        return true;
    }
    /**
     * Core Logic: Check message against rules and return response if match found.
     */
    static async getResponse(userId, messageContent, sessionId) {
        if (!messageContent)
            return null;
        // 1. Fetch active rules for this user
        // Optimization: In a real DB, we would query { userId, isActive: true } directly.
        // For file storage, we filter in memory.
        const allRules = await storage.getItems('autoreplies', { userId });
        const activeRules = allRules.filter(r => r.isActive);
        const contentLower = messageContent.toLowerCase().trim();
        for (const rule of activeRules) {
            // Optional: Check session binding
            if (rule.sessionId && rule.sessionId !== sessionId)
                continue;
            const keywordLower = rule.keyword.toLowerCase().trim();
            if (rule.matchType === 'exact') {
                if (contentLower === keywordLower) {
                    return rule.response;
                }
            }
            else if (rule.matchType === 'contains') {
                if (contentLower.includes(keywordLower)) {
                    return rule.response;
                }
            }
        }
        return null;
    }
}
