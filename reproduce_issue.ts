
import './env-loader';
import { storage } from './services/storage';

async function testUserCreation() {
    try {
        console.log('Initializing storage...');
        await storage.init();

        console.log('Attempting to check for existing user...');
        const existing = await storage.getItem('users', { username: 'test_repro@example.com' });
        console.log('Existing check done:', existing);

        if (existing) {
            console.log('User exists, deleting...');
            await storage.deleteItem('users', { username: 'test_repro@example.com' });
        }

        console.log('Attempting to save new user...');
        const newUser = await storage.saveItem('users', {
            name: 'Test Repro',
            username: 'test_repro@example.com',
            password: 'hashed_password_placeholder',
            role: 'user',
            isActive: true
        });

        console.log('User created successfully:', newUser);
        process.exit(0);
    } catch (error) {
        console.error('CAUGHT ERROR:', error);
        process.exit(1);
    }
}

testUserCreation();
