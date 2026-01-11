import mongoose, { Document, Schema } from 'mongoose';

export interface IMessage extends Document {
    sessionId: string;
    remoteJid: string;
    fromMe: boolean;
    content: any;
    timestamp: number;
    pushName?: string;
    id: string; // WhatsApp Message ID
    createdAt?: string;
}

const MessageSchema = new Schema<IMessage>({
    sessionId: { type: String, required: true },
    remoteJid: { type: String, required: true },
    fromMe: { type: Boolean, required: true },
    content: { type: Schema.Types.Mixed }, // Flexible for different message structures
    timestamp: { type: Number, required: true },
    pushName: { type: String },
    id: { type: String, required: true }
}, {
    timestamps: true
});

// Index for efficient querying by session and chat
MessageSchema.index({ sessionId: 1, remoteJid: 1, timestamp: -1 });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
