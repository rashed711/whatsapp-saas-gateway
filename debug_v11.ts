import './env-loader.js';
import mongoose from 'mongoose';
import { AutoReply } from './models/AutoReply.js';
import { Session } from './models/Session.js';

async function debug() {
    try {
        if (!process.env.MONGO_URI) {
            console.error('MONGO_URI is missing even after env-loader');
            process.exit(1);
        }
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        const activeUser = '694ba8d5036863df733cd098';
        const rules = await AutoReply.find({ userId: activeUser }).lean();
        console.log(`Rules for user ${activeUser}: ${rules.length}`);
        rules.forEach(r => {
            console.log(` - Keyword: "${r.keyword}", Match: ${r.matchType}, SessionID: ${r.sessionId || 'GLOBAL'}`);
        });

        const muted = await mongoose.connection.db.collection('muted_chats').find({}).toArray();
        console.log(`\nMuted Chats: ${muted.length}`);
        muted.forEach(m => console.log(` - Session: ${m.sessionId}, Chat: ${m.chatId}, User: ${m.userId}`));

        const activeSessions = await Session.find({ userId: activeUser }).lean();
        console.log(`\nActive Sessions for user ${activeUser}: ${activeSessions.length}`);
        activeSessions.forEach(s => console.log(` - ID: ${s.id}, Name: ${s.name}, Status: ${s.status}`));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

debug();
