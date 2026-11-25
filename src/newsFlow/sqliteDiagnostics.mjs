const names={1:'SQLITE_ERROR',5:'SQLITE_BUSY',6:'SQLITE_LOCKED',7:'SQLITE_NOMEM',8:'SQLITE_READONLY',10:'SQLITE_IOERR',11:'SQLITE_CORRUPT',13:'SQLITE_FULL',14:'SQLITE_CANTOPEN',19:'SQLITE_CONSTRAINT',21:'SQLITE_MISUSE',26:'SQLITE_NOTADB'};
export function newsSqliteDiagnostics(error){
 if(error?.code!=='ERR_SQLITE_ERROR')return {};
 const code=Number.isInteger(error.errcode)?error.errcode:null;
 const frame=String(error.stack||'').split('\n').map(s=>s.match(/(?:src[\\/]newsFlow|scripts)[\\/][A-Za-z0-9_.-]+:\d+:\d+/)?.[0]).find(Boolean)||null;
 return {sqlite:{code,name:code===null?'SQLITE_UNKNOWN':names[code&255]||'SQLITE_UNKNOWN',operation:/^(master_(seed|article)|recover_(seed|article)|sync_seeds|cleanup_(links|samples|tasks|requests|cycles|events)|claim_writes|finish_(verified|held|seed)|write_batch)$/.test(error.newsDbOperation||'')?error.newsDbOperation:null,elapsedMs:Number.isFinite(error.newsDbElapsedMs)?error.newsDbElapsedMs:null,frame}};
}
