import {newsSiteProfiles} from './newsSiteProfiles.mjs';
import {classifyNewsLink} from './newsLinkPolicy.mjs';
export function isNewsCategoryUrl(raw,site){
 try{const u=new URL(raw),host=u.hostname.replace(/^www\./,''),profile=newsSiteProfiles[site.domain]||{};
  if(![site.domain.replace(/^www\./,''),...(profile.articleHosts||[])].includes(host))return false;
  const kind=classifyNewsLink(u.href,site.domain);if(kind.kind==='excluded'||['tag_topic_or_author_archive','search_or_archive_query','archive_pagination','native_event_id','publisher_directory'].includes(kind.reason))return false;
  if(site.domain==='goodstock.vn'&&u.searchParams.get('rest_route')==='/wp/v2/posts'&&/^[1-9]\d*(?:,[1-9]\d*)*$/.test(u.searchParams.get('categories')||''))return true;
  if(/^\/(?:admin|administrator|wp-admin|wp-login(?:\.php)?|undefined|null|cdn-cgi)(?:\/|$)/i.test(u.pathname))return false;
  const p=u.pathname.replace(/\/$/,'');if(profile.languageHomePaths?.includes(p))return false;
  if(site.domain==='baodoi.com'&&p==='/r.php')return false;
  if(/\/wp-json\/wp\/v2\/posts$/.test(p)&&!/^\d+(?:,\d+)*$/.test(u.searchParams.get('categories')||''))return false;
  if(!p||/^\/(?:trang-chu|home|index(?:\.html?)?|(?:vi|en|fr|de|zh|ja|ko|th|es|ru|id|ar|km|lo|fa|hu)(?:-[a-z]{2,4})?)$/i.test(p)||p.startsWith('/&mobile='))return false;
  if(/^\/(?:social|community|tim-kiem|du-lieu|portfolios|mymarkets|tour|ty-gia|gia-vang-sjc|gia-xang-dau)(?:\/|\.|$)/i.test(p))return false;
  if(site.domain==='markets.businessinsider.com'&&/^\/(?:stocks|indices|commodities|cryptocurrencies|currencies|etfs)$/.test(p))return false;
  return !profile.categoryUrlPattern||new RegExp(profile.categoryUrlPattern,'i').test(p);
 }catch{return false;}
}
