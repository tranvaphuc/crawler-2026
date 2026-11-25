/** Explicit opt-in private export. This output embeds the API key; never publish it. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import dotenv from 'dotenv';
if(!process.argv.includes('--include-api-key'))throw Error('Private export requires --include-api-key');
const env=dotenv.parse(await fs.readFile('.env'));
const url=new URL(env.DOMAIN_FOR_API.includes('://')?env.DOMAIN_FOR_API:'https://'+env.DOMAIN_FOR_API);
if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('INVALID_PRODUCTION_DOMAIN');
if(!env.AUTHEN_KEY_FOR_DOMAIN)throw Error('API_KEY_NOT_CONFIGURED');
const source='outputs/postman-crawler-es5-2026-10-23';
const dest=path.resolve('outputs/postman-production-private-2026-10-24');
await fs.mkdir(dest,{recursive:true,mode:0o700});await fs.chmod(dest,0o700);
const c=JSON.parse(await fs.readFile(source+'/Crawler-2026.postman_collection.json'));
const e=JSON.parse(await fs.readFile(source+'/Crawler-2026-Server.postman_environment.json'));
c.info._postman_id=randomUUID();c.info.name='Crawler 2026 — Production';
c.info.description='Bộ kiểm tra API production. Import environment PRIVATE cùng gói và chọn Crawler 2026 — Production PRIVATE. Collection dùng Bearer token từ AUTHEN_KEY_FOR_DOMAIN. Environment chứa key thật, không chia sẻ hoặc đồng bộ công khai.';
for(const entry of c.variable||[])if(['social_base_url','facebook_base_url'].includes(entry.key))entry.value=url.origin;else if(entry.key==='AUTHEN_KEY_FOR_DOMAIN')entry.value='';
e.id=randomUUID();e.name='Crawler 2026 — Production PRIVATE';e._postman_exported_at=new Date().toISOString();
for(const v of e.values){if(['social_base_url','facebook_base_url'].includes(v.key))v.value=url.origin;if(v.key==='AUTHEN_KEY_FOR_DOMAIN'){v.value=env.AUTHEN_KEY_FOR_DOMAIN;v.type='secret';v.enabled=true;}}
if(!e.values.some(v=>v.key==='AUTHEN_KEY_FOR_DOMAIN'))throw Error('AUTH_VARIABLE_MISSING');
c.item.unshift({name:'00 Kiểm tra kết nối production',item:[{name:'Health — đúng API key',request:{method:'GET',header:[{key:'Accept',value:'application/json'}],url:'{{social_base_url}}/api/health',description:'Chạy trước: HTTP 200 và status=ok nghĩa là domain và API key đang hoạt động.'},event:[{listen:'test',script:{type:'text/javascript',exec:["pm.test('Đúng API key và dịch vụ đang chạy', function () { pm.response.to.have.status(200); pm.expect(pm.response.json().status).to.eql('ok'); });"]}}]}]});
const require=createRequire(import.meta.url),Ajv=require('ajv'),ajv=new Ajv({allErrors:true,schemaId:'auto'});
const schema=JSON.parse(await fs.readFile('/private/tmp/crawler-postman-v2.1.schema.json'));
if(schema.$schema.includes('draft-04'))ajv.addMetaSchema(require('ajv/lib/refs/json-schema-draft-04.json'));
if(!ajv.validate(schema,c))throw Error('INVALID_POSTMAN_SCHEMA');
const requests=c.item.flatMap(f=>f.item);for(const r of requests)for(const event of r.event||[])new vm.Script(event.script.exec.join('\n'));
const write=async(name,data)=>{const p=path.join(dest,name);await fs.writeFile(p,typeof data==='string'?data:JSON.stringify(data,null,2)+'\n',{mode:0o600});await fs.chmod(p,0o600);};
await write('Crawler-2026-Production.postman_collection.json',c);
await write('Crawler-2026-Production-PRIVATE.postman_environment.json',e);
await write('HUONG-DAN.txt',`BỘ POSTMAN PRODUCTION — CHỨA API KEY THẬT\n\n1. Import hai file JSON trong gói.\n2. Chọn environment: Crawler 2026 — Production PRIVATE.\n3. Chạy folder 00 / Health: mong đợi HTTP 200, status=ok.\n4. Chạy request FIRST trước, NEXT sau để lấy trang tiếp. Không chạy toàn bộ collection đồng loạt.\n\nDomain: ${url.origin}\nXác thực: Bearer token tự lấy từ biến AUTHEN_KEY_FOR_DOMAIN, không cần dán key vào từng request.\n\nGói này chứa key production thật. Giữ riêng, không gửi lên repository hoặc chia sẻ workspace công khai. Chỉ HTTP 200 không đủ chứng minh crawl đầy đủ; đọc status/reason/coverage/ordering của từng phản hồi.\n\nHướng dẫn chi tiết: README-VI.md.\n`);
const guide=(await fs.readFile(source+'/README-VI.md','utf8'))
 .replaceAll('Crawler-2026.postman_collection.json','Crawler-2026-Production.postman_collection.json')
 .replaceAll('Crawler-2026-Server.postman_environment.json','Crawler-2026-Production-PRIVATE.postman_environment.json')
 .replace('Key lấy từ cấu hình riêng của bạn; tài liệu và bộ Postman không chứa giá trị thật.','Gói PRIVATE này đã điền key production thật trong environment để bạn import và test ngay. Nội dung tài liệu không in key.')
 .replace('Điền giá trị thật vào biến `AUTHEN_KEY_FOR_DOMAIN` trong môi trường riêng. Collection dùng Bearer token và tự gửi header.','Chọn environment `Crawler 2026 — Production PRIVATE`; biến `AUTHEN_KEY_FOR_DOMAIN` đã được điền sẵn. Collection dùng Bearer token và tự gửi header.');
await write('README-VI.md',guide);
await write('export-check.json',{exportedAt:new Date().toISOString(),baseUrl:url.origin,requests:requests.length,folders:c.item.length,schemaValid:true,scriptSyntaxValid:true,containsProductionApiKey:true,keyValueOmittedFromReport:true});
console.log(JSON.stringify({outputDirectory:dest,domain:url.origin,requests:requests.length,folders:c.item.length,schemaValid:true,privateExport:true}));
