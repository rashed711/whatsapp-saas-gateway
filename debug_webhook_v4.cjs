
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const MONGO_URI = process.env.MONGO_URI || '';

async function run() {
    try {
        if (!MONGO_URI) {
            console.error('MONGO_URI is missing!');
            return;
        }
        console.log('Connecting to DB...');
        await mongoose.connect(MONGO_URI);
        console.log('Connected.');

        // Define Loose Schema to read everything
        const SessionSchema = new mongoose.Schema({
            id: String,
            name: String,
            webhookUrl: String,
            webhookUrls: [String],
            webhooks: Array // Use generic Array to see raw data
        }, { strict: false });

        const Session = mongoose.model('Session', SessionSchema, 'sessions'); // Force 'sessions' collection

        const sessions = await Session.find({});
        console.log(`Found ${sessions.length} sessions.`);

        sessions.forEach(s => {
            console.log('------------------------------------------------');
            console.log(`Session ID: ${s.id}`);
            console.log(`Name: ${s.name}`);
            console.log(`Legacy webhookUrl:`, s.webhookUrl);
            console.log(`Legacy webhookUrls:`, s.webhookUrls);
            console.log(`New webhooks:`, JSON.stringify(s.webhooks, null, 2));
            console.log('------------------------------------------------');
        });

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await mongoose.disconnect();
    }
}

run();
