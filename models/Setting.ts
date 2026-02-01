import mongoose, { Document, Schema } from 'mongoose';

export interface ISetting extends Document {
    key: string;
    value: any;
    updatedAt?: string;
}

const SettingSchema = new Schema<ISetting>({
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true }
}, {
    timestamps: true
});

export const Setting = mongoose.model<ISetting>('Setting', SettingSchema);
