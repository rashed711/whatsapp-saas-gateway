
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Current directory:', __dirname);
console.log('Files in directory:');
fs.readdirSync(__dirname).forEach(file => {
    if (file.startsWith('.env')) {
        console.log('Found env file:', file);
        // Only cat safe parts? No, I'll just check existence.
    }
});
