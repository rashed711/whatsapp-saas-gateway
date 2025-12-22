
/**
 * WhatsApp Engine (SaaS Core)
 * هذا المحرك مصمم للعمل في بيئة Node.js مع Baileys و MongoDB.
 */

// ملاحظة: في بيئة التشغيل الفعلية (Node.js)، سنستخدم BufferJSON.stringify/parse 
// للتعامل مع المفاتيح المشفرة داخل MongoDB.
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import P from 'pino';
import fs from 'fs/promises';
import { getLinkPreview } from 'link-preview-js';



export class WhatsAppEngine {
  private userId: string;
  private status: 'IDLE' | 'QR' | 'CONNECTED' | 'ERROR' = 'IDLE';
  private sock: any = null;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * دالة مخصصة لاسترجاع الجلسة من MongoDB.
   * تقوم بتحويل JSON المخزن إلى مفاتيح Buffer صالحة لـ Baileys.
   */
  async getAuthFromDB() {
    console.log(`[DB] محاولة استعادة الجلسة لـ ${this.userId}...`);
    // Logic: 
    // const session = await SessionModel.findOne({ userId: this.userId });
    // if (session) return BufferJSON.revive(session.authData);
    return null;
  }

  /**
   * دالة حفظ الجلسة في MongoDB.
   */
  async saveAuthToDB(authData: any) {
    console.log(`[DB] جاري مزامنة بيانات التشفير سحابياً...`);
    // Logic:
    // await SessionModel.updateOne({ userId: this.userId }, { authData: BufferJSON.stringify(authData) }, { upsert: true });
  }

  /**
   * تهيئة الاتصال.
   */
  async startSession(onQR: (qr: string) => void, onConnected: () => void) {
    this.status = 'QR';
    console.log('[Engine] Starting Baileys socket...');

    // إنشاء حالة المصادقة (تُحفظ في مجلد auth_<userId>)
    const { state, saveCreds } = await useMultiFileAuthState(`./auth_${this.userId}`);

    // إنشاء socket للواتساب
    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: P({ level: 'silent' })
    });
    const sock = this.sock;

    // إرسال QR كـ data URL للواجهة الأمامية
    // (تم الدمج مع connection.update)

    // مراقبة تحديثات الاتصال
    // مراقبة تحديثات الاتصال واستلام الـ QR
    sock.ev.on('connection.update', async (update) => {
      console.log('[Engine] Connection update received:', { connection: update.connection, hasQR: !!update.qr });
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('[Engine] QR Code string received from Baileys');
        // Baileys يرسل الـ QR هنا
        const qrDataUrl = `data:image/png;base64,${qr}`;
        onQR(qrDataUrl);
      }
      if (connection === 'open') {
        this.status = 'CONNECTED';
        onConnected();
        await saveCreds();
      } else if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          console.log('[Engine] Reconnecting...');
          this.startSession(onQR, onConnected);
        } else {
          console.log('[Engine] Connection closed, logged out.');
          this.status = 'ERROR';
        }
      }
    });

    // حفظ بيانات الاعتماد عند تحديثها
    sock.ev.on('creds.update', saveCreds);
  }

  async send(to: string, type: 'text' | 'image' | 'audio' | 'video' | 'document', content: string, caption?: string) {
    if (this.status !== 'CONNECTED' || !this.sock) throw new Error("الجهاز غير متصل!");

    const jid = to.includes('@s.whatsapp.net') ? to : `${to}@s.whatsapp.net`;
    console.log(`[API] إرسال ${type} إلى ${to}...`);

    try {
      if (type === 'text') {
        // Detect URL for link preview
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const matchedUrl = content.match(urlRegex)?.[0];

        if (matchedUrl) {
          try {
            const previewData: any = await getLinkPreview(matchedUrl);

            // Construct rich preview message
            // Note: High quality thumbnail requires fetching and buffering the image
            let thumbnail: Buffer | undefined = undefined;
            if (previewData.images && previewData.images.length > 0) {
              try {
                const response = await fetch(previewData.images[0]);
                const arrayBuffer = await response.arrayBuffer();
                thumbnail = Buffer.from(arrayBuffer);
              } catch (e) {
                console.warn('Failed to fetch thumbnail', e);
              }
            }

            await this.sock.sendMessage(jid, {
              text: content,
              contextInfo: {
                externalAdReply: {
                  title: previewData.title || 'Link Preview',
                  body: previewData.description || matchedUrl,
                  thumbnail: thumbnail,
                  sourceUrl: matchedUrl,
                  mediaType: 1, // 1 = Thumbnail from sourceUrl, 2 = Thumbnail from image file
                  renderLargerThumbnail: true
                }
              }
            });
          } catch (err) {
            console.error('Link preview failed, sending text only', err);
            await this.sock.sendMessage(jid, { text: content });
          }
        } else {
          await this.sock.sendMessage(jid, { text: content });
        }
      } else {
        // Handle media (image, audio, video, document)
        // Extract base64 part safely (handles any mimetype prefix)
        const base64Part = content.includes(',') ? content.split(',')[1] : content;

        if (!base64Part) {
          throw new Error("Invalid media content: Base64 data missing");
        }

        const buffer = Buffer.from(base64Part, 'base64');
        console.log(`[API] Created buffer for ${type}, size: ${buffer.length} bytes`);

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
      console.error(`[API] فشل الإرسال:`, error);
      throw error;
    }
  }
  async logout() {
    try {
      console.log('[Engine] Logging out...');
      if (this.sock) {
        await this.sock.logout(); // Try graceful logout
        this.sock.end(undefined); // Close connection
        this.sock = null;
      }
    } catch (err) {
      console.error('[Engine] Error during logout:', err);
    } finally {
      // Force cleanup auth folder
      try {
        await fs.rm(`./auth_${this.userId}`, { recursive: true, force: true });
        console.log('[Engine] Auth session cleared.');
        this.status = 'IDLE';
      } catch (err) {
        console.error('[Engine] Failed to delete auth folder:', err);
      }
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
