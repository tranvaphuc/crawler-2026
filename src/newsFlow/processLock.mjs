import {readFileSync,statSync} from 'node:fs';
export function createNewsProcessLock(file,scope,{pid=process.pid,readLocks=()=>readFileSync('/proc/locks','utf8'),statFile=()=>statSync(file,{bigint:true})}={}){
 const owns=()=>{
  try{
   const stat=statFile(),dev=BigInt(stat.dev),inode=BigInt(stat.ino),major=((dev>>8n)&0xfffn)|((dev>>32n)&0xfffff000n),minor=(dev&0xffn)|((dev>>12n)&0xffffff00n);
   return readLocks().split('\n').some(line=>{const f=line.trim().split(/\s+/);if(f[1]!=='FLOCK'||f[2]!=='ADVISORY'||f[3]!=='WRITE'||f[4]!==String(pid))return false;const d=f[5]?.split(':');return d?.length===3&&BigInt('0x'+d[0])===major&&BigInt('0x'+d[1])===minor&&BigInt(d[2])===inode;});
  }catch{return false;}
 };
 if(!owns())throw Error('NEWS_PROCESS_LOCK_REQUIRED');return {scope,owns};
}
