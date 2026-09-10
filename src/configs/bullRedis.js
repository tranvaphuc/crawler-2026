import 'dotenv/config';
import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;

export const bullConnection = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null
});

bullConnection.on('error', (err) => {
    console.error('[Bull Redis] error:', err.message);
});

bullConnection.on('connect', () => {
    console.log('[Bull Redis] connected');
});
