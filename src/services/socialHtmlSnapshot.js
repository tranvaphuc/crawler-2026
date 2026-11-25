import {load} from 'cheerio';
// Bounded one-document DOM cache for internal read-only selectors. Never cache
// parsed API/native JSON or expose a mutable cached tree to parser callers.
let lastHtml, lastDom, lastFast;
function freezeTree($){
 const pending=$.root().toArray();
 while(pending.length){const node=pending.pop();if(node.attribs)Object.freeze(node.attribs);if(Array.isArray(node.children)){for(const child of node.children)pending.push(child);Object.freeze(node.children);}Object.freeze(node);}
 return $;
}
export function readOnlyHtml(value='',{platform}={}){
 const html=value||'';
 const fast=platform==='youtube'&&process.env.CRAWL_HTML_PARSER!=='parse5';
 if(typeof html==='string'&&html===lastHtml&&lastDom&&fast===lastFast)return lastDom;
 // Drop the old strong reference before building another large document.
 lastHtml=undefined;lastDom=undefined;
 // Enable the lighter parser only for YouTube bootstraps validated by live
 // canaries. Warm medians on Instagram/Threads did not justify a global switch.
 // Preserve browser parsing for inert/foreign evidence and as an escape hatch.
 let parsed;
 if(!fast||typeof html!=='string'||/<noscript(?=[\s/>])/i.test(html))parsed=load(html);
 else{
  parsed=load(html,{_useHtmlParser2:true});
  if(/<(?:svg|math)(?=[\s/>])/i.test(html)&&parsed('title,meta,link[rel="canonical"],input[name="lsd"],input[name="jazoest"],h1,h2,[role="heading"],script[type="application/json"]').parents('svg,math').length)parsed=load(html);
 }
 const dom=freezeTree(parsed);
 if(typeof html==='string'){lastHtml=html;lastDom=dom;lastFast=fast;}
 return dom;
}
