export interface IMessage {
    _id?: string;
    sessionId: string;
    remoteJid: string;
    fromMe: boolean;
    content: any;
    timestamp: number;
    pushName?: string;
    id: string; // WhatsApp Message ID
    createdAt?: string;
}
