
import mongoose from 'mongoose';
import { storage } from './services/storage.js';
import { Session, User, AuthState } from './models/index.js';
import { AutoReply } from './models/AutoReply.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/whatsapp-saas';

async function debug() {
    await mongoose.connect(MONGO_URI);
    console.log('--- DEBUG INFO ---');

    const sessions = await Session.find({});
    console.log('\nSessions:');
    sessions.forEach(s => {
        console.log(`- ID: ${s.id} | UserID: ${s.userId} | Name: ${s.name} | Status: ${s.status}`);
    });

    const rules = await AutoReply.find({});
    console.log('\nAuto-Reply Rules:');
    rules.forEach(r => {
        console.log(`- RuleID: ${r._id} | UserID: ${r.userId} | Keyword: ${r.keyword} | SessionID: ${r.sessionId || 'Global'} | Active: ${r.isActive}`);
    });

    const users = await User.find({});
    console.log('\nUsers:');
    users.forEach(u => {
        console.log(`- ID: ${u._id} | Name: ${u.name} | Role: ${u.role}`);
    });

    await mongoose.disconnect();
}

debug().catch(console.error);
