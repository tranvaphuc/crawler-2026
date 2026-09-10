import dotenv from 'dotenv';
import ES5ClientPkg from 'elasticsearch';
import { Client } from '@opensearch-project/opensearch';

dotenv.config();

const ES5Client = ES5ClientPkg.Client || ES5ClientPkg;

export const ESMASTER = new ES5Client({
    host: process.env.ES5_HOST,
    log: 'error'
});

export const ESTOPIC = new Client({
    node: process.env.ES7_HOST
});

export const checkEsMaster = async () => {
    try {
        await ESMASTER.ping({
            requestTimeout: 3000
        });
        console.log('[ES Master] connected');
    } catch (error) {
        console.error('[ES Master] connect error:', error.message);
    }
};

export const checkEsTopic = async () => {
    try {
        await ESTOPIC.ping();
        console.log('[ES Topic] connected');
    } catch (error) {
        console.error('[ES Topic] connect error:', error.message);
    }
};
