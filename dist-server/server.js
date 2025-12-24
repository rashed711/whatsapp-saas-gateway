import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { WhatsAppEngine } from './services/whatsappEngine.js';
import { SessionModel } from './models/Session.js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    maxHttpBufferSize: 1e7, // 10 MB
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const sessions = new Map();
const MONGO_URI = process.env.MONGO_URI || "";
// Helper: Load sessions from MongoDB
const loadSessions = async () => {
    try {
        if (!MONGO_URI) {
            console.error('MONGO_URI is missing in .env.local');
            return;
        }
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB.');
        const storedSessions = await SessionModel.find();
        for (const s of storedSessions) {
            const engine = new WhatsAppEngine('master-user', s.id);
            sessions.set(s.id, { id: s.id, name: s.name, engine });
            // Auto-start if previously connected? 
            // For now, we instantiate the engine but don't auto-connect unless requested, 
            // OR we can try to restore connection immediately:
            if (s.status === 'CONNECTED') {
                console.log(`[Startup] Attempting to resume session ${s.id}...`);
                engine.startSession((qr) => console.log(`[Startup] QR generated for ${s.id}`), // No socket client yet
                () => console.log(`[Startup] Session ${s.id} resumed!`)).catch(err => console.error(`[Startup] Failed to resume ${s.id}`, err));
            }
        }
        console.log(`Loaded ${sessions.size} sessions from DB.`);
    }
    catch (error) {
        console.error('Failed to load sessions or connect to DB:', error);
    }
};
// Initialize
loadSessions();
// Stats (Mock/Simple In-Memory)
let stats = {
    messagesToday: 0,
    startTime: Date.now()
};
app.get('/stats', (req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - stats.startTime) / 1000);
    const uptimeStr = uptimeSeconds > 3600
        ? `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`
        : `${Math.floor(uptimeSeconds / 60)}m ${uptimeSeconds % 60}s`;
    res.header('Access-Control-Allow-Origin', '*');
    res.json({
        messagesToday: stats.messagesToday,
        activeDevices: Array.from(sessions.values()).filter(s => s.engine.currentStatus === 'CONNECTED').length,
        uptime: uptimeStr
    });
});
app.get('/', (req, res) => {
    res.send('WhatsApp Backend Server is running and reachable (MongoDB Enabled)!');
});
// Middleware for API
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Global CORS Middleware for API routes
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});
// --- API Endpoints for Individual Numbers ---
// Get Session Status
app.get('/api/sessions/:sessionId/status', (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found', code: 'SESSION_NOT_FOUND' });
    }
    res.json({
        sessionId: session.id,
        name: session.name,
        status: session.engine.currentStatus
    });
});
// Send Message (Text, Image, etc) via HTTP
app.post('/api/sessions/:sessionId/send', async (req, res) => {
    const { sessionId } = req.params;
    // Expected body: { number: "...", type: "text|image...", content: "...", caption: "..." }
    const { number, type, content, caption } = req.body;
    const session = sessions.get(sessionId);
    if (!session) {
        return res.status(404).json({ error: 'Session not found', code: 'SESSION_NOT_FOUND' });
    }
    if (session.engine.currentStatus !== 'CONNECTED') {
        return res.status(400).json({ error: 'Session is not connected', code: 'SESSION_NOT_CONNECTED' });
    }
    if (!number || !content || !type) {
        return res.status(400).json({ error: 'Missing required fields: number, type, content', code: 'MISSING_FIELDS' });
    }
    const cleanNumber = number.replace(/\D/g, '');
    const finalNumber = (cleanNumber.startsWith('01') && cleanNumber.length === 11)
        ? '20' + cleanNumber.substring(1)
        : cleanNumber;
    if (finalNumber.length < 10) {
        return res.status(400).json({ error: 'Invalid phone number', code: 'INVALID_NUMBER' });
    }
    try {
        const shouldValidate = req.query.skip_validate !== 'true';
        if (shouldValidate) {
            const isValid = await session.engine.validateNumber(finalNumber);
            if (!isValid) {
                return res.status(400).json({ error: 'Number not registered on WhatsApp', code: 'NUMBER_NOT_REGISTERED' });
            }
        }
        const validTypes = ['text', 'image', 'audio', 'video', 'document'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ error: `Invalid type. Supported: ${validTypes.join(', ')}` });
        }
        // Send
        await session.engine.send(finalNumber, type, content, caption);
        return res.json({ success: true, message: 'Message sent successfully', timestamp: Date.now() });
    }
    catch (error) {
        console.error(`API Send Error [${sessionId}]:`, error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});
io.on('connection', (socket) => {
    console.log('Frontend connected:', socket.id);
    // List Sessions
    socket.on('list-sessions', () => {
        const sessionList = Array.from(sessions.values()).map(s => ({
            id: s.id,
            name: s.name,
            status: s.engine.currentStatus
        }));
        socket.emit('sessions-list', sessionList);
    });
    // Create Session
    socket.on('create-session', async ({ name }, callback) => {
        try {
            const sessionId = 'sess_' + Date.now();
            const engine = new WhatsAppEngine('master-user', sessionId);
            sessions.set(sessionId, { id: sessionId, name, engine });
            // Persist to MongoDB
            try {
                await SessionModel.create({ id: sessionId, name, status: 'IDLE' });
            }
            catch (saveError) {
                console.error('Failed to save session to DB:', saveError);
            }
            socket.emit('session-created', { id: sessionId, name, status: 'IDLE' });
            io.emit('sessions-updated');
            if (typeof callback === 'function') {
                callback({ sessionId });
            }
        }
        catch (error) {
            console.error('Error creating session:', error);
            if (typeof callback === 'function') {
                callback({ error: error.message });
            }
        }
    });
    // Delete Session
    socket.on('delete-session', async ({ sessionId }) => {
        const session = sessions.get(sessionId);
        if (session) {
            await session.engine.logout(); // Cleans up auth data in DB
            sessions.delete(sessionId);
            // Remove from DB
            try {
                await SessionModel.deleteOne({ id: sessionId });
            }
            catch (e) {
                console.error('Failed to delete session from DB:', e);
            }
            io.emit('sessions-updated');
        }
    });
    // Start Session (Connect)
    socket.on('start-session', async ({ sessionId }) => {
        console.log(`Request to start session ${sessionId}`);
        const session = sessions.get(sessionId);
        if (!session)
            return socket.emit('error', 'Session not found');
        try {
            socket.emit('session-status', { sessionId, status: 'connecting' });
            await session.engine.startSession((qrCodeDataUrl) => {
                socket.emit('session-qr', { sessionId, qr: qrCodeDataUrl });
                socket.emit('session-status', { sessionId, status: 'qr' });
                // Update DB status?
                SessionModel.updateOne({ id: sessionId }, { status: 'QR' }).exec();
                io.emit('sessions-updated');
            }, () => {
                console.log(`Session ${sessionId} connected!`);
                socket.emit('session-status', { sessionId, status: 'connected' });
                SessionModel.updateOne({ id: sessionId }, { status: 'CONNECTED' }).exec();
                io.emit('sessions-updated');
            });
        }
        catch (error) {
            console.error('Session start error:', error);
            socket.emit('session-status', { sessionId, status: 'error' });
        }
    });
    // Send Message
    socket.on('send-message', async (data) => {
        const { sessionId, numbers, type, content, caption, minDelay = 3, maxDelay = 10 } = data;
        const session = sessions.get(sessionId);
        if (!session) {
            socket.emit('message-status', { error: 'Invalid Session ID' });
            return;
        }
        console.log(`Message request for session ${sessionId}:`, data);
        if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
            socket.emit('message-status', { error: 'No numbers provided' });
            return;
        }
        const replaceVariables = (text) => {
            if (!text)
                return text;
            return text.replace(/{{id}}/g, () => Math.floor(Math.random() * 900000 + 100000).toString());
        };
        let successCount = 0;
        let failCount = 0;
        const normalizeNumber = (num) => {
            if (!num)
                return '';
            const clean = num.replace(/\D/g, '');
            if (clean.startsWith('01') && clean.length === 11)
                return '20' + clean.substring(1);
            return clean;
        };
        const uniqueNumbers = [...new Set(numbers.map((n) => normalizeNumber(n)).filter((n) => n.length >= 10))];
        console.log(`[Batch] Received ${numbers.length} numbers. Unique valid targets: ${uniqueNumbers.length}`);
        if (uniqueNumbers.length === 0) {
            socket.emit('message-status', { error: 'No valid numbers found after normalization' });
            return;
        }
        io.emit('message-progress', {
            sessionId,
            current: 0,
            total: uniqueNumbers.length,
            status: 'starting'
        });
        for (const [index, number] of uniqueNumbers.entries()) {
            try {
                if (index > 0) {
                    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);
                    console.log(`[Batch] Waiting ${delay}s before next message...`);
                    await new Promise(resolve => setTimeout(resolve, delay * 1000));
                }
                console.log(`[Batch] Processing ${index + 1}/${uniqueNumbers.length}: ${number}`);
                const finalNumber = number;
                // Validate
                try {
                    const isValid = await Promise.race([
                        session.engine.validateNumber(finalNumber),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('Validation timeout')), 15000))
                    ]);
                    if (!isValid) {
                        console.warn(`[Batch] Number ${finalNumber} is not active on WhatsApp.`);
                        throw new Error("Number not active on WhatsApp");
                    }
                }
                catch (valError) {
                    throw new Error(`Validation failed: ${valError.message}`);
                }
                // Send
                const personalizedContent = type === 'text' ? replaceVariables(content) : content;
                const personalizedCaption = replaceVariables(caption);
                await Promise.race([
                    session.engine.send(finalNumber, type, personalizedContent, personalizedCaption),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Send timeout')), 40000))
                ]);
                console.log(`[Batch] Sent to ${finalNumber} successfully.`);
                successCount++;
                stats.messagesToday++;
                io.emit('message-progress', {
                    sessionId,
                    current: index + 1,
                    total: uniqueNumbers.length,
                    lastNumber: number,
                    status: 'success'
                });
            }
            catch (error) {
                console.error(`[Batch] Failed to send to ${number}:`, error);
                failCount++;
                io.emit('message-progress', {
                    sessionId,
                    current: index + 1,
                    total: uniqueNumbers.length,
                    lastNumber: number,
                    status: 'failed',
                    error: error.message,
                });
            }
        }
        console.log(`[Batch] Finished. Success: ${successCount}, Failed: ${failCount}`);
        io.emit('message-complete', { sessionId, success: successCount, failed: failCount });
    });
    // Logout
    socket.on('logout', async ({ sessionId }) => {
        const session = sessions.get(sessionId);
        if (session) {
            await session.engine.logout();
            socket.emit('session-status', { sessionId, status: 'disconnected' });
            SessionModel.updateOne({ id: sessionId }, { status: 'DISCONNECTED' }).exec();
            io.emit('sessions-updated');
        }
    });
});
const PORT = 3050;
httpServer.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
});
