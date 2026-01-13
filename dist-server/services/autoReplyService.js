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
    // Update rule
    static async updateRule(id, userId, data) {
        return await storage.saveItem('autoreplies', { ...data, _id: id, userId });
    }
    // ----------------------------------------------------------------
    // UTILS: Smart Arabic Matching
    // ----------------------------------------------------------------
    static normalizeText(text) {
        if (!text)
            return '';
        return text
            .replace(/[أإآ]/g, 'ا')
            .replace(/[ى]/g, 'ي')
            .replace(/[ة]/g, 'ه')
            .replace(/[ً-ْ]/g, '') // Remove Tashkeel
            .toLowerCase();
    }
    static levenshteinDistance(a, b) {
        const matrix = [];
        for (let i = 0; i <= b.length; i++)
            matrix[i] = [i];
        for (let j = 0; j <= a.length; j++)
            matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                }
                else {
                    matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
                }
            }
        }
        return matrix[b.length][a.length];
    }
    static fuzzyContains(text, keyword) {
        // 1. Direct normalized check (Fastest)
        const normText = this.normalizeText(text);
        const normKeyword = this.normalizeText(keyword);
        if (normText.includes(normKeyword))
            return true;
        // 2. Levenshtein Scan (Slower but handles typos like "بيك" vs "بك")
        // Tolerance: 20% of length or 2 chars max
        const threshold = Math.min(2, Math.floor(keyword.length * 0.3) + 1);
        // Scan windows of text
        const len = normKeyword.length;
        for (let i = 0; i < normText.length - len + 3; i++) {
            // Check substrings of varying length (len, len-1, len+1) to catch missing/extra chars
            for (let offset = -1; offset <= 1; offset++) {
                if (len + offset < 2)
                    continue;
                const sub = normText.substr(i, len + offset);
                if (this.levenshteinDistance(sub, normKeyword) <= threshold)
                    return true;
            }
        }
        return false;
    }
    /**
     * Core Logic: Check message against rules and return response if match found.
     * Supports multiple keywords + Fuzzy Matching for Arabic.
     * Returns the FULL rule object to support media types.
     */
    static async getResponse(userId, messageContent, sessionId) {
        if (!messageContent)
            return null;
        const allRules = await storage.getItems('autoreplies', { userId });
        const activeRules = allRules.filter(r => r.isActive);
        const contentLower = messageContent.toLowerCase().trim();
        for (const rule of activeRules) {
            if (rule.sessionId && rule.sessionId !== sessionId)
                continue;
            // Support multiple keywords split by comma
            const keywords = rule.keyword.split(',').map(k => k.trim()).filter(k => k.length > 0);
            for (const kw of keywords) {
                if (rule.matchType === 'exact') {
                    // Strict Exact Match
                    if (contentLower === kw.toLowerCase() || this.normalizeText(contentLower) === this.normalizeText(kw)) {
                        return rule;
                    }
                }
                else if (rule.matchType === 'contains') {
                    // Smart Fuzzy Match
                    if (this.fuzzyContains(messageContent, kw)) {
                        return rule;
                    }
                }
            }
        }
        return null;
    }
}
