export interface ISession {
  _id?: string;
  id: string; // The session ID string (e.g. sess_123)
  name: string;
  userId: string;
  status: 'IDLE' | 'QR' | 'CONNECTED' | 'DISCONNECTED';
  createdAt?: string;
  updatedAt?: string;
}
