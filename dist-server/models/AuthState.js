import mongoose from 'mongoose';
const authStateSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, index: true },
    key: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, required: true } // Stores the JSON/Buffer data
});
// Composite unique index ensures we don't duplicate keys for a session
authStateSchema.index({ sessionId: 1, key: 1 }, { unique: true });
export const AuthStateModel = mongoose.model('AuthState', authStateSchema);
