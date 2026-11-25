const $ = selector => document.querySelector(selector);
const vi = new Intl.NumberFormat('vi-VN');
const platforms = { facebook: 'Facebook / TikTok / Threads / Instagram', youtube: 'YouTube', news: 'Google News' };
const channels = { facebook: 'Facebook', instagram: 'Instagram', threads: 'Threads', youtube: 'YouTube',
  tiktok: 'TikTok', linkedin: 'LinkedIn', news: 'News', forum: 'Forum', website: 'Website', 'gg reviews': 'Google Maps', x: 'X' };
const sourceTypes = { page: 'Page', user: 'User', group_public: 'Group công khai', group_private: 'Group riêng tư',
  group_unknown: 'Group chưa rõ quyền riêng tư', company: 'Công ty', channel: 'Kênh', profile: 'Hồ sơ',
  content_reference: 'Tham chiếu nội dung', unknown: 'Chưa rõ', threads: 'Hồ sơ', place: 'Địa điểm' };
const statuses = { READY: 'Sẵn sàng', REVIEW: 'Cần rà', NOT_CHECKED: 'Chưa kiểm tra', CHANNEL_ONLY: 'Theo kênh',
  ALIAS: 'Biến thể', OUT_OF_SCOPE: 'Ngoài phạm vi', ES_ONLY: 'Chỉ dùng trong ES',
  PAUSED: 'Tạm dừng', RETIRED: 'Đã ngừng', ARCHIVE_VERIFIED: 'Xác minh từ bản lưu', PLATFORM_VERIFIED: 'Xác minh trực tiếp',
  URL_ONLY: 'ID từ URL', CONFLICT: 'ID mâu thuẫn', UNRESOLVED: 'Chưa xác minh' };
const headings = { keywords: ['Keyword', 'Project', 'Level', 'Trạng thái'],
  sources: ['Tên / Link', 'Kênh', 'Loại', 'ID', 'Follower', 'Project'], plans: ['Cụm cần rà', 'Project', 'Tab trong plan', 'Ô gốc'] };

let tab = 'keywords';
let meta;
let page = 1;
let total = 0;
let timer;
let toastTimer;
let activeRequest;
let detailToken = 0;
const savedFilters = {};

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function link(url, label) {
  const node = element('a', label);
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    node.href = parsed.href;
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
    return node;
  } catch {
    return element('span', label);
  }
}

function badge(status) {
  const color = ['READY', 'ARCHIVE_VERIFIED', 'PLATFORM_VERIFIED'].includes(status) ? 'good'
    : ['CONFLICT', 'OUT_OF_SCOPE'].includes(status) ? 'stop' : ['REVIEW', 'URL_ONLY', 'UNRESOLVED'].includes(status) ? 'warn' : '';
  return element('span', statuses[status] || status || 'Chưa rõ', `badge ${color}`);
}

async function api(endpoint, params, signal) {
  const query = params ? `?${params}` : '';
  const response = await fetch(`/api/${endpoint}${query}`, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Không tải được dữ liệu.');
  return data;
}

function showToast(text) {
  const toast = $('#toast');
  toast.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

async function copy(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('Đã sao chép');
      return;
    } catch { /* Clipboard permission can vary across browsers. */ }
  }
  const field = element('textarea', text, 'copy-buffer');
  field.setAttribute('aria-label', 'Nội dung cần sao chép');
  ($('#detail').open ? $('#detail') : document.body).append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (copied) showToast('Đã sao chép');
  else window.prompt('Sao chép nội dung', text);
}

function picker(name, label, prompt, choices) {
  const field = element('div', null, 'filter');
  const title = element('label', label);
  title.htmlFor = `filter-${name}`;
  const select = element('select');
  select.id = title.htmlFor;
  select.name = name;
  for (const [value, text] of [['', prompt], ...choices]) {
    const option = element('option', text);
    option.value = value;
    select.append(option);
  }
  field.append(title, select);
  return field;
}

function options(list, labels = {}) {
  return list.map(value => [value, labels[value] || value]);
}

function projectPicker() {
  return picker('project','Project','Tất cả project',options(meta.projects));
}

function statusChoices() {
  return options($('#filter-platform')?.value ? meta.platform_statuses : meta.statuses,statuses);
}

function updateStatusPicker() {
  const current = $('#filter-status');
  current.replaceWith(picker('status','Trạng thái','Mọi trạng thái',statusChoices()).querySelector('select'));
}

function searchField() {
  const field = element('div', null, 'filter search');
  const label = element('label', 'Tìm kiếm');
  label.htmlFor = 'filter-q';
  const wrap = element('div', null, 'search-wrap');
  // Fixed decorative icon, with no content from the catalog.
  wrap.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>';
  const input = element('input');
  input.type = 'search';
  input.name = 'q';
  input.id = label.htmlFor;
  input.maxLength = 160;
  input.placeholder = tab === 'sources' ? 'Tên, link hoặc ID…' : 'Keyword, chủ thể hoặc project…';
  wrap.append(input);
  field.append(label,wrap);
  return field;
}

function buildFilters() {
  const fields = $('#filters');
  fields.replaceChildren(searchField(), projectPicker());
  if (tab === 'keywords') {
    fields.append(picker('platform','Kênh tìm','Tất cả kênh',Object.entries({...platforms,facebook:'Facebook + social'})),
      picker('level','Level','Tất cả level',[['1','Level 1'],['2','Level 2']]),
      picker('status','Trạng thái','Mọi trạng thái',statusChoices()),
      picker('kind','Dạng từ khóa','Tất cả',[['plain','Keyword thường'],['tag','Hashtag']]));
  } else if (tab === 'sources') {
    fields.append(picker('channel','Kênh','Tất cả nền tảng',options(meta.channels,channels)),
      picker('type','Loại','Tất cả loại',options(meta.types,sourceTypes)),
      picker('id_state','Bằng chứng ID','Tất cả',[['verified','Đã xác minh'],['unverified','Chưa xác minh'],['conflict','ID mâu thuẫn']]),
      picker('follower','Follower','Tất cả',[['known','Có số liệu'],['unknown','Thiếu số liệu']]),
      picker('sort','Sắp xếp','Theo tên',[['followers','Follower giảm dần']]));
  } else {
    $('#filter-q').placeholder = 'Keyword, chủ thể, sheet hoặc ô gốc…';
  }
}

function changeTab(target, filters = savedFilters[target] ?? {}) {
  tab = target;
  page = 1;
  clearTimeout(timer);
  for (const button of document.querySelectorAll('[data-tab]')) {
    if (button.dataset.tab === tab) button.setAttribute('aria-current','page');
    else button.removeAttribute('aria-current');
  }
  $('#coverage').hidden = true;
  $('#columns').replaceChildren();
  const row = $('#columns').insertRow();
  row.append(...headings[tab].map(label => element('th',label)));
  buildFilters();
  if (tab === 'keywords' && filters.platform) {
    $('#filter-platform').value = filters.platform;
    updateStatusPicker();
  }
  for (const field of $('#filters').querySelectorAll('input,select')) {
    if (Object.hasOwn(filters,field.name)) field.value = filters[field.name];
  }
  load();
}

function metricCards(summary, platform) {
  const metrics = $('#metrics');
  const labels = tab === 'keywords' ? [['level_1','Level 1'],['level_2','Level 2'],['plain','Keyword thường'],['hashtags','Hashtag'],
    ['ready',platform ? 'Đạt ở kênh đang chọn' : 'Sẵn sàng theo kho'],...(platform ? [['not_checked','Chưa kiểm tra ở kênh này']] : [])]
    : tab === 'sources' ? [['verified','ID đã xác minh'],['with_count','Có follower hoặc số thành viên'],['groups','Group Facebook'],['channels','Nền tảng']]
    : [['origins','Ô plan khớp'],['projects','Project có kết quả']];
  metrics.replaceChildren(...labels.map(([key,label]) => {
    const card = element('div',null,'metric');
    card.append(element('strong',vi.format(summary[key])),element('span',label));
    return card;
  }));
  metrics.hidden = false;
}

function cell(row, content, className) {
  const td = row.insertCell();
  if (className) td.className = className;
  if (content instanceof Node) td.append(content);
  else td.textContent = content ?? '—';
  return td;
}

function detailButton(text, endpoint, params) {
  const button = element('button',text);
  button.type = 'button';
  button.addEventListener('click', () => showDetail(endpoint,params,text));
  return button;
}

function followerText(row) {
  if (row.follower == null) return '—';
  const unit = {subscribers:' đăng ký',members:' thành viên',group_members:' thành viên'}[row.follower_kind] ?? '';
  return `${row.follower_precision === 'rounded' ? '≈ ' : ''}${vi.format(row.follower)}${unit}`;
}

function drawTable(items) {
  const tbody = $('#rows');
  tbody.replaceChildren();
  for (const item of items) {
    const row = tbody.insertRow();
    if (tab === 'keywords') {
      cell(row, detailButton(item.keyword,'keyword',{keyword:item.keyword,project:item.project}), 'key');
      cell(row,item.project);
      cell(row,item.level,'nowrap');
      const status = cell(row,badge(item.status));
      if (item.canonical_keyword) status.append(element('div',item.canonical_keyword,'sub'));
    } else if (tab === 'sources') {
      const identity = cell(row,detailButton(item.name || 'Chưa có tên','source',{key:item.key}),'key');
      const sourceLink = element('div',null,'sub');
      sourceLink.append(link(item.link,item.link.replace(/^https?:\/\/(www\.)?/,'').slice(0,75)));
      identity.append(sourceLink);
      cell(row,channels[item.channel] || item.channel);
      cell(row,sourceTypes[item.type] || item.type);
      const id = cell(row,element('code',item.id ?? '—'));
      if (item.id || item.id_status === 'CONFLICT') id.append(element('div',statuses[item.id_status] || item.id_status,'sub'));
      cell(row,followerText(item),'nowrap');
      cell(row,JSON.parse(item.projects_json).join(', ') || '—');
    } else {
      const keyword = cell(row,item.keyword,'key');
      if (item.reason) keyword.append(element('div',item.reason,'sub'));
      cell(row,item.project);
      cell(row,item.sheet);
      cell(row,item.plan_url ? link(item.plan_url,item.cell) : item.cell,'nowrap');
    }
  }
  if (!items.length) empty('Không tìm thấy dòng phù hợp.');
}

function empty(text) {
  const row = $('#rows').insertRow();
  const message = cell(row,text,'empty');
  message.colSpan = headings[tab].length;
}

function drawCoverage(coverage) {
  const box = $('#coverage');
  box.className = 'coverage';
  box.replaceChildren();
  box.hidden = !coverage.gaps.length;
  if (coverage.gaps.length) {
    const detail = element('details');
    const list = element('ul');
    for (const gap of coverage.gaps) list.append(element('li',`${gap.projects.join(', ')} · ${gap.fetch_status}`));
    detail.append(element('summary',`${vi.format(coverage.gaps.length)} link plan thiếu bản đọc trong phạm vi lọc`),list);
    box.append(detail);
  }
}

async function load() {
  if (!meta) return;
  activeRequest?.abort();
  const request = new AbortController();
  activeRequest = request;
  const params = new URLSearchParams({ page, limit: 25 });
  const selected = {};
  for (const field of $('#filters').querySelectorAll('input,select')) {
    if (field.value) {
      params.set(field.name,field.value);
      selected[field.name] = field.value;
    }
  }
  savedFilters[tab] = selected;
  const share = new URLSearchParams({tab,...selected});
  history.replaceState(null,'',`${location.pathname}?${share}`);
  $('#result-count').textContent = 'Đang tải…';
  $('#metrics').hidden = true;
  $('#coverage').hidden = true;
  $('#page-label').textContent = '';
  $('#prev').disabled = true;
  $('#next').disabled = true;
  try {
    const data = await api(tab,params,request.signal);
    if (activeRequest !== request) return;
    total = data.total;
    const pages = Math.max(1,Math.ceil(total / 25));
    if (page > pages) { page = pages; load(); return; }
    drawTable(data.items);
    metricCards(data.summary, params.has('platform'));
    if (tab === 'plans') drawCoverage(data.coverage);
    const label = {keywords:'keyword',sources:'nguồn',plans:'cụm cần rà'}[tab];
    $('#result-count').textContent = `${vi.format(total)} ${label} khớp bộ lọc`;
    $('#page-label').textContent = total ? `${vi.format((page - 1) * 25 + 1)}–${vi.format((page - 1) * 25 + data.items.length)} / ${vi.format(total)} · Trang ${vi.format(page)} / ${vi.format(pages)}` : '';
    $('#prev').disabled = page <= 1;
    $('#next').disabled = page >= pages;
  } catch (error) {
    if (request.signal.aborted) return;
    $('#rows').replaceChildren();
    $('#result-count').textContent = 'Có lỗi khi tải dữ liệu';
    empty(error.message);
  }
}

function detailsList(items) {
  const list = element('dl',null,'details-list');
  for (const [name,value] of items) {
    const description = element('dd');
    if (value instanceof Node) description.append(value);
    else description.textContent = value ?? '—';
    list.append(element('dt',name),description);
  }
  return list;
}

function proof(title, reason, state, url) {
  const box = element('section',null,'proof');
  box.append(element('strong',title));
  if (state) box.append(badge(state));
  if (reason) box.append(element('p',reason));
  if (url) box.append(link(url,'Mở kết quả tìm kiếm'));
  return box;
}

function copyButton(label, text) {
  const button = element('button',label,'secondary');
  button.type = 'button';
  button.addEventListener('click', () => copy(text));
  return button;
}

async function showDetail(endpoint, values, title) {
  const token = ++detailToken;
  const dialog = $('#detail');
  const body = $('#detail-body');
  $('#detail-title').textContent = title;
  body.replaceChildren(element('p','Đang tải…'));
  if (!dialog.open) dialog.showModal();
  try {
    const row = await api(endpoint,new URLSearchParams(values));
    if (token !== detailToken || !dialog.open) return;
    body.replaceChildren();
    if (endpoint === 'keyword') {
      const info = [['Project',row.project],['Level',row.level],['Trạng thái',badge(row.status)],['Chủ thể',row.subjects.join(', ')]];
      if (row.canonical_keyword) info.push(['Cụm chuẩn',row.canonical_keyword]);
      body.append(detailsList(info),copyButton('Sao chép keyword',row.canonical_keyword || row.keyword));
      for (const found of row.channels) {
        const reason = [found.reason, found.canonical_keyword ? `Cụm ưu tiên ${found.canonical_keyword}.` : ''].filter(Boolean).join(' ');
        body.append(proof(platforms[found.platform] || found.platform,reason,found.status,found.search_url));
      }
      const planProofs = row.evidence.filter(entry => typeof entry === 'string' && entry.includes(' · https://'));
      if (planProofs.length) {
        const history = element('details');
        const originals = element('ul');
        for (const entry of planProofs) {
          const [label,url] = entry.split(' · ',2);
          const item = element('li');
          item.append(link(url,label));
          originals.append(item);
        }
        history.append(element('summary','Ô tham chiếu trong plan'),originals);
        body.append(history);
      }
      if (row.reasons.length) {
        const history = element('details');
        history.append(element('summary','Ghi chú trong kho'),...row.reasons.map(reason => element('p',reason,'sub')));
        body.append(history);
      }
    } else {
      body.append(detailsList([['Kênh',channels[row.channel] || row.channel],['Loại',sourceTypes[row.type] || row.type],
        [row.verified ? 'ID đã xác minh' : 'ID ứng viên',row.id],['Bằng chứng ID',badge(row.id_status)],['Link',link(row.link,row.link)],
        ['Follower',followerText(row)],['Ngày ghi nhận',row.follower_as_of],['Project',row.projects.join(', ') || '—']]));
      if (row.id) body.append(copyButton('Sao chép ID',row.id));
      for (const entry of row.identity_evidence) body.append(proof(entry.name || 'Bằng chứng định danh',entry.evidence,null));
    }
  } catch (error) {
    if (token === detailToken) body.replaceChildren(element('p',error.message));
  }
}

$('#filters').addEventListener('input', event => {
  activeRequest?.abort();
  $('#metrics').hidden = true;
  $('#coverage').hidden = true;
  $('#result-count').textContent = 'Đang tải…';
  if (event.target.name === 'platform') updateStatusPicker();
  page = 1;
  clearTimeout(timer);
  timer = setTimeout(load,event.target.name === 'q' ? 240 : 0);
});
for (const button of document.querySelectorAll('[data-tab]')) {
  button.addEventListener('click', () => { if (meta) changeTab(button.dataset.tab); });
}
$('#clear').addEventListener('click', () => { if (meta) changeTab(tab,{}); });
$('#prev').addEventListener('click', () => { if (page > 1) { page--; load(); } });
$('#next').addEventListener('click', () => { if (page * 25 < total) { page++; load(); } });
$('#close').addEventListener('click', () => $('#detail').close());

try {
  meta = await api('meta');
  if (meta.lan_url) {
    const button = $('#copy-lan');
    button.hidden = false;
    button.title = meta.lan_url;
    button.addEventListener('click', () => copy(meta.lan_url));
  }
  const initial = new URLSearchParams(location.search);
  const startTab = initial.get('tab');
  changeTab(Object.hasOwn(headings,startTab) ? startTab : 'keywords', Object.fromEntries(initial));
} catch (error) {
  $('#result-count').textContent = error.message;
}
