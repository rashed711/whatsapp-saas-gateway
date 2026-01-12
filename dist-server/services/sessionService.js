import { WhatsAppEngine } from './whatsappEngine.js';
import { storage } from './storage.js';
export class SessionService {
    static sessions = new Map();
    /**
     * Initialize and load all sessions from storage in parallel.
     */
    static async loadSessions() {
        try {
            console.log('Loading sessions from storage...');
            const storedSessions = await storage.getItems('sessions');
            console.log(`Found ${storedSessions.length} total sessions in storage.`);
            const loadPromises = storedSessions.map(async (s) => {
                if (!s.userId)
                    return;
                const engine = new WhatsAppEngine(s.userId, s.id);
                this.sessions.set(s.id, {
                    id: s.id,
                    name: s.name,
                    userId: s.userId,
                    engine
                });
                if (s.status === 'CONNECTED') {
                    console.log(`[Startup] Attempting to resume session ${s.id} for user ${s.userId}...`);
                    try {
                        await engine.startSession((qr) => console.log(`[Startup] QR generated for ${s.id}`), () => console.log(`[Startup] Session ${s.id} resumed!`));
                    }
                    catch (err) {
                        console.error(`[Startup] Failed to resume ${s.id}`, err.message);
                        // Optionally update status to error or disconnected if resume fails hard
                    }
                }
            });
            await Promise.all(loadPromises);
            console.log(`Loaded ${this.sessions.size} active sessions in memory.`);
            return true;
        }
        catch (error) {
            console.error('Failed to load sessions:', error);
            return false;
        }
    }
    static getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    static getAllSessions() {
        return Array.from(this.sessions.values());
    }
    static getUserSessions(userId) {
        return Array.from(this.sessions.values()).filter(s => s.userId === userId);
    }
    static async createSession(userId, name) {
        const sessionId = 'sess_' + Date.now();
        const engine = new WhatsAppEngine(userId, sessionId);
        this.sessions.set(sessionId, { id: sessionId, name, userId, engine });
        try {
            await storage.saveItem('sessions', { id: sessionId, name, userId, status: 'IDLE' });
        }
        catch (saveError) {
            console.error('Failed to save session to storage:', saveError);
            // We might want to throw here to prevent in-memory only sessions
            throw saveError;
        }
        return sessionId;
    }
    static async deleteSession(sessionId, userId) {
        const session = this.sessions.get(sessionId);
        if (!session || session.userId !== userId)
            return false;
        await session.engine.logout();
        this.sessions.delete(sessionId);
        try {
            await storage.deleteItem('sessions', { id: sessionId, userId });
        }
        catch (e) {
            console.error('Failed to delete session from storage:', e);
        }
        return true;
    }
    static async startSessionConnection(sessionId, userId, socket, io) {
        const session = this.sessions.get(sessionId);
        if (!session || session.userId !== userId) {
            socket.emit('error', 'Session not found');
            return;
        }
        try {
            socket.emit('session-status', { sessionId, status: 'connecting' });
            await session.engine.startSession((qrCodeDataUrl) => {
                socket.emit('session-qr', { sessionId, qr: qrCodeDataUrl });
                socket.emit('session-status', { sessionId, status: 'qr' });
                this.updateSessionStatusInStorage(sessionId, 'QR');
                io.to(`user:${userId}`).emit('sessions-updated');
            }, () => {
                console.log(`Session ${sessionId} connected!`);
                socket.emit('session-status', { sessionId, status: 'connected' });
                this.updateSessionStatusInStorage(sessionId, 'CONNECTED');
                io.to(`user:${userId}`).emit('sessions-updated');
            });
        }
        catch (error) {
            console.error('Session start error:', error);
            socket.emit('session-status', { sessionId, status: 'error' });
        }
    }
    static async logoutSession(sessionId, userId, socket, io) {
        const session = this.sessions.get(sessionId);
        if (session && session.userId === userId) {
            await session.engine.logout();
            socket.emit('session-status', { sessionId, status: 'disconnected' });
            this.updateSessionStatusInStorage(sessionId, 'DISCONNECTED');
            io.to(`user:${userId}`).emit('sessions-updated');
        }
    }
    static updateSessionStatusInStorage(sessionId, status) {
        storage.getItem('sessions', { id: sessionId }).then(s => {
            if (s) {
                s.status = status;
                storage.saveItem('sessions', s);
            }
        });
    }
}
