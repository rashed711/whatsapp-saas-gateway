const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config(); // Load variables from .env

async function wipeNumber() {
    try {
        console.log("Connecting to MongoDB...");
        // Use the env var directly or the local dev one if available
        const uri = process.env.MONGO_URI || "mongodb+srv://rashed:gZp0cve82w7S6DMC@cluster0.e4pwt.mongodb.net/whatsapp-saas?retryWrites=true&w=majority";

        console.log("URI Loaded:", uri.substring(0, 20) + "...");

        await mongoose.connect(uri);
        console.log("Connected.");

        const AuthState = mongoose.models.AuthState || mongoose.model('AuthState', new mongoose.Schema({ sessionId: String }, { strict: false }));

        const targetSessionId = 'sess_1772886488441';

        console.log(`Targeting Session: ${targetSessionId}`);
        const authDel = await AuthState.deleteMany({ sessionId: targetSessionId });
        console.log(`Deleted ${authDel.deletedCount} auth states (keys) for ${targetSessionId}`);

        process.exit(0);
    } catch (err) {
        console.error("Connection Error:", err);
        process.exit(1);
    }
}

wipeNumber();
