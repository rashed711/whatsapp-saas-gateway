import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, // Hashed
    createdAt: { type: Date, default: Date.now },
    role: { type: String, enum: ['user', 'admin'], default: 'user' }
});

export const UserModel = mongoose.model('User', userSchema);
