import mongoose, { Schema } from 'mongoose';
const ContactSchema = new Schema({
    sessionId: { type: String, required: true },
    id: { type: String, required: true },
    name: { type: String },
    notify: { type: String },
    verifiedName: { type: String },
    hasMessaged: { type: Boolean, default: false }
}, {
    timestamps: true
});
// Compound index for uniqueness per session
ContactSchema.index({ sessionId: 1, id: 1 }, { unique: true });
export const Contact = mongoose.model('Contact', ContactSchema);
