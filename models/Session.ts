
/**
 * هذا الكود يوضح كيفية هيكلة Session Model في Mongoose
 */

/*
import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  // يتم تخزين بيانات Baileys Auth ككائن JSON كبير
  // باستخدام BufferJSON للتعامل مع الـ Binary Data
  authData: { type: Object, required: true },
  updatedAt: { type: Date, default: Date.now }
});

export const Session = mongoose.models.Session || mongoose.model('Session', SessionSchema);
*/

export const SessionSchemaPreview = {
  fields: {
    userId: "string (unique index)",
    authData: "JSON Object (Baileys compatible)",
    lastKnownStatus: "string (connected/disconnected)",
  }
};
