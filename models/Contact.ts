export interface IContact {
    _id?: string;
    sessionId: string;
    id: string; // WhatsApp JID (phone number @s.whatsapp.net)
    name?: string; // Name saved in phone book
    notify?: string; // Name set by the user on WhatsApp
    verifiedName?: string; // Verified business name
    createdAt?: string;
    updatedAt?: string;
}
