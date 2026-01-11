import mongoose, { Document, Schema } from 'mongoose';

export interface IContact extends Document {
    sessionId: string;
    id: string; // WhatsApp JID (phone number @s.whatsapp.net)
    name?: string; // Name saved in phone book
    notify?: string; // Name set by the user on WhatsApp
    verifiedName?: string; // Verified business name
    hasMessaged?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

const ContactSchema = new Schema<IContact>({
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

export const Contact = mongoose.model<IContact>('Contact', ContactSchema);
