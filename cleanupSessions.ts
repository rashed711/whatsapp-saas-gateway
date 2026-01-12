
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Load env vars
dotenv.config({ path: '.env.local' });

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ MONGO_URI not found in .env.local');
    process.exit(1);
}

const cleanup = async () => {
    try {
        console.log('⏳ Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected.');

        // 1. Clear Sessions Collection
        const sessionsCollection = mongoose.connection.db.collection('sessions');
        const sessionCount = await sessionsCollection.countDocuments();
        if (sessionCount > 0) {
            await sessionsCollection.deleteMany({});
            console.log(`🗑️ Deleted ${sessionCount} active sessions.`);
        } else {
            console.log('ℹ️ No active sessions found.');
        }

        // 2. Clear Auth States (Baileys Credentials)
        const authCollection = mongoose.connection.db.collection('auth_states');
        const authCount = await authCollection.countDocuments();
        if (authCount > 0) {
            await authCollection.deleteMany({});
            console.log(`🗑️ Deleted ${authCount} auth state records.`);
        } else {
            console.log('ℹ️ No auth states found.');
        }

        console.log('✨ cleanup complete! Now your server logs in Render should stabilize (it might restart once).');
        console.log('👉 You can now go to your Dashboard and Scan QR again properly.');

    } catch (error) {
        console.error('Error during cleanup:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

cleanup();
