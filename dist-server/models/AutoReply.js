import mongoose, { Schema } from 'mongoose';
const AutoReplySchema = new Schema({
    userId: { type: String, required: true, index: true },
    sessionId: { type: String, required: false }, // Optional
    keyword: { type: String, required: true },
    matchType: { type: String, enum: ['exact', 'contains'], default: 'exact' },
    response: { type: String, required: true }, // Main text or Caption
    replyType: { type: String, enum: ['text', 'image', 'video', 'audio', 'document'], default: 'text' },
    mediaUrl: { type: String },
    fileName: { type: String },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});
// Compound index to prevent duplicate keywords for the same scope (if desired, but let's keep it flexible for now)
// AutoReplySchema.index({ userId: 1, keyword: 1 }, { unique: true });
export const AutoReply = mongoose.model('AutoReply', AutoReplySchema);
