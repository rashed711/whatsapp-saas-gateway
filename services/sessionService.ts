import { WhatsAppEngine } from './whatsappEngine.js';
import { storage } from './storage.js';
import { ISession } from '../models/Session.js';

export interface ActiveSession {
    id: string;
    name: string;
    userId: string;
    engine: WhatsAppEngine;
    webhookUrl?: string; // Legacy
    webhookUrls?: string[]; // Legacy
    webhooks?: { name: string; url: string }[]; // New
}

export class SessionService {
    private static sessions = new Map<string, ActiveSession>();

    /**
     * Initialize and load all sessions from storage in parallel.
     */
    static async loadSessions(): Promise<boolean> {
        try {
            console.log('Loading sessions from storage...');
            const storedSessions: ISession[] = await storage.getItems('sessions');
            console.log(`Found ${storedSessions.length} total sessions in storage.`);

            const loadPromises = storedSessions.map(async (s) => {
                if (!s.userId) return;

                const engine = new WhatsAppEngine(s.userId, s.id);
                this.sessions.set(s.id, {
                    id: s.id,
                    name: s.name,
                    userId: s.userId,
                    webhookUrl: s.webhookUrl,
                    webhookUrls: s.webhookUrls || [],
                    webhooks: s.webhooks || [],
                    engine
                });

                if (s.status === 'CONNECTED') {
                    console.log(`[Startup] Attempting to resume session ${s.id} for user ${s.userId}...`);
                    try {
                        await engine.startSession(
                            (qr) => console.log(`[Startup] QR generated for ${s.id}`),
                            () => console.log(`[Startup] Session ${s.id} resumed!`)
                        );
                    } catch (err: any) {
                        console.error(`[Startup] Failed to resume ${s.id}`, err.message);
                        // Optionally update status to error or disconnected if resume fails hard
                    }
                }
            });

            await Promise.all(loadPromises);
            console.log(`Loaded ${this.sessions.size} active sessions in memory.`);
            return true;
        } catch (error) {
            console.error('Failed to load sessions:', error);
            return false;
        }
    }

    static getSession(sessionId: string): ActiveSession | undefined {
        return this.sessions.get(sessionId);
    }

    static getAllSessions(): ActiveSession[] {
        return Array.from(this.sessions.values());
    }

    static getUserSessions(userId: string): ActiveSession[] {
        return Array.from(this.sessions.values()).filter(s => s.userId === userId);
    }

    static async createSession(userId: string, name: string): Promise<string> {
        const sessionId = 'sess_' + Date.now();
        const engine = new WhatsAppEngine(userId, sessionId);
        const webhookUrl = ''; // Default empty
        const webhookUrls: string[] = []; // Default empty
        const webhooks: { name: string; url: string }[] = []; // Default empty

        this.sessions.set(sessionId, { id: sessionId, name, userId, engine, webhookUrl, webhookUrls, webhooks });

        try {
            await storage.saveItem('sessions', { id: sessionId, name, userId, status: 'IDLE', webhookUrl });
        } catch (saveError) {
            console.error('Failed to save session to storage:', saveError);
            // We might want to throw here to prevent in-memory only sessions
            throw saveError;
        }

        return sessionId;
    }

    static async deleteSession(sessionId: string, userId: string): Promise<boolean> {
        const session = this.sessions.get(sessionId);
        if (!session || session.userId !== userId) return false;

        await session.engine.logout();
        this.sessions.delete(sessionId);

        try {
            await storage.deleteItem('sessions', { id: sessionId, userId });
        } catch (e) {
            console.error('Failed to delete session from storage:', e);
        }
        return true;
    }

    static async startSessionConnection(sessionId: string, userId: string, socket: any, io: any) {
        const session = this.sessions.get(sessionId);
        if (!session || session.userId !== userId) {
            socket.emit('error', 'Session not found');
            return;
        }

        try {
            socket.emit('session-status', { sessionId, status: 'connecting' });

            await session.engine.startSession(
                (qrCodeDataUrl) => {
                    socket.emit('session-qr', { sessionId, qr: qrCodeDataUrl });
                    socket.emit('session-status', { sessionId, status: 'qr' });

                    this.updateSessionStatusInStorage(sessionId, 'QR');
                    io.to(`user:${userId}`).emit('sessions-updated');
                },
                () => {
                    console.log(`Session ${sessionId} connected!`);
                    socket.emit('session-status', { sessionId, status: 'connected' });

                    this.updateSessionStatusInStorage(sessionId, 'CONNECTED');
                    io.to(`user:${userId}`).emit('sessions-updated');
                }
            );
        } catch (error) {
            console.error('Session start error:', error);
            socket.emit('session-status', { sessionId, status: 'error' });
        }
    }

    static async logoutSession(sessionId: string, userId: string, socket: any, io: any) {
        const session = this.sessions.get(sessionId);
        if (session && session.userId === userId) {
            await session.engine.logout();
            socket.emit('session-status', { sessionId, status: 'disconnected' });

            this.updateSessionStatusInStorage(sessionId, 'DISCONNECTED');
            io.to(`user:${userId}`).emit('sessions-updated');
        }
    }

    private static updateSessionStatusInStorage(sessionId: string, status: string) {
        storage.getItem('sessions', { id: sessionId }).then(s => {
            if (s) { s.status = status; storage.saveItem('sessions', s); }
        });
    }
}
