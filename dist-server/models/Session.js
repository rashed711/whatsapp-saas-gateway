import mongoose, { Schema } from 'mongoose';
const WebhookSchema = new Schema({
    name: { type: String, required: true },
    url: { type: String, required: true }
}, { _id: false });
const SessionSchema = new Schema({
    id: { type: String, required: true, unique: true },
    instanceId: { type: String },
    name: { type: String, required: true },
    userId: { type: String, required: true },
    webhookUrl: { type: String }, // Legacy
    webhookUrls: { type: [String], default: [] }, // Legacy
    webhooks: {
        type: [WebhookSchema],
        default: []
    },
    status: {
        type: String,
        enum: ['IDLE', 'QR', 'CONNECTED', 'DISCONNECTED', 'TERMINATED'],
        default: 'IDLE'
    },
    autoReplyEnabled: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});
export const Session = mongoose.model('Session', SessionSchema);
