
export interface User {
  id: string;
  email: string;
  apiKey: string;
  isConnected: boolean;
}

export interface ConnectionStatus {
  status: 'connecting' | 'connected' | 'disconnected' | 'qr';
  qr?: string;
  error?: string;
}

export interface SendMessageRequest {
  to: string;
  message: string;
}

export interface SessionData {
  userId: string;
  creds: any;
  keys: any;
}
