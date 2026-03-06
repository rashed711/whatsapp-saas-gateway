import mongoose, { Schema } from 'mongoose';
const UserSchema = new Schema({
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String },
    role: { type: String, enum: ['admin', 'user'], default: 'user' },
    permissions: { type: [String], default: [] },
    isActive: { type: Boolean, default: true }
}, {
    timestamps: true
});
export const User = mongoose.model('User', UserSchema);
