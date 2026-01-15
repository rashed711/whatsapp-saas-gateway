import mongoose, { Document, Schema } from 'mongoose';

export interface ISession extends Document {
  id: string; // The session ID string (e.g. sess_123)
  name: string;
  userId: string;
  status: 'IDLE' | 'QR' | 'CONNECTED' | 'DISCONNECTED';
  webhookUrl?: string; // Legacy
  webhookUrls?: string[]; // Legacy (Keep for migration if needed, or deprecate)
  webhooks?: { name: string; url: string }[]; // New: Named Webhooks
  createdAt?: string;
  updatedAt?: string;
}

const SessionSchema = new Schema<ISession>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  userId: { type: String, required: true },
  webhookUrl: { type: String }, // Legacy
  webhookUrls: { type: [String], default: [] }, // Legacy
  webhooks: {
    type: [{
      name: { type: String, required: true },
      url: { type: String, required: true }
    }],
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

export const Session = mongoose.model<ISession>('Session', SessionSchema);
