
import mongoose, { Schema, Document } from 'mongoose';

export interface IMutedChat extends Document {
    sessionId: string;
    chatId: string;
    mutedUntil?: Date; // If present, muted until this time. If null/undefined but record exists, muted indefinitely? OR use a boolean.
    // Usually "human takeover" implies indefinite until unmuted. 
    createdAt: Date;
}

const MutedChatSchema: Schema = new Schema({
    sessionId: { type: String, required: true, index: true },
    chatId: { type: String, required: true },
    mutedUntil: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

// Compound index for unique mute per chat per session
MutedChatSchema.index({ sessionId: 1, chatId: 1 }, { unique: true });

export const MutedChat = mongoose.model<IMutedChat>('MutedChat', MutedChatSchema);
