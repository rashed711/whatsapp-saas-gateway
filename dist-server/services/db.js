import mongoose from 'mongoose';
export const connectDB = async () => {
    try {
        const uri = process.env.MONGO_URI;
        if (!uri) {
            throw new Error('MONGO_URI is not defined in .env');
        }
        await mongoose.connect(uri);
        console.log('✅ MongoDB Connected successfully');
    }
    catch (error) {
        console.error('❌ MongoDB Connection Error:', error);
        process.exit(1); // Exit if DB is critical
    }
};
