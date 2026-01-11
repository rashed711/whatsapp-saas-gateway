import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Try to load .env files from current dir and root dir (for dist-server)
const envPaths = [
    path.join(__dirname, '.env.local'),
    path.join(__dirname, '.env'),
    path.join(__dirname, '..', '.env.local'),
    path.join(__dirname, '..', '.env')
];
let loaded = false;
for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
        dotenv.config({ path: envPath });
        console.log(`✅ Loaded environment from: ${envPath}`);
        loaded = true;
        break;
    }
}
if (!loaded) {
    console.warn('⚠️  No .env file found. Relying on system environment variables.');
}
// Validation
if (!process.env.MONGO_URI) {
    console.error('❌ FATAL: MONGO_URI is not defined in environment variables.');
    // We don't exit here to allow for some setups where it might be injected later, 
    // but typically this will cause a crash in db.ts
}
else {
    console.log('✅ MONGO_URI is set.');
}
