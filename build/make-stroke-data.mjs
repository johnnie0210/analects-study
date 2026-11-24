/* 논어 명언에 쓰인 한자의 획순 데이터를 로컬 파일(stroke-data.js)로 만듭니다.
 *
 * 데이터 출처
 *  - hanzi-writer-data (Make Me a Hanzi / Arphic Public License)
 *    https://www.npmjs.com/package/hanzi-writer-data
 *  - Make Me a Hanzi graphics.txt (위 데이터의 원본, 같은 라이선스)
 *    https://github.com/skishore/makemeahanzi
 *  - hanzi-writer-data-jp (일부 누락 글자 보충, animCJK 유래)
 *    https://www.npmjs.com/package/@k1low/hanzi-writer-data-jp
 *  - animCJK (누락 글자 俶 보충, Arphic Public License)
 *    https://github.com/parsimonhi/animCJK
 *  - 조합 글자(COMPOSED): 위 데이터의 부품을 잘라 붙여 생성 (飮·踰·廋·杇·訒·敎·鬪 등, 구성은 COMPOSED 참고)
 *  - 천자문 앱(../cheonjamun-study/stroke-data.js)이 옆 폴더에 있으면 그 데이터를 가장 먼저 사용
 *
 * 실행: cd build && node make-stroke-data.mjs
 * (처음 실행 시 npm tarball / graphics.txt 를 내려받아 임시 폴더에 압축 해제합니다.)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(os.tmpdir(), 'cheonjamun-stroke-build');
const OUT = path.join(ROOT, 'stroke-data.js');

// animCJK는 SVG 파일명이 유니코드 10진수라 글자별 주소를 직접 지정합니다.
const ANIMCJK_FILES = {
  '俶': 'https://raw.githubusercontent.com/parsimonhi/animCJK/master/svgsJa/20470.svg',
};

// 어느 소스에도 없는 글자는 기존 글자의 부품을 잘라 붙여 만듭니다.
// parts 순서가 곧 획순입니다. strokes: 가져올 획 번호(0부터), 생략하면 전체.
// transform: x' = dx + sx·x, y' = dy + sy·y (Hanzi Writer 좌표계, 1024칸, y축 위쪽).
// fit: { char, strokes, x?, y? } — 참조 글자의 해당 획들이 차지하는 영역(x·y로 비율 구간 지정 가능)에
//      부품을 맞춰 넣습니다.
const COMPOSED = {
  // ---- 논어 명언 보충 글자 ----
  // 飮 = 飲 (한국 표준 자형 코드, 구성·획순 동일)
  '飮': [
    { from: '飲' },
  ],
  // 踰 = 足(踊 1~7획) + 俞(踊의 甬 자리에 맞춤)
  '踰': [
    { from: '踊', strokes: [0, 1, 2, 3, 4, 5, 6] },
    { from: '俞', fit: { char: '踊', strokes: [7, 8, 9, 10, 11, 12, 13] } },
  ],
  // 廋 = 广(瘦 1~3획) + 叟(瘦 6~14획, 이미 广 안쪽 위치)
  '廋': [
    { from: '瘦', strokes: [0, 1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13] },
  ],
  // 杇 = 木(朽 1~4획) + 亏(朽의 丂 자리에 맞춤)
  '杇': [
    { from: '朽', strokes: [0, 1, 2, 3] },
    { from: '亏', fit: { char: '朽', strokes: [4, 5] } },
  ],
  // 訒 = 言(訓 1~7획) + 刃(訓의 川 자리에 맞춤)
  '訒': [
    { from: '訓', strokes: [0, 1, 2, 3, 4, 5, 6] },
    { from: '刃', fit: { char: '訓', strokes: [7, 8, 9] } },
  ],
  // 敎 = 爻(教의 耂 자리에 맞춤) + 子·攵(教 5~11획)
  '敎': [
    { from: '爻', fit: { char: '教', strokes: [0, 1, 2, 3] } },
    { from: '教', strokes: [4, 5, 6, 7, 8, 9, 10] },
  ],
  // 鬪 = 鬥(鬭 1~10획) + 豆·寸(鬭의 안쪽 斲 자리를 좌우로 나눠 맞춤)
  '鬪': [
    { from: '鬭', strokes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] },
    { from: '豆', fit: { char: '鬭', strokes: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], x: [0, 0.56] } },
    { from: '寸', fit: { char: '鬭', strokes: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], x: [0.6, 1], y: [0, 0.92] } },
  ],
  // ---- 천자문 앱에서 쓰던 조합 글자 (cheonjamun-study 데이터가 없을 때 사용) ----
  // 凊 = 冫(冷 1~2획) + 靑(전체, 清 안의 青 위치에 맞게 가로 축소)
  '凊': [
    { from: '冷', strokes: [0, 1] },
    { from: '靑', transform: { sx: 0.76, dx: 232, sy: 1, dy: 0 } },
  ],
  // 磻 = 石(磁 1~5획) + 番(전체, 오른쪽에 맞게 가로 축소)
  '磻': [
    { from: '磁', strokes: [0, 1, 2, 3, 4] },
    { from: '番', transform: { sx: 0.62, dx: 372, sy: 1, dy: 0 } },
  ],
  // 輶 = 車(輸 1~7획) + 酋(전체, 오른쪽에 맞게 가로 축소)
  '輶': [
    { from: '輸', strokes: [0, 1, 2, 3, 4, 5, 6] },
    { from: '酋', transform: { sx: 0.66, dx: 348, sy: 1, dy: 0 } },
  ],
  // 煒 = 火(燈 1~4획) + 韋(전체, 오른쪽에 맞게 가로 축소)
  '煒': [
    { from: '燈', strokes: [0, 1, 2, 3] },
    { from: '韋', transform: { sx: 0.70, dx: 313, sy: 1, dy: 0 } },
  ],
  // 璿 = 王(璇 1~4획) + 睿(전체, 오른쪽에 맞게 가로 축소)
  '璿': [
    { from: '璇', strokes: [0, 1, 2, 3] },
    { from: '睿', transform: { sx: 0.675, dx: 309, sy: 1, dy: 0 } },
  ],
};

const SOURCES = {
  hwd: {
    url: 'https://registry.npmjs.org/hanzi-writer-data/-/hanzi-writer-data-2.0.1.tgz',
    dir: 'hanzi-writer-data',
  },
  jp: {
    url: 'https://registry.npmjs.org/@k1low/hanzi-writer-data-jp/-/hanzi-writer-data-jp-0.8.0.tgz',
    dir: 'hanzi-writer-data-jp',
  },
  graphics: {
    url: 'https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphics.txt',
    file: 'graphics.txt',
  },
};

function log(msg) { console.log('[stroke-data] ' + msg); }

async function download(url, dest) {
  if (fs.existsSync(dest)) return dest;
  log('downloading ' + url);
  const res = await fetch(url);
  if (!res.ok) throw new Error('download failed: ' + url + ' (' + res.status + ')');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

function unpackTgz(tgz, targetDir) {
  if (fs.existsSync(path.join(targetDir, 'package'))) return targetDir;
  fs.mkdirSync(targetDir, { recursive: true });
  // Windows 10+, macOS, Linux 모두 tar 사용 가능.
  // Windows의 tar.exe는 한자 파일명에서 경고를 내며 종료코드 1을 반환하지만 파일은 정상 추출됩니다.
  try {
    execFileSync('tar', ['-xzf', tgz, '-C', targetDir], { stdio: 'ignore' });
  } catch (e) {
    if (!fs.existsSync(path.join(targetDir, 'package'))) throw e;
  }
  return targetDir;
}

function walkJson(dir) {
  const found = new Map();
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const [k, v] of walkJson(p)) found.set(k, v);
    } else if (entry.name.endsWith('.json')) {
      const key = entry.name.slice(0, -5);
      if (!found.has(key)) found.set(key, p);
    }
  }
  return found;
}

function loadCharacter(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(raw.strokes) || !Array.isArray(raw.medians)) return null;
  // Hanzi Writer 에 필요한 최소 필드만 유지
  return { strokes: raw.strokes, medians: raw.medians };
}

function loadGraphics(file) {
  const map = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line) continue;
    const obj = JSON.parse(line.replace(/,$/, ''));
    if (obj.character && Array.isArray(obj.strokes) && Array.isArray(obj.medians)) {
      map.set(obj.character, { strokes: obj.strokes, medians: obj.medians });
    }
  }
  return map;
}

// animCJK SVG → Hanzi Writer 형식 (strokes/medians).
// viewBox가 1024×1024이라 좌표 변환이 필요 없고, 중심선은 M/L만 사용합니다.
function parseAnimCjkSvg(svg) {
  const strokes = [];
  for (const m of svg.matchAll(/<path id="z\d+d(\d+)" d="([^"]+)"/g)) {
    strokes.push({ n: Number(m[1]), d: m[2] });
  }

  const medians = [];
  for (const m of svg.matchAll(/<path\b[^>]*>/g)) {
    const tag = m[0];
    const clip = tag.match(/clip-path="url\(#z\d+c(\d+)\)"/);
    const d = tag.match(/\sd="([^"]+)"/);
    if (!clip || !d) continue;
    const points = [];
    for (const p of d[1].matchAll(/[ML]\s*([-\d.]+)[ ,]+([-\d.]+)/g)) {
      points.push([Number(p[1]), Number(p[2])]);
    }
    if (points.length) medians.push({ n: Number(clip[1]), points });
  }

  strokes.sort((a, b) => a.n - b.n);
  medians.sort((a, b) => a.n - b.n);
  if (!strokes.length || strokes.length !== medians.length) {
    throw new Error('animCJK stroke/median mismatch: ' + strokes.length + '/' + medians.length);
  }
  return {
    strokes: strokes.map((s) => s.d),
    medians: medians.map((m) => m.points),
  };
}

function transformCharacter(data, t) {
  if (!t) return data;
  const fx = (x) => Math.round(t.dx + t.sx * x);
  const fy = (y) => Math.round(t.dy + t.sy * y);
  // strokes의 path 명령(M/L/Q/C/Z)은 모두 절대 좌표 x y 쌍이므로 숫자를 둘씩 변환합니다.
  const strokes = data.strokes.map((d) => {
    let i = 0;
    return d.replace(/-?\d+(?:\.\d+)?/g, (n) => String(i++ % 2 === 0 ? fx(Number(n)) : fy(Number(n))));
  });
  const medians = data.medians.map((m) => m.map(([x, y]) => [fx(x), fy(y)]));
  return { strokes, medians };
}

// 획 외곽선(path)의 좌표로 영역(bounding box)을 구합니다.
function bbox(strokes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of strokes) {
    const nums = (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    for (let i = 0; i + 1 < nums.length; i += 2) {
      x0 = Math.min(x0, nums[i]); x1 = Math.max(x1, nums[i]);
      y0 = Math.min(y0, nums[i + 1]); y1 = Math.max(y1, nums[i + 1]);
    }
  }
  return { x0, y0, x1, y1 };
}

// 부품 영역을 참조 글자의 지정 획 영역에 맞추는 transform
function fitTransform(picked, fit, lookup) {
  const ref = lookup(fit.char);
  if (!ref) throw new Error('fit reference not found: ' + fit.char);
  const a = bbox(picked.strokes);
  const r = bbox(fit.strokes.map((i) => ref.strokes[i]));
  // x·y: 참조 영역 중 사용할 비율 구간 (예: x: [0, 0.5] → 왼쪽 절반)
  const [fx0, fx1] = fit.x || [0, 1];
  const [fy0, fy1] = fit.y || [0, 1];
  const b = {
    x0: r.x0 + (r.x1 - r.x0) * fx0, x1: r.x0 + (r.x1 - r.x0) * fx1,
    y0: r.y0 + (r.y1 - r.y0) * fy0, y1: r.y0 + (r.y1 - r.y0) * fy1,
  };
  const sx = (b.x1 - b.x0) / (a.x1 - a.x0);
  const sy = (b.y1 - b.y0) / (a.y1 - a.y0);
  return { sx, sy, dx: b.x0 - sx * a.x0, dy: b.y0 - sy * a.y0 };
}

function composeCharacter(parts, lookup) {
  const out = { strokes: [], medians: [] };
  for (const part of parts) {
    const src = lookup(part.from);
    if (!src) throw new Error('compose source not found: ' + part.from);
    const idx = part.strokes || src.strokes.map((_, i) => i);
    const picked = {
      strokes: idx.map((i) => src.strokes[i]),
      medians: idx.map((i) => src.medians[i]),
    };
    const t = part.fit ? fitTransform(picked, part.fit, lookup) : part.transform;
    const moved = transformCharacter(picked, t);
    out.strokes.push(...moved.strokes);
    out.medians.push(...moved.medians);
  }
  return out;
}

function appCharacters() {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data.js'), 'utf8'), ctx);
  return [...new Set(ctx.window.ANALECTS_DATA.characters.map((c) => c.hanja))];
}

// 천자문 앱(cheonjamun-study)의 획순 데이터가 옆 폴더에 있으면 먼저 사용합니다.
// (조합 글자 등 천자문 앱에서 다듬은 데이터를 그대로 재사용)
function loadCheonjamunStrokes() {
  const file = path.resolve(ROOT, '..', 'cheonjamun-study', 'stroke-data.js');
  if (!fs.existsSync(file)) return new Map();
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx);
  return new Map(Object.entries(ctx.window.STROKE_DATA || {}));
}

// 이전에 만든 이 앱의 stroke-data.js (GitHub Actions처럼 천자문 폴더가 없을 때 결과 유지용)
function loadPreviousStrokes() {
  if (!fs.existsSync(OUT)) return new Map();
  try {
    const ctx = { window: {} };
    vm.runInNewContext(fs.readFileSync(OUT, 'utf8'), ctx);
    return new Map(Object.entries(ctx.window.STROKE_DATA || {}));
  } catch { return new Map(); }
}

const chars = appCharacters();
log('target characters: ' + chars.length);
const cheonjamun = loadCheonjamunStrokes();
log('cheonjamun stroke data: ' + cheonjamun.size);
const previous = loadPreviousStrokes();
log('previous stroke data: ' + previous.size);

const hwdTgz = await download(SOURCES.hwd.url, path.join(TMP, 'hwd.tgz'));
const jpTgz = await download(SOURCES.jp.url, path.join(TMP, 'jp.tgz'));
const graphicsFile = await download(SOURCES.graphics.url, path.join(TMP, 'graphics.txt'));

const hwdDir = unpackTgz(hwdTgz, path.join(TMP, 'hwd'));
const jpDir = unpackTgz(jpTgz, path.join(TMP, 'jp'));
const hwdFiles = walkJson(hwdDir);
const jpFiles = walkJson(jpDir);
const graphics = loadGraphics(graphicsFile);

const animcjkFiles = new Map();
for (const [ch, url] of Object.entries(ANIMCJK_FILES)) {
  const file = await download(url, path.join(TMP, 'animcjk-' + ch.codePointAt(0) + '.svg'));
  animcjkFiles.set(ch, parseAnimCjkSvg(fs.readFileSync(file, 'utf8')));
}
log('source data: hwd=' + hwdFiles.size + ', jp=' + jpFiles.size +
  ', makemeahanzi=' + graphics.size + ', animcjk=' + animcjkFiles.size);

const result = {};
const missing = [];
const from = { cheonjamun: 0, previous: 0, hwd: 0, makemeahanzi: 0, jp: 0, animcjk: 0, composed: 0 };

function lookupSource(ch) {
  if (hwdFiles.has(ch)) {
    const d = loadCharacter(hwdFiles.get(ch));
    if (d) return d;
  }
  if (graphics.has(ch)) return graphics.get(ch);
  if (jpFiles.has(ch)) return loadCharacter(jpFiles.get(ch));
  return null;
}

for (const ch of chars) {
  let data = null;
  let source = '';
  if (cheonjamun.has(ch)) {
    data = cheonjamun.get(ch);
    source = 'cheonjamun';
  }
  // 조합 글자는 COMPOSED 규칙을 고치면 바로 반영되도록 이전 결과를 쓰지 않습니다.
  if (!data && !COMPOSED[ch] && previous.has(ch)) {
    data = previous.get(ch);
    source = 'previous';
  }
  if (!data && hwdFiles.has(ch)) {
    data = loadCharacter(hwdFiles.get(ch));
    source = 'hwd';
  }
  if (!data && graphics.has(ch)) {
    data = graphics.get(ch);
    source = 'makemeahanzi';
  }
  // 직접 지정한 animCJK 글자는 jp보다 먼저 적용합니다.
  // (jp tarball의 한자 파일명이 환경에 따라 풀리지 않아 결과가 달라지는 것을 막기 위함)
  if (!data && animcjkFiles.has(ch)) {
    data = animcjkFiles.get(ch);
    source = 'animcjk';
  }
  if (!data && jpFiles.has(ch)) {
    data = loadCharacter(jpFiles.get(ch));
    source = 'jp';
  }
  if (!data && COMPOSED[ch]) {
    data = composeCharacter(COMPOSED[ch], lookupSource);
    source = 'composed';
  }
  if (data) {
    result[ch] = data;
    from[source] += 1;
  } else {
    missing.push(ch);
  }
}

const body = JSON.stringify(result);
fs.writeFileSync(OUT,
  '/* 자동 생성 파일 — build/make-stroke-data.mjs 로 재생성. 직접 수정 금지 */\n' +
  '/* 데이터 출처: cheonjamun-study 획순 데이터 / hanzi-writer-data / Make Me a Hanzi / hanzi-writer-data-jp / animCJK (ARPHICPL, licenses/) */\n' +
  '/* animCJK SVG는 Hanzi Writer 형식으로 변환되었습니다. */\n' +
  'window.STROKE_DATA = ' + body + ';\n', 'utf8');

log('wrote ' + OUT + ' (' + (fs.statSync(OUT).size / 1024 / 1024).toFixed(2) + ' MB)');
log('source breakdown: ' + JSON.stringify(from));
log('no stroke data (' + missing.length + '): ' + missing.join(''));
