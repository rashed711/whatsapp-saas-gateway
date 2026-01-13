
const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || '';

async function run() {
    try {
        console.log('Connecting to:', MONGO_URI);
        await mongoose.connect(MONGO_URI);
        console.log('Connected.');

        // Define Schema Inline
        const SessionSchema = new mongoose.Schema({
            id: { type: String, required: true, unique: true },
            name: { type: String, required: true },
            userId: { type: String, required: true },
            webhookUrl: { type: String },
            status: { type: String, default: 'IDLE' }
        }, { timestamps: true });

        // Use a random collection name to avoid conflicts
        const Session = mongoose.model('Session_Debug_' + Date.now(), SessionSchema);

        const testId = 'sess_debug_' + Date.now();

        // 1. Create
        console.log('Creating session...');
        const created = await Session.create({
            id: testId,
            name: 'Debug Session',
            userId: 'user_123'
        });
        console.log('Created:', created.toObject());

        // 2. Try Partial Update (The original failure?)
        console.log('\n--- Attempting Partial Update (id, webhookUrl) ---');
        try {
            const partialUpdate = { id: testId, webhookUrl: 'http://partial.com' };
            const res1 = await Session.findOneAndUpdate({ id: testId }, partialUpdate, {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true
            });
            console.log('Partial Update Result:', res1 ? res1.toObject() : null);
        } catch (e) {
            console.error('Partial Update FAILED:', e.message);
        }

        // 3. Try Full Update (The fix attempt)
        console.log('\n--- Attempting Full Update (spread object) ---');
        try {
            // Fetch first
            const current = await Session.findOne({ id: testId }).lean();
            if (!current) throw new Error('Not found');

            const fullUpdate = { ...current, webhookUrl: 'http://full.com' };

            // Emulate what I did in server.ts
            if (fullUpdate._id) delete fullUpdate._id;
            // Also try deleting __v
            // delete fullUpdate.__v; 
            // delete fullUpdate.createdAt;
            // delete fullUpdate.updatedAt;

            console.log('Full Update Payload keys:', Object.keys(fullUpdate));

            const res2 = await Session.findOneAndUpdate({ id: testId }, fullUpdate, {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true
            });
            console.log('Full Update Result:', res2 ? res2.toObject() : null);
        } catch (e) {
            console.error('Full Update FAILED:', e.message);
        }

        console.log('\nCleanup done.');

    } catch (err) {
        console.error('Global Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
