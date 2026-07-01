// KRX 공식 상장기업 목록을 받아서 backend/data/krFullList.js 로 생성하는 1회성 스크립트
import axios from 'axios';
import iconv from 'iconv-lite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const res = await axios.get('https://kind.krx.co.kr/corpgeneral/corpList.do', {
  params: { method: 'download', searchType: '13' },
  responseType: 'arraybuffer',
});
const html = iconv.decode(res.data, 'euc-kr');
const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].slice(1); // 첫 행은 헤더

const list = [];
for (const [, rowHtml] of rows) {
  const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m =>
    m[1].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
  );
  const name = cells[0];
  const market = cells[1] || '';
  const code = (cells[2] || '').trim();
  if (!name || !/^\d{6}$/.test(code)) continue;

  let suffix;
  if (market.includes('코스닥')) suffix = '.KQ';
  else if (market.includes('코스피')) suffix = '.KS';
  else continue; // 코넥스 등 Yahoo 미지원 시장 제외

  list.push({ name, symbol: `${code}${suffix}` });
}

console.log('총', list.length, '개 종목 파싱됨');

const content = `// KRX 공식 데이터 기반 코스피+코스닥 전체 상장기업 목록 (자동 생성, ${new Date().toISOString().slice(0, 10)} 기준)
// scripts/genKrStocks.mjs 로 재생성 가능
export const KR_FULL_LIST = ${JSON.stringify(list, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, '..', 'data', 'krFullList.js'), content, 'utf-8');
console.log('저장 완료 -> backend/data/krFullList.js');
