import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  status: { type: String, default: 'IDLE' }, // IDLE, QR, CONNECTED, PAUSED
  createdAt: { type: Date, default: Date.now }
});

export const SessionModel = mongoose.model('Session', sessionSchema);
