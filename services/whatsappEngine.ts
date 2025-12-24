
/**
 * WhatsApp Engine (SaaS Core)
 * This engine is designed to work in a Node.js environment with Baileys and MongoDB.
 */

import { makeWASocket, DisconnectReason, BufferJSON, AuthenticationCreds, SignalDataTypeMap, initAuthCreds, AnyMessageContent } from '@whiskeysockets/baileys';
import P from 'pino';
import fs from 'fs/promises';
import { getLinkPreview } from 'link-preview-js';
import { AuthStateModel } from '../models/AuthState.js';

export class WhatsAppEngine {
  private userId: string;
  private sessionId: string;
  private status: 'IDLE' | 'QR' | 'CONNECTED' | 'ERROR' = 'IDLE';
  private sock: any = null;

  constructor(userId: string, sessionId: string) {
    this.userId = userId; // kept for compatibility, but we rely on sessionId mostly
    this.sessionId = sessionId;
  }

  /**
   * Custom MongoDB Auth State for Baileys
   */
  async useMongoDBAuthState() {
    const saveState = async () => {
      // We write whenever keys are updated. 
      // In this implementation, 'keys.set' does the writing.
    };

    return {
      state: {
        creds: await this.loadCreds(),
        keys: {
          get: async (type: string, ids: string[]) => {
            const data: { [key: string]: any } = {};
            for (const id of ids) {
              const doc = await AuthStateModel.findOne({ sessionId: this.sessionId, key: `${type}:${id}` });
              if (doc && doc.value) {
                try {
                  data[id] = JSON.parse(JSON.stringify(doc.value), BufferJSON.reviver);
                } catch (e) {
                  console.error(`[DB] Failed to parse key ${type}:${id}`, e);
                }
              }
            }
            return data;
          },
          set: async (data: any) => {
            const ops: any[] = [];
            for (const type in data) {
              for (const id in data[type]) {
                const value = data[type][id];
                const key = `${type}:${id}`;
                if (value === null || value === undefined) {
                  ops.push({ deleteOne: { filter: { sessionId: this.sessionId, key } } });
                } else {
                  const serialized = JSON.parse(JSON.stringify(value, BufferJSON.replacer));
                  ops.push({
                    updateOne: {
                      filter: { sessionId: this.sessionId, key },
                      update: { $set: { value: serialized } },
                      upsert: true
                    }
                  });
                }
              }
            }
            if (ops.length > 0) {
              await AuthStateModel.bulkWrite(ops);
            }
          }
        }
      },
      saveCreds: async () => {
        if (this.sock?.authState?.creds) {
          const serialized = JSON.parse(JSON.stringify(this.sock.authState.creds, BufferJSON.replacer));
          await AuthStateModel.updateOne(
            { sessionId: this.sessionId, key: 'creds' },
            { value: serialized },
            { upsert: true }
          );
        }
      }
    };
  }

  async loadCreds(): Promise<AuthenticationCreds> {
    const doc = await AuthStateModel.findOne({ sessionId: this.sessionId, key: 'creds' });
    if (doc && doc.value) {
      return JSON.parse(JSON.stringify(doc.value), BufferJSON.reviver);
    }
    return initAuthCreds();
  }

  /**
   * Initialize Session
   */
  async startSession(onQR: (qr: string) => void, onConnected: () => void) {
    this.status = 'QR';
    console.log(`[Engine] Starting Baileys socket for session ${this.sessionId} (MongoDB Auth)...`);

    try {
      // Use Custom MongoDB Auth
      const { state, saveCreds } = await this.useMongoDBAuthState();

      // Create Socket
      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: P({ level: 'silent' }), // Reduce logs for production
        browser: ['WhatsApp Gateway', 'Chrome', '1.0.0'],
        defaultQueryTimeoutMs: 60000,
      });

      // Handle Connection Updates
      this.sock.ev.on('connection.update', async (update: any) => {
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
        } else if (connection === 'close') {
          const reason = (lastDisconnect?.error as any)?.output?.statusCode;
          console.log(`[Engine] Connection closed for ${this.sessionId}. Reason: ${reason}`);

          const shouldReconnect = reason !== DisconnectReason.loggedOut;

          if (shouldReconnect) {
            console.log('[Engine] Reconnecting...');
            // Add a small delay for stability
            setTimeout(() => this.startSession(onQR, onConnected), 3000);
          } else {
            console.log('[Engine] Session logged out. Stopping.');
            this.status = 'ERROR';
            await this.cleanupData();
          }
        }
      });

      // Handle Creds Update
      this.sock.ev.on('creds.update', saveCreds);

    } catch (error) {
      console.error('[Engine] Failed to start session:', error);
      this.status = 'ERROR';
      throw error;
    }
  }

  async send(to: string, type: 'text' | 'image' | 'audio' | 'video' | 'document', content: string, caption?: string) {
    if (this.status !== 'CONNECTED' || !this.sock) throw new Error("Device is not connected!");

    const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
    console.log(`[API] Sending ${type} to ${to}...`);

    try {
      if (type === 'text') {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const matchedUrl = content.match(urlRegex)?.[0];

        if (matchedUrl) {
          await this.sock.sendMessage(jid, { text: content });
          // Simplified link preview handling for stability
        } else {
          await this.sock.sendMessage(jid, { text: content });
        }
      } else {
        const base64Part = content.includes(',') ? content.split(',')[1] : content;
        if (!base64Part) throw new Error("Invalid media content: Base64 data missing");

        const buffer = Buffer.from(base64Part, 'base64');

        if (type === 'image') {
          await this.sock.sendMessage(jid, { image: buffer, caption: caption });
        } else if (type === 'audio') {
          await this.sock.sendMessage(jid, { audio: buffer, ptt: true });
        } else if (type === 'video') {
          await this.sock.sendMessage(jid, { video: buffer, caption: caption });
        } else if (type === 'document') {
          await this.sock.sendMessage(jid, { document: buffer, mimetype: 'application/pdf', fileName: caption || 'file.pdf' });
        }
      }
      return { success: true, timestamp: Date.now() };
    } catch (error) {
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
    } catch (err) {
      console.error('[Engine] Error during logout:', err);
    } finally {
      await this.cleanupData();
      this.status = 'IDLE';
    }
  }

  async cleanupData() {
    try {
      await AuthStateModel.deleteMany({ sessionId: this.sessionId });
      console.log(`[Engine] Auth data for ${this.sessionId} cleared from DB.`);
    } catch (e) {
      console.error('[Engine] Failed to clear DB data', e);
    }
  }

  async validateNumber(phone: string): Promise<boolean> {
    if (this.status !== 'CONNECTED' || !this.sock) return false;
    const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
    try {
      const result = await this.sock.onWhatsApp(jid);
      return result && result.length > 0 && result[0].exists;
    } catch (err) {
      console.error(`Failed to validate number ${phone}`, err);
      // In case of timeout or error, assuming false or skipping validation might be safer
      return false;
    }
  }

  public get currentStatus() {
    return this.status;
  }
}
