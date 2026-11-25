import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseProfile,classifyProfile,pageKind,normalizeUrl,openStore,exportData,absolute} from '../scripts/crawl_nguoinoitieng.mjs';

const fixture=(biography, country='Việt Nam', residence='Việt Nam', category='ca-si')=>{
  const html=`<section id="content"><h1>Ca sĩ Test Person</h1><div class="brc"><a>Home</a><a>Ca sĩ</a></div><div class="info-nnt"><a class="nganhhd">Ca sĩ</a><div class="motangan"><h2>Test Person</h2><p title="Thành phố X, nước ${residence}"><b>Nơi sống/ làm việc: </b>X</p><p><b>Ngày tháng năm sinh: </b>2-3-1990 (36 tuổi)</p><p><b>Facebook: </b><a href="https://www.facebook.com/test.person">test.person</a></p><div class="share"><a href="https://facebook.com/sharer.php?u=test">Share</a></div></div></div><div class="thongtinchitiet"><div class="title-chitiet"><a id="tieu-su"></a><h2>Tiểu sử</h2></div><div class="about-nnt">${biography}</div><div class="title-chitiet"><h2>Tóm tắt lý lịch Test Person</h2></div><div class="about-nnt">Test Person sinh ra tại Thành phố X, nước ${country}. Anh sinh thuộc cung Song Ngư.</div></div></section>`;
  return parseProfile(html,`https://nguoinoitieng.tv/nghe-nghiep/${category}/test-person/test`);
};
test('keeps source links and structured fields while excluding sharing widgets',()=>{
  const p=fixture('Test Person tên thật là Nguyễn Văn A.');
  assert.equal(p.platform_links.length,1);
  assert.equal(p.platform_links[0].attribution,'subject_profile_link');
  assert.equal(p.birthplace.country,'Việt Nam');
  assert.equal(p.birth_date.iso,'1990-03-02');
  assert.equal(p.real_name_raw,'Nguyễn Văn A');
  assert.equal(p.vietnam_classification.status,'vietnamese_origin_supported');
  assert.equal(p.quality.profile_links_independently_verified,false);
});
test('includes explicitly Vietnamese diaspora born and resident abroad',()=>{
  const p=fixture('Test Person là một ca sĩ người Mỹ gốc Việt.','Mỹ','Mỹ');
  assert.equal(p.vietnam_classification.status,'vietnamese_explicit');
  assert.equal(p.vietnam_classification.included,true);
});
test('applies independently reviewed evidence only to the exact source identity',()=>{
  const p=fixture('This biography does not identify Vietnamese origins.','Hoa Kỳ','Hoa Kỳ');
  p.source_id='ax5p';p.name='Maggie Q';
  assert.equal(classifyProfile(p).status,'vietnamese_external_supported');
  assert.ok(classifyProfile(p).evidence[0].source_url.includes('thewrap.com'));
  p.name='Someone Else';
  assert.equal(classifyProfile(p).included,false);
});
test('keeps primary-source reviews distinct from independent reporting and corrects contradictory templates',()=>{
  const p=fixture('A generic archived biography.');
  p.source_id='6e5';p.name='Tina Yong';
  assert.equal(classifyProfile(p).status,'vietnamese_source_reviewed');
  p.source_id='bbog';p.name='Dan Hauer';
  assert.equal(classifyProfile(p).status,'foreign_identity_reviewed');
  assert.equal(classifyProfile(p).included,false);
  p.source_id='bi2s';p.name='Dược Sư';
  assert.equal(classifyProfile(p).status,'non_person');
});
test('residence and Vietnamese-language article alone do not establish Vietnamese identity',()=>{
  const p=fixture('Test Person là một ca sĩ người Hàn Quốc. Anh làm việc tại Việt Nam.','Hàn Quốc');
  assert.equal(p.vietnam_classification.status,'needs_review');
  assert.equal(p.vietnam_classification.included,false);
});
test('foreign identity conflicting with Vietnamese birthplace goes to review',()=>{
  const p=fixture('Test Person là một diễn viên người Pháp.');
  assert.equal(p.vietnam_classification.status,'needs_review');
});
test('Vietnam residence later in the same summary line does not change foreign birthplace',()=>{
  const p=fixture('Test Person đi biểu diễn.','Anh. Anh sống và làm việc chủ yếu ở Thành phố Hồ Chí Minh, nước Việt Nam');
  assert.equal(p.birthplace.country,'Anh');
  assert.equal(p.vietnam_classification.included,false);
  assert.equal(p.vietnam_classification.status,'needs_review');
});
test('excludes groups and fiction from person export',()=>{
  const p=fixture('Test Person là một nhóm nhạc Việt Nam.','Việt Nam','Việt Nam','nhom-nhac');
  assert.equal(p.vietnam_classification.status,'non_person');
  assert.equal(fixture('Test là một bộ phim Việt Nam.','Việt Nam','Việt Nam','phim').vietnam_classification.status,'non_person');
  assert.equal(fixture('Test Person là một diễn viên người Việt Nam.','Việt Nam','Việt Nam','nhan-vat-truyen-hinh').vietnam_classification.status,'vietnamese_explicit');
});
test('does not infer nationality from an incidental career mention',()=>{
  const p=fixture('Test Person đi du lịch Việt Nam và biểu diễn cùng ca sĩ người Việt Nam.','Mỹ','Mỹ');
  assert.equal(p.vietnam_classification.included,false);
  const author=fixture('Cô cũng là nhân vật được nhắc tới trong cuốn sách Coming Home của một tác giả người Mỹ ở New York.');
  assert.equal(author.vietnam_classification.status,'vietnamese_origin_supported');
  const collaboration=fixture('Test Person là một ca sĩ hợp tác với nghệ sĩ người Việt Nam.','Mỹ','Mỹ');
  assert.equal(collaboration.vietnam_classification.included,false);
  assert.equal(fixture('Test Person là người anh hùng.').vietnam_classification.status,'vietnamese_origin_supported');
  assert.equal(fixture('Test Person là một người ý thức trong công việc.').vietnam_classification.status,'vietnamese_origin_supported');
});
test('only follows the intended host and recognized finite listing paths',()=>{
  assert.equal(pageKind('https://nguoinoitieng.tv/nghe-nghiep/ca-si/abc/id'),'profile');
  assert.equal(pageKind('https://nguoinoitieng.tv/tinh-tp/ha-noi-viet-nam/page9'),'listing');
  assert.equal(pageKind('https://evil.test/nghe-nghiep/ca-si/abc/id'),null);
  assert.equal(pageKind('https://nguoinoitieng.tv/tinh-tp/london-anh'),null);
  assert.equal(normalizeUrl('https://nguoinoitieng.tv/moi-nhat/?p=1000'),'https://nguoinoitieng.tv/moi-nhat/');
  assert.equal(absolute(undefined),null);
  assert.equal(pageKind('https://nguoinoitieng.tv/nghe-nghiep/ca-si/abc/contact@example.test'),null);
  assert.equal(pageKind('https://nguoinoitieng.tv/nghe-nghiep/ca-si/abc/a1%3Cbr%3E'),null);
});
test('exports a complete valid JSON array and JSONL across keyset batch boundaries',()=>{
  const out=fs.mkdtempSync(path.join(os.tmpdir(),'nnt-export-test-'));
  const db=openStore(out);
  try{
    const insert=db.prepare('INSERT INTO profiles VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for(let i=0;i<205;i++){
      const p={source_id:String(i).padStart(4,'0'),name:'Tên người '+i};
      insert.run(p.source_id,'https://nguoinoitieng.tv/test/'+i,p.name,'Ca sĩ','ca-si','person',null,'Việt Nam','Hà Nội','Việt Nam','vietnamese_explicit',1,0,new Date().toISOString(),JSON.stringify(p));
    }
    const report=exportData(db,out);
    const array=JSON.parse(fs.readFileSync(path.join(out,'vietnamese.json'),'utf8'));
    const lines=fs.readFileSync(path.join(out,'all-profiles.jsonl'),'utf8').trim().split('\n').map(x=>JSON.parse(x));
    assert.equal(report.total_profiles,205);
    assert.equal(array.length,205);
    assert.equal(lines.length,205);
    assert.equal(new Set(array.map(p=>p.source_id)).size,205);
    assert.equal(array.at(-1).source_id,'0204');
  }finally{
    db.close();
    for(const file of fs.readdirSync(out))fs.unlinkSync(path.join(out,file));
    fs.rmdirSync(out);
  }
});
