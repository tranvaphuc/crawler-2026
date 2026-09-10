import dotenv from 'dotenv';

dotenv.config();

const config = {
    port: Number(process.env.PORT || 3000),
    es5: {
        host: process.env.ES5_HOST
    },
    es7: {
        node: process.env.ES7_HOST
    },
    mongo: {
        uri: process.env.MONGO_URI
    },
    redis: {
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT)
    }
};

export default config;