import mongoose from 'mongoose';

const authStateSchema = new mongoose.Schema({
    sessionId: { type: String, required: true },
    key: { type: String, required: true }, // 'creds' or 'type-id'
    data: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

// Compound index to ensure unique key per session
authStateSchema.index({ sessionId: 1, key: 1 }, { unique: true });

export const AuthState = mongoose.model('AuthState', authStateSchema);
