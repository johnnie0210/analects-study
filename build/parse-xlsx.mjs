// 논어_명언_300.xlsx → ../data.js 생성
// 사용법:
//   cd build
//   npm install          (최초 1회)
//   node parse-xlsx.mjs [엑셀 경로]
//
// 엑셀 구조
//   시트1 '논어 명언 300' : A=No. / B=편 / C=원문 / D=음독 / E=직역 / F=무슨 뜻인가요?(의미) / G=오늘 이 구절을 어떻게 적용할까?(적용)
//   시트2 '한자 풀이'     : A=No. / B=편 / C=원문 / D=한자 / E=음 / F=뜻 / G=획수 / H=부수
//     - 원문 한 구절의 글자마다 1행 (No.로 시트1과 연결)

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XLSX_NAME = '논어_명언_300.xlsx';
const SOURCE_CANDIDATES = [
  path.resolve(__dirname, '..', XLSX_NAME),       // 저장소 안 (GitHub Actions)
  path.resolve(__dirname, '..', '..', XLSX_NAME), // 저장소 밖
];
const SRC = process.argv[2] || SOURCE_CANDIDATES.find((p) => fs.existsSync(p)) || SOURCE_CANDIDATES[0];
const OUT = path.resolve(__dirname, '../data.js');

function fail(...msg) {
  console.error(...msg);
  process.exit(1);
}

if (!fs.existsSync(SRC)) fail('엑셀 파일을 찾을 수 없습니다:', SRC);

const clean = (s) => String(s ?? '')
  .replace(/[​-‍﻿]/g, '')
  .replace(/ /g, ' ')
  .replace(/\r\n/g, '\n')
  .replace(/[ \t]+/g, ' ')
  .trim();

// 한자(CJK 통합/확장/호환) 여부
const isHan = (ch) => /\p{Script=Han}/u.test(ch);

const wb = XLSX.readFile(SRC);
const ws1 = wb.Sheets['논어 명언 300'] || wb.Sheets[wb.SheetNames[0]];
const ws2 = wb.Sheets['한자 풀이'] || wb.Sheets[wb.SheetNames[1]];
if (!ws1) fail('명언 시트를 찾을 수 없습니다.');
if (!ws2) fail('한자 풀이 시트를 찾을 수 없습니다.');

const rows1 = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: '' });
const rows2 = XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' });

// ---------- 시트2: 글자 풀이 (No.별로 묶기) ----------
const charRows = new Map();
for (const r of rows2) {
  const noText = clean(r[0]);
  if (!/^\d+$/.test(noText)) continue;
  const no = Number(noText);
  const hanja = clean(r[3]);
  if (!hanja) continue;
  if (!charRows.has(no)) charRows.set(no, []);
  charRows.get(no).push({
    hanja,
    reading: clean(r[4]),
    meaning: clean(r[5]),
    strokes: Number(String(r[6]).replace(/[^\d]/g, '')) || 0,
    radical: clean(r[7]),
  });
}

// ---------- 시트1: 명언 ----------
const entries = [];
const warnings = [];
const charMap = new Map();

for (const r of rows1) {
  const noText = clean(r[0]);
  if (!/^\d+$/.test(noText)) continue;
  const no = Number(noText);
  const chapter = clean(r[1]);
  const hanja = clean(r[2]);
  const reading = clean(r[3]);
  const translation = clean(r[4]);
  const explain = clean(r[5]); // 의미 (무슨 뜻인가요?)
  const apply = clean(r[6]);   // 적용 (오늘 이 구절을 어떻게 적용할까?)
  if (!hanja) fail('원문이 비어 있습니다: No.', no);

  // 원문 글자 순서대로 시트2의 풀이를 매칭 (같은 글자가 여러 번 나오면 순서대로 사용)
  const textChars = [...hanja].filter(isHan);
  const pool = (charRows.get(no) || []).slice();
  const chars = textChars.map((ch) => {
    const idx = pool.findIndex((p) => p.hanja === ch);
    if (idx >= 0) return pool.splice(idx, 1)[0];
    // 같은 구절에서 못 찾으면 다른 구절의 풀이를 빌려옵니다.
    const known = charMap.get(ch);
    warnings.push('No.' + no + ' ' + ch + ' 풀이 없음' + (known ? ' (다른 구절 풀이 사용)' : ''));
    return known
      ? { hanja: ch, reading: known.readings[0] || '', meaning: known.meanings[0] || '', strokes: known.strokes, radical: known.radical }
      : { hanja: ch, reading: '', meaning: '', strokes: 0, radical: '' };
  });

  // 음독은 원문과 같은 위치에 공백이 있어야 글자별로 맞춰 볼 수 있습니다.
  const readingSyllables = [...reading.replace(/\s/g, '')];
  if (readingSyllables.length !== textChars.length) {
    warnings.push('No.' + no + ' 원문 ' + textChars.length + '자 / 음독 ' + readingSyllables.length + '자 (글자 수 다름)');
  }

  const id = entries.length + 1;
  entries.push({ id, no, chapter, hanja, reading, translation, explain, apply, chars });

  chars.forEach((c) => {
    if (!charMap.has(c.hanja)) {
      charMap.set(c.hanja, {
        hanja: c.hanja,
        readings: [],
        meanings: [],
        strokes: c.strokes,
        radical: c.radical,
        in: [],
        first: charMap.size + 1,
      });
    }
    const o = charMap.get(c.hanja);
    if (c.reading && !o.readings.includes(c.reading)) o.readings.push(c.reading);
    if (c.meaning && !o.meanings.includes(c.meaning)) o.meanings.push(c.meaning);
    if (!o.strokes && c.strokes) o.strokes = c.strokes;
    if (!o.radical && c.radical) o.radical = c.radical;
    if (!o.in.includes(id)) o.in.push(id);
  });
}

if (!entries.length) fail('명언을 하나도 읽지 못했습니다:', SRC);

// 편 목록 (처음 나온 순서)
const chapters = [];
for (const e of entries) {
  let ch = chapters.find((c) => c.name === e.chapter);
  if (!ch) { ch = { name: e.chapter, count: 0, first: e.id }; chapters.push(ch); }
  ch.count += 1;
}

const characters = [...charMap.values()];
const totalChars = entries.reduce((n, e) => n + e.chars.length, 0);

const data = {
  source: path.basename(SRC),
  generated: new Date().toISOString(),
  counts: {
    entries: entries.length,
    characters: characters.length,
    totalChars,
    chapters: chapters.length,
  },
  chapters,
  entries,
  characters,
};

// 내용이 이전과 같으면 생성 시각을 유지해 불필요한 커밋을 막는다.
try {
  const prev = fs.readFileSync(OUT, 'utf8').match(/window\.ANALECTS_DATA\s*=\s*(\{[\s\S]*\});\s*$/);
  if (prev) {
    const old = JSON.parse(prev[1]);
    const content = (o) => JSON.stringify({ ...o, generated: undefined });
    if (old.generated && content(old) === content(data)) data.generated = old.generated;
  }
} catch { /* 이전 파일이 없거나 형식이 다르면 무시 */ }

fs.writeFileSync(OUT,
  '// 자동 생성 파일 — ' + path.basename(SRC) + ' 에서 파싱됨. 직접 수정 금지\n'
  + '// 재생성: cd build && node parse-xlsx.mjs\n'
  + 'window.ANALECTS_DATA = ' + JSON.stringify(data) + ';\n', 'utf8');

console.log('entries:', entries.length, '/ chapters:', chapters.length,
  '/ unique characters:', characters.length, '/ total chars:', totalChars);
if (warnings.length) {
  console.log('warnings (' + warnings.length + '):');
  warnings.forEach((w) => console.log('  - ' + w));
}
console.log('-> written', OUT);
