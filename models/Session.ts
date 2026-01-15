import mongoose, { Document, Schema } from 'mongoose';

export interface ISession extends Document {
  id: string; // The session ID string (e.g. sess_123)
  name: string;
  userId: string;
  status: 'IDLE' | 'QR' | 'CONNECTED' | 'DISCONNECTED';
  webhookUrl?: string; // Legacy: URL to forward incoming messages to
  webhookUrls?: string[]; // New: List of URLs to forward incoming messages to
  createdAt?: string;
  updatedAt?: string;
}

const SessionSchema = new Schema<ISession>({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  userId: { type: String, required: true },
  webhookUrl: { type: String }, // Optional Webhook URL
  webhookUrls: { type: [String], default: [] }, // Optional Webhook URLs
  status: {
    type: String,
    enum: ['IDLE', 'QR', 'CONNECTED', 'DISCONNECTED'],
    default: 'IDLE'
  }
}, {
  timestamps: true
});

export const Session = mongoose.model<ISession>('Session', SessionSchema);
