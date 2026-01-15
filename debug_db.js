
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
dotenv.config({ path: path.join(__dirname, '.env.local') });

const uri = process.env.MONGO_URI;
if (!uri) {
    console.error('MONGO_URI missing');
    process.exit(1);
}

// Define Schema Inline to avoid import issues
const SessionSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    webhookUrl: { type: String },
    webhookUrls: { type: [String], default: [] },
    webhooks: {
        type: [{
            name: { type: String, required: true },
            url: { type: String, required: true }
        }],
        default: []
    }
}, { strict: false }); // Use strict:false to see everything

const Session = mongoose.model('Session', SessionSchema);

async function run() {
    try {
        await mongoose.connect(uri);
        console.log('Connected to DB');

        const sessions = await Session.find({});
        console.log(`Found ${sessions.length} sessions`);

        sessions.forEach(s => {
            console.log('--- Session: ' + s.name + ' (' + s.id + ') ---');
            console.log('Webhooks Field:', JSON.stringify(s.get('webhooks'), null, 2));
            console.log('Legacy URL:', s.get('webhookUrl'));
            console.log('Legacy URLs:', s.get('webhookUrls'));
            console.log('---------------------------');
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

run();
