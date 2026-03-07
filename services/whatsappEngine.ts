
/**
 * WhatsApp Engine (SaaS Core)
 * This engine is designed to work in a Node.js environment with Baileys and File Storage.
 */

import { makeWASocket, DisconnectReason, BufferJSON, AuthenticationCreds, fetchLatestBaileysVersion, Browsers } from '@whiskeysockets/baileys';
import P from 'pino';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import NodeCache from 'node-cache';
import { v4 as uuidv4 } from 'uuid';
import { storage } from './storage.js';
import { AutoReplyService } from './autoReplyService.js';
import { useMongoDBAuthState } from './mongoAuth.js';
import { AuthState } from '../models/index.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cache to handle "Over 2000 messages into the future" decryption errors
const msgRetryCounterCache = new NodeCache();

export class WhatsAppEngine {
  private userId: string;
  private sessionId: string;
  private instanceId: string;
  private status: 'IDLE' | 'QR' | 'CONNECTED' | 'ERROR' = 'IDLE';
  private sock: any = null;
  private retryCount = 0;
  private conflictCount = 0;
  private decryptionErrorCount = 0;
  private decryptionErrorTimer: NodeJS.Timeout | null = null;
  private connectionStabilityTimeout: NodeJS.Timeout | null = null;
  private sentMessageIds = new Set<string>();

  constructor(userId: string, sessionId: string) {
    this.userId = userId;
    this.sessionId = sessionId;
    this.instanceId = uuidv4();
  }

  // Auth path is no longer needed but we keep folder logic just in case or remove if safe
  private getAuthPath() {
    return path.join(__dirname, '../data/auth_info_baileys', this.sessionId);
  }

  /**
   * Initialize Session
   */
  async startSession(onQR: (qr: string) => void, onConnected: () => void, onError?: (reason: any) => void) {
    if (this.sock || this.status === 'CONNECTED') {
      console.log(`[Engine] Session ${this.sessionId} is already active/connecting. Ignoring start request.`);
      if (this.status === 'CONNECTED') onConnected();
      return;
    }

    this.status = 'QR';
    console.log(`[Engine] Starting Baileys socket for session ${this.sessionId} (Mongo Auth)...`);

    try {
      // Fetch latest version with a hardcoded fallback to avoid 405 errors
      let version: [number, number, number] = [2, 3000, 1017531287];
      try {
        const latest = await fetchLatestBaileysVersion();
        version = latest.version;
        console.log(`[Engine] Using fetched version ${version.join('.')} for ${this.sessionId}`);
      } catch (e) {
        console.warn(`[Engine] Failed to fetch latest version, using fallback ${version.join('.')}`);
      }

      // Use MongoDB Auth Adapter
      const { state, saveCreds } = await useMongoDBAuthState(this.sessionId);

      // Create Socket
      this.sock = makeWASocket({
        auth: state,
        version,
        printQRInTerminal: false,
        mobile: false,
        logger: P({ level: 'error' }),
        browser: Browsers.macOS('Chrome'),
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false, // Disable history sync to prevent Signal key desync
        msgRetryCounterCache,
        getMessage: async () => undefined,
        markOnlineOnConnect: false
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

            // 1. Update this session with the phone number and Instance ID
            await storage.saveItem('sessions', {
              id: this.sessionId,
              instanceId: this.instanceId,
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
          // Delay resetting retryCount to ensure stability. 
          // If we disconnect within 15s (e.g. 440 conflict), retryCount will NOT reset, forcing exponential backoff.
          if (this.connectionStabilityTimeout) clearTimeout(this.connectionStabilityTimeout);
          this.connectionStabilityTimeout = setTimeout(() => {
            this.retryCount = 0;
            console.log(`[Engine] Session ${this.sessionId} connection stabilized. Retry count reset.`);
          }, 15000);

          onConnected();
        } else if (connection === 'close') {
          const reason = (lastDisconnect?.error as any)?.output?.statusCode;
          console.log(`[Engine] Connection closed for ${this.sessionId}. Reason: ${reason}`);

          // Reset status to allow reconnection logic to pass the guard in startSession
          // BUT only if not a fatal error
          if (this.status !== 'ERROR') {
            this.status = 'IDLE';
          }
          this.sock = null;
          if (this.connectionStabilityTimeout) clearTimeout(this.connectionStabilityTimeout);

          // Detect Signal "Over 2000 messages into the future" error or session desync
          const errorMessage = lastDisconnect?.error?.message || '';
          const isFatalSignal = errorMessage.includes('Over 2000 messages into the future') ||
            errorMessage.includes('SessionError') ||
            errorMessage.includes('MessageCounterError') ||
            (lastDisconnect?.error as any)?.name === 'SessionError' ||
            (lastDisconnect?.error as any)?.name === 'MessageCounterError';

          if (isFatalSignal) {
            console.error(`[Engine] FATAL DECRYPTION ERROR for ${this.sessionId}: ${errorMessage}. Forcing session reset.`);
            this.status = 'ERROR';
            await this.cleanupData();
            if (onError) onError('fatal_signal_error');
            return; // Stop the loop
          }

          // Reason 440: Connection Replaced (Conflict)
          // Reason 405: Unauthorized/Invalid Session. Reason 401: Logged Out.
          const isConflict = reason === 440;
          const isInvalidSession = reason === 405 || reason === 401 || reason === DisconnectReason.loggedOut;

          let shouldReconnect = !isInvalidSession;

          if (isConflict) {
            this.conflictCount++;
            console.warn(`[Engine] CONFLICT detected for ${this.sessionId} (Count: ${this.conflictCount}).`);

            if (this.conflictCount > 3) {
              console.error(`[Engine] Too many conflicts for ${this.sessionId}. Stopping to prevent loop.`);
              shouldReconnect = false;
            } else {
              // Wait for DB consistency
              await new Promise(resolve => setTimeout(resolve, 3000));

              const currentSession = await storage.getItem('sessions', { id: this.sessionId });

              // DEFINITIVE Ownership Check
              const isOwner = currentSession?.instanceId === this.instanceId;

              if (!isOwner || !currentSession || currentSession.status === 'TERMINATED' || currentSession.status === 'DISCONNECTED') {
                console.log(`[Engine] Session ${this.sessionId} yield to newer instance. Local: ${this.instanceId.slice(0, 8)}, DB: ${currentSession?.instanceId?.slice(0, 8)}. Stopping.`);
                shouldReconnect = false;
              } else {
                const phoneNumber = currentSession.phoneNumber;
                if (phoneNumber) {
                  const allSessions = await storage.getItems('sessions', { phoneNumber });
                  const newerActive = allSessions.find(s => s.id !== this.sessionId && s.status === 'CONNECTED');
                  if (newerActive) {
                    console.log(`[Engine] Newer active session found (${newerActive.id}). Yielding ${this.sessionId}.`);
                    shouldReconnect = false;
                  }
                }
              }
            }
          }

          if (shouldReconnect) {
            const delay = isConflict ? 20000 : Math.min(Math.pow(2, this.retryCount) * 1000, 30000); // Wait longer on conflict
            console.log(`[Engine] Reconnecting in ${delay}ms... (Attempt ${this.retryCount + 1})`);

            this.retryCount++;
            setTimeout(() => this.startSession(onQR, onConnected), delay);
          } else {
            console.log(`[Engine] Session ${this.sessionId} stopped. Reason: ${reason || 'Yield/Logout'}`);
            this.status = 'ERROR';
            if (reason !== 440) await this.cleanupData(); // Don't wipe keys on conflict yield
            if (onError) onError(reason || 'stopped');
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
        console.log(`[Engine] messages.upsert event: ${messages.length} messages, Type: ${type}`);

        if (type === 'notify' || type === 'append') {
          const contactsToUpdate = [];
          for (const msg of messages) {
            let remoteJid = msg.key.remoteJid;
            console.log(`[Engine] Incoming msg from ${remoteJid}, fromMe: ${msg.key.fromMe}`);

            const m = msg.message;
            const messageContent = m?.ephemeralMessage?.message || m?.viewOnceMessage?.message || m?.viewOnceMessageV2?.message || m;
            const textContent = (messageContent?.conversation || messageContent?.extendedTextMessage?.text || messageContent?.imageMessage?.caption || '').trim();
            const lowerText = textContent.toLowerCase();
            const hasMedia = !!(messageContent?.imageMessage || messageContent?.videoMessage || messageContent?.audioMessage || messageContent?.documentMessage);
            const isUnmuteCommand = ['#bot', '#unmute', '!bot', '/bot', 'unmute', '#تفعيل'].includes(lowerText);

            // --- Global System Commands (#bot) ---
            if (isUnmuteCommand) {
              console.log(`[Engine] SYSTEM COMMAND detected (fromMe: ${msg.key.fromMe}): UNMUTE for ${remoteJid}`);
              try {
                await storage.deleteItem('muted_chats', { sessionId: this.sessionId, chatId: remoteJid });
                // Optional: Notify on successful unmute (Only once)
                // if (!msg.key.fromMe) await this.sock.sendMessage(remoteJid, { text: "🤖 Bot Re-enabled!" });
              } catch (err) {
                console.error('[Engine] Failed to unmute chat:', err);
              }
              // If it's a command, we don't want to trigger auto-replies or takeover
              continue;
            }

            if (msg.key.fromMe) {
              // Ignore bot's own messages (Auto-Replies) to prevent triggering Human Takeover
              if (msg.key.id && this.sentMessageIds.has(msg.key.id)) {
                continue;
              }

              // --- Human Takeover Logic (Muting) ---
              // If user replies manually, mute the bot for this chat
              const msgTimestamp = msg.messageTimestamp;
              const now = Math.floor(Date.now() / 1000);
              const isStale = msgTimestamp && (now - Number(msgTimestamp) > 60);

              if (remoteJid && !remoteJid.includes('@broadcast') && !remoteJid.includes('@g.us') && !isStale && type !== 'append') {
                // Ignore protocol/system messages
                if (m?.protocolMessage || m?.senderKeyDistributionMessage || m?.peerDataOperationRequestMessage) continue;

                // Only proceed if there's actual content (already checked isUnmuteCommand above)
                if (!textContent && !hasMedia) continue;

                console.log(`[Human Takeover] MANUAL REPLY detected. Chat: ${remoteJid}, Content: "${textContent.substring(0, 50)}", Type: ${type}`);
                try {
                  await storage.saveItem('muted_chats', {
                    sessionId: this.sessionId,
                    chatId: remoteJid,
                    mutedAt: new Date(),
                    userId: this.userId
                  });
                } catch (err) {
                  console.error('[Human Takeover] Failed to mute chat:', err);
                }
              } else if (isStale) {
                console.log(`[Human Takeover] Ignored stale manual reply from ${remoteJid} (Age: ${now - Number(msgTimestamp)}s)`);
              }
              continue;
            }

            remoteJid = msg.key.remoteJid;

            // --- Signal Repair Logic ---
            // Detect and fix decryption errors on the fly
            // messageStubType 1 is CIPHERTEXT
            const isCiphertext = msg.messageStubType === 'CIPHERTEXT' || msg.messageStubType === 1 ||
              (!msg.message && !msg.key.fromMe && !msg.messageStubType);

            if (isCiphertext) {
              this.decryptionErrorCount++;
              console.warn(`[Engine] Decryption failure from ${remoteJid} (Total: ${this.decryptionErrorCount}). Attempting Signal Repair...`);

              // Flush timer
              if (!this.decryptionErrorTimer) {
                this.decryptionErrorTimer = setTimeout(() => {
                  this.decryptionErrorCount = 0;
                  this.decryptionErrorTimer = null;
                }, 30000);
              }

              if (this.decryptionErrorCount > 15) {
                console.error(`[Engine] DECRYPTION STORM DETECTED for ${this.sessionId}. Session is unsalvageable. Forcing logout.`);
                this.status = 'ERROR';
                await this.logout(); // This calls cleanupData()
                return;
              }

              try {
                // Force clear session for this JID
                if (this.sock?.signalRepository?.clearSession) {
                  await this.sock.signalRepository.clearSession(remoteJid);
                  console.log(`[Engine] Cleared Signal session for ${remoteJid}.`);
                }
              } catch (repairErr) {
                console.error('[Engine] Signal Repair failed:', repairErr);
              }
            }

            // Allow @s.whatsapp.net AND @lid (Lightning IDs)
            if (!remoteJid || remoteJid.includes('@broadcast') || (!remoteJid.includes('@s.whatsapp.net') && !remoteJid.includes('@lid'))) continue;

            const pushName = msg.pushName;

            // --- Webhook Trigger (n8n & Multiple) ---
            try {
              const session = await storage.getItem('sessions', { id: this.sessionId });

              // Collect all unique URLs
              const targets = new Set<string>();

              // 1. Legacy Single
              if (session?.webhookUrl) targets.add(session.webhookUrl);

              // 2. Legacy Array
              if (session?.webhookUrls && Array.isArray(session.webhookUrls)) {
                session.webhookUrls.forEach((url: string) => {
                  if (url && typeof url === 'string') targets.add(url);
                });
              }

              // 3. New Named Webhooks
              if (session?.webhooks && Array.isArray(session.webhooks)) {
                session.webhooks.forEach((w: any) => {
                  if (w.url && typeof w.url === 'string') targets.add(w.url);
                });
              }

              if (targets.size > 0) {
                console.log(`[Webhook] Reforwarding message from ${remoteJid} to ${targets.size} endpoints.`);

                // Determine message type and content
                let msgType = 'text';
                let msgContent = '';

                if (msg.message?.conversation) {
                  msgContent = msg.message.conversation;
                } else if (msg.message?.extendedTextMessage?.text) {
                  msgContent = msg.message.extendedTextMessage.text;
                } else if (msg.message?.imageMessage) {
                  msgType = 'image';
                  msgContent = '[Image]'; // We could potentially download and upload, or just notify
                } else if (msg.message?.videoMessage) {
                  msgType = 'video';
                  msgContent = '[Video]';
                } else if (msg.message?.audioMessage) {
                  msgType = 'audio';
                  msgContent = '[Audio]';
                } else if (msg.message?.documentMessage) {
                  msgType = 'document';
                  msgContent = '[Document]';
                }

                const payload = {
                  event: 'message.received',
                  session_id: this.sessionId,
                  from: remoteJid.replace('@s.whatsapp.net', ''),
                  pushName: pushName,
                  type: msgType,
                  content: msgContent,
                  timestamp: msg.messageTimestamp,
                  full_message: msg
                };

                // Dispatch to all targets (Fire and Forget)
                const promises = Array.from(targets).map(url =>
                  fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                  }).catch(err => console.error(`[Webhook] Failed to send to ${url}:`, err.message))
                );

                // We don't await all to avoid blocking, but maybe we should await Promise.allSettled slightly?
                // The original code didn't await. Let's keep it async.
              }
            } catch (whErr) {
              console.error('[Webhook] Error:', whErr);
            }

            // --- Auto Reply Logic ---
            try {
              // 0. Check if Chat is Muted (Human Takeover)
              const isMuted = await storage.getItem('muted_chats', { sessionId: this.sessionId, chatId: remoteJid });

              if (isMuted) {
                // Still check for match to help debug, but don't send
                console.log(`[AutoReply] [Muted Mode] Rule check for ${remoteJid} (skipped sending).`);
              } else if (textContent) {
                console.log(`[AutoReply] [DEBUG] Checking rules. User: ${this.userId}, Session: ${this.sessionId}, Content: "${textContent}"`);
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
                    let sentMsg;
                    if (matchedRule.replyType === 'image' && matchedRule.mediaUrl) {
                      sentMsg = await this.sock.sendMessage(remoteJid, {
                        image: { url: matchedRule.mediaUrl },
                        caption: responseText
                      }, { quoted: msg });

                    } else if (matchedRule.replyType === 'video' && matchedRule.mediaUrl) {
                      sentMsg = await this.sock.sendMessage(remoteJid, {
                        video: { url: matchedRule.mediaUrl },
                        caption: responseText
                      }, { quoted: msg });

                    } else if (matchedRule.replyType === 'document' && matchedRule.mediaUrl) {
                      sentMsg = await this.sock.sendMessage(remoteJid, {
                        document: { url: matchedRule.mediaUrl },
                        mimetype: 'application/pdf', // Default, maybe detect from extension later
                        fileName: matchedRule.fileName || 'file.pdf',
                        caption: responseText
                      }, { quoted: msg });

                    } else if (matchedRule.replyType === 'audio' && matchedRule.mediaUrl) {
                      sentMsg = await this.sock.sendMessage(remoteJid, {
                        audio: { url: matchedRule.mediaUrl },
                        ptt: true // Send as Voice Note
                      }, { quoted: msg });

                    } else {
                      // Default: Text
                      sentMsg = await this.sock.sendMessage(remoteJid, { text: responseText }, { quoted: msg });
                    }

                    if (sentMsg?.key?.id) {
                      this.sentMessageIds.add(sentMsg.key.id);
                      setTimeout(() => this.sentMessageIds.delete(sentMsg.key.id!), 15000); // Clear after 15s
                    }
                    console.log(`[AutoReply] Sent ${matchedRule.replyType || 'text'} response.`);

                  } catch (sendErr) {
                    console.error('[AutoReply] Failed to send response:', sendErr);
                    // Fallback to text if media fails?
                    await this.sock.sendMessage(remoteJid, { text: `[Error sending media] ${responseText}` }, { quoted: msg });
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
      let sentMsg;
      if (type === 'text') {
        // Plain text message
        sentMsg = await this.sock.sendMessage(jid, { text: content });
      } else {
        // Media message handling
        const isUrl = content.startsWith('http://') || content.startsWith('https://');

        if (isUrl) {
          // A. Handle URL (Best for n8n/Automation)
          console.log(`[API] Detected Media URL for ${type}`);

          if (type === 'image') {
            sentMsg = await this.sock.sendMessage(jid, { image: { url: content }, caption: caption });
          } else if (type === 'audio') {
            sentMsg = await this.sock.sendMessage(jid, { audio: { url: content }, ptt: true }); // Send as Voice Note
          } else if (type === 'video') {
            sentMsg = await this.sock.sendMessage(jid, { video: { url: content }, caption: caption });
          } else if (type === 'document') {
            // Try to guess mimetype or default to pdf (WhatsApp requires mimetype for documents usually)
            // Ideally we'd fetch HEAD to check content-type, but for now we default to pdf/octet-stream
            // n8n users should ensure their URL is direct.
            sentMsg = await this.sock.sendMessage(jid, {
              document: { url: content },
              mimetype: 'application/pdf',
              fileName: caption || content.split('/').pop() || 'file.pdf'
            });
          }

        } else {
          // B. Handle Base64 (Legacy/Direct Upload)
          const base64Part = content.includes(',') ? content.split(',')[1] : content;
          if (!base64Part) throw new Error("Invalid media content: Base64 data missing");

          const buffer = Buffer.from(base64Part, 'base64');

          if (type === 'image') {
            sentMsg = await this.sock.sendMessage(jid, { image: buffer, caption: caption });
          } else if (type === 'audio') {
            sentMsg = await this.sock.sendMessage(jid, { audio: buffer, ptt: true });
          } else if (type === 'video') {
            sentMsg = await this.sock.sendMessage(jid, { video: buffer, caption: caption });
          } else if (type === 'document') {
            sentMsg = await this.sock.sendMessage(jid, { document: buffer, mimetype: 'application/pdf', fileName: caption || 'file.pdf' });
          }
        }
      }

      if (sentMsg?.key?.id) {
        this.sentMessageIds.add(sentMsg.key.id);
        setTimeout(() => this.sentMessageIds.delete(sentMsg.key.id!), 15000); // Clear after 15s
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
      // 1. Clear MongoDB Auth State (SaaS Core)
      // The model name is 'AuthState', Mongoose pluralizes to 'authstates' or 'auth_states' 
      // but the storage.deleteItem uses the collection name passed.
      // Based on mongoAuth.ts, it uses the AuthState model.
      await AuthState.deleteMany({ sessionId: this.sessionId });

      // 2. Update Session Status in DB to prevent automatic resumption
      await storage.saveItem('sessions', { id: this.sessionId, status: 'DISCONNECTED' });

      // 3. Optional: Clear local files (Legacy/Fallback)
      const authPath = this.getAuthPath();
      await fs.rm(authPath, { recursive: true, force: true });

      console.log(`[Engine] Auth data and status for ${this.sessionId} cleared in DB & Disk.`);
    } catch (e) {
      console.error('[Engine] Failed to clear data:', e);
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
