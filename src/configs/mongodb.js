import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

export const connectMongo = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('[MongoDB] connected');
    } catch (error) {
        console.error('[MongoDB] connect error:', error.message);
        process.exit(1);
    }
};

export default mongoose;