import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import dotenv from 'dotenv';
import ES from 'elasticsearch';
import {ForumBoundedEsConnection} from '../src/forumFlow/boundedEsConnection.mjs';
import {ForumEs5Sink,validateForumDocument} from '../src/forumFlow/es5.mjs';
import {ForumState} from '../src/forumFlow/state.mjs';

const db=new DatabaseSync('/var/lib/forum-flow/runtime/state.sqlite',{readOnly:true});
const row=db.prepare("SELECT * FROM forum_documents WHERE site='dff.vn' AND role='forumTopic' AND native_id='1795060166181'").get();
db.close();
const doc=JSON.parse(row.doc), proof=JSON.parse(row.proof), scratch=await ForumState.open(':memory:');
const env=dotenv.parse(await fs.readFile('/etc/forum-flow/forum.env'));
const es=new ES.Client({host:env.ES5_HOST,apiVersion:'5.6',connectionClass:ForumBoundedEsConnection,log:[],maxRetries:0,requestTimeout:30000});
try{
 const sites=JSON.parse(await fs.readFile('config/forum-flow/sites.json'));
 const sink=new ForumEs5Sink({es,state:scratch,sites,proof:JSON.parse(await fs.readFile('/etc/forum-flow/identity-proof.json'))});
 await sink.initialize();
 const properties=await sink.mapping(doc);
 validateForumDocument(doc,proof,properties);
 const hit=await es.get({index:doc._index,type:row.role,id:doc._id,_source:['url','publishedDate']}).catch(e=>{if(e.statusCode===404)return null;throw e;});
 console.log(JSON.stringify({valid:true,existing:hit?._source||null}));
}catch(e){console.log(JSON.stringify({valid:false,error:/^FORUM_[A-Za-z0-9_]+$/.test(e.message)?e.message:e.code||e.name,status:e.statusCode,esType:e.body?.error?.type}));}
finally{es.close();scratch.close();}
