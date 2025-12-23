import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { WhatsAppEngine } from './services/whatsappEngine.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    maxHttpBufferSize: 1e7, // 10 MB
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

import fs from 'fs/promises';

// Session Management
interface Session {
    id: string;
    name: string;
    engine: WhatsAppEngine;
}

const sessions = new Map<string, Session>();
const SESSIONS_FILE = './sessions.json';

// Helper: Load sessions from disk
const loadSessions = async () => {
    try {
        const data = await fs.readFile(SESSIONS_FILE, 'utf-8');
        const storedSessions = JSON.parse(data);
        for (const s of storedSessions) {
            const engine = new WhatsAppEngine('master-user', s.id);
            sessions.set(s.id, { id: s.id, name: s.name, engine });
            // Optionally auto-connect here if needed, but for now we wait for user action
        }
        console.log(`Loaded ${sessions.size} sessions.`);
    } catch (error) {
        console.log('No sessions found, starting fresh.');
    }
};

// Helper: Save sessions to disk
const saveSessions = async () => {
    const data = Array.from(sessions.values()).map(s => ({ id: s.id, name: s.name }));
    await fs.writeFile(SESSIONS_FILE, JSON.stringify(data, null, 2));
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
    res.send('WhatsApp Backend Server is running and reachable!');
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
    // Basic Egypt normalization if needed, or just trust input
    const finalNumber = (cleanNumber.startsWith('01') && cleanNumber.length === 11)
        ? '20' + cleanNumber.substring(1)
        : cleanNumber;

    if (finalNumber.length < 10) {
        return res.status(400).json({ error: 'Invalid phone number', code: 'INVALID_NUMBER' });
    }

    try {
        // Validate presence on WhatsApp
        // We can make this optional via query param ?skip_validate=true for speed
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
        await session.engine.send(finalNumber, type as any, content, caption);

        return res.json({ success: true, message: 'Message sent successfully', timestamp: Date.now() });

    } catch (error) {
        console.error(`API Send Error [${sessionId}]:`, error);
        return res.status(500).json({ error: (error as any).message || 'Internal Server Error' });
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

            try {
                await saveSessions();
            } catch (saveError) {
                console.error('Failed to save sessions to disk:', saveError);
                // We communicate this error but still allow the session to exist in memory
            }

            socket.emit('session-created', { id: sessionId, name, status: 'IDLE' });
            // Trigger list update for all clients
            io.emit('sessions-updated');

            // Callback if provided
            if (typeof callback === 'function') {
                callback({ sessionId });
            }
        } catch (error) {
            console.error('Error creating session:', error);
            if (typeof callback === 'function') {
                callback({ error: (error as any).message });
            }
        }
    });

    // Delete Session
    socket.on('delete-session', async ({ sessionId }) => {
        const session = sessions.get(sessionId);
        if (session) {
            await session.engine.logout(); // Cleans up auth folder
            sessions.delete(sessionId);
            await saveSessions();
            io.emit('sessions-updated');
        }
    });

    // Start Session (Connect)
    socket.on('start-session', async ({ sessionId }) => {
        console.log(`Request to start session ${sessionId}`);
        const session = sessions.get(sessionId);
        if (!session) return socket.emit('error', 'Session not found');

        try {
            socket.emit('session-status', { sessionId, status: 'connecting' });

            await session.engine.startSession(
                (qrCodeDataUrl) => {
                    socket.emit('session-qr', { sessionId, qr: qrCodeDataUrl });
                    socket.emit('session-status', { sessionId, status: 'qr' });
                    io.emit('sessions-updated'); // Ensure list reflects QR status
                },
                () => {
                    console.log(`Session ${sessionId} connected!`);
                    socket.emit('session-status', { sessionId, status: 'connected' });
                    io.emit('sessions-updated'); // Update list status
                }
            );
        } catch (error) {
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

        // Validation
        if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
            socket.emit('message-status', { error: 'No numbers provided' });
            return;
        }

        const replaceVariables = (text: string) => {
            if (!text) return text;
            return text.replace(/{{id}}/g, () => Math.floor(Math.random() * 900000 + 100000).toString());
        };

        let successCount = 0;
        let failCount = 0;

        const normalizeNumber = (num: string) => {
            if (!num) return '';
            const clean = num.replace(/\D/g, '');
            if (clean.startsWith('01') && clean.length === 11) return '20' + clean.substring(1);
            return clean;
        };

        const uniqueNumbers = [...new Set(
            numbers.map((n: string) => normalizeNumber(n)).filter((n: string) => n.length >= 10)
        )];

        console.log(`[Batch] Received ${numbers.length} numbers. Unique valid targets: ${uniqueNumbers.length}`);

        if (uniqueNumbers.length === 0) {
            socket.emit('message-status', { error: 'No valid numbers found after normalization' });
            return;
        }

        // Notify client of actual start (Broadcast so all tabs/reconnected clients see it)
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
                    console.log(`[Batch] Validating ${finalNumber}...`);
                    const isValid = await Promise.race([
                        session.engine.validateNumber(finalNumber),
                        // Increased timeout and handle rejection gracefully
                        new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('Validation timeout')), 15000))
                    ]);

                    if (!isValid) {
                        console.warn(`[Batch] Number ${finalNumber} is not active on WhatsApp.`);
                        throw new Error("Number not active on WhatsApp");
                    }
                } catch (valError) {
                    throw new Error(`Validation failed: ${(valError as any).message}`);
                }

                // Send
                console.log(`[Batch] Sending to ${finalNumber}...`);
                const personalizedContent = type === 'text' ? replaceVariables(content) : content;
                const personalizedCaption = replaceVariables(caption);

                await Promise.race([
                    session.engine.send(finalNumber, type, personalizedContent, personalizedCaption),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Send timeout')), 40000))
                ]);

                console.log(`[Batch] Sent to ${finalNumber} successfully.`);
                successCount++;
                stats.messagesToday++;
                // Broadcast progress
                io.emit('message-progress', {
                    sessionId,
                    current: index + 1,
                    total: uniqueNumbers.length,
                    lastNumber: number,
                    status: 'success'
                });

            } catch (error) {
                console.error(`[Batch] Failed to send to ${number}:`, error);
                failCount++;
                // Broadcast failure
                io.emit('message-progress', {
                    sessionId,
                    current: index + 1,
                    total: uniqueNumbers.length,
                    lastNumber: number,
                    status: 'failed',
                    error: (error as any).message,
                });
            }
        }

        console.log(`[Batch] Finished. Success: ${successCount}, Failed: ${failCount}`);
        // Broadcast complete
        io.emit('message-complete', { sessionId, success: successCount, failed: failCount });
    });

    // Logout
    socket.on('logout', async ({ sessionId }) => {
        const session = sessions.get(sessionId);
        if (session) {
            await session.engine.logout();
            socket.emit('session-status', { sessionId, status: 'disconnected' });
            io.emit('sessions-updated');
        }
    });
});

const PORT = 3050;
httpServer.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
});
