const clean=value=>String(value||'').replace(/\s+/g,' ').trim();
const insideScopedForm=(node,root)=>root.is('form')||node.parentsUntil(root,'form').length>0;
export function readNewsDescription($,config){
 const setting=config.description;
 if(setting?.strategy==='native_text_lead'){
  let root,nodes;try{root=$(setting.scope);nodes=root.find(setting.selector);}catch{return {value:''};}
  if(root.length!==1||nodes.length!==1||nodes.parents('nav,footer,aside,.related,.comments').length)return {value:''};
  const value=nodes.contents().toArray().filter(n=>n.type==='text').map(n=>clean(n.data)).find(s=>s.length>=30&&s.length<=2000)||'';
  return {value,selector:setting.selector,scope:setting.scope,attribute:null,nativeTextLead:true};
 }
 if(setting?.strategy==='native_lead'&&setting.onlyIfMissing){const value=clean($('meta[name="description"]').attr('content')||$('meta[property="og:description"]').attr('content'));if(value)return {value};}
 if(setting?.strategy==='native_lead'){
  let root,nodes;try{root=$(setting.scope);nodes=root.find(setting.selector);}catch{return {value:''};}
  if(root.length!==1)return {value:''};
  for(let index=0;index<nodes.length;index++){const n=nodes.eq(index),value=clean(n.text());if(value.length<30||value.length>2000||n.find('video,audio').length||n.is('video,audio')||(n.parents('nav,footer,aside,.related,.comments,.comment,.comment-list,figcaption,video,audio').length||insideScopedForm(n,root)))continue;return {value,selector:':is('+setting.selector+'):eq('+index+')',scope:setting.scope,attribute:null};}
  return {value:''};
 }
 if(setting?.strategy==='selector'){
  let nodes;try{const root=setting.scope?$(setting.scope):null;nodes=root?root.find(setting.selector):$(setting.selector);}catch{return {value:'',selector:setting.selector,scope:setting.scope};}
  const n=nodes.eq(setting.index||0);return {value:clean(setting.attribute?n.attr(setting.attribute):n.text()),selector:setting.selector,scope:setting.scope,attribute:setting.attribute||null};
 }
 return {value:clean($('meta[name="description"]').attr('content')||$('meta[property="og:description"]').attr('content'))};
}
export function matchesVisibleNewsDescription($,parsed){
 const e=parsed?.extracted||{},s=parsed?._source||{};if(!e.descriptionSelector||!e.descriptionScope||e.descriptionAttribute)return false;
 let root,nodes;try{root=$(e.descriptionScope);nodes=root.find(e.descriptionSelector);}catch{return false;}
 if(root.length!==1||nodes.length!==1||nodes.find('video,audio').length||nodes.is('video,audio')||(nodes.parents('nav,footer,aside,.related,.comments,.comment,.comment-list,.article-mini,video,audio').length||insideScopedForm(nodes,root)))return false;
 const headline=root.find('h1,h2,h3').toArray().some(n=>clean($(n).text())===clean(s.title))||(()=>{if(!e.titleSelector)return false;let n;try{n=root.find(e.titleSelector).filter((i,e)=>clean($(e).text())===clean(s.title));}catch{return false;}return n.length===1&&!n.is('meta,script,style,head')&&!n.parents('nav,footer,aside,.related,.comments').length;})();
 const native=e.descriptionNativeTextLead?nodes.contents().toArray().filter(n=>n.type==='text').map(n=>clean(n.data)).find(t=>t.length>=30&&t.length<=2000):clean(nodes.text());
 return headline&&native===clean(s.description)&&clean(s.description).length>=20;
}
