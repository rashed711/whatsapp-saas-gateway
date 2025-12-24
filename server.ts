import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import { WhatsAppEngine } from './services/whatsappEngine.js';
import { SessionModel } from './models/Session.js';
import { UserModel } from './models/User.js';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json()); // Middleware to parse JSON
const httpServer = createServer(app);
const io = new Server(httpServer, {
    maxHttpBufferSize: 1e7, // 10 MB
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-it';
const MONGO_URI = process.env.MONGO_URI || "";

// Session Management (InMemory Map for active engines, DB for persistence)
interface ActiveSession {
    id: string;
    name: string;
    userId: string;
    engine: WhatsAppEngine;
}

const sessions = new Map<string, ActiveSession>();

// Helper: Load sessions from MongoDB
const loadSessions = async () => {
    try {
        if (!MONGO_URI) {
            console.error('MONGO_URI is missing in .env.local');
            return false;
        }

        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB.');

        const storedSessions = await SessionModel.find();
        for (const s of storedSessions) {
            // Check if session has a valid userId, otherwise skip or assign to default if needed
            // For SaaS, we ignore orphaned sessions or delete them
            if (!s.userId) continue;

            const engine = new WhatsAppEngine(s.userId.toString(), s.id);
            sessions.set(s.id, {
                id: s.id,
                name: s.name,
                userId: s.userId.toString(),
                engine
            });

            if (s.status === 'CONNECTED') {
                console.log(`[Startup] Attempting to resume session ${s.id} for user ${s.userId}...`);
                engine.startSession(
                    (qr) => console.log(`[Startup] QR generated for ${s.id}`),
                    () => console.log(`[Startup] Session ${s.id} resumed!`)
                ).catch(err => console.error(`[Startup] Failed to resume ${s.id}`, err));
            }
        }
        console.log(`Loaded ${sessions.size} active sessions from DB.`);
        return true;
    } catch (error) {
        console.error('Failed to load sessions or connect to DB:', error);
        return false;
    }
};



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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Global CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Middleware: Authenticate Token & Optional Admin Check
const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token == null) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const requireAdmin = (req: any, res: any, next: any) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ error: 'Admin access required' });
    }
};

// Seed Admin User
const seedAdmin = async () => {
    try {
        const adminExists = await UserModel.findOne({ role: 'admin' });
        if (!adminExists) {
            console.log('Seeding default admin...');
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await UserModel.create({
                name: 'System Admin',
                username: 'admin@admin.com', // Default username
                password: hashedPassword,
                role: 'admin',
                isActive: true
            });
            console.log('Default admin created: admin@admin.com / admin123');
        }
    } catch (error) {
        console.error('Failed to seed admin:', error);
    }
};

const PORT = 3050;

// Initialize & Start Server
const startServer = async () => {
    const dbConnected = await loadSessions();
    if (dbConnected) {
        await seedAdmin();
    }

    httpServer.listen(PORT, () => {
        console.log(`Backend Server running on port ${PORT}`);
    });
};

startServer();

// --- Auth Routes ---

// Register (Now Protected - Admin Only)
app.post('/api/auth/register', authenticateToken, requireAdmin, async (req: any, res: any) => {
    try {
        const { name, username, password } = req.body;
        if (!name || !username || !password) return res.status(400).json({ error: 'Missing fields' });

        const existingUser = await UserModel.findOne({ username });
        if (existingUser) return res.status(400).json({ error: 'Username already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await UserModel.create({ name, username, password: hashedPassword, role: 'user', isActive: true });

        res.json({ message: 'User created successfully', user: { id: user._id, name: user.name, username: user.username } });
    } catch (error) {
        console.error('Register error', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body; // Changed email to username
        const user = await UserModel.findOne({ username });
        if (!user) return res.status(400).json({ error: 'User not found' });

        if (user.isActive === false) return res.status(403).json({ error: 'Account is suspended' });

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

        const token = jwt.sign({ userId: user._id, username: user.username, role: user.role }, JWT_SECRET);
        res.json({ token, user: { id: user._id, name: user.name, username: user.username, role: user.role } });
    } catch (error) {
        console.error('Login error', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/api/me', authenticateToken, async (req: any, res) => {
    const user = await UserModel.findById(req.user.userId).select('-password');
    res.json(user);
});

// List Users (Admin Only)
app.get('/api/users', authenticateToken, requireAdmin, async (req: any, res) => {
    try {
        const users = await UserModel.find({}, '-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Update User (Admin Only)
app.put('/api/users/:id', authenticateToken, requireAdmin, async (req: any, res) => {
    try {
        const { id } = req.params;
        const { name, username, password, isActive } = req.body;

        const updateData: any = { name, username, isActive };
        if (password && password.trim() !== '') {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const updatedUser = await UserModel.findByIdAndUpdate(id, updateData, { new: true }).select('-password');
        res.json(updatedUser);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// Delete User (Admin Only)
app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req: any, res) => {
    try {
        const { id } = req.params;
        await UserModel.findByIdAndDelete(id);
        // Also delete their sessions
        await SessionModel.deleteMany({ userId: id });
        res.json({ message: 'User deleted' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Change Password (Self)
app.post('/api/auth/change-password', authenticateToken, async (req: any, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = await UserModel.findById(req.user.userId);
        if (!user) return res.status(404).json({ error: 'User not found' });

        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Incorrect old password' });

        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update password' });
    }
});

// --- Secured API Endpoints ---

// Get User's Sessions
app.get('/api/sessions', authenticateToken, async (req: any, res) => {
    const userSessions = Array.from(sessions.values())
        .filter(s => s.userId === req.user.userId)
        .map(s => ({
            id: s.id,
            name: s.name,
            status: s.engine.currentStatus
        }));
    res.json(userSessions);
});


// Send Message (Secured)
app.post('/api/sessions/:sessionId/send', authenticateToken, async (req: any, res) => {
    const { sessionId } = req.params;
    const { number, type, content, caption } = req.body;

    const session = sessions.get(sessionId);

    // Isolation Check
    if (!session || session.userId !== req.user.userId) {
        return res.status(404).json({ error: 'Session not found or access denied', code: 'SESSION_NOT_FOUND' });
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

        await session.engine.send(finalNumber, type as any, content, caption);

        return res.json({ success: true, message: 'Message sent successfully', timestamp: Date.now() });

    } catch (error) {
        console.error(`API Send Error [${sessionId}]:`, error);
        return res.status(500).json({ error: (error as any).message || 'Internal Server Error' });
    }
});

// --- Socket.IO with Auth ---

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error("Authentication error"));
    }
    jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
        if (err) return next(new Error("Authentication error"));
        socket.data.user = decoded;
        next();
    });
});

io.on('connection', (socket) => {
    const userId = socket.data.user.userId;
    console.log(`User connected: ${userId}`);

    // Join user room for private updates
    socket.join(`user:${userId}`);

    // List Sessions (Filtered by User)
    socket.on('list-sessions', () => {
        const userSessions = Array.from(sessions.values())
            .filter(s => s.userId === userId)
            .map(s => ({
                id: s.id,
                name: s.name,
                status: s.engine.currentStatus
            }));
        socket.emit('sessions-list', userSessions);
    });

    // Create Session
    socket.on('create-session', async ({ name }, callback) => {
        try {
            const sessionId = 'sess_' + Date.now();
            const engine = new WhatsAppEngine(userId, sessionId); // Use userId for auth storage separation
            sessions.set(sessionId, { id: sessionId, name, userId, engine });

            // Persist to MongoDB with userId
            try {
                await SessionModel.create({ id: sessionId, name, userId, status: 'IDLE' });
            } catch (saveError) {
                console.error('Failed to save session to DB:', saveError);
            }

            socket.emit('session-created', { id: sessionId, name, status: 'IDLE' });
            // Only update this user
            io.to(`user:${userId}`).emit('sessions-updated');

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
        // Ownership check
        if (session && session.userId === userId) {
            await session.engine.logout();
            sessions.delete(sessionId);

            try {
                await SessionModel.deleteOne({ id: sessionId, userId });
            } catch (e) {
                console.error('Failed to delete session from DB:', e);
            }
            io.to(`user:${userId}`).emit('sessions-updated');
        }
    });

    // Start Session (Connect)
    socket.on('start-session', async ({ sessionId }) => {
        const session = sessions.get(sessionId);
        if (!session || session.userId !== userId) return socket.emit('error', 'Session not found');

        try {
            socket.emit('session-status', { sessionId, status: 'connecting' });

            await session.engine.startSession(
                (qrCodeDataUrl) => {
                    socket.emit('session-qr', { sessionId, qr: qrCodeDataUrl });
                    socket.emit('session-status', { sessionId, status: 'qr' });
                    SessionModel.updateOne({ id: sessionId }, { status: 'QR' }).exec();
                    io.to(`user:${userId}`).emit('sessions-updated');
                },
                () => {
                    console.log(`Session ${sessionId} connected!`);
                    socket.emit('session-status', { sessionId, status: 'connected' });
                    SessionModel.updateOne({ id: sessionId }, { status: 'CONNECTED' }).exec();
                    io.to(`user:${userId}`).emit('sessions-updated');
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

        // Security Check
        if (!session || session.userId !== userId) {
            socket.emit('message-status', { error: 'Invalid Session or Access Denied' });
            return;
        }

        console.log(`Message request for session ${sessionId} by user ${userId}`);

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

        if (uniqueNumbers.length === 0) {
            socket.emit('message-status', { error: 'No valid numbers found' });
            return;
        }

        socket.emit('message-progress', {
            sessionId,
            current: 0,
            total: uniqueNumbers.length,
            status: 'starting'
        });

        for (const [index, number] of uniqueNumbers.entries()) {
            try {
                if (index > 0) {
                    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);
                    await new Promise(resolve => setTimeout(resolve, delay * 1000));
                }

                const finalNumber = number;

                // Validate
                try {
                    const isValid = await Promise.race([
                        session.engine.validateNumber(finalNumber),
                        new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('Validation timeout')), 15000))
                    ]);

                    if (!isValid) throw new Error("Number not active on WhatsApp");

                } catch (valError) {
                    throw new Error(`Validation failed: ${(valError as any).message}`);
                }

                // Send
                const personalizedContent = type === 'text' ? replaceVariables(content) : content;
                const personalizedCaption = replaceVariables(caption);

                await Promise.race([
                    session.engine.send(finalNumber, type, personalizedContent, personalizedCaption),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Send timeout')), 40000))
                ]);

                successCount++;
                socket.emit('message-progress', {
                    sessionId,
                    current: index + 1,
                    total: uniqueNumbers.length,
                    lastNumber: number,
                    status: 'success'
                });

            } catch (error) {
                failCount++;
                socket.emit('message-progress', {
                    sessionId,
                    current: index + 1,
                    total: uniqueNumbers.length,
                    lastNumber: number,
                    status: 'failed',
                    error: (error as any).message,
                });
            }
        }

        socket.emit('message-complete', { sessionId, success: successCount, failed: failCount });
    });

    // Logout
    socket.on('logout', async ({ sessionId }) => {
        const session = sessions.get(sessionId);
        if (session && session.userId === userId) {
            await session.engine.logout();
            socket.emit('session-status', { sessionId, status: 'disconnected' });
            SessionModel.updateOne({ id: sessionId }, { status: 'DISCONNECTED' }).exec();
            io.to(`user:${userId}`).emit('sessions-updated');
        }
    });
});


// Serve Static Frontend (Production) - DISABLED (Vercel hosts frontend)
// app.use(express.static(path.join(__dirname, 'dist')));
// app.get('*', (req, res) => {
//    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
// });


