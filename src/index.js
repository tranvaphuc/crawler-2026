import 'dotenv/config';
import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Queue } from 'bullmq';
import { bullConnection } from './configs/bullRedis.js';
import {
    FB_SOURCE_QUEUE_NAME,
    FB_SHARE_QUEUE_NAME,
    FB_CMT_QUEUE_NAME
} from './queues/facebook/master.js';
import { FB_TOKEN_QUEUE_NAME } from './queues/facebook/tokenMaster.js';

const BOARD_PORT = Number(process.env.BOARD_PORT) || 3803;
const QUEUE_NAMES = (process.env.QUEUE_NAMES ||
    `${FB_SOURCE_QUEUE_NAME},${FB_TOKEN_QUEUE_NAME},${FB_SHARE_QUEUE_NAME},${FB_CMT_QUEUE_NAME}`)
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

const queues = QUEUE_NAMES.map(
    (name) => new Queue(name, { connection: bullConnection })
);

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/');

createBullBoard({
    queues: queues.map((q) => new BullMQAdapter(q)),
    serverAdapter
});

const app = express();
app.use('/', serverAdapter.getRouter());

app.listen(BOARD_PORT, () => {
    console.log(`Bull Board: http://localhost:${BOARD_PORT}`);
    console.log('Queues:', QUEUE_NAMES.join(', '));
});
