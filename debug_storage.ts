import { storage } from './services/storage.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Current __dirname:', __dirname);

async function testStorage() {
    console.log('Initializing storage...');
    await storage.init();

    console.log('Seeding admin...');
    try {
        await storage.saveItem('users', {
            username: 'admin@admin.com',
            role: 'admin',
            test: true
        });
        console.log('Admin seeded.');
    } catch (e: any) {
        console.error('Failed to save item:', e.message);
    }

    console.log('Reading users...');
    try {
        const users = await storage.getItems('users');
        console.log('Users found:', users);
    } catch (e: any) {
        console.error('Failed to read items:', e.message);
    }
}

testStorage();
