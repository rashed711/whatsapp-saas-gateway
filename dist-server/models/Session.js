import mongoose, { Schema } from 'mongoose';
const SessionSchema = new Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    userId: { type: String, required: true },
    status: {
        type: String,
        enum: ['IDLE', 'QR', 'CONNECTED', 'DISCONNECTED'],
        default: 'IDLE'
    }
}, {
    timestamps: true
});
export const Session = mongoose.model('Session', SessionSchema);
