import { connectDB } from './db.js';
import { User, Session, Contact, Message } from '../models/index.js';
import { AutoReply } from '../models/AutoReply.js';
class MongoStorage {
    constructor() {
        this.init();
    }
    async init() {
        await connectDB();
    }
    getModel(collection) {
        switch (collection) {
            case 'users': return User;
            case 'sessions': return Session;
            case 'contacts': return Contact;
            case 'messages': return Message;
            case 'autoreplies': return AutoReply;
            default: throw new Error(`Unknown collection: ${collection}`);
        }
    }
    // Convert internal _id to string if needed, or handle mapping
    normalizeItem(item) {
        if (!item)
            return null;
        const obj = item.toObject ? item.toObject() : item;
        // Ensure _id is available as string if needed, but our app mostly uses custom 'id' for contacts/sessions
        // User model uses _id.
        if (obj._id)
            obj._id = obj._id.toString();
        // Remove __v
        delete obj.__v;
        return obj;
    }
    async getItems(collection, query = {}) {
        const Model = this.getModel(collection);
        const items = await Model.find(query).sort({ createdAt: -1 });
        return items.map(this.normalizeItem);
    }
    async getItem(collection, query) {
        const Model = this.getModel(collection);
        const item = await Model.findOne(query);
        return this.normalizeItem(item);
    }
    async saveItem(collection, item) {
        const Model = this.getModel(collection);
        let filter = {};
        if (item._id) {
            filter._id = item._id;
        }
        else if (collection === 'contacts' && item.sessionId && item.id) {
            filter = { sessionId: item.sessionId, id: item.id };
        }
        else if (collection === 'sessions' && item.id) {
            filter = { id: item.id };
        }
        else if (collection === 'users' && item.username) {
            filter = { username: item.username };
        }
        else {
            // New item without ID, just create
            const newItem = await Model.create(item);
            return this.normalizeItem(newItem);
        }
        // Upsert
        const updated = await Model.findOneAndUpdate(filter, item, {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true
        });
        return this.normalizeItem(updated);
    }
    async saveItems(collection, newItems) {
        if (newItems.length === 0)
            return;
        const Model = this.getModel(collection);
        const operations = newItems.map(item => {
            let filter = {};
            // Determine unique filter based on collection logic
            if (collection === 'contacts') {
                filter = { sessionId: item.sessionId, id: item.id };
            }
            else if (collection === 'messages') {
                filter = { sessionId: item.sessionId, id: item.id };
            }
            else if (collection === 'sessions') {
                filter = { id: item.id };
            }
            else if (item._id) {
                filter = { _id: item._id };
            }
            else {
                // If strictly new insert without unique key logic, rely on _id generation
                return { insertOne: { document: item } };
            }
            // For contacts, we want to specific merge logic (preserve name if not present)
            // But bulkWrite doesn't support "calculate then update" easily. 
            // We'll trust Mongoose 'upsert' to merge fields provided in 'item'.
            // WARNING: If 'item' contains only partial fields, findOneAndUpdate with $set is default.
            // But we need to be careful not to unset fields.
            // Our whatsappEngine sends full objects usually, or merged ones.
            // The engine already did some merging. 
            // However, the engine logic `...(c.name ? { name: c.name } : {})` means it might send objects WITHOUT name.
            // Mongoose updateOne with $set will ONLY update provided fields. Perfect.
            return {
                updateOne: {
                    filter: filter,
                    update: { $set: item },
                    upsert: true
                }
            };
        });
        if (operations.length > 0) {
            await Model.bulkWrite(operations);
        }
    }
    async deleteItem(collection, query) {
        const Model = this.getModel(collection);
        await Model.deleteMany(query);
    }
    // Specific Helpers
    async getMessages(sessionId, limit = 50, remoteJid) {
        const query = { sessionId };
        if (remoteJid)
            query.remoteJid = remoteJid;
        const messages = await Message.find(query)
            .sort({ timestamp: -1 })
            .limit(limit);
        return messages.map(this.normalizeItem);
    }
    async getContacts(sessionId) {
        // Return unique contacts for this session that have sent a message
        const contacts = await Contact.find({ sessionId, hasMessaged: true });
        return contacts.map(this.normalizeItem);
    }
}
export const storage = new MongoStorage();
