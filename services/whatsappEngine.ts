
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
import { AutoReplyService } from './autoReplyService.js';
import { useMongoDBAuthState } from './mongoAuth.js';


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

          // -----------------------------------------------------
          // UNIQUE SESSION ENFORCEMENT (One Number Policy)
          // -----------------------------------------------------
          const userJid = this.sock?.user?.id;
          const phoneNumber = userJid ? userJid.split(':')[0] : null;

          if (phoneNumber) {
            console.log(`[Engine] Verifying uniqueness for number: ${phoneNumber}`);

            // 1. Update this session with the phone number
            await storage.saveItem('sessions', {
              id: this.sessionId,
              userId: this.userId, // Ensure userId is preserved
              phoneNumber: phoneNumber,
              status: 'CONNECTED',
              updatedAt: new Date()
            });

            // 2. Check for OTHER sessions with the same phone number
            const allSessions = await storage.getItems('sessions', { phoneNumber });

            // Filter out CURRENT session
            const duplicates = allSessions.filter(s => s.id !== this.sessionId && s.status !== 'TERMINATED');

            if (duplicates.length > 0) {
              console.warn(`[Engine] SECURITY ALERT: Found ${duplicates.length} duplicate sessions for number ${phoneNumber}. Terminating them.`);

              for (const dup of duplicates) {
                console.log(`[Engine] Killing duplicate session: ${dup.id}`);
                // Mark as terminated in DB
                await storage.saveItem('sessions', { id: dup.id, status: 'TERMINATED' });

                // Ideally, we would emit an event to server.ts to kill the specific engine instance,
                // but marking it TERMINATED in DB prevents it from being resumed on restart.
                // The 440 conflict from WhatsApp will eventually disconnect the zombie if it's running.
              }
            }
          }
          // -----------------------------------------------------

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
        console.log(`[Engine] Message Event: type=${type}, count=${messages.length}`);

        if (type === 'notify' || type === 'append') {
          const contactsToUpdate = [];

          for (const msg of messages) {
            console.log(`[Engine] Processing Msg: fromMe=${msg.key.fromMe}, remoteJid=${msg.key.remoteJid}, type=${Object.keys(msg.message || {})}`);

            if (msg.key.fromMe) {
              // --- Human Takeover Logic ---
              // If user replies manually, mute the bot for this chat
              const targetJid = msg.key.remoteJid;
              if (targetJid && !targetJid.includes('@broadcast') && !targetJid.includes('@g.us')) {
                // Check for "Unmute" command
                const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
                if (text && (text.toLowerCase() === '#bot' || text.toLowerCase() === '#unmute')) {
                  console.log(`[Human Takeover] User re-enabled bot for ${targetJid}`);
                  await storage.deleteItem('muted_chats', { sessionId: this.sessionId, chatId: targetJid });
                } else {
                  console.log(`[Human Takeover] Manual reply detected. Muting bot for ${targetJid}`);
                  await storage.saveItem('muted_chats', {
                    sessionId: this.sessionId,
                    chatId: targetJid,
                    mutedAt: new Date(),
                    userId: this.userId
                  });
                }
              }
              continue;
            }

            const remoteJid = msg.key.remoteJid;
            // Allow @s.whatsapp.net AND @lid (Lightning IDs)
            if (!remoteJid || remoteJid.includes('@broadcast') || (!remoteJid.includes('@s.whatsapp.net') && !remoteJid.includes('@lid'))) continue;

            const pushName = msg.pushName;

            // --- Auto Reply Logic ---
            try {
              // 0. Check if Chat is Muted (Human Takeover)
              const isMuted = await storage.getItem('muted_chats', { sessionId: this.sessionId, chatId: remoteJid });

              if (isMuted) {
                // Optional: Log that we skipped
                // console.log(`[AutoReply] Skipped: Chat ${remoteJid} is in Human Mode.`);
              } else {
                // Extract text content (support conversation or extendedTextMessage)
                const textContent = msg.message?.conversation || msg.message?.extendedTextMessage?.text;

                if (textContent) {
                  console.log(`[AutoReply] Checking rules for: "${textContent}" from ${remoteJid}`);
                  const matchedRule = await AutoReplyService.getResponse(this.userId, textContent, this.sessionId);

                  if (matchedRule) {
                    console.log(`[AutoReply] Match found! RuleID: ${matchedRule._id} | Type: ${matchedRule.replyType || 'text'}`);

                    // Simulate human behavior
                    await this.sock.sendPresenceUpdate('composing', remoteJid);
                    const humanDelay = Math.floor(Math.random() * 5000) + 3000;
                    console.log(`[AutoReply] Waiting ${humanDelay}ms...`);
                    await new Promise(r => setTimeout(r, humanDelay));
                    await this.sock.sendPresenceUpdate('paused', remoteJid);

                    // Send Reply based on Type
                    const responseText = matchedRule.response; // Caption or Text

                    try {
                      if (matchedRule.replyType === 'image' && matchedRule.mediaUrl) {
                        await this.sock.sendMessage(remoteJid, {
                          image: { url: matchedRule.mediaUrl },
                          caption: responseText
                        }, { quoted: msg });

                      } else if (matchedRule.replyType === 'video' && matchedRule.mediaUrl) {
                        await this.sock.sendMessage(remoteJid, {
                          video: { url: matchedRule.mediaUrl },
                          caption: responseText
                        }, { quoted: msg });

                      } else if (matchedRule.replyType === 'document' && matchedRule.mediaUrl) {
                        await this.sock.sendMessage(remoteJid, {
                          document: { url: matchedRule.mediaUrl },
                          mimetype: 'application/pdf', // Default, maybe detect from extension later
                          fileName: matchedRule.fileName || 'file.pdf',
                          caption: responseText
                        }, { quoted: msg });

                      } else if (matchedRule.replyType === 'audio' && matchedRule.mediaUrl) {
                        await this.sock.sendMessage(remoteJid, {
                          audio: { url: matchedRule.mediaUrl },
                          ptt: true // Send as Voice Note
                        }, { quoted: msg });

                      } else {
                        // Default: Text
                        await this.sock.sendMessage(remoteJid, { text: responseText }, { quoted: msg });
                      }
                      console.log(`[AutoReply] Sent ${matchedRule.replyType || 'text'} response.`);

                    } catch (sendErr) {
                      console.error('[AutoReply] Failed to send response:', sendErr);
                      // Fallback to text if media fails?
                      await this.sock.sendMessage(remoteJid, { text: `[Error sending media] ${responseText}` }, { quoted: msg });
                    }

                  } else {
                    console.log(`[AutoReply] No match found for: "${textContent}"`);
                  }
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
