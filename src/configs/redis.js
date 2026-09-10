import dotenv from 'dotenv';
import { createClient } from 'redis';

dotenv.config();

export const redisClient = createClient({
    socket: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT)
    }
});

redisClient.on('error', (err) => {
    console.error('[Redis] error:', err.message);
});

redisClient.on('connect', () => {
    console.log('[Redis] connected');
});

export const connectRedis = async () => {
    try {
        await redisClient.connect();
    } catch (error) {
        console.error('[Redis] connect error:', error.message);
    }
};