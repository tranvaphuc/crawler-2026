import fs from 'node:fs';import{uploadAnonymousGroupCandidate}from'./src/services/anonymousHeaderUpload.js';
const c=JSON.parse(fs.readFileSync(new URL('./config.json',import.meta.url))),result=await uploadAnonymousGroupCandidate(c,{}, {timeoutMs:30000});
if(result?.code!=='CANDIDATE_INVALID'||result.status!=='kept_current')throw Error('UPLOAD_TRANSPORT_NOT_VERIFIED');console.log(JSON.stringify({transportVerified:true,rejectedInvalidCandidate:true,currentHeaderPreserved:true}));
