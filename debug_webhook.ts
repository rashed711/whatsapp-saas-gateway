
import mongoose from 'mongoose';
import { Session } from './models/Session';
import { connectDB } from './services/db';
import dotenv from 'dotenv';
dotenv.config();

// Mock storage logic locally to isolate the issue
async function debugWebhook() {
    try {
        console.log('Connecting to DB...');
        await connectDB();
        console.log('Connected.');

        // 1. Create a dummy session
        const testId = 'sess_debug_' + Date.now();
        const userId = 'user_debug';

        console.log(`Creating test session: ${testId}`);
        await Session.create({
            id: testId,
            name: 'Debug Session',
            userId: userId,
            status: 'IDLE'
        });

        // 2. Fetch it like server.ts does
        const session = await Session.findOne({ id: testId }).lean();
        if (!session) throw new Error('Session not found');

        console.log('Fetched session:', session);

        // 3. Simulate the update payload
        const webhookUrl = 'https://n8n.test.com/webhook/123';

        // This resembles the object we are passing to saveItem
        const updatedSession: any = { ...session, webhookUrl: webhookUrl };

        // My previous fix: delete _id
        if (updatedSession._id) delete updatedSession._id;

        // Simulate storage.saveItem logic
        console.log('Attempting findOneAndUpdate with payload:', updatedSession);

        const result = await Session.findOneAndUpdate(
            { id: testId },
            updatedSession,
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        console.log('Update Result:', result);
        console.log('SUCCESS: Webhook URL updated.');

        // Cleanup
        await Session.deleteOne({ id: testId });

    } catch (error) {
        console.error('ERROR CAUGHT:', error);
    } finally {
        await mongoose.disconnect();
    }
}

debugWebhook();
