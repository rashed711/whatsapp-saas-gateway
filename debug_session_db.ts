
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load .env.local
const envPath = path.join(__dirname, '.env.local');
console.log('Loading env from:', envPath);
dotenv.config({ path: envPath });

console.log('MONGO_URI is:', process.env.MONGO_URI ? 'SET' : 'NOT SET');

async function checkWebhooks() {
    // Dynamic import to delay execution until after env load
    const { storage } = await import('./services/storage.js');

    console.log('Connecting to DB...');
    await storage.init();

    console.log('Fetching sessions...');
    const sessions = await storage.getItems('sessions');

    console.log(`Found ${sessions.length} sessions.`);

    sessions.forEach(s => {
        console.log('------------------------------------------------');
        console.log(`Session ID: ${s.id}`);
        console.log(`Name: ${s.name}`);
        console.log(`Status: ${s.status}`);
        console.log(`Legacy webhookUrl:`, s.webhookUrl);
        console.log(`Legacy webhookUrls:`, s.webhookUrls);
        console.log(`New webhooks:`, JSON.stringify(s.webhooks, null, 2));
        console.log('------------------------------------------------');
    });

    process.exit(0);
}

checkWebhooks().catch(console.error);
