import mongoose, { Schema } from 'mongoose';
const WebhookSchema = new Schema({
    name: { type: String, required: true },
    url: { type: String, required: true }
}, { _id: false });
const SessionSchema = new Schema({
    id: { type: String, required: true, unique: true },
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
        enum: ['IDLE', 'QR', 'CONNECTED', 'DISCONNECTED'],
        default: 'IDLE'
    }
}, {
    timestamps: true
});
export const Session = mongoose.model('Session', SessionSchema);
