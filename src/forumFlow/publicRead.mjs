import axios from 'axios';import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {isExcludedSource} from '../web/sourceExclusions.mjs';
// Only the two DFF loadview operations below use POST; their frontend implements
// read-only comment/statistics queries with POST. Never pass arbitrary endpoints.
export async function publicRead({site,url,referer,form,evidenceDirectory,now=Date.now()}){
 const u=new URL(url);if(isExcludedSource(u.hostname)||!site.allowedHosts.includes(u.hostname))throw Error('PUBLIC_READ_HOST_NOT_ALLOWED');
 if(form&&!(site.domain==='dff.vn'&&u.pathname.toLowerCase()==='/vendor/dffvn/news/handler/loadview.ashx'&&['8','9'].includes(u.searchParams.get('t'))))throw Error('PUBLIC_POST_READ_NOT_ALLOWED');
 const dir=path.resolve(evidenceDirectory,site.domain);await fs.mkdir(dir,{recursive:true});
 const response=await axios({url,method:form?'POST':'GET',data:form?new URLSearchParams(form).toString():undefined,proxy:false,timeout:15000,maxRedirects:0,maxContentLength:4000000,responseType:'text',headers:{'User-Agent':'Mozilla/5.0 (compatible; ForumFlow/1.0)','X-Requested-With':'XMLHttpRequest',Referer:referer,Accept:'application/json,text/html','Content-Type':'application/x-www-form-urlencoded'}});
 const key=createHash('sha256').update(url+JSON.stringify(form||{})+response.data).digest('hex');
 const metadata={requestedUrl:url,finalUrl:url,checkedAt:new Date(now).toISOString(),statusCode:response.status,method:form?'POST (frontend read-only loadview)':'GET',evidenceFile:path.join(dir,key+'.response')};
 await fs.writeFile(metadata.evidenceFile,response.data);await fs.writeFile(path.join(dir,key+'.json'),JSON.stringify(metadata,null,2));return {text:response.data,metadata};
}
