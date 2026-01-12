
/**
 * WhatsApp Engine (SaaS Core)
 * This engine is designed to work in a Node.js environment with Baileys and File Storage.
 */

import { makeWASocket, DisconnectReason, BufferJSON, AuthenticationCreds } from '@whiskeysockets/baileys';
import P from 'pino';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { storage } from './storage.js';
import { useMongoDBAuthState } from './mongoAuth.js';
import { AutoReplyService } from './autoReplyService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WhatsAppEngine {
  private userId: string;
  private sessionId: string;
  private status: 'IDLE' | 'QR' | 'CONNECTED' | 'ERROR' = 'IDLE';
  private sock: any = null;
  private retryCount = 0;

  constructor(userId: string, sessionId: string) {
    this.userId = userId;
    this.sessionId = sessionId;
  }

  // Auth path is no longer needed but we keep folder logic just in case or remove if safe
  private getAuthPath() {
    return path.join(__dirname, '../data/auth_info_baileys', this.sessionId);
  }

  /**
   * Initialize Session
   */
  async startSession(onQR: (qr: string) => void, onConnected: () => void) {
    this.status = 'QR';
    console.log(`[Engine] Starting Baileys socket for session ${this.sessionId} (Mongo Auth)...`);

    try {
      // Use MongoDB Auth Adapter
      const { state, saveCreds } = await useMongoDBAuthState(this.sessionId);

      // Create Socket
      this.sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: P({ level: 'silent' }), // Reduce logs for production
        browser: ['WhatsApp Gateway', 'Chrome', '1.0.0'],
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 10000, // Explicit connection timeout
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
          this.retryCount = 0; // Reset retry count
          onConnected();
        } else if (connection === 'close') {
          const reason = (lastDisconnect?.error as any)?.output?.statusCode;
          console.log(`[Engine] Connection closed for ${this.sessionId}. Reason: ${reason}`);

          const shouldReconnect = reason !== DisconnectReason.loggedOut;

          if (shouldReconnect) {
            const delay = Math.min(Math.pow(2, this.retryCount) * 1000, 30000); // Exponential backoff max 30s
            console.log(`[Engine] Reconnecting in ${delay}ms... (Attempt ${this.retryCount + 1})`);

            this.retryCount++;
            setTimeout(() => this.startSession(onQR, onConnected), delay);
          } else {
            console.log('[Engine] Session logged out. Stopping.');
            this.status = 'ERROR';
            await this.cleanupData();
          }
        }
      });

      // Handle Creds Update
      this.sock.ev.on('creds.update', saveCreds);

      // --- Contact Handling ---

      // 1. Initial Contact Sync from WhatsApp (Phonebook)
      this.sock.ev.on('contacts.upsert', async (contacts: any[]) => {
        console.log(`[Engine] Received ${contacts.length} contacts (Phonebook).`);
        if (contacts.length > 0) console.log('[Engine] Sample contact:', JSON.stringify(contacts[0]));

        const validContacts = contacts
          .filter(c => c.id.includes('@s.whatsapp.net') && !c.id.includes('@lid') && !c.id.includes('@broadcast'))
          .map(c => ({
            sessionId: this.sessionId,
            id: c.id,
            name: c.name || undefined, // Strict name only
            notify: c.notify,
            verifiedName: c.verifiedName
          }));

        if (validContacts.length > 0) {
          await storage.saveItems('contacts', validContacts);
          console.log(`[Engine] Saved ${validContacts.length} numbers from Phonebook.`);
        }
      });

      // 2. Fallback: Parse Incoming Messages to extract sender number/name
      this.sock.ev.on('messages.upsert', async ({ messages, type }: { messages: any[], type: string }) => {
        if (type === 'notify' || type === 'append') {
          const contactsToUpdate = [];

          for (const msg of messages) {
            if (msg.key.fromMe) continue;

            const remoteJid = msg.key.remoteJid;
            if (!remoteJid || remoteJid.includes('@lid') || remoteJid.includes('@broadcast') || !remoteJid.includes('@s.whatsapp.net')) continue;

            const pushName = msg.pushName;

            // --- Auto Reply Logic ---
            try {
              // Extract text content (support conversation or extendedTextMessage)
              const textContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

              if (textContent) {
                const replyText = await AutoReplyService.getResponse(this.userId, textContent, this.sessionId);

                if (replyText) {
                  console.log(`[AutoReply] Matched rule for ${remoteJid}: "${textContent}" -> "${replyText}"`);

                  // Simulate natural delay (1-3 seconds)
                  await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));

                  // Send Reply
                  await this.sock.sendMessage(remoteJid, { text: replyText }, { quoted: msg });
                }
              }
            } catch (err) {
              console.error('[AutoReply] Error processing message:', err);
            }
            // ------------------------

            contactsToUpdate.push({
              sessionId: this.sessionId,
              id: remoteJid,
              notify: pushName,
              name: undefined, // Never overwrite name from a message upsert
              hasMessaged: true
            });
          }

          if (contactsToUpdate.length > 0) {
            await storage.saveItems('contacts', contactsToUpdate);
          }
        }
      });

      // 3. conversation History (Chats) - REMOVED (Handled by messaging-history.set)
      this.sock.ev.on('chats.upsert', async (chats: any[]) => {
        // Helpful for incremental updates, but history sync covers initial.
        // keeping it for real-time new conversation updates
        const contactsToUpdate = chats
          .filter(c => c.id.includes('@s.whatsapp.net') && !c.id.includes('@lid') && !c.id.includes('@broadcast'))
          .map(c => ({
            sessionId: this.sessionId,
            id: c.id,
            name: c.name || undefined,
            hasMessaged: true
          }));

        if (contactsToUpdate.length > 0) {
          await storage.saveItems('contacts', contactsToUpdate);
        }
      });

      // 4. Initial History Sync (The most reliable source for past chats)
      this.sock.ev.on('messaging-history.set', async (data: any) => {
        const { chats, contacts, messages } = data;
        const msgCount = messages?.length || 0;
        console.log(`[Engine] Received History Sync: ${chats?.length || 0} chats, ${contacts?.length || 0} contacts, ${msgCount} messages.`);

        // Map to deduplicate and merge updates for this batch
        // Key: JID, Value: Partial<Contact>
        const contactsMap = new Map<string, any>();

        const upsertContact = (id: string, data: any) => {
          if (!id.includes('@s.whatsapp.net') || id.includes('@lid')) return;
          const existing = contactsMap.get(id) || { sessionId: this.sessionId, id };
          // Merge logic: prefer new truthy values, but careful with 'name' vs 'notify'
          contactsMap.set(id, { ...existing, ...data });
        };

        // 1. Process Contacts (Phonebook names & PushNames from direct contact sync)
        if (contacts) {
          contacts.forEach((c: any) => {
            upsertContact(c.id, {
              name: c.name || undefined, // Strict name only (Saved Name)
              notify: c.notify, // Push Name (WhatsApp Name) if present
              verifiedName: c.verifiedName
            });
          });
        }

        // 2. Process Chats (Conversations state)
        if (chats) {
          chats.forEach((c: any) => {
            // For chats, we primarily want to establish 'hasMessaged'
            upsertContact(c.id, {
              // chat.name can be a name for groups/contacts if set manually or synced
              ...(c.name ? { name: c.name } : {}),
              hasMessaged: true
            });
          });
        }

        // 3. Process Messages (CRITICAL: Extract PushNames for unsaved contacts)
        if (messages) {
          messages.forEach((msg: any) => {
            if (msg.pushName && !msg.key.fromMe) {
              const isGroup = msg.key.remoteJid.endsWith('@g.us');
              // For groups, sender is participant. For private, remoteJid is sender.
              const sender = isGroup ? msg.key.participant : msg.key.remoteJid;

              if (sender) {
                upsertContact(sender, {
                  notify: msg.pushName, // This solves "Missing WhatsApp Name"
                  hasMessaged: true
                });
              }
            }
          });
        }

        const contactsToSave = Array.from(contactsMap.values());

        if (contactsToSave.length > 0) {
          await storage.saveItems('contacts', contactsToSave);
          console.log(`[Engine] Synced ${contactsToSave.length} unique contacts from history (with deep message scanning).`);
        }
      });


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
      const authPath = this.getAuthPath();
      // try removing directory recursively
      await fs.rm(authPath, { recursive: true, force: true });
      console.log(`[Engine] Auth data for ${this.sessionId} cleared.`);

      // Optional: Clear contacts? No, user might want to keep data.
    } catch (e) {
      console.error('[Engine] Failed to clear data', e);
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
      return false;
    }
  }

  public get currentStatus() {
    return this.status;
  }
}
