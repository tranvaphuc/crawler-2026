const decoder=new TextDecoder('utf-8',{fatal:true});
export function readNextFlightJsonRecords(scripts,{maxBytes=8000000,maxRows=20000}={}){
 const parts=[];let chars=0;
 for(const source of scripts){const raw=String(source||'').trim();if(!raw.startsWith('self.__next_f.push('))continue;let tuple;try{tuple=JSON.parse(raw.slice(raw.indexOf('(')+1,raw.lastIndexOf(')')));}catch{continue;}if(tuple?.[0]!==1||typeof tuple[1]!=='string')continue;chars+=tuple[1].length;if(chars>maxBytes)return null;parts.push(tuple[1]);}
 const bytes=Buffer.from(parts.join(''),'utf8');if(bytes.length>maxBytes)return null;const values=new Map(),strings=new Map();let cursor=0,count=0;
 const store=(id,value)=>{if(values.has(id)&&JSON.stringify(values.get(id))!==JSON.stringify(value))return false;values.set(id,value);if(typeof value==='string')strings.set(id,value);return true;};
 try{while(cursor<bytes.length){if(bytes[cursor]===10||bytes[cursor]===13){cursor++;continue;}if(++count>maxRows)return null;
  // React resource hints have no row ID; validate and discard their inert JSON.
  if(bytes[cursor]===58){const end=bytes.indexOf(10,cursor);if(end<0)return null;const hint=decoder.decode(bytes.subarray(cursor,end));if(!hint.startsWith(':HL')||!Array.isArray(JSON.parse(hint.slice(3))))return null;cursor=end+1;continue;}
  const prefix=bytes.subarray(cursor,Math.min(cursor+40,bytes.length)).toString('latin1').match(/^([a-f0-9]+):/i);if(!prefix)return null;const id=prefix[1].toLowerCase();cursor+=prefix[0].length;
  if(bytes[cursor]===84){const comma=bytes.indexOf(44,cursor+1);if(comma<0||comma-cursor>16)return null;const hex=bytes.subarray(cursor+1,comma).toString('latin1');if(!/^[a-f0-9]+$/i.test(hex))return null;const length=parseInt(hex,16),end=comma+1+length;if(!Number.isSafeInteger(length)||length>maxBytes||end>bytes.length)return null;const text=decoder.decode(bytes.subarray(comma+1,end));if(!store(id,text))return null;cursor=end;continue;}
  const line=bytes.indexOf(10,cursor),end=line<0?bytes.length:line;let raw=decoder.decode(bytes.subarray(cursor,end));cursor=line<0?bytes.length:line+1;if(raw[0]==='J')raw=raw.slice(1);if(!/^[\[{\"]/.test(raw))continue;let value;try{value=JSON.parse(raw);}catch{return null;}if(!store(id,value))return null;
 }}catch{return null;}
 return {records:[...values.values()].filter(v=>v&&typeof v==='object'),strings};
}
