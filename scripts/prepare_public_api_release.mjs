import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
const env=dotenv.parse(await fs.readFile('.env'));
const root=path.resolve(process.env.PUBLIC_API_RELEASE_DIR||'outputs/public-api-deploy-2026-10-24');
await fs.mkdir(root,{recursive:true,mode:0o700});
const stage=path.join(root,'release.credentials');await fs.mkdir(stage,{recursive:true,mode:0o700});
const files=new Set(),deps=new Set();
async function scan(file){if(files.has(file))return;files.add(file);const text=await fs.readFile(file,'utf8');for(const m of text.matchAll(/(?:from\s*|import\s*\(|import\s*)['"]([^'"]+)['"]/g)){const spec=m[1];if(spec.startsWith('.'))await scan(path.normalize(path.join(path.dirname(file),spec)));else if(!spec.startsWith('node:'))deps.add(spec.startsWith('@')?spec.split('/').slice(0,2).join('/'):spec.split('/')[0]);}}
await scan('scripts/public_api.mjs');await scan('scripts/proxy_manager.mjs');await scan('scripts/proxy_manager_admin.mjs');
for(const file of files){const dest=path.join(stage,file);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(file,dest);}
await fs.mkdir(path.join(stage,'deploy'),{recursive:true});for(const name of ['crawler-api.service','crawler-proxy-manager.service','Caddyfile.template'])await fs.copyFile('deploy/'+name,path.join(stage,'deploy',name));
const dependencies={};for(const dep of deps)dependencies[dep]=JSON.parse(await fs.readFile(`node_modules/${dep}/package.json`)).version;
await fs.writeFile(path.join(stage,'package.json'),JSON.stringify({name:'crawler-private-api',version:'1.0.0',private:true,type:'module',scripts:{start:'node scripts/public_api.mjs'},engines:{node:'>=22'},dependencies},null,2));
const domain=new URL(env.DOMAIN_FOR_API.includes('://')?env.DOMAIN_FOR_API:'https://'+env.DOMAIN_FOR_API);
if(!/^[a-z0-9.-]+$/.test(domain.hostname)||domain.pathname!=='/'||domain.port||domain.username||domain.password)throw new Error('INVALID_DOMAIN_FOR_API');
const privateDir=path.join(stage,'deploy-private');await fs.mkdir(privateDir,{mode:0o700,recursive:true});await fs.mkdir(path.join(privateDir,'proxies'),{mode:0o700,recursive:true});await fs.mkdir(path.join(privateDir,'templates'),{mode:0o700,recursive:true});
// Shared manager configuration replaces the legacy platform-specific key files.
await fs.rm(path.join(privateDir,'proxies'),{recursive:true,force:true});await fs.rm(path.join(privateDir,'proxy-pools.json'),{force:true});
const sources={group:'/Users/phuctran/Downloads/www.facebook.com.har',page:'/Users/phuctran/Downloads/www.facebook.com_page.har',user:'/Users/phuctran/Downloads/www.facebook.com_user.har'};
const allowed=new Set(['av','__user','__a','__req','__hs','dpr','__ccg','__rev','__s','__hsi','__dyn','__csr','__comet_req','lsd','jazoest','__spin_r','__spin_b','__spin_t','fb_api_caller_class','fb_api_req_friendly_name','variables','server_timestamps','doc_id']);
const allowedHeaders=new Set(['user-agent','accept','accept-language','content-type','origin','referer','x-fb-friendly-name','x-fb-lsd']);
for(const [type,filename]of Object.entries(sources)){
 const raw=JSON.parse(await fs.readFile(filename)),entries=[];
 for(const entry of raw.log?.entries||[]){const r=entry.request;if(r?.url!=='https://www.facebook.com/api/graphql/'||!r.postData?.text)continue;const form=Object.fromEntries(new URLSearchParams(r.postData.text));const name=form.fb_api_req_friendly_name||'';if(type==='group'?!/GroupsCometFeedRegularStoriesPaginationQuery/.test(name):!/^ProfileCometTimeline.*(?:Query|Refetch)$/.test(name))continue;
 const clean=Object.fromEntries(Object.entries(form).filter(([k])=>allowed.has(k)));clean.__user='0';clean.av='0';clean.lsd='ANONYMOUS_BOOTSTRAP_REQUIRED';delete clean.jazoest;delete clean.__s;
 const headers=(r.headers||[]).filter(h=>allowedHeaders.has(h.name.toLowerCase())&&h.name.toLowerCase()!=='x-fb-lsd');entries.push({request:{url:r.url,method:'POST',headers,postData:{mimeType:'application/x-www-form-urlencoded',text:new URLSearchParams(clean).toString()}}});
 }
 if(!entries.length)throw Error('MISSING_SANITIZED_TEMPLATE_'+type);
 await fs.writeFile(path.join(privateDir,'templates',type+'.json'),JSON.stringify({log:{entries:[entries.at(-1)]}}));
}
const commentCapture=env.FACEBOOK_COMMENTS_TEMPLATE_CAPTURE;
if(commentCapture){
 const raw=JSON.parse(await fs.readFile(commentCapture));let entry;
 for(const e of raw.log?.entries||[]){const f=Object.fromEntries(new URLSearchParams(e.request?.postData?.text||''));if(e.request?.url==='https://www.facebook.com/api/graphql/'&&f.fb_api_req_friendly_name==='CommentListComponentsRootQuery'&&f.__user==='0'&&f.av==='0')entry=e;}
 if(!entry)throw Error('MISSING_ANONYMOUS_COMMENT_ROOT_CAPTURE');
 const form=Object.fromEntries(new URLSearchParams(entry.request.postData.text));const vars=JSON.parse(form.variables);
 if(vars.commentsIntentToken!=='RANKED_UNFILTERED_CHRONOLOGICAL_REPLIES_INTENT_V1')throw Error('NATIVE_ALL_COMMENTS_INTENT_MISMATCH');
 const fields=new Set([...allowed,'__aaid','__crn','__hblp','__hsdp','__sjsp']);const clean=Object.fromEntries(Object.entries(form).filter(([k])=>fields.has(k)));clean.__user='0';clean.av='0';clean.lsd='ANONYMOUS_BOOTSTRAP_REQUIRED';delete clean.jazoest;delete clean.__s;
 const safeHeaders=new Set([...allowedHeaders,'x-asbd-id','priority','sec-fetch-dest','sec-fetch-mode','sec-fetch-site']);
 const headers=entry.request.headers.filter(h=>safeHeaders.has(h.name.toLowerCase())&&h.name.toLowerCase()!=='x-fb-lsd');
 await fs.writeFile(path.join(privateDir,'templates','comments.json'),JSON.stringify({log:{entries:[{request:{url:'https://www.facebook.com/api/graphql/',method:'POST',headers,postData:{text:new URLSearchParams(clean).toString()}}}]}}));
}
const values={TIKTOK_INTERACTION_API_URL:env.TIKTOK_INTERACTION_API_URL,TIKTOK_INTERACTION_API_KEY:env.TIKTOK_INTERACTION_API_KEY,PROXY_MANAGER_URL:'http://127.0.0.1:3810',PROXY_MANAGER_AUTH_KEY:env.PROXY_MANAGER_AUTH_KEY,NODE_ENV:'production',AUTHEN_KEY_FOR_DOMAIN:env.AUTHEN_KEY_FOR_DOMAIN,DOMAIN_FOR_API:domain.hostname,PUBLIC_API_HOST:'127.0.0.1',PUBLIC_API_PORT:'3805',ES5_HOST:env.ES5_HOST,SOCIAL_PLATFORM_COOLDOWN_FILE:'/var/lib/crawler-api/platform-cooldowns.json',FACEBOOK_FEED_HAR_GROUP:'/etc/crawler-api/templates/group.json',FACEBOOK_FEED_HAR_PAGE:'/etc/crawler-api/templates/page.json',FACEBOOK_FEED_HAR_USER:'/etc/crawler-api/templates/user.json',FACEBOOK_COMMENTS_HAR:commentCapture?'/etc/crawler-api/templates/comments.json':'/etc/crawler-api/templates/group.json'};
if(!env.PROXY_MANAGER_AUTH_KEY||!env.PROXY_MANAGER_KEYS_FILE)throw Error('Run prepare_proxy_manager_config.mjs before exporting');
await fs.copyFile(env.PROXY_MANAGER_KEYS_FILE,path.join(privateDir,'shared-proxy-keys.json'));
await fs.copyFile(env.PROXY_MANAGER_SETTINGS_FILE,path.join(privateDir,'proxy-manager-settings.json'));
const managerEnv={PROXY_MANAGER_ADMIN_KEY:env.PROXY_MANAGER_ADMIN_KEY,PROXY_MANAGER_AUTH_KEY:env.PROXY_MANAGER_AUTH_KEY,PROXY_MANAGER_HOST:'127.0.0.1',PROXY_MANAGER_PORT:'3810',PROXY_MANAGER_KEYS_FILE:'/var/lib/crawler-proxy-manager/keys.json',PROXY_MANAGER_STATE_FILE:'/var/lib/crawler-proxy-manager/state.json',PROXY_MANAGER_SETTINGS_FILE:'/var/lib/crawler-proxy-manager/settings.json',SOCIAL_PLATFORM_COOLDOWN_FILE:'/var/lib/crawler-proxy-manager/imported-cooldowns.json'};
await fs.writeFile(path.join(privateDir,'proxy-manager.env'),Object.entries(managerEnv).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600});
const cooldownSeed=path.join(privateDir,'platform-cooldowns.json');
if(process.env.DEPLOY_INCLUDE_LOCAL_COOLDOWN==='0')await fs.rm(cooldownSeed,{force:true});
else try{await fs.copyFile(env.SOCIAL_PLATFORM_COOLDOWN_FILE,cooldownSeed);}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.writeFile(path.join(privateDir,'runtime.env'),Object.entries(values).filter(([,v])=>v!==undefined).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600});
await fs.writeFile(path.join(root,'release-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),files:[...files],dependencies,domain:domain.hostname,privateFilesIncluded:true,credentialValuesOmitted:true},null,2));
console.log(JSON.stringify({stage,codeFiles:files.size,dependencies:Object.keys(dependencies),domain:domain.hostname}));
