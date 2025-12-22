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

// Stats (Mock/Simple In-Memory)
let stats = {
    messagesToday: 0,
    startTime: Date.now()
};

app.get('/stats', (req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - stats.startTime) / 1000);
    const uptimeStr = uptimeSeconds > 3600
        ? `${Math.floor(uptimeSeconds / 3600)}h ${Math.floor((uptimeSeconds % 3600) / 60)}m`
        : `${Math.floor(uptimeSeconds / 60)}m ${uptimeSeconds % 60}s`;

    res.header('Access-Control-Allow-Origin', '*');
    res.json({
        messagesToday: stats.messagesToday,
        activeDevices: engine.currentStatus === 'CONNECTED' ? 1 : 0,
        uptime: uptimeStr
    });
});

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

        // Normalization Helper
        const normalizeNumber = (num: string) => {
            const clean = num.replace(/\D/g, '');
            // Egypt: 010xxxx -> 2010xxxx
            if (clean.startsWith('01') && clean.length === 11) {
                return '20' + clean.substring(1);
            }
            return clean;
        };

        // Deduplicate Numbers
        const uniqueNumbers = [...new Set(numbers.map((n: string) => normalizeNumber(n)))];
        console.log(`Received ${numbers.length} numbers, processing ${uniqueNumbers.length} unique numbers.`);

        for (const [index, number] of uniqueNumbers.entries()) {
            try {
                // Add random delay if specified (skip for first message)
                if (index > 0) {
                    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);
                    console.log(`Waiting for ${delay} seconds before sending to next...`);
                    await new Promise(resolve => setTimeout(resolve, delay * 1000));
                }

                console.log(`Processing unique number: ${number}`);
                const finalNumber = number;

                // Validate Number with 10s Timeout
                try {
                    const isValid = await Promise.race([
                        engine.validateNumber(finalNumber),
                        new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('Validation timeout')), 10000))
                    ]);

                    if (!isValid) {
                        throw new Error("Number not active on WhatsApp");
                    }
                } catch (valError) {
                    throw new Error(`Validation failed: ${(valError as any).message}`);
                }

                // Personalize content
                const personalizedContent = type === 'text' ? replaceVariables(content) : content;
                const personalizedCaption = replaceVariables(caption);

                // Race between send and 20s timeout
                await Promise.race([
                    engine.send(finalNumber, type, personalizedContent, personalizedCaption),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Send timeout')), 20000))
                ]);
                successCount++;
                stats.messagesToday++;
                socket.emit('message-progress', {
                    current: index + 1,
                    total: uniqueNumbers.length,
                    lastNumber: number,
                    status: 'success'
                });

            } catch (error) {
                console.error(`Failed to send to ${number}:`, error);
                failCount++;
                socket.emit('message-progress', {
                    current: index + 1,
                    total: uniqueNumbers.length,
                    lastNumber: number,
                    status: 'failed',
                    error: (error as any).message,
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
