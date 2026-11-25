import 'dotenv/config';
import {createApiAuthentication} from '../src/services/apiAuthentication.js';
import express from 'express';
import { createFacebookShareRouter } from '../src/routes/facebookShare.js';

const app = express();
app.use(createApiAuthentication());
app.disable('x-powered-by');
app.use(createFacebookShareRouter());
const host = process.env.FACEBOOK_SHARE_HOST || '127.0.0.1';
const port = Number(process.env.FACEBOOK_SHARE_PORT || 3804);
const server = app.listen(port, host, () => console.log(`Facebook share API: http://${host}:${server.address().port}/api/facebook/post/share`));
server.requestTimeout = 30000;
server.headersTimeout = 10000;
