// URL layout hints use route segments or explicit publisher prefixes. A word
// inside an ordinary article slug (music album, television, "tin anh") is not a template.
export function newsUrlFamily(raw){let u;try{u=new URL(raw);}catch{return 'ordinary';}const p=u.pathname.toLowerCase(),segments=p.split('/').filter(Boolean),leaf=segments.at(-1)||'';
 if(u.hostname.replace(/^www\./,'')==='phunuvagiadinh.vn'&&/^\/video-\d+\//.test(p))return 'video';
 if(segments.includes('dt360')||segments.includes('shorts'))return 'short_video';
 if((u.hostname.replace(/^www\./,'')==='vietq.vn'&&/-video\d+\.html$/.test(leaf))||segments.some(s=>/^(?:videos?|tv|truyen-hinh)$/.test(s))||/^video\./i.test(u.hostname)||/\.media$/.test(p)||/^video-/.test(leaf))return 'video';
 if(segments.some(s=>/^(?:e-?magazine|dmagazine|longform|mega-?story|interactive|special)$/.test(s))||/^(?:e-?magazine|dmagazine|longform|mega-?story)-/.test(leaf))return 'longform';
 if(/\.html\.photo$/.test(p)||segments.includes('xem-albumphoto')||segments.some(s=>/^(?:photos?|gallery|album|tin-anh|chum-anh)$/.test(s))||/^(?:photos?|chum-anh|album-anh)-/.test(leaf))return 'photo';
 if(segments.some(s=>/^(?:audio|podcasts?|radio)$/.test(s))||/^(?:audio|podcast|radio)-/.test(leaf))return 'audio';
 if(/^(?:en|fr|cn|zh|de|ja|ko|ru)$/.test(segments[0]||''))return 'language_variant';return 'ordinary';
}
