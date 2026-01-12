import { WhatsAppEngine } from './whatsappEngine.js';

interface ActiveSession {
    id: string;
    userId: string;
    engine: WhatsAppEngine;
}

export class CampaignService {
    private static activeCampaigns = new Map<string, boolean>();

    static async stopCampaign(socket: any, sessionId: string) {
        if (this.activeCampaigns.has(sessionId)) {
            this.activeCampaigns.set(sessionId, false); // Signal stop
            socket.emit('message-status', { error: 'تم طلب إيقاف الحملة' });
        }
    }

    static async startCampaign(socket: any, data: any, session: ActiveSession, userId: string) {
        const { sessionId, numbers, type, content, caption, minDelay = 3, maxDelay = 10 } = data;

        // Security Check
        if (!session || session.userId !== userId) {
            socket.emit('message-status', { error: 'Invalid Session or Access Denied' });
            return;
        }

        console.log(`Message request for session ${sessionId} by user ${userId}`);

        if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
            socket.emit('message-status', { error: 'No numbers provided' });
            return;
        }

        const replaceVariables = (text: string) => {
            if (!text) return text;
            return text.replace(/{{id}}/g, () => Math.floor(Math.random() * 900000 + 100000).toString());
        };

        const normalizeNumber = (num: string) => {
            if (!num) return '';
            const clean = num.replace(/\D/g, '');
            if (clean.startsWith('01') && clean.length === 11) return '20' + clean.substring(1);
            return clean;
        };

        const uniqueNumbers = [...new Set(
            numbers.map((n: string) => normalizeNumber(n)).filter((n: string) => n.length >= 10)
        )];

        if (uniqueNumbers.length === 0) {
            socket.emit('message-status', { error: 'No valid numbers found' });
            return;
        }

        // Register campaign start
        this.activeCampaigns.set(sessionId, true);

        socket.emit('message-progress', {
            sessionId,
            current: 0,
            total: uniqueNumbers.length,
            status: 'starting'
        });

        let successCount = 0;
        let failCount = 0;

        for (const [index, number] of uniqueNumbers.entries()) {
            // Check for cancellation
            if (this.activeCampaigns.get(sessionId) === false) {
                socket.emit('message-progress', {
                    sessionId,
                    current: index,
                    total: uniqueNumbers.length,
                    status: 'stopped',
                    lastNumber: number
                });
                break; // Exit loop
            }

            try {
                if (index > 0) {
                    const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);
                    await new Promise(resolve => setTimeout(resolve, delay * 1000));
                }

                const finalNumber = number;

                // Validate
                try {
                    const isValid = await Promise.race([
                        session.engine.validateNumber(finalNumber),
                        new Promise<boolean>((_, reject) => setTimeout(() => reject(new Error('Validation timeout')), 15000))
                    ]);

                    if (!isValid) throw new Error("Number not active on WhatsApp");

                } catch (valError) {
                    throw new Error(`Validation failed: ${(valError as any).message}`);
                }

                // Send
                const personalizedContent = type === 'text' ? replaceVariables(content) : content;
                const personalizedCaption = replaceVariables(caption);

                await Promise.race([
                    session.engine.send(finalNumber, type, personalizedContent, personalizedCaption),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Send timeout')), 40000))
                ]);

                successCount++;
                socket.emit('message-progress', {
                    sessionId,
                    current: index + 1,
                    total: uniqueNumbers.length,
                    lastNumber: number,
                    status: 'success'
                });

            } catch (error) {
                failCount++;
                socket.emit('message-progress', {
                    sessionId,
                    current: index + 1,
                    total: uniqueNumbers.length,
                    lastNumber: number,
                    status: 'failed',
                    error: (error as any).message,
                });
            }
        }

        socket.emit('message-complete', { sessionId, success: successCount, failed: failCount });
    }
}
