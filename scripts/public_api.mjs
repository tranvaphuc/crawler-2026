import 'dotenv/config';
import {createPublicApiApp} from '../src/routes/publicApiApp.js';
const app=createPublicApiApp({onRequestComplete:event=>console.log(JSON.stringify({at:new Date(),...event}))});
const host=process.env.PUBLIC_API_HOST||'127.0.0.1';
if(host!=='127.0.0.1'&&host!=='::1')throw new Error('PUBLIC_API_HOST must be loopback; publish through the HTTPS reverse proxy');
const port=Number(process.env.PUBLIC_API_PORT||3805);
const server=app.listen(port,host,()=>console.log(`Authenticated crawler API listening on loopback port ${port}`));
server.requestTimeout=120000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxHeadersCount=50;
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(1),15000).unref();});
