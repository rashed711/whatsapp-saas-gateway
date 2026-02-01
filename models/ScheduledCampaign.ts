import mongoose, { Document, Schema } from 'mongoose';

export interface IScheduledCampaign extends Document {
    userId: string;
    sessionId: string; // The WhatsApp session ID to use
    title: string;

    // Message Details
    messageType: 'text' | 'image' | 'video' | 'audio' | 'document';
    content: string; // Text content or Media URL
    caption?: string; // For media
    mediaUrl?: string; // Explicit field if needed, or rely on content

    // Recipients & Progress
    recipients: { number: string; status: 'pending' | 'sent' | 'failed'; error?: string }[];

    // Scheduling & Config
    scheduledTime: Date;
    minDelay: number;
    maxDelay: number;

    // State
    status: 'pending' | 'active' | 'completed' | 'paused' | 'failed' | 'stopped';
    progress: {
        sent: number;
        failed: number;
        total: number;
    };

    createdAt?: Date;
    updatedAt?: Date;
}

const ScheduledCampaignSchema = new Schema<IScheduledCampaign>({
    userId: { type: String, required: true },
    sessionId: { type: String, required: true },
    title: { type: String, required: true },

    messageType: { type: String, enum: ['text', 'image', 'video', 'audio', 'document'], default: 'text' },
    content: { type: String, default: '' },
    caption: { type: String },
    mediaUrl: { type: String },

    recipients: [{
        number: { type: String, required: true },
        status: { type: String, enum: ['pending', 'sent', 'failed'], default: 'pending' },
        error: { type: String }
    }],

    scheduledTime: { type: Date, required: true },
    minDelay: { type: Number, default: 3 },
    maxDelay: { type: Number, default: 10 },

    status: { type: String, enum: ['pending', 'active', 'completed', 'paused', 'failed', 'stopped'], default: 'pending' },
    progress: {
        sent: { type: Number, default: 0 },
        failed: { type: Number, default: 0 },
        total: { type: Number, default: 0 }
    }
}, {
    timestamps: true
});

// Index for efficient querying by scheduler
ScheduledCampaignSchema.index({ status: 1, scheduledTime: 1 });
ScheduledCampaignSchema.index({ userId: 1 });

export const ScheduledCampaign = mongoose.model<IScheduledCampaign>('ScheduledCampaign', ScheduledCampaignSchema);
