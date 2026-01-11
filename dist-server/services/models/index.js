import mongoose from 'mongoose';
// --- User Schema ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Hashed
    name: { type: String },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });
export const User = mongoose.model('User', userSchema);
// --- Session Schema ---
const sessionSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true }, // sess_...
    userId: { type: String, required: true }, // Link to User._id (stored as string in this app logic)
    name: { type: String },
    status: { type: String, default: 'IDLE' }, // IDLE, QR, CONNECTED
    // We don't store socket object here
}, { timestamps: true });
export const Session = mongoose.model('Session', sessionSchema);
// --- Contact Schema ---
const contactSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, index: true },
    id: { type: String, required: true }, // JID (phone@s.whatsapp.net)
    name: { type: String }, // Saved Name
    notify: { type: String }, // Push Name
    verifiedName: { type: String },
    hasMessaged: { type: Boolean, default: false }
}, { timestamps: true });
// Compound unique index: Prevent duplicates per session
contactSchema.index({ sessionId: 1, id: 1 }, { unique: true });
export const Contact = mongoose.model('Contact', contactSchema);
// --- Message Schema ---
const messageSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, index: true },
    remoteJid: { type: String, required: true, index: true },
    id: { type: String, required: true }, // Message ID
    fromMe: { type: Boolean, required: true },
    timestamp: { type: Number, required: true },
    pushName: { type: String },
    content: { type: Object }, // Raw content object
    status: { type: String }
}, { timestamps: true });
// Index for getting chat history
messageSchema.index({ sessionId: 1, remoteJid: 1, timestamp: -1 });
export const Message = mongoose.model('Message', messageSchema);
export * from './AuthState.js';
