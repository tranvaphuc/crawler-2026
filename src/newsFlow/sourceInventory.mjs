import net from 'node:net';
import {isExcludedSource} from '../web/sourceExclusions.mjs';

export function newsSourceHost(value) {
  try {
    const u=new URL(/^https?:\/\//i.test(value)?value:'https://'+value);
    const host=u.hostname.toLowerCase().replace(/^www\./,'');
    return /^https?:$/.test(u.protocol)&&!u.username&&!u.password&&!net.isIP(host)&&host.includes('.')?host:null;
  } catch {return null;}
}

export function classifyNewsSourceHit(hit,registry,knownForums=new Set()) {
  const doc=hit._source||{},urlHost=newsSourceHost(doc.url||''),nameHost=newsSourceHost(doc.siteName||''),domain=urlHost||nameHost;
  const row={domain,urlHost,nameHost,siteName:doc.siteName||'',example:hit};
  if(!domain)return {...row,state:'excluded',reason:'invalid_site_and_url_host'};
  const forum=h=>h&&(/^(?:forum|forums|diendan|board)\./.test(h)||[...knownForums].some(f=>h===f||h.endsWith('.'+f)));
  if(isExcludedSource(domain)||isExcludedSource(nameHost))return {...row,state:'excluded',reason:'user_excluded_fireant'};
  if(/^forum/i.test(hit._type||'')||forum(domain)||forum(nameHost))return {...row,state:'excluded',reason:'user_excluded_forum'};
  const owner=registry.byHost(domain)||[...registry.sources.values()].find(s=>s.config.registrableDomain&&(domain===s.config.registrableDomain||domain.endsWith('.'+s.config.registrableDomain)));
  if(owner)return {...row,state:'already_configured',source:owner.domain};
  return {...row,state:'candidate'};
}
