/**
 * WhatsApp Engine (SaaS Core)
 * This engine is designed to work in a Node.js environment with Baileys and File Storage.
 */
import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import P from 'pino';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { storage } from './storage.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export class WhatsAppEngine {
    userId;
    sessionId;
    status = 'IDLE';
    sock = null;
    constructor(userId, sessionId) {
        this.userId = userId;
        this.sessionId = sessionId;
    }
    getAuthPath() {
        return path.join(__dirname, '../data/auth_info_baileys', this.sessionId);
    }
    /**
     * Initialize Session
     */
    async startSession(onQR, onConnected) {
        this.status = 'QR';
        console.log(`[Engine] Starting Baileys socket for session ${this.sessionId} (File Auth)...`);
        try {
            const authPath = this.getAuthPath();
            // Ensure directory exists
            await fs.mkdir(authPath, { recursive: true });
            const { state, saveCreds } = await useMultiFileAuthState(authPath);
            // Create Socket
            this.sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: P({ level: 'silent' }), // Reduce logs for production
                browser: ['WhatsApp Gateway', 'Chrome', '1.0.0'],
                defaultQueryTimeoutMs: 60000,
            });
            // Handle Connection Updates
            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                if (qr) {
                    console.log(`[Engine] QR Code generated for ${this.sessionId}`);
                    const qrDataUrl = `data:image/png;base64,${qr}`;
                    onQR(qrDataUrl);
                }
                if (connection === 'open') {
                    console.log(`[Engine] Session ${this.sessionId} is now CONNECTED.`);
                    this.status = 'CONNECTED';
                    onConnected();
                }
                else if (connection === 'close') {
                    const reason = lastDisconnect?.error?.output?.statusCode;
                    console.log(`[Engine] Connection closed for ${this.sessionId}. Reason: ${reason}`);
                    const shouldReconnect = reason !== DisconnectReason.loggedOut;
                    if (shouldReconnect) {
                        console.log('[Engine] Reconnecting...');
                        // Add a small delay for stability
                        setTimeout(() => this.startSession(onQR, onConnected), 3000);
                    }
                    else {
                        console.log('[Engine] Session logged out. Stopping.');
                        this.status = 'ERROR';
                        await this.cleanupData();
                    }
                }
            });
            // Handle Creds Update
            this.sock.ev.on('creds.update', saveCreds);
            // --- Contact Handling ---
            // 1. Initial Contact Sync from WhatsApp (when connecting new device)
            this.sock.ev.on('contacts.upsert', async (contacts) => {
                console.log(`[Engine] Received ${contacts.length} contacts.`);
                const validContacts = contacts
                    .filter(c => !c.id.includes('@lid') && !c.id.includes('@broadcast') && c.id.includes('@s.whatsapp.net'))
                    .map(c => ({
                    sessionId: this.sessionId,
                    id: c.id,
                    name: c.name || c.notify, // 'name' is from phonebook, 'notify' is pushname
                    notify: c.notify,
                    verifiedName: c.verifiedName
                }));
                if (validContacts.length > 0) {
                    await storage.saveItems('contacts', validContacts);
                    console.log(`[Engine] Saved ${validContacts.length} numbers.`);
                }
            });
            // 2. Fallback: Parse Incoming Messages to extract sender number/name
            this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
                // We look at 'notify' (new) and 'append' (history) messages
                if (type === 'notify' || type === 'append') {
                    const contactsToUpdate = [];
                    for (const msg of messages) {
                        if (msg.key.fromMe)
                            continue; // Skip own messages for contact list purposes if desired, or keep to know I messaged them
                        const remoteJid = msg.key.remoteJid;
                        // Basic Filtering
                        if (!remoteJid || remoteJid.includes('@lid') || remoteJid.includes('@broadcast') || !remoteJid.includes('@s.whatsapp.net'))
                            continue;
                        const pushName = msg.pushName;
                        // Push to list
                        contactsToUpdate.push({
                            sessionId: this.sessionId,
                            id: remoteJid,
                            name: pushName, // We treat pushName as a potential name if none empty
                            notify: pushName,
                            hasMessaged: true
                        });
                    }
                    if (contactsToUpdate.length > 0) {
                        await storage.saveItems('contacts', contactsToUpdate);
                    }
                }
            });
        }
        catch (error) {
            console.error('[Engine] Failed to start session:', error);
            this.status = 'ERROR';
            throw error;
        }
    }
    async send(to, type, content, caption) {
        if (this.status !== 'CONNECTED' || !this.sock)
            throw new Error("Device is not connected!");
        const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
        console.log(`[API] Sending ${type} to ${to}...`);
        try {
            if (type === 'text') {
                const urlRegex = /(https?:\/\/[^\s]+)/g;
                const matchedUrl = content.match(urlRegex)?.[0];
                if (matchedUrl) {
                    await this.sock.sendMessage(jid, { text: content });
                    // Simplified link preview handling for stability
                }
                else {
                    await this.sock.sendMessage(jid, { text: content });
                }
            }
            else {
                const base64Part = content.includes(',') ? content.split(',')[1] : content;
                if (!base64Part)
                    throw new Error("Invalid media content: Base64 data missing");
                const buffer = Buffer.from(base64Part, 'base64');
                if (type === 'image') {
                    await this.sock.sendMessage(jid, { image: buffer, caption: caption });
                }
                else if (type === 'audio') {
                    await this.sock.sendMessage(jid, { audio: buffer, ptt: true });
                }
                else if (type === 'video') {
                    await this.sock.sendMessage(jid, { video: buffer, caption: caption });
                }
                else if (type === 'document') {
                    await this.sock.sendMessage(jid, { document: buffer, mimetype: 'application/pdf', fileName: caption || 'file.pdf' });
                }
            }
            return { success: true, timestamp: Date.now() };
        }
        catch (error) {
            console.error(`[API] Send failed:`, error);
            throw error;
        }
    }
    async logout() {
        try {
            console.log('[Engine] Logging out...');
            if (this.sock) {
                await this.sock.logout();
                this.sock.end(undefined);
                this.sock = null;
            }
        }
        catch (err) {
            console.error('[Engine] Error during logout:', err);
        }
        finally {
            await this.cleanupData();
            this.status = 'IDLE';
        }
    }
    async cleanupData() {
        try {
            const authPath = this.getAuthPath();
            // try removing directory recursively
            await fs.rm(authPath, { recursive: true, force: true });
            console.log(`[Engine] Auth data for ${this.sessionId} cleared.`);
            // Optional: Clear contacts? No, user might want to keep data.
        }
        catch (e) {
            console.error('[Engine] Failed to clear data', e);
        }
    }
    async validateNumber(phone) {
        if (this.status !== 'CONNECTED' || !this.sock)
            return false;
        const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
        try {
            const result = await this.sock.onWhatsApp(jid);
            return result && result.length > 0 && result[0].exists;
        }
        catch (err) {
            console.error(`Failed to validate number ${phone}`, err);
            return false;
        }
    }
    get currentStatus() {
        return this.status;
    }
}
