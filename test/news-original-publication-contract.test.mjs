import test from 'node:test';import assert from 'node:assert/strict';
import {originalPublicationContract} from '../src/web/newsOriginalPublicationContract.mjs';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
import {loadNewsRegistry} from '../src/newsFlow/registry.mjs';import {ThreeFlowState} from '../src/newsFlow/threeFlowState.mjs';
const proof={ok:true,version:1,policy:'strict_native_publication_v1',source:'scoped_original_article_clock',precision:'minute'};
test('production original clock contract rejects date-only, defaulted midnight and update fallback irrespective of approval flags',()=>{
 assert(originalPublicationContract(proof));
 for(const patch of [{precision:'day'},{defaultedClock:true},{publicationDateKind:'updated_fallback'},{publicationDatePolicy:'native_updated_when_original_missing'},{publicationTimePolicy:'native_date_midnight_if_missing'},{source:'scoped_native_updated_fallback'},{source:'suckhoecong_owned_local_article_clock'}])assert.equal(originalPublicationContract({...proof,...patch}),false,JSON.stringify(patch));
 assert(originalPublicationContract({...proof,source:'url_bound_original_jsonld',precision:'second'}));
});
test('live registry and overlays enforce original clocks even when old JSON asks for midnight or updated fallback',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'news-original-contract-')),legacy={siteName:'publisher.vn',siteId:'publisher.vn',registrableDomain:'publisher.vn',homepage:'https://publisher.vn/',allowedHosts:['publisher.vn'],publicationTimePolicy:'native_date_midnight_if_missing',publicationDatePolicy:'native_updated_when_original_missing'},state=new ThreeFlowState(new DatabaseSync(':memory:'));
 try{await fs.writeFile(path.join(directory,'publisher.vn.json'),JSON.stringify(legacy));const registry=await loadNewsRegistry({directory,qualityFile:path.join(directory,'missing.json')});let c=registry.sources.get('publisher.vn').config;assert.equal(c.publicationTimePolicy,'original_clock_required');assert.equal(c.publicationDatePolicy,'original_only');state.db.prepare('INSERT INTO parser_overlays VALUES(?,?,?,?)').run('publisher.vn',JSON.stringify(legacy),'legacy',Date.now());state.loadOverlays(registry);c=registry.sources.get('publisher.vn').config;assert.equal(c.publicationTimePolicy,'original_clock_required');assert.equal(c.publicationDatePolicy,'original_only');}finally{state.close();await fs.rm(directory,{recursive:true,force:true});}
});
