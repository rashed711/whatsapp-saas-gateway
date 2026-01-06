export interface IUser {
    _id?: string;
    name: string;
    username: string; // Used as email/login id
    password?: string;
    role: 'admin' | 'user';
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
}
