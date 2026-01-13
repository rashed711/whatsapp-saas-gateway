import mongoose, { Schema } from 'mongoose';
const MutedChatSchema = new Schema({
    sessionId: { type: String, required: true, index: true },
    chatId: { type: String, required: true },
    mutedUntil: { type: Date },
    createdAt: { type: Date, default: Date.now }
});
// Compound index for unique mute per chat per session
MutedChatSchema.index({ sessionId: 1, chatId: 1 }, { unique: true });
export const MutedChat = mongoose.model('MutedChat', MutedChatSchema);
