import {createHash, timingSafeEqual} from 'node:crypto';

/** Fail closed at startup. Only a single Authorization: Bearer header is accepted. */
export function createApiAuthentication({key=process.env.AUTHEN_KEY_FOR_DOMAIN}={}) {
  if (typeof key!=='string' || Buffer.byteLength(key)<32 || Buffer.byteLength(key)>512 || !/^[\x21-\x7e]+$/.test(key)) {
    throw new Error('AUTHEN_KEY_FOR_DOMAIN must contain 32..512 printable ASCII bytes without whitespace');
  }
  const expected=createHash('sha256').update(key).digest();
  return (req,res,next)=>{
    res.set('Cache-Control','no-store');
    res.set('X-Content-Type-Options','nosniff');
    let count=0;
    for(let i=0;i<(req.rawHeaders||[]).length;i+=2)if(req.rawHeaders[i].toLowerCase()==='authorization')count++;
    const header=req.headers.authorization;
    const match=typeof header==='string'&&header.length<=520?/^Bearer ([\x21-\x7e]{32,512})$/i.exec(header):null;
    const candidate=createHash('sha256').update(match?match[1]:'').digest();
    const valid=timingSafeEqual(expected,candidate);
    if(count!==1||!match||!valid)return res.status(401).set('WWW-Authenticate','Bearer realm="crawler-api"').json({status:'unauthorized',reason:'AUTHENTICATION_REQUIRED'});
    return next();
  };
}
