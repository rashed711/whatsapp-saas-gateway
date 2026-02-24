import mongoose, { Schema } from 'mongoose';
const ScheduledCampaignSchema = new Schema({
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
export const ScheduledCampaign = mongoose.model('ScheduledCampaign', ScheduledCampaignSchema);
