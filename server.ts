import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { WhatsAppEngine } from './services/whatsappEngine.ts';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    maxHttpBufferSize: 1e7, // 10 MB
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// متغير لتخزين محرك الواتساب (يمكن تطويره ليدعم جلسات متعددة)
const engine = new WhatsAppEngine('master-session');

io.on('connection', (socket) => {
    console.log('Frontend connected:', socket.id);

    socket.on('start-session', async () => {
        console.log('Request to start session received.');
        try {
            // إخبار الواجهة أننا بدأنا
            socket.emit('status', 'connecting');

            await engine.startSession(
                (qrCodeDataUrl) => {
                    console.log('QR Code generated.');
                    socket.emit('qr', qrCodeDataUrl);
                    socket.emit('status', 'qr');
                },
                () => {
                    console.log('WhatsApp Connected!');
                    socket.emit('status', 'connected');
                }
            );
        } catch (error) {
            console.error('Session start error:', error);
            socket.emit('status', 'error');
        }
    });

    // استقبال طلب إرسال رسالة
    socket.on('send-message', async (data) => {
        console.log('Message request received:', data);
        const { numbers, type, content, caption, minDelay = 3, maxDelay = 10 } = data;

        // Validation
        if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
            socket.emit('message-status', { error: 'No numbers provided' });
            return;
        }

        const replaceVariables = (text: string) => {
            if (!text) return text;
            // Replace {{id}} with a random number
            return text.replace(/{{id}}/g, () => Math.floor(Math.random() * 900000 + 100000).toString());
        };

        // Process queue with delay
        let successCount = 0;
        let failCount = 0;

        for (const [index, number] of numbers.entries()) {
            try {
                // Add random delay if specified (skip for first message)
                if (index > 0) {
                    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);
                    console.log(`Waiting for ${delay} seconds before sending to next...`);
                    await new Promise(resolve => setTimeout(resolve, delay * 1000));
                }

                const cleanNumber = number.replace(/\D/g, ''); // Extract only digits
                console.log(`Sending to cleaned number: ${cleanNumber}`);

                // Personalize content
                const personalizedContent = type === 'text' ? replaceVariables(content) : content;
                const personalizedCaption = replaceVariables(caption);

                // Race between send and 20s timeout (increased slightly)
                await Promise.race([
                    engine.send(cleanNumber, type, personalizedContent, personalizedCaption),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Send timeout')), 20000))
                ]);
                successCount++;
                socket.emit('message-progress', {
                    current: index + 1,
                    total: numbers.length,
                    lastNumber: number,
                    status: 'success'
                });

            } catch (error) {
                console.error(`Failed to send to ${number}:`, error);
                failCount++;
                socket.emit('message-progress', {
                    current: index + 1,
                    total: numbers.length,
                    lastNumber: number,
                    status: 'failed',
                    error: (error as any).message
                });
            }
        }

        socket.emit('message-complete', { success: successCount, failed: failCount });
    });

    // يمكن إضافة المزيد من الأحداث هنا مثل قطع الاتصال
    socket.on('logout', async () => {
        console.log('Logout request received');
        await engine.logout();
        socket.emit('status', 'disconnected');
    });
});

const PORT = 3050;
httpServer.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
});
