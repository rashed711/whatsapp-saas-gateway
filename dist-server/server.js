import './env-loader.js';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { storage } from './services/storage.js';
import { CampaignService } from './services/campaignService.js';
import { SessionService } from './services/sessionService.js';
import { AutoReplyService } from './services/autoReplyService.js';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
dotenv.config({ path: '.env.local' });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.use(express.json()); // Middleware to parse JSON
// CORS Middleware
// CORS Middleware
app.use(cors());
const httpServer = createServer(app);
const io = new Server(httpServer, {
    maxHttpBufferSize: 1e7, // 10 MB
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-it';
// Stats (Mock/Simple In-Memory)
let stats = {
    messagesToday: 0,
    startTime: Date.now()
};
app.get('/stats', async (req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - stats.startTime) / 1000);
    const uptimeStr = uptimeSeconds > 3600
        ? `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`
        : `${Math.floor(uptimeSeconds / 60)}m ${uptimeSeconds % 60}s`;
    try {
        // Count messages sent today
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const MessageModel = storage.getModel('messages');
        const messagesToday = await MessageModel.countDocuments({
            timestamp: { $gte: startOfDay.getTime() }
        });
        const activeDevices = SessionService.getAllSessions().filter(s => s.engine.currentStatus === 'CONNECTED').length;
        res.json({
            messagesToday,
            activeDevices,
            uptime: uptimeStr
        });
    }
    catch (error) {
        console.error('Stats Error:', error);
        res.status(500).json({
            messagesToday: 0,
            activeDevices: 0,
            uptime: uptimeStr
        });
    }
});
app.get('/', (req, res) => {
    res.send('WhatsApp Backend Server is running (File Storage API)!');
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// Global CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});
// Middleware: Authenticate Token & Optional Admin Check
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    if (token == null)
        return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err)
            return res.sendStatus(403);
        req.user = user;
        next();
    });
};
const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    }
    else {
        res.status(403).json({ error: 'Admin access required' });
    }
};
// Seed Admin User
const seedAdmin = async () => {
    try {
        // Fix: Drop legacy 'email_1' index if it exists (causes user creation errors)
        try {
            const UserModel = storage.getModel('users');
            if (UserModel) {
                await UserModel.collection.dropIndex('email_1');
                console.log('--> Dropped legacy index: email_1');
            }
        }
        catch (idxErr) {
            // Ignore error if index doesn't exist
            if (idxErr.code !== 27) { // 27 = Index not found
                console.log('--> Note: email_1 index logic:', idxErr.message);
            }
        }
        const adminUser = await storage.getItem('users', { role: 'admin' });
        if (!adminUser) {
            console.log('Seeding default admin...');
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await storage.saveItem('users', {
                name: 'System Admin',
                username: 'admin@admin.com',
                password: hashedPassword,
                role: 'admin',
                isActive: true
            });
            console.log('Default admin created: admin@admin.com / admin123');
        }
        else {
            if (adminUser.username !== 'admin@admin.com') {
                adminUser.username = 'admin@admin.com';
                adminUser.isActive = true;
                await storage.saveItem('users', adminUser);
                console.log('Admin updated');
            }
        }
    }
    catch (error) {
        console.error('Failed to seed admin:', error);
    }
};
const PORT = 3050;
// Initialize & Start Server
const startServer = async () => {
    await storage.init(); // Ensure data dir exists
    await SessionService.loadSessions();
    await seedAdmin();
    httpServer.listen(PORT, () => {
        console.log(`Backend Server running on port ${PORT}`);
    });
};
startServer();
// Health/Version Check
app.get('/api/version', (req, res) => {
    res.json({
        version: '1.0.2-debug-error-logging',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV
    });
});
// --- Auth Routes ---
// Register (Now Protected - Admin Only)
app.post('/api/auth/register', authenticateToken, requireAdmin, async (req, res) => {
    console.log('--> REGISTER REQUEST RECEIVED');
    console.log('Body:', JSON.stringify(req.body, null, 2));
    try {
        const { name, username, password } = req.body;
        if (!name || !username || !password)
            return res.status(400).json({ error: 'Missing fields' });
        const existingUser = await storage.getItem('users', { username });
        if (existingUser)
            return res.status(400).json({ error: 'Username already exists' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await storage.saveItem('users', {
            name,
            username,
            password: hashedPassword,
            role: 'user',
            isActive: true
        });
        console.log('--> USER CREATED SUCCESSFULLY:', user._id);
        res.json({ message: 'User created successfully', user: { id: user._id, name: user.name, username: user.username } });
    }
    catch (error) {
        console.error('xx REGISTER ERROR THROWN xx');
        console.error(error);
        // Debugging: Write error to file (Sync)
        try {
            const fs = await import('fs');
            fs.appendFileSync('server_error.log', `[${new Date().toISOString()}] Register Error: ${error.message}\nStack: ${error.stack}\n\n`);
            console.log('--> Error written to server_error.log');
        }
        catch (fsErr) {
            console.error('Failed to write error log:', fsErr);
        }
        res.status(500).json({ error: `Internal Server Error: ${error.message}`, details: error.message });
    }
});
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password)
            return res.status(400).json({ error: 'Username and password required' });
        const user = await storage.getItem('users', { username });
        if (!user)
            return res.status(400).json({ error: 'User not found' });
        if (user.isActive === false)
            return res.status(403).json({ error: 'Account is suspended' });
        const validPassword = await bcrypt.compare(password, user.password || '');
        if (!validPassword)
            return res.status(400).json({ error: 'Invalid password' });
        const token = jwt.sign({ userId: user._id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, name: user.name, username: user.username, role: user.role } });
    }
    catch (error) {
        console.error('Login error', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});
app.get('/api/me', authenticateToken, async (req, res) => {
    const user = await storage.getItem('users', { _id: req.user.userId });
    if (user)
        delete user.password;
    res.json(user);
});
// List Users (Admin Only)
app.get('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    console.log('--> GET /api/users REQUEST');
    try {
        const users = await storage.getItems('users');
        console.log(`--> Found ${users.length} users`);
        const safeUsers = users.map((u) => {
            const { password, ...rest } = u;
            return rest;
        });
        // Sort by date (newest first)
        res.json(safeUsers.sort((a, b) => {
            const dateA = new Date(a.createdAt || 0).getTime();
            const dateB = new Date(b.createdAt || 0).getTime();
            return dateB - dateA;
        }));
    }
    catch (error) {
        console.error('--> GET /api/users ERROR:', error);
        res.status(500).json({ error: 'Failed to fetch users', details: error.message });
    }
});
// Update User (Admin Only)
app.put('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, username, password, isActive } = req.body;
        // Prevent suspending Admin
        const targetUser = await storage.getItem('users', { _id: id });
        if (!targetUser)
            return res.status(404).json({ error: 'User not found' });
        if (targetUser.role === 'admin' && isActive === false) {
            return res.status(403).json({ error: 'Cannot suspend an admin account' });
        }
        const updateData = { _id: id, name, username, isActive };
        if (password && password.trim() !== '') {
            updateData.password = await bcrypt.hash(password, 10);
        }
        const updatedUser = await storage.saveItem('users', updateData);
        delete updatedUser.password;
        res.json(updatedUser);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update user' });
    }
});
// Delete User (Admin Only)
app.delete('/api/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        // Check if target is admin
        const targetUser = await storage.getItem('users', { _id: id });
        if (!targetUser)
            return res.status(404).json({ error: 'User not found' });
        if (targetUser.role === 'admin') {
            return res.status(403).json({ error: 'Cannot delete an admin account' });
        }
        await storage.deleteItem('users', { _id: id });
        // Also delete their sessions
        await storage.deleteItem('sessions', { userId: id });
        res.json({ message: 'User deleted' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});
// Change Password (Self)
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = await storage.getItem('users', { _id: req.user.userId });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        const isMatch = await bcrypt.compare(oldPassword, user.password || '');
        if (!isMatch)
            return res.status(400).json({ error: 'Incorrect old password' });
        user.password = await bcrypt.hash(newPassword, 10);
        await storage.saveItem('users', user);
        res.json({ message: 'Password updated successfully' });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to update password' });
    }
});
// --- Secured API Endpoints ---
// Get User's Sessions
app.get('/api/sessions', authenticateToken, async (req, res) => {
    const userSessions = SessionService.getUserSessions(req.user.userId)
        .map(s => ({
        id: s.id,
        name: s.name,
        status: s.engine.currentStatus
    }));
    res.json(userSessions);
});
// Send Message (Secured)
app.post('/api/sessions/:sessionId/send', authenticateToken, async (req, res) => {
    const { sessionId } = req.params;
    const { number, type, content, caption } = req.body;
    const session = SessionService.getSession(sessionId);
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
        await session.engine.send(finalNumber, type, content, caption);
        return res.json({ success: true, message: 'Message sent successfully', timestamp: Date.now() });
    }
    catch (error) {
        console.error(`API Send Error [${sessionId}]:`, error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});
// Get Contacts (Secured)
app.get('/api/sessions/:sessionId/contacts', authenticateToken, async (req, res) => {
    const { sessionId } = req.params;
    const session = SessionService.getSession(sessionId);
    // Isolation Check
    if (!session || session.userId !== req.user.userId) {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }
    try {
        const contacts = await storage.getContacts(sessionId);
        res.json(contacts);
    }
    catch (error) {
        console.error('Failed to fetch contacts:', error);
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});
// Get Messages (Secured)
app.get('/api/sessions/:sessionId/messages', authenticateToken, async (req, res) => {
    const { sessionId } = req.params;
    const { jid, limit = 50 } = req.query;
    const session = SessionService.getSession(sessionId);
    // Isolation Check
    if (!session || session.userId !== req.user.userId) {
        return res.status(404).json({ error: 'Session not found or access denied' });
    }
    try {
        const messages = await storage.getMessages(sessionId, Number(limit), jid);
        res.json(messages);
    }
    catch (error) {
        console.error('Failed to fetch messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});
// --- Auto Reply Routes ---
app.get('/api/autoreply', authenticateToken, async (req, res) => {
    try {
        const rules = await AutoReplyService.getRules(req.user.userId);
        res.json(rules);
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to fetch rules' });
    }
});
app.post('/api/autoreply', authenticateToken, async (req, res) => {
    try {
        const { keyword, response, matchType, sessionId } = req.body;
        if (!keyword || !response)
            return res.status(400).json({ error: 'Missing keyword or response' });
        const rule = await AutoReplyService.createRule({
            userId: req.user.userId,
            sessionId: sessionId || undefined, // undefined means "All Devices"
            keyword,
            response,
            matchType: matchType || 'exact',
            isActive: true
        });
        res.json(rule);
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to create rule' });
    }
});
app.delete('/api/autoreply/:id', authenticateToken, async (req, res) => {
    try {
        await AutoReplyService.deleteRule(req.params.id, req.user.userId);
        res.json({ success: true });
    }
    catch (e) {
        res.status(500).json({ error: 'Failed to delete rule' });
    }
});
// --- Socket.IO with Auth ---
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error("Authentication error"));
    }
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err)
            return next(new Error("Authentication error"));
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
        const userSessions = SessionService.getUserSessions(userId)
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
            const sessionId = await SessionService.createSession(userId, name);
            socket.emit('session-created', { id: sessionId, name, status: 'IDLE' });
            // Only update this user
            io.to(`user:${userId}`).emit('sessions-updated');
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
        const result = await SessionService.deleteSession(sessionId, userId);
        if (result) {
            io.to(`user:${userId}`).emit('sessions-updated');
        }
    });
    // Start Session (Connect)
    socket.on('start-session', async ({ sessionId }) => {
        await SessionService.startSessionConnection(sessionId, userId, socket, io);
    });
    // Stop Campaign
    socket.on('stop-campaign', ({ sessionId }) => {
        CampaignService.stopCampaign(socket, sessionId);
    });
    // Send Message
    socket.on('send-message', async (data) => {
        const { sessionId, numbers, type, content, caption, minDelay = 3, maxDelay = 10 } = data;
        const session = SessionService.getSession(sessionId);
        // Security Check
        if (!session || session.userId !== userId) {
            socket.emit('message-status', { error: 'Invalid Session or Access Denied' });
            return;
        }
        await CampaignService.startCampaign(socket, data, session, userId);
    });
    // Logout
    socket.on('logout', async ({ sessionId }) => {
        await SessionService.logoutSession(sessionId, userId, socket, io);
    });
});
