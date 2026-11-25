import {publicationPageKey} from './newsPublicationPageIdentity.mjs';

// Match transport aliases, retaining every article/language query parameter.
export function publicationFeedDate(context,url){
 const target=publicationPageKey(url);if(!target)return null;
 const matches=Object.entries(context.publicationDates||{}).filter(([u])=>publicationPageKey(u)===target).map(([,d])=>d);
 if(!matches.length||matches.some(d=>!Number.isFinite(Date.parse(d?.iso))))return null;
 return new Set(matches.map(d=>Date.parse(d.iso))).size===1?matches[0]:null;
}

// A feed that stamps several distinct articles with its own fetch time needs
// an independent article clock; URL binding alone does not prove publication.
export function publicationFeedHasGenerationClock(context){
 const checked=Date.parse(context.checkedAt);if(!Number.isFinite(checked))return false;
 const entries=Array.isArray(context.items)&&context.items.length?context.items.map(i=>[i.url,i]):Object.entries(context.publicationDates||{}),dates=new Map();
 for(const [url,value] of entries){const key=publicationPageKey(url),at=Date.parse(value?.iso);if(key&&Number.isFinite(at))dates.set(key,at);}
 if(dates.size<3)return false;const values=[...dates.values()];return new Set(values).size===1&&Math.abs(values[0]-checked)<=60000;
}
