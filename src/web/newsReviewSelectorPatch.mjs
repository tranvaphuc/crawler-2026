import * as cheerio from 'cheerio';
import {parsePublishedDate} from './configurableNewsParser.mjs';
const patchFields={title:'title',content:'body',description:'description',time:'publishedDate'};

export function newsReviewCandidateConfig(original,patch){
  if(!patch||!Object.values(patch).some(Boolean))return null;
  const config=structuredClone(original);
  for(const [field,target] of Object.entries(patchFields)){
    if(!patch[field])continue;
    if(typeof patch[field]!=='string'||patch[field].length>300||/:has\(|javascript:|https?:|\bscript\b/i.test(patch[field]))throw Error('NEWS_AI_INVALID_SELECTOR');
    let selector=patch[field].trim(),attribute;
    const explicit=selector.match(/::attr\((content|datetime)\)$/i);
    if(explicit){attribute=explicit[1].toLowerCase();selector=selector.slice(0,explicit.index).trim();}
    const branches=selector.split(',').map(s=>s.trim());
    const meta=branches.every(s=>/(?:^|[\s>+~])meta(?:\[|$)/i.test(s));
    const dateTime=branches.every(s=>/(?:^|[\s>+~])time\[datetime\]/i.test(s));
    if(!selector||target==='body'&&(meta||attribute)||attribute==='content'&&!meta||attribute==='datetime'&&!dateTime)throw Error('NEWS_AI_INVALID_SELECTOR');
    if(meta)attribute='content';
    if(target==='publishedDate'&&dateTime)attribute='datetime';
    const setting={strategy:'selector',selector,...(attribute?{attribute}:{})};
    if(target==='description'&&!meta){
      const scoped=selector.match(/^((?:article|main|[.#][\w-]+))\s+(.+)$/);
      if(scoped){setting.scope=scoped[1];setting.selector=scoped[2];}
      else if(original.description?.scope)setting.scope=original.description.scope;
    }
    config[target]=setting;
  }
  return config;
}

export function newsReviewPatchMatches(html,config,patch,parsed){
  if(!parsed||Number(parsed.extracted?.variant||0)!==0)return false;
  const $=cheerio.load(html),clean=s=>String(s||'').normalize('NFC').replace(/\s+/g,' ').trim();
  for(const [field,target] of Object.entries(patchFields)){
    if(!patch?.[field])continue;
    const setting=config[target];let node;try{const scope=setting.scope?$(setting.scope):null;if(scope&&scope.length!==1)return false;node=(scope?scope.find(setting.selector):$(setting.selector)).eq(setting.index||0);}catch{return false;}
    if(!node.length)return false;
    const value=clean(setting.attribute?node.attr(setting.attribute):node.text());if(!value)return false;
    if(target==='publishedDate'){
      const date=parsePublishedDate(value,config.timezone,config.dateOrder,config.clockFormat);
      if(date?.iso!==parsed._source.publishedDate)return false;
    }else if(target==='body'){
      if(value.length<Math.min(150,parsed.extracted.bodyLength||0))return false;
    }else if(value!==clean(parsed._source[target]))return false;
  }
  return true;
}
