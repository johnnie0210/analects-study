/* 논어 공부 — 앱 로직 */
(function () {
  'use strict';

  const DATA = window.ANALECTS_DATA || { chapters: [], entries: [], characters: [], counts: {} };
  const $ = (id) => document.getElementById(id);

  /* ================= 저장소 ================= */
  const STORE_KEY = 'analects-study-v1';
  const defaultStats = () => ({ viewed: {}, quiz: { total: 0, correct: 0 }, wrong: {} });
  let stats = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultStats();
      return Object.assign(defaultStats(), JSON.parse(raw));
    } catch (e) { return defaultStats(); }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(stats)); } catch (e) {}
  }

  /* ================= 유틸 ================= */
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const isHan = (ch) => /\p{Script=Han}/u.test(ch);
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uniq(arr) { return [...new Set(arr)]; }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 1800);
  }

  // 원문을 띄어쓰기(구) 단위로 묶고, 한자마다 누를 수 있는 버튼으로 만듭니다.
  function hanjaHtml(text) {
    return String(text || '').split(/\s+/).filter(Boolean).map((phrase) =>
      '<span class="phrase-group">' + [...phrase].map((ch) => isHan(ch)
        ? '<button type="button" class="hz" data-hanja="' + esc(ch) + '" aria-label="' + esc(ch) + ' 획순 보기">' + esc(ch) + '</button>'
        : '<span>' + esc(ch) + '</span>').join('') + '</span>'
    ).join('');
  }

  // 글자 수·가장 긴 구 길이에 맞춰 원문 글자 크기를 정합니다.
  function textSize(text, small) {
    const phrases = String(text || '').split(/\s+/).filter(Boolean);
    const total = phrases.reduce((n, p) => n + [...p].length, 0);
    const longest = Math.max(1, ...phrases.map((p) => [...p].length));
    const width = Math.min(560, window.innerWidth) - 32 - 40;
    let target;
    if (small) target = total <= 4 ? 44 : total <= 10 ? 32 : total <= 18 ? 27 : 23;
    else target = total <= 1 ? 110 : total <= 4 ? 72 : total <= 8 ? 56 : total <= 14 ? 44 : total <= 22 ? 36 : 30;
    const fit = Math.floor(width / (longest * 1.08));
    return Math.max(small ? 18 : 22, Math.min(target, fit));
  }

  /* ================= 데이터 구성 ================= */
  const charInfo = new Map(DATA.characters.map((c) => [c.hanja, c]));
  const entryById = new Map(DATA.entries.map((e) => [e.id, e]));

  const passageCards = DATA.entries.map((e) => ({
    key: 'p' + e.id,
    kind: 'passage',
    id: e.id,
    no: e.no,
    chapter: e.chapter,
    hanja: e.hanja,
    reading: e.reading,
    translation: e.translation,
    explain: e.explain || '',
    apply: e.apply || '',
    chars: e.chars,
  }));

  const charCards = DATA.characters.map((c) => {
    const used = c.in.map((id) => entryById.get(id)).filter(Boolean);
    return {
      key: 'c' + c.hanja,
      kind: 'char',
      hanja: c.hanja,
      reading: c.readings.join(' · '),
      meaning: c.meanings.join(', '),
      strokes: c.strokes,
      radical: c.radical,
      used,
      chapters: uniq(used.map((e) => e.chapter)),
      first: c.first,
    };
  }).sort((a, b) => a.first - b.first);

  const cardByKey = new Map(passageCards.concat(charCards).map((c) => [c.key, c]));

  // 카드/항목의 획순 대상 글자 목록
  function strokeCharsOf(card) {
    if (!card) return [];
    if (card.kind === 'char') return [card.hanja];
    return uniq([...card.hanja].filter(isHan));
  }

  /* ================= 획순 (앱 내부) ================= */
  const strokeData = () => window.STROKE_DATA || {};

  let strokeWriter = null;
  let strokeCurrent = '';
  let strokeChars = [];
  let strokeQuizMode = false;
  let strokeAutoPlay = true;
  let strokeLastFocus = null;
  let strokeOpenToken = 0;
  let strokeAssetsPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error('load failed: ' + src));
      document.head.appendChild(el);
    });
  }

  function loadStrokeAssets() {
    if (!strokeAssetsPromise) {
      strokeAssetsPromise = Promise.all([
        loadScript('vendor/hanzi-writer.min.js'),
        loadScript('stroke-data.js'),
      ]).catch((e) => { strokeAssetsPromise = null; throw e; });
    }
    return strokeAssetsPromise;
  }

  function strokeInfoText(hanja) {
    const info = charInfo.get(hanja);
    if (!info) return '';
    const left = [info.readings.join(' · '), info.meanings.join(', ')].filter(Boolean).join('  |  ');
    const right = [info.radical ? '부수 ' + info.radical : '', info.strokes ? info.strokes + '획' : ''].filter(Boolean).join(' · ');
    return [left, right].filter(Boolean).join('  ·  ');
  }

  function renderStrokeHeader(hanja) {
    $('stroke-title').textContent = hanja + ' 획순';
    $('stroke-sub').textContent = strokeInfoText(hanja);
    $('stroke-chars').innerHTML = strokeChars.length > 1
      ? strokeChars.map((ch) => '<button type="button" class="stroke-char-btn' +
          (ch === hanja ? ' active' : '') + '" data-hanja="' + esc(ch) +
          '" aria-label="' + esc(ch) + ' 획순 보기">' + esc(ch) + '</button>').join('')
      : '';
    const active = $('stroke-chars').querySelector('.active');
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  // chars: 위쪽에 고를 수 있게 보여 줄 글자들, start: 처음 보여 줄 글자
  function openStrokeOrder(chars, start) {
    strokeChars = uniq((chars || []).filter(Boolean));
    if (!strokeChars.length) return;
    strokeCurrent = start && strokeChars.includes(start) ? start : strokeChars[0];

    const token = ++strokeOpenToken;
    strokeLastFocus = document.activeElement;
    renderStrokeHeader(strokeCurrent);
    $('stroke-writer').innerHTML = '<div class="stroke-loading">획순 불러오는 중…</div>';
    $('stroke-writer').classList.remove('hidden');
    $('stroke-empty').classList.add('hidden');
    updateStrokeButtons(false);
    $('stroke-backdrop').classList.remove('hidden');
    $('stroke-close').focus();

    loadStrokeAssets().then(() => {
      if (token === strokeOpenToken && !$('stroke-backdrop').classList.contains('hidden')) {
        renderStrokeChar(strokeCurrent);
      }
    }).catch(() => {
      if (token === strokeOpenToken && !$('stroke-backdrop').classList.contains('hidden')) {
        $('stroke-writer').innerHTML = '<div class="stroke-loading">획순 데이터를 불러오지 못했어요.</div>';
      }
    });
  }

  function closeStroke() {
    $('stroke-backdrop').classList.add('hidden');
    if (strokeWriter) {
      try { strokeWriter.cancelQuiz(); } catch (e) {}
    }
    strokeQuizMode = false;
    if (strokeLastFocus && strokeLastFocus.focus) strokeLastFocus.focus();
  }

  function renderStrokeChar(hanja) {
    if (strokeWriter) {
      try { strokeWriter.cancelQuiz(); } catch (e) {}
    }
    strokeCurrent = hanja;
    strokeQuizMode = false;
    renderStrokeHeader(hanja);

    const hasData = !!strokeData()[hanja];
    $('stroke-writer').classList.toggle('hidden', !hasData);
    $('stroke-empty').classList.toggle('hidden', hasData);
    $('stroke-empty-char').textContent = hasData ? '' : hanja;
    updateStrokeButtons(hasData);

    const mount = $('stroke-writer');
    mount.innerHTML = '';
    strokeWriter = null;
    if (!hasData || typeof window.HanziWriter === 'undefined') return;

    const size = Math.max(200, Math.min(280, (mount.parentElement.clientWidth || 320) - 32));
    strokeAutoPlay = true;
    const writer = HanziWriter.create(mount, hanja, {
      width: size,
      height: size,
      padding: 12,
      showOutline: true,
      strokeColor: '#6b2a2a',
      radicalColor: '#9a7a3a',
      strokeAnimationSpeed: 1,
      delayBetweenStrokes: 180,
      charDataLoader: (ch) => strokeData()[ch] || null,
      onLoadCharDataSuccess: () => {
        if (strokeAutoPlay && strokeWriter === writer) writer.animateCharacter();
      },
      onLoadCharDataError: () => toast('획순 데이터를 불러오지 못했어요.'),
    });
    strokeWriter = writer;
  }

  function updateStrokeButtons(hasData) {
    $('stroke-replay').disabled = !hasData || strokeQuizMode;
    $('stroke-trace').disabled = !hasData;
    $('stroke-reset').disabled = !hasData;
    $('stroke-trace').textContent = strokeQuizMode ? '✓ 따라쓰기 종료' : '✍️ 따라쓰기';
    $('stroke-trace').classList.toggle('active', strokeQuizMode);
  }

  function toggleStrokeQuiz() {
    if (!strokeWriter) return;
    if (strokeQuizMode) {
      strokeAutoPlay = false;
      strokeWriter.cancelQuiz();
      strokeWriter.setCharacter(strokeCurrent);
      strokeQuizMode = false;
    } else {
      try {
        strokeQuizMode = true;
        strokeWriter.quiz({
          onComplete: () => {
            toast('잘했어요! 🎉');
            strokeQuizMode = false;
            updateStrokeButtons(true);
            if (strokeWriter) strokeWriter.animateCharacter();
          },
        });
      } catch (e) {
        strokeQuizMode = false;
        toast('아직 획순을 불러오는 중이에요.');
      }
    }
    updateStrokeButtons(!!strokeData()[strokeCurrent]);
  }

  $('stroke-close').addEventListener('click', closeStroke);
  $('stroke-backdrop').addEventListener('click', (e) => {
    if (e.target === $('stroke-backdrop')) closeStroke();
  });
  $('stroke-chars').addEventListener('click', (e) => {
    const btn = e.target.closest('.stroke-char-btn[data-hanja]');
    if (btn) renderStrokeChar(btn.dataset.hanja);
  });
  $('stroke-replay').addEventListener('click', () => {
    if (strokeWriter && !strokeQuizMode) strokeWriter.animateCharacter();
  });
  $('stroke-trace').addEventListener('click', toggleStrokeQuiz);
  $('stroke-reset').addEventListener('click', () => {
    if (!strokeWriter) return;
    try { strokeWriter.cancelQuiz(); } catch (e) {}
    strokeQuizMode = false;
    strokeAutoPlay = false;
    strokeWriter.setCharacter(strokeCurrent);
    updateStrokeButtons(!!strokeData()[strokeCurrent]);
  });

  /* ================= 범위 선택 ================= */
  const CHAR_STEP = 100;

  function chapterOptions(unit) {
    return DATA.chapters.map((c) => ({ value: 'ch:' + c.name, label: c.name + ' (' + c.count + unit + ')' }));
  }

  function rangeOptions(kind) {
    if (kind === 'passage') {
      return [{ value: 'all', label: '전체 (' + passageCards.length + '구절)' }].concat(chapterOptions('구절'));
    }
    const total = charCards.length;
    const opts = [{ value: 'all', label: '전체 (' + total + '자)' }];
    for (let start = 1; start <= total; start += CHAR_STEP) {
      const end = Math.min(start + CHAR_STEP - 1, total);
      opts.push({ value: 'n:' + start + '-' + end, label: start + '~' + end + '자 (나온 순서)' });
    }
    return opts.concat(DATA.chapters.map((c) => ({ value: 'ch:' + c.name, label: c.name + '에 나온 한자' })));
  }

  function fillRangeSelect(select, options, current) {
    select.innerHTML = options.map((o) =>
      '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>'
    ).join('');
    if (!options.some((o) => o.value === current)) current = 'all';
    select.value = current;
    return current;
  }

  function matchRange(item, range) {
    if (!range || range === 'all') return true;
    if (range.startsWith('ch:')) {
      const name = range.slice(3);
      return item.kind === 'passage' ? item.chapter === name : item.chapters.includes(name);
    }
    if (range.startsWith('n:')) {
      const [a, b] = range.slice(2).split('-').map(Number);
      return item.first >= a && item.first <= b;
    }
    return true;
  }

  /* ================= 탭 ================= */
  const TABS = ['card', 'quiz', 'list'];
  let currentTab = 'card';
  function switchTab(tab) {
    currentTab = tab;
    TABS.forEach((t) => {
      document.querySelector('.tab[data-tab="' + t + '"]').classList.toggle('active', t === tab);
      $('view-' + t).classList.toggle('hidden', t !== tab);
    });
    window.scrollTo({ top: 0 });
    if (tab === 'list') renderList();
    if (tab === 'card') fitCardHeight();
  }
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  /* ================= 카드 학습 ================= */
  let cardDeckName = 'passage';
  let cardRange = 'all';
  let cardList = [];
  let cardIndex = 0;
  let order = [];

  function updateCardRange() {
    cardRange = fillRangeSelect($('card-range'), rangeOptions(cardDeckName), cardRange);
  }

  function setDeck(name) {
    cardDeckName = name;
    document.querySelectorAll('#card-deck-seg .seg-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.deck === name);
    });
  }

  function buildCardList(focusKey) {
    const base = cardDeckName === 'char' ? charCards : passageCards;
    cardList = base.filter((c) => matchRange(c, cardRange));
    applyCardOrder();
    if (focusKey) {
      const pos = order.findIndex((i) => cardList[i].key === focusKey);
      if (pos >= 0) cardIndex = pos;
    }
    showCard();
  }
  function applyCardOrder() {
    order = cardList.map((_, i) => i);
    if ($('card-shuffle').checked) order = shuffle(order);
    cardIndex = 0;
  }
  function currentCard() { return cardList[order[cardIndex]]; }

  // 다른 화면에서 특정 카드로 이동
  function openCard(key) {
    const card = cardByKey.get(key);
    if (!card) return;
    setDeck(card.kind);
    cardRange = 'all';
    updateCardRange();
    buildCardList(card.key);
    if (currentTab !== 'card') switchTab('card');
  }

  function setText(el, text, small) {
    el.innerHTML = hanjaHtml(text);
    el.style.setProperty(small ? '--hz-small' : '--hz', textSize(text, small) + 'px');
  }

  // 적용 끝의 '스스로에게 던지는 질문 · 질문1 · 질문2 · 질문3'은 제목 + 목록으로 나눈다
  const QUESTION_HEAD = '스스로에게 던지는 질문';
  function noteHtml(text) {
    const at = text.indexOf(QUESTION_HEAD);
    if (at < 0) return '<p>' + esc(text) + '</p>';
    const body = text.slice(0, at).trim();
    const qs = text.slice(at + QUESTION_HEAD.length).split(' · ').map((q) => q.replace(/^\s*·\s*/, '').trim()).filter(Boolean);
    return (body ? '<p>' + esc(body) + '</p>' : '') +
      '<div class="note-q-title">' + esc(QUESTION_HEAD) + '</div>' +
      '<ul class="note-q">' + qs.map((q) => '<li>' + esc(q) + '</li>').join('') + '</ul>';
  }

  // 카드 뒷면 의미(explain)·적용(apply) : 내용이 없으면 라벨까지 숨김
  function setNote(name, text) {
    const el = $('card-back-' + name);
    el.innerHTML = text ? noteHtml(text) : '';
    $('card-back-' + name + '-label').classList.toggle('hidden', !text);
  }

  function showCard() {
    const c = currentCard();
    $('flip-card').classList.remove('flipped');
    if (!c) {
      $('card-front-type').textContent = '';
      $('card-front-text').textContent = '—';
      $('card-back-text').innerHTML = '';
      $('card-back-reading').textContent = '';
      $('card-back-meaning').textContent = '';
      setNote('explain', '');
      setNote('apply', '');
      $('card-back-extra').textContent = '';
      $('card-back-chars').innerHTML = '';
      setCardProgress(0, 0);
      $('card-progress-fill').style.width = '0%';
      fitCardHeight();
      return;
    }

    const isPassage = c.kind === 'passage';
    const typeLabel = isPassage ? c.chapter + ' · ' + c.no : '한자 · ' + c.first;
    $('card-front-type').textContent = typeLabel;
    $('card-back-type').textContent = typeLabel;
    setText($('card-front-text'), c.hanja, false);
    setText($('card-back-text'), c.hanja, true);
    $('card-front-hint').textContent = isPassage
      ? '글자를 누르면 획순 · 뒤집기를 누르면 풀이'
      : '글자를 누르면 획순 · 뒤집기를 누르면 음과 뜻';

    $('card-back-reading-label').textContent = isPassage ? '음독' : '음';
    $('card-back-reading').textContent = c.reading || '';
    $('card-back-reading').classList.toggle('big', !isPassage);
    $('card-back-meaning-label').textContent = isPassage ? '직역' : '뜻';
    $('card-back-meaning').textContent = isPassage ? c.translation : c.meaning;
    $('card-back-meaning-label').classList.toggle('hidden', !(isPassage ? c.translation : c.meaning));
    // 의미·적용은 명언 카드에만 (개별 한자 카드는 숨김)
    setNote('explain', isPassage ? c.explain : '');
    setNote('apply', isPassage ? c.apply : '');

    const cc = $('card-back-chars');
    if (isPassage) {
      $('card-back-extra').textContent = '';
      // 글자 풀이 (중복 글자는 한 번만)
      const seen = new Set();
      cc.className = 'card-chars';
      cc.innerHTML = c.chars.filter((ch) => !seen.has(ch.hanja) && seen.add(ch.hanja)).map((ch) => {
        const label = ch.hanja + ' ' + ch.reading + (ch.meaning ? ' ' + ch.meaning : '');
        return '<button type="button" class="cc" data-hanja="' + esc(ch.hanja) +
          '" aria-label="' + esc(label + ' 획순 보기') + '"><b>' + esc(ch.hanja) + '</b><span>' +
          esc(ch.reading) + (ch.meaning ? ' ' + esc(ch.meaning) : '') + '</span></button>';
      }).join('');
    } else {
      $('card-back-extra').textContent = [
        c.radical ? '부수 ' + c.radical : '',
        c.strokes ? c.strokes + '획' : '',
        '명언 ' + c.used.length + '곳',
      ].filter(Boolean).join(' · ');
      cc.className = 'card-chars used';
      cc.innerHTML = '<div class="usedwords-label">쓰인 명언</div>' +
        c.used.slice(0, 4).map((e) => '<button type="button" class="uw" data-key="p' + e.id + '">' +
          esc(e.hanja) + '<small>' + esc(e.chapter + ' · ' + e.no + ' — ' + e.reading) + '</small></button>').join('') +
        (c.used.length > 4 ? '<div class="usedwords-label">외 ' + (c.used.length - 4) + '곳 (목록에서 검색)</div>' : '');
    }

    setCardProgress(cardIndex + 1, cardList.length);
    $('card-progress-fill').style.width = (cardList.length ? (cardIndex + 1) / cardList.length * 100 : 0) + '%';
    updateKnownStat();
    fitCardHeight();
  }

  // 앞/뒷면 내용에 맞춰 카드 높이를 정합니다.
  // 뒷면이 길면 '뒤집기' 버튼이 화면 안에 보이는 높이까지만 늘리고, 나머지는 카드 안에서 스크롤합니다.
  function measureFace(face) {
    face.classList.add('measure');
    const h = face.offsetHeight;
    face.classList.remove('measure');
    return h;
  }
  function fitCardHeight() {
    const fc = $('flip-card');
    if (!fc.offsetParent) return; // 화면이 숨겨져 있으면 다음에 계산
    const front = measureFace($('flip-front'));
    const back = measureFace($('flip-back'));
    const stageTop = $('card-stage').getBoundingClientRect().top + window.scrollY;
    const tabbar = document.querySelector('.tabbar').offsetHeight;
    const below = 19 + 14 + $('btn-flip').offsetHeight + 36 + tabbar; // 진행바 + 버튼 + 학습 수 + 탭바
    const room = Math.max(340, window.innerHeight - stageTop - below);
    fc.style.height = Math.max(340, front, Math.min(back, room)) + 'px';
    $('flip-back').scrollTop = 0;
  }
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const c = currentCard();
      if (c) {
        $('card-front-text').style.setProperty('--hz', textSize(c.hanja, false) + 'px');
        $('card-back-text').style.setProperty('--hz-small', textSize(c.hanja, true) + 'px');
      }
      fitCardHeight();
    }, 120);
  });

  function flipCard() {
    const c = currentCard();
    if (!c) return;
    const fc = $('flip-card');
    fc.classList.toggle('flipped');
    if (fc.classList.contains('flipped') && !stats.viewed[c.key]) {
      stats.viewed[c.key] = 1;
      save();
      updateKnownStat();
    }
  }
  function nextCard() {
    if (!cardList.length) return;
    cardIndex = (cardIndex + 1) % cardList.length;
    showCard();
  }
  function prevCard() {
    if (!cardList.length) return;
    cardIndex = (cardIndex - 1 + cardList.length) % cardList.length;
    showCard();
  }
  function setCardProgress(pos, total) {
    const input = $('card-jump');
    input.value = pos;
    input.max = total;
    input.disabled = !total;
    $('card-progress-total').textContent = '/ ' + total;
  }
  function jumpToCard() {
    const input = $('card-jump');
    if (!cardList.length) return;
    const n = Number(input.value);
    if (!Number.isInteger(n) || n < 1 || n > cardList.length) {
      toast('1 ~ ' + cardList.length + ' 사이의 순번을 입력하세요.');
      input.value = cardIndex + 1;
      return;
    }
    if (n - 1 !== cardIndex) {
      cardIndex = n - 1;
      showCard();
    }
  }
  $('card-jump-form').addEventListener('submit', (e) => {
    e.preventDefault();
    jumpToCard();
    $('card-jump').blur();
  });
  $('card-jump').addEventListener('change', () => {
    if ($('card-jump').value === '') { $('card-jump').value = cardIndex + 1; return; }
    jumpToCard();
  });
  $('card-jump').addEventListener('focus', (e) => e.target.select());

  function updateKnownStat() {
    const known = cardList.filter((c) => stats.viewed[c.key]).length;
    $('card-known-count').textContent = cardList.length
      ? ('이 묶음에서 학습한 카드 ' + known + ' / ' + cardList.length)
      : '';
  }

  // 카드 클릭: 글자 → 획순, 쓰인 명언 → 해당 카드, 나머지 → 뒤집기
  $('flip-card').addEventListener('click', (e) => {
    const c = currentCard();
    const hz = e.target.closest('.hz[data-hanja], .cc[data-hanja]');
    if (hz && c) {
      e.stopPropagation();
      openStrokeOrder(strokeCharsOf(c), hz.dataset.hanja);
      return;
    }
    const uw = e.target.closest('.uw[data-key]');
    if (uw) {
      e.stopPropagation();
      openCard(uw.dataset.key);
      return;
    }
    flipCard();
  });
  $('btn-flip').addEventListener('click', flipCard);
  $('btn-next').addEventListener('click', nextCard);
  $('btn-prev').addEventListener('click', prevCard);
  $('card-shuffle').addEventListener('change', () => { applyCardOrder(); showCard(); });
  $('card-range').addEventListener('change', (e) => {
    cardRange = e.target.value;
    buildCardList();
  });
  document.querySelectorAll('#card-deck-seg .seg-btn').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.deck === cardDeckName) return;
      setDeck(b.dataset.deck);
      cardRange = 'all';
      updateCardRange();
      buildCardList();
    });
  });

  // 키보드 (PC): ←/→ 이전·다음, Space 뒤집기, Esc 획순 닫기
  document.addEventListener('keydown', (e) => {
    const strokeOpen = !$('stroke-backdrop').classList.contains('hidden');
    if (e.key === 'Escape') {
      if (strokeOpen) closeStroke();
      else $('sheet-backdrop').classList.add('hidden');
      return;
    }
    if (strokeOpen || currentTab !== 'card' || !$('sheet-backdrop').classList.contains('hidden')) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    if (e.key === 'ArrowRight') { nextCard(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { prevCard(); e.preventDefault(); }
    else if (e.key === ' ' && tag !== 'button') { flipCard(); e.preventDefault(); }
  });

  // 스와이프
  (function swipe() {
    const stage = $('card-stage');
    let x0 = null, y0 = null;
    stage.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      const dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) { dx < 0 ? nextCard() : prevCard(); }
      x0 = y0 = null;
    }, { passive: true });
  })();

  /* ================= 퀴즈 ================= */
  const QTYPES = {
    text2reading: { kind: 'passage', prompt: '다음 구절의 음독은?' },
    text2meaning: { kind: 'passage', prompt: '다음 구절의 뜻(직역)은?' },
    meaning2text: { kind: 'passage', prompt: '다음 뜻에 해당하는 원문은?' },
    char2sound: { kind: 'char', prompt: '다음 한자의 음은?' },
  };
  const quizCfg = { qtype: 'text2reading', range: 'all', count: 20, order: 'random' };
  let quiz = null;

  function updateQuizRange() {
    const unit = QTYPES[quizCfg.qtype].kind === 'char' ? '구절에 나온 한자' : '구절';
    const opts = [{ value: 'all', label: '전체' }].concat(DATA.chapters.map((c) => ({
      value: 'ch:' + c.name,
      label: c.name + (unit === '구절' ? ' (' + c.count + '구절)' : '에 나온 한자'),
    })));
    quizCfg.range = fillRangeSelect($('quiz-range'), opts, quizCfg.range);
  }

  function setActive(btn) {
    if (!btn) return;
    btn.parentElement.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('active'));
    btn.classList.add('active');
  }

  document.querySelectorAll('#quiz-type-seg .seg-btn').forEach((b) =>
    b.addEventListener('click', () => {
      setActive(b);
      quizCfg.qtype = b.dataset.qtype;
      updateQuizRange();
      updateWeakInfo();
    }));
  document.querySelectorAll('#quiz-count-seg .seg-btn').forEach((b) =>
    b.addEventListener('click', () => { setActive(b); quizCfg.count = parseInt(b.dataset.count, 10); }));
  document.querySelectorAll('#quiz-order-seg .seg-btn').forEach((b) =>
    b.addEventListener('click', () => { setActive(b); quizCfg.order = b.dataset.order; }));
  $('quiz-range').addEventListener('change', (e) => {
    quizCfg.range = e.target.value;
    updateWeakInfo();
  });

  function quizBase(qtype) {
    return QTYPES[qtype].kind === 'char' ? charCards : passageCards;
  }
  function scopeItems() {
    return quizBase(quizCfg.qtype).filter((it) => matchRange(it, quizCfg.range));
  }
  const wrongKey = (qtype, it) => qtype + ':' + it.key;

  function updateWeakInfo() {
    const weak = scopeItems().filter((it) => (stats.wrong[wrongKey(quizCfg.qtype, it)] || 0) > 0).length;
    $('quiz-weak-info').textContent = stats.quiz.total
      ? ('지금까지 ' + stats.quiz.total + '문제 · 정답률 ' + Math.round(stats.quiz.correct / stats.quiz.total * 100) + '% · 이 범위에서 틀린 항목 ' + weak + '개')
      : '아직 퀴즈 기록이 없습니다.';
  }

  $('btn-start-quiz').addEventListener('click', () => startQuiz(scopeItems(), false));

  function startQuiz(items, review) {
    const qtype = quizCfg.qtype;
    let pool = items.slice();
    if (!review && quizCfg.order === 'weak') {
      pool.sort((a, b) => (stats.wrong[wrongKey(qtype, b)] || 0) - (stats.wrong[wrongKey(qtype, a)] || 0));
      const half = Math.ceil(pool.length / 2);
      pool = pool.slice(0, half).concat(shuffle(pool.slice(half)));
    } else {
      pool = shuffle(pool);
    }
    const n = !review && quizCfg.count > 0 ? Math.min(quizCfg.count, pool.length) : pool.length;
    pool = pool.slice(0, n);
    if (pool.length < 1 || quizBase(qtype).length < 4) { toast('문제가 너무 적습니다'); return; }

    quiz = { qtype, queue: pool, scope: items, idx: 0, correct: 0, wrongList: [], answered: false };
    $('quiz-setup').classList.add('hidden');
    $('quiz-result').classList.add('hidden');
    $('quiz-play').classList.remove('hidden');
    renderQuestion();
  }

  function answerOf(qtype, it) {
    if (qtype === 'text2reading') return it.reading;
    if (qtype === 'text2meaning') return it.translation;
    if (qtype === 'meaning2text') return it.hanja;
    return it.reading;
  }

  function renderQuestion() {
    if (quiz.idx >= quiz.queue.length) return showResult();
    quiz.answered = false;
    const { qtype } = quiz;
    const it = quiz.queue[quiz.idx];
    const correct = answerOf(qtype, it);

    // 보기: 같은 범위에서 먼저 고르고, 부족하면 전체에서 보충
    const fromScope = uniq(quiz.scope.map((x) => answerOf(qtype, x)).filter((v) => v && v !== correct));
    const fromAll = uniq(quizBase(qtype).map((x) => answerOf(qtype, x)).filter((v) => v && v !== correct && !fromScope.includes(v)));
    const distract = shuffle(fromScope).slice(0, 3);
    if (distract.length < 3) distract.push(...shuffle(fromAll).slice(0, 3 - distract.length));
    const opts = shuffle([correct].concat(distract));
    quiz.current = { it, correct };

    $('quiz-counter').textContent = (quiz.idx + 1) + ' / ' + quiz.queue.length;
    $('quiz-score').textContent = quiz.correct + '점';
    $('quiz-progress-fill').style.width = (quiz.idx / quiz.queue.length * 100) + '%';
    $('quiz-prompt').textContent = QTYPES[qtype].prompt + (it.kind === 'passage' ? '  (' + it.chapter + ' · ' + it.no + ')' : '');

    const q = $('quiz-question');
    if (qtype === 'meaning2text') {
      q.className = 'quiz-question text';
      q.textContent = it.translation;
    } else {
      q.className = 'quiz-question' + (it.kind === 'char' ? ' char' : ([...it.hanja].length > 12 ? ' long' : ''));
      q.textContent = it.hanja;
    }

    const box = $('quiz-options');
    box.innerHTML = opts.map((o) =>
      '<button class="opt' + (qtype === 'meaning2text' ? ' hanja' : '') + '" data-val="' + esc(o) + '">' + esc(o) + '</button>'
    ).join('');
    box.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', onAnswer));

    $('btn-quiz-next').disabled = true;
    $('btn-quiz-next').textContent = (quiz.idx === quiz.queue.length - 1) ? '결과 보기' : '다음';
  }

  function onAnswer(e) {
    if (quiz.answered) return;
    quiz.answered = true;
    const btn = e.currentTarget;
    const picked = btn.dataset.val;
    const { it, correct } = quiz.current;
    const ok = picked === correct;
    const wk = wrongKey(quiz.qtype, it);

    $('quiz-options').querySelectorAll('.opt').forEach((b) => {
      b.disabled = true;
      if (b.dataset.val === correct) b.classList.add('correct');
      else if (b === btn) b.classList.add('wrong');
    });

    stats.quiz.total += 1;
    if (ok) {
      quiz.correct += 1;
      stats.quiz.correct += 1;
      if (stats.wrong[wk]) stats.wrong[wk] = Math.max(0, stats.wrong[wk] - 1);
    } else {
      stats.wrong[wk] = (stats.wrong[wk] || 0) + 1;
      quiz.wrongList.push({
        question: quiz.qtype === 'meaning2text' ? it.translation : it.hanja,
        textQuestion: quiz.qtype === 'meaning2text',
        correct,
      });
    }
    save();
    $('quiz-score').textContent = quiz.correct + '점';
    $('btn-quiz-next').disabled = false;
  }

  $('btn-quiz-next').addEventListener('click', () => {
    quiz.idx += 1;
    renderQuestion();
  });

  function showResult() {
    $('quiz-play').classList.add('hidden');
    $('quiz-result').classList.remove('hidden');
    const total = quiz.queue.length;
    const pct = Math.round(quiz.correct / total * 100);
    $('result-score').textContent = total + '문제 중 ' + quiz.correct + '개 정답 (' + pct + '%)';
    let emoji = '🎉', title = '훌륭해요!';
    if (pct < 60) { emoji = '💪'; title = '조금 더 힘내요'; }
    else if (pct < 85) { emoji = '👍'; title = '잘하고 있어요'; }
    $('result-emoji').textContent = emoji;
    $('result-title').textContent = title;

    const wl = quiz.wrongList;
    $('result-wrong').innerHTML = wl.length
      ? '<p class="field-label">틀린 항목</p>' + wl.map((w) =>
        '<div class="rw' + (w.textQuestion ? ' text-q' : '') + '"><b>' + esc(w.question) + '</b><span>' +
        esc(w.correct) + '</span></div>').join('')
      : '<p class="result-score">틀린 문제가 없습니다! 🏆</p>';
  }

  $('btn-quiz-again').addEventListener('click', () => {
    $('quiz-result').classList.add('hidden');
    $('quiz-setup').classList.remove('hidden');
    updateWeakInfo();
  });
  $('btn-review-wrong').addEventListener('click', () => {
    const qtype = quiz ? quiz.qtype : quizCfg.qtype;
    const items = quizBase(qtype).filter((it) => (stats.wrong[wrongKey(qtype, it)] || 0) > 0);
    if (!items.length) { toast('복습할 틀린 항목이 없어요'); return; }
    quizCfg.qtype = qtype;
    startQuiz(items, true);
  });

  /* ================= 목록 ================= */
  let listFilter = 'passage';
  let listRange = 'all';
  let listLimit = 100;
  let listSearchTimer;

  function updateListRange() {
    const opts = [{ value: 'all', label: '전체' }].concat(DATA.chapters.map((c) => ({
      value: 'ch:' + c.name,
      label: c.name + (listFilter === 'passage' ? ' (' + c.count + '구절)' : '에 나온 한자'),
    })));
    listRange = fillRangeSelect($('list-range'), opts, listRange);
  }

  document.querySelectorAll('#list-filter-seg .seg-btn').forEach((b) =>
    b.addEventListener('click', () => {
      setActive(b);
      listFilter = b.dataset.filter;
      listLimit = 100;
      updateListRange();
      renderList();
    }));
  $('list-range').addEventListener('change', (e) => {
    listRange = e.target.value;
    listLimit = 100;
    renderList();
  });
  $('list-search').addEventListener('input', () => {
    clearTimeout(listSearchTimer);
    listSearchTimer = setTimeout(() => { listLimit = 100; renderList(); }, 120);
  });

  function renderList() {
    const q = $('list-search').value.trim().toLowerCase();
    let items = (listFilter === 'char' ? charCards : passageCards).filter((it) => matchRange(it, listRange));
    if (q) {
      items = items.filter((it) => {
        const text = it.kind === 'passage'
          ? [it.hanja, it.hanja.replace(/\s/g, ''), it.reading, it.reading.replace(/\s/g, ''), it.translation, it.chapter].join(' ')
          : [it.hanja, it.reading, it.meaning, it.radical].join(' ');
        return text.toLowerCase().includes(q);
      });
    }

    const total = items.length;
    const shown = items.slice(0, listLimit);
    $('list-count').textContent = total + '개 항목' + (total > shown.length ? ' · ' + shown.length + '개 표시' : '');
    $('list-body').innerHTML = shown.map((it) => {
      if (it.kind === 'char') {
        const info = [it.radical ? '부수 ' + it.radical : '', it.strokes ? it.strokes + '획' : '', '명언 ' + it.used.length + '곳']
          .filter(Boolean).join(' · ');
        return '<div class="entry" data-key="' + esc(it.key) + '">' +
          '<div class="entry-head">' +
            '<div><div class="entry-hanja char">' + hanjaHtml(it.hanja) + '</div>' +
            '<div class="entry-reading">' + esc(it.reading) + '</div></div>' +
            '<span class="entry-badge">한자 · ' + it.first + '</span>' +
          '</div>' +
          (it.meaning ? '<div class="entry-meaning">' + esc(it.meaning) + '</div>' : '') +
          '<div class="entry-meaning">' + esc(info) + '</div>' +
          '<button type="button" class="entry-open">카드로 보기</button>' +
          '</div>';
      }
      return '<div class="entry" data-key="' + esc(it.key) + '">' +
        '<div class="entry-head">' +
          '<div><div class="entry-hanja">' + hanjaHtml(it.hanja) + '</div>' +
          '<div class="entry-reading">' + esc(it.reading) + '</div></div>' +
          '<span class="entry-badge">' + esc(it.chapter + ' · ' + it.no) + '</span>' +
        '</div>' +
        '<div class="entry-meaning">' + esc(it.translation) + '</div>' +
        '<button type="button" class="entry-open">카드로 보기</button>' +
        '</div>';
    }).join('') || '<p class="list-count">결과가 없습니다.</p>';

    if (total > shown.length) {
      const more = document.createElement('button');
      more.className = 'ghost-btn';
      more.textContent = '더 보기 (' + (total - shown.length) + '개)';
      more.addEventListener('click', () => { listLimit += 100; renderList(); });
      $('list-body').appendChild(more);
    }
  }

  $('list-body').addEventListener('click', (e) => {
    const entry = e.target.closest('.entry[data-key]');
    if (!entry) return;
    const card = cardByKey.get(entry.dataset.key);
    const hz = e.target.closest('.hz[data-hanja]');
    if (hz) {
      openStrokeOrder(strokeCharsOf(card), hz.dataset.hanja);
      return;
    }
    if (e.target.closest('.entry-open')) openCard(entry.dataset.key);
  });

  /* ================= 정보 시트 ================= */
  $('btn-info').addEventListener('click', () => {
    $('info-source').textContent = DATA.source || '—';
    $('info-entries').textContent = (DATA.counts.entries || DATA.entries.length) + '구절';
    $('info-chapters').textContent = (DATA.counts.chapters || DATA.chapters.length) + '편';
    $('info-chars').textContent = (DATA.counts.characters || DATA.characters.length) + '자';
    $('info-total').textContent = (DATA.counts.totalChars || 0) + '자';
    $('info-date').textContent = DATA.generated ? DATA.generated.slice(0, 10) : '—';
    const acc = stats.quiz.total ? Math.round(stats.quiz.correct / stats.quiz.total * 100) + '%' : '0%';
    $('stat-known').textContent = Object.keys(stats.viewed).length;
    $('stat-quiz').textContent = stats.quiz.total;
    $('stat-acc').textContent = acc;
    $('sheet-backdrop').classList.remove('hidden');
  });
  $('sheet-backdrop').addEventListener('click', (e) => {
    if (e.target === $('sheet-backdrop')) $('sheet-backdrop').classList.add('hidden');
  });
  $('btn-reset').addEventListener('click', () => {
    if (confirm('학습 기록을 모두 지울까요?')) {
      stats = defaultStats();
      save();
      $('btn-info').click();
      updateKnownStat();
      updateWeakInfo();
      toast('초기화 완료');
    }
  });

  /* ================= 시작 ================= */
  function init() {
    const entries = DATA.counts.entries || DATA.entries.length;
    $('load-status').textContent = entries
      ? (entries + '구절 · ' + (DATA.counts.characters || DATA.characters.length) + '자')
      : '데이터 없음';
    updateCardRange();
    buildCardList();
    updateQuizRange();
    updateWeakInfo();
    updateListRange();
    // 웹 폰트가 늦게 적용되면 높이가 달라질 수 있어 한 번 더 맞춥니다.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitCardHeight);
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }
  init();
})();
