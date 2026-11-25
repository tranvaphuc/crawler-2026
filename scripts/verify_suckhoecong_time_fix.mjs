import fs from 'node:fs/promises';
import { parseConfiguredArticle } from '../src/web/configurableNewsParser.mjs';
const directory = process.argv[2] || 'outputs/suckhoecong-time-fix-20261116';
const config = JSON.parse(await fs.readFile('config/web-sources/news/suckhoecong.vn.json', 'utf8'));
const cases = [
  ['https://suckhoecong.vn/3-cach-giam-khan-tieng-tai-nha-cuc-hieu-qua-d103255.html', '2026-08-03T07:33:00.000Z'],
  ['https://suckhoecong.vn/khan-tieng-tai-dien-4-nguyen-tac-cham-soc-thanh-quan-hieu-qua-d104790.html', '2026-11-16T00:13:00.000Z'],
  ['https://suckhoecong.vn/thay-sua-bo-bang-sua-thuc-vat-co-the-gay-thieu-vi-chat-nghiem-trong-d104688.html', '2026-11-08T08:17:00.000Z'],
];
for (const [i, [url, expected]] of cases.entries()) {
  const result = parseConfiguredArticle(await fs.readFile(`${directory}/sample-${i}.html`, 'utf8'), url, { ...config, publicationValidationPolicy: 'strict_native_publication_v1' });
  if (result.error || result._source.publishedDate !== expected || !result.extracted.publicationProof.ok) throw Error(`SAMPLE_${i}_FAILED_${result.error}`);
  console.log(JSON.stringify({ url, publishedDate: result._source.publishedDate, proof: result.extracted.publicationProof.source }));
}
