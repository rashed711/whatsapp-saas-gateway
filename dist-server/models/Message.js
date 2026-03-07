import mongoose, { Schema } from 'mongoose';
const MessageSchema = new Schema({
    sessionId: { type: String, required: true },
    remoteJid: { type: String, required: true },
    fromMe: { type: Boolean, required: true },
    content: { type: String, required: true }, // v20: Strict String to preserve Baileys Buffers
    timestamp: { type: Number, required: true },
    pushName: { type: String },
    id: { type: String, required: true }
}, {
    timestamps: true
});
// Index for efficient querying by session and chat
MessageSchema.index({ id: 1 }); // v15: Critical for getMessage performance
MessageSchema.index({ sessionId: 1, remoteJid: 1, timestamp: -1 });
// TTL index to automatically delete sent messages after 24 hours (86400 seconds)
MessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
export const Message = mongoose.model('Message', MessageSchema);
