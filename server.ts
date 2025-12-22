import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { WhatsAppEngine } from './services/whatsappEngine.ts';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
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

    // يمكن إضافة المزيد من الأحداث هنا مثل قطع الاتصال
    socket.on('logout', () => {
        // logic to logout
    });
});

const PORT = 3050;
httpServer.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
});
