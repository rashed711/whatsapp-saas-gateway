export interface IAutoReply {
    _id?: string;
    userId: string;
    sessionId?: string; // Optional: bind to specific session
    keyword: string;
    matchType: 'exact' | 'contains';
    response: string;
    isActive: boolean;
    createdAt?: Date;
}
