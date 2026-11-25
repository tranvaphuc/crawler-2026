import subprocess
code=r'''
import fs from 'node:fs';import * as cheerio from 'cheerio';import {createResearchTransport} from './src/web/researchTransport.mjs';
const t=createResearchTransport({timeoutMs:15000,maxSockets:1,persistEvidence:false});
try{const url='https://bovagau.vn/amy-grupo-hut-von-tu-cac-dinh-che-tai-chinh-nhat-ban-san-sang-cho-ngay-len-san-hose-ma-ck-amy-1-151438';const r=await t.get(url,null,'qc'),$=cheerio.load(r.html||'');const data=JSON.parse($('#__NEXT_DATA__').text()).props.pageProps.post;console.log(JSON.stringify({id:data.id,keys:Object.keys(data),author:data.author,contentType:typeof data.content,contentLength:data.content?.length,title:data.title,publishedAt:data.publishedAt,metaAuthor:$('meta[name=author]').attr('content'),visibleAuthors:$('.author,.author-name,[rel=author]').map((i,e)=>$(e).text()).get()}));}finally{await t.close();}
'''
r=subprocess.run(['/opt/forum-flow/node/bin/node','--input-type=module','-e',code],cwd='/opt/forum-flow/current',capture_output=True,text=True,timeout=45)
print(r.stdout)
if r.returncode:print(r.stderr[:1000])
