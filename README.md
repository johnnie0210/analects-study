# 논어 공부 앱 (명언 300)

논어 명언 300구절을 **카드 뒤집기**와 **퀴즈**로 공부하고, 원문의 각 한자를 눌러 **획순**을 익히는 앱입니다.
스마트폰에서 홈 화면에 설치(PWA)해 오프라인으로도 쓸 수 있습니다. (구성은 `cheonjamun-study` 앱과 같습니다)

- 앱 이름: **논어 공부 — 명언 300**
- 배포 주소(예정): `https://johnnie0210.github.io/analects-study/`

## 주요 기능

- **📇 카드 학습**
  - 앞면: **원문** (띄어쓰기 단위로 줄바꿈)
  - `뒤집기` 버튼(또는 카드 탭) → 뒷면: **음독 · 직역 · 의미 · 적용 · 글자 풀이**(음·뜻)
    - 적용 끝의 '스스로에게 던지는 질문'은 질문 목록으로 표시
  - **원문의 글자를 누르면 획순** 애니메이션 (앞면·뒷면·글자 풀이 모두)
    - 획순 시트 위쪽에서 같은 구절의 다른 글자로 바로 전환
    - `다시 보기`, `따라쓰기`(획순 퀴즈), `지우기`
  - 덱: `명언`(300구절) / `개별 한자`(653자, 음·뜻·부수·획수·쓰인 명언)
  - 범위: 편(學而篇~堯曰篇)별, 개별 한자는 100자 단위·편별
  - 섞기, 순번 이동, 좌우 스와이프, PC 키보드(←/→ 이동, Space 뒤집기, Esc 닫기)
  - 뒷면이 길면 카드 안에서 스크롤 (뒤집기 버튼은 항상 화면 안에 보임)
- **❓ 퀴즈** — 원문→음독, 원문→직역, 직역→원문, 한자→음 / 편별 범위 / 문제 수 / 자주 틀린 것 우선 / 틀린 것만 복습
- **📖 목록** — 명언·개별 한자 검색(원문·음독·직역·편), 편 필터, 글자 눌러 획순, `카드로 보기`
- **학습 기록** — 본 카드·푼 문제·정답률을 기기에 저장

## 파일 구성

```
analects-study/
├─ index.html              앱 화면
├─ styles.css              스타일
├─ app.js                  앱 로직
├─ data.js                 ← 엑셀에서 자동 생성 (직접 수정 금지)
├─ stroke-data.js          ← 획순 데이터 자동 생성 (직접 수정 금지)
├─ vendor/
│  └─ hanzi-writer.min.js  획순 애니메이션 라이브러리
├─ licenses/               데이터·라이브러리 라이선스
├─ 논어_명언_300.xlsx       공부할 원본 엑셀
├─ manifest.webmanifest    PWA 설정
├─ sw.js                   서비스 워커 (오프라인)
├─ icons/                  앱 아이콘
├─ .github/workflows/
│  └─ update-data.yml      엑셀 업로드 시 data.js·stroke-data.js 자동 생성
└─ build/
   ├─ parse-xlsx.mjs       엑셀 → data.js 변환
   ├─ make-stroke-data.mjs 획순 데이터 → stroke-data.js 생성
   └─ package.json
```

## 엑셀 형식 (`논어_명언_300.xlsx`)

**시트 1 `논어 명언 300`**

| A | B | C | D | E | F | G |
|---|---|---|---|---|---|---|
| No. | 편 | 원문 | 음독 | 직역 | 무슨 뜻인가요? | 오늘 이 구절을 어떻게 적용할까? |
| 1 | 學而篇 | 學而時習之 不亦說乎 | 학이시습지 불역열호 | 배우고 때때로 익히면 또한 기쁘지 아니한가. | (구절 해설) | (현대 적용 + `스스로에게 던지는 질문 · 질문1 · 질문2 · 질문3`) |

- F(의미)·G(적용)은 카드 뒷면의 직역 아래에 **의미**·**적용**으로 표시됩니다.
- G 끝의 `스스로에게 던지는 질문`부터는 ` · `로 나눠 질문 목록으로 보여 줍니다.

**시트 2 `한자 풀이`** — 원문의 글자마다 1행 (No.로 시트 1과 연결)

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| No. | 편 | 원문 | 한자 | 음 | 뜻 | 획수 | 부수 |
| 1 | 學而篇 | 學而時習之 不亦說乎 | 學 | 학 | 배우다 | 16획 | 子(자) |

- 원문의 띄어쓰기가 카드의 줄바꿈 단위가 됩니다.
- 시트 2에 글자 풀이가 없으면 다른 구절의 같은 글자 풀이를 빌려 쓰고, 변환 시 경고로 알려 줍니다.
- 원문 글자 수와 음독 글자 수가 다르면 경고가 표시됩니다.

## PC에서 직접 반영하기

엑셀을 고친 뒤 아래를 실행합니다.

```powershell
cd build
npm install                 # 최초 1회
node parse-xlsx.mjs         # data.js 생성
node make-stroke-data.mjs   # 새 글자가 생겼을 때 획순 데이터 생성 (인터넷 필요)
```

- 기본으로 `../논어_명언_300.xlsx`를 읽습니다. 다른 파일은 `node parse-xlsx.mjs "경로\파일.xlsx"`.

## 획순 데이터

현재 653자 모두 획순이 들어 있습니다.

| 출처 | 글자 수 |
|---|---|
| 천자문 앱(`../cheonjamun-study/stroke-data.js`) 재사용 | 369 |
| [hanzi-writer-data](https://www.npmjs.com/package/hanzi-writer-data) / [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) | 269 |
| [hanzi-writer-data-jp](https://www.npmjs.com/package/@k1low/hanzi-writer-data-jp) (animCJK 유래) | 8 |
| 부품 조합 (`飮·踰·廋·杇·訒·敎·鬪`) | 7 |

- `make-stroke-data.mjs`는 **천자문 앱 데이터 → 이전 결과 → 공개 데이터 → 조합 규칙** 순으로 찾습니다.
- 조합 글자는 기존 글자의 획을 잘라 붙여 만든 것입니다 (`COMPOSED` 참고).
  - 飮 = 飲 / 踰 = 足 + 俞 / 廋 = 广 + 叟 / 杇 = 木 + 亏 / 訒 = 言 + 刃 / 敎 = 爻 + 子 + 攵 / 鬪 = 鬥 + 豆 + 寸
  - 飮(13획)·廋(13획)은 자형 차이로 애니메이션이 12획입니다(엑셀 획수는 그대로 표시).
- 애니메이션: [Hanzi Writer](https://github.com/chanind/hanzi-writer) (MIT). 라이선스 원문은 `licenses/`에 있습니다.

## 엑셀만 올리면 자동 반영 (GitHub)

1. GitHub 저장소에 `논어_명언_300.xlsx`를 업로드/교체하고 **Commit changes** (파일 이름 유지)
2. **Actions** 탭에서 `Update analects data` 워크플로가 `data.js`·`stroke-data.js`를 다시 만들어 커밋합니다.
3. 서비스 워커가 **network-first**라 앱을 다시 열면 최신 내용을 받아옵니다.

> 저장소 **Settings → Actions → General → Workflow permissions** 가 **Read and write permissions** 인지 확인하세요.

## 로컬에서 미리보기

```powershell
npx serve .
```

브라우저에서 표시된 주소(예: http://localhost:3000)를 엽니다.
(`index.html`을 더블클릭해 열어도 동작하지만, 오프라인 설치(서비스 워커)는 서버로 열었을 때만 동작합니다.)

## 배포 (GitHub Pages)

1. GitHub에 `analects-study` 저장소를 만들고 이 폴더를 push
2. 저장소 **Settings → Pages** → Source: `Deploy from a branch`, Branch: `main` / `/ (root)`
3. 잠시 후 `https://<아이디>.github.io/analects-study/` 접속

### 스마트폰에 설치

- **Android(Chrome)**: 주소 접속 → ⋮ → **홈 화면에 추가** 또는 **앱 설치**
- **iPhone(Safari)**: 주소 접속 → 공유 → **홈 화면에 추가**

> 예전 내용이 계속 보이면 `sw.js`의 `CACHE` 이름을 `analects-study-v2`처럼 올려 주세요.
