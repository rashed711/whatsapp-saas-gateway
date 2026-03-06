import mongoose, { Schema } from 'mongoose';
const SettingSchema = new Schema({
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true }
}, {
    timestamps: true
});
export const Setting = mongoose.model('Setting', SettingSchema);
