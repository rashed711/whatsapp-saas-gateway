import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
    name: string;
    username: string; // Used as email/login id
    password?: string;
    role: 'admin' | 'user';
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

const UserSchema = new Schema<IUser>({
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true
});

export const User = mongoose.model<IUser>('User', UserSchema);
