import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '../data');
class FileStorage {
    constructor() {
        this.init();
    }
    async init() {
        try {
            await fs.mkdir(DATA_DIR, { recursive: true });
        }
        catch (error) {
            console.error('Failed to create data directory:', error);
        }
    }
    getFilePath(collection) {
        return path.join(DATA_DIR, `${collection}.json`);
    }
    async readCollection(collection) {
        try {
            const data = await fs.readFile(this.getFilePath(collection), 'utf-8');
            return JSON.parse(data);
        }
        catch (error) {
            return [];
        }
    }
    async writeCollection(collection, data) {
        await fs.writeFile(this.getFilePath(collection), JSON.stringify(data, null, 2));
    }
    async getItems(collection, query = {}) {
        const items = await this.readCollection(collection);
        if (Object.keys(query).length === 0)
            return items;
        return items.filter(item => {
            for (const key in query) {
                if (item[key] !== query[key])
                    return false;
            }
            return true;
        });
    }
    async getItem(collection, query) {
        const items = await this.getItems(collection, query);
        return items.length > 0 ? items[0] : null;
    }
    async saveItem(collection, item) {
        const items = await this.readCollection(collection);
        if (!item._id) {
            item._id = Math.random().toString(36).substr(2, 9);
            item.createdAt = new Date().toISOString();
        }
        item.updatedAt = new Date().toISOString();
        const index = items.findIndex(i => i._id === item._id);
        if (index >= 0) {
            items[index] = { ...items[index], ...item };
        }
        else {
            items.push(item);
        }
        await this.writeCollection(collection, items);
        return item;
    }
    async saveItems(collection, newItems) {
        if (newItems.length === 0)
            return;
        const items = await this.readCollection(collection);
        const now = new Date().toISOString();
        for (const item of newItems) {
            if (!item._id) {
                item._id = Math.random().toString(36).substr(2, 9);
                item.createdAt = now;
            }
            item.updatedAt = now;
            // Check existence based on specific criteria
            let index = -1;
            if (collection === 'contacts') {
                // For contacts, check by 'id' (whatsapp JID) and 'sessionId' to prevent dups
                index = items.findIndex(i => i.id === item.id && i.sessionId === item.sessionId);
                // Merge logic: Don't overwrite existing name if new one is empty
                if (index >= 0) {
                    const existing = items[index];
                    item.name = item.name || existing.name;
                    item.notify = item.notify || existing.notify;
                    // Merge hasMessaged: if true in new or existing, keep it true
                    item.hasMessaged = item.hasMessaged || existing.hasMessaged;
                    // Keep original createdAt
                    item.createdAt = existing.createdAt;
                }
            }
            else if (collection === 'messages') {
                index = items.findIndex(i => i.id === item.id);
            }
            else {
                index = items.findIndex(i => i._id === item._id);
            }
            if (index >= 0) {
                items[index] = { ...items[index], ...item };
            }
            else {
                items.push(item);
            }
        }
        await this.writeCollection(collection, items);
    }
    async deleteItem(collection, query) {
        let items = await this.readCollection(collection);
        const originalLength = items.length;
        items = items.filter(item => {
            for (const key in query) {
                if (item[key] === query[key])
                    return false;
            }
            return true;
        });
        if (items.length !== originalLength) {
            await this.writeCollection(collection, items);
        }
    }
    // Helper specifically for Message sorting/limiting since we removed Mongoose
    async getMessages(sessionId, limit = 50, remoteJid) {
        let messages = await this.readCollection('messages');
        messages = messages.filter(m => m.sessionId === sessionId);
        if (remoteJid) {
            messages = messages.filter(m => m.remoteJid === remoteJid);
        }
        // Sort by timestamp desc
        messages.sort((a, b) => b.timestamp - a.timestamp);
        return messages.slice(0, limit);
    }
    async getContacts(sessionId) {
        const contacts = await this.readCollection('contacts');
        // Return unique contacts for this session that have sent a message
        return contacts.filter(c => c.sessionId === sessionId && c.hasMessaged === true);
    }
}
export const storage = new FileStorage();
