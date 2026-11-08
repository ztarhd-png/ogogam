(() => {
  'use strict';
  // 데이터: { v, people: [{id, name, color, createdAt}], entries: [{id, personId, amount, memo, date, createdAt}] }
  // amount는 받은 돈이 +, 준 돈이 −. 사람별 잔액 = 받은 돈 − 준 돈.
  const KEY = 'ogogam.data.v1';
  const COLORS = [
    ['쪽빛', '#34449a'], ['솔잎', '#2f6450'], ['자두', '#6e3563'], ['단풍', '#a9432f'],
    ['겨자', '#94700f'], ['먹', '#474e5e'], ['하늘', '#3a77ad'], ['진달래', '#ad4a69']
  ];
  const $ = id => document.getElementById(id);
  const fmt = new Intl.NumberFormat('ko-KR');
  const won = n => fmt.format(Math.abs(n));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const today = () => iso(new Date());
  const day = s => new Date(s + 'T00:00:00');
  const mono = name => [...(name || '').trim()][0] || '';

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) e.append(kid instanceof Node ? kid : String(kid));
    return e;
  }

  // ── 저장 ───────────────────────────────────────
  let storageBroken = false;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { v: 1, people: [], entries: [] };
      const s = JSON.parse(raw);
      if (s && Array.isArray(s.people) && Array.isArray(s.entries)) return s;
    } catch (_) { /* 아래에서 처리 */ }
    storageBroken = true; // 읽지 못한 원본을 덮어쓰지 않는다
    return { v: 1, people: [], entries: [] };
  }
  const state = load();
  const ui = (() => { try { return JSON.parse(localStorage.getItem(KEY + '.ui')) || {}; } catch (_) { return {}; } })();
  function save() {
    if (storageBroken) { toast('기존 기록을 읽지 못해 저장을 멈췄어요. 백업 파일로 복구하세요.'); return; }
    try { localStorage.setItem(KEY, JSON.stringify(state)); localStorage.setItem(KEY + '.ui', JSON.stringify(ui)); }
    catch (_) { toast('저장하지 못했어요. 아이폰 저장 공간을 확인하세요.'); }
  }

  const person = id => state.people.find(p => p.id === id);
  const order = (a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || '');
  function stats(pid) {
    let give = 0, get = 0, last = '';
    for (const e of state.entries) {
      if (e.personId !== pid) continue;
      if (e.amount < 0) give -= e.amount; else get += e.amount;
      const k = e.date + 'T' + (e.createdAt || '');
      if (k > last) last = k;
    }
    return { give, get, bal: get - give, last };
  }
  const direction = bal => bal > 0 ? '받은 게 더 많아요' : bal < 0 ? '준 게 더 많아요' : '딱 맞아요';
  // 잔액은 글 대신 색으로: 받은 게 많으면 파랑(+), 준 게 많으면 빨강(−). 흰 캡슐 위에 올려 어느 표지 색에서도 또렷하게.
  const tone = bal => bal > 0 ? 'plus' : bal < 0 ? 'minus' : 'even';
  const sign = bal => bal > 0 ? '+' : bal < 0 ? '−' : '';
  const balPill = bal => h('span', { class: 'bal-pill ' + tone(bal) },
    h('span', { class: 'num' }, sign(bal) + won(bal)), h('span', { class: 'unit' }, '원'));
  // 최근에 주고받은 사람이 위로
  function peopleByRecent() {
    return state.people.map(p => ({ p, s: stats(p.id) }))
      .sort((a, b) => (b.s.last || b.p.createdAt).localeCompare(a.s.last || a.p.createdAt));
  }

  // ── 첫 화면 ─────────────────────────────────────
  let view = 'home', currentId = null, homeScroll = 0;
  function renderHome(deal) {
    $('today').textContent = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date());
    const list = peopleByRecent();
    const stack = $('stack');
    stack.replaceChildren(...list.map(({ p, s }, i) => h('button', {
      class: 'card cover', type: 'button', 'data-id': p.id, 'data-mono': mono(p.name),
      style: `--c:${p.color};--i:${i};z-index:${i + 1}`,
      'aria-label': `${p.name}, ${won(s.bal)}원 ${direction(s.bal)}`,
      onclick: ev => openBook(p.id, ev.currentTarget)
    },
      h('span', { class: 'card-name' }, p.name),
      h('span', { class: 'card-bal' }, balPill(s.bal)),
      h('span', { class: 'card-foot' },
        h('span', {}, h('small', {}, '준 돈'), h('span', { class: 'num' }, won(s.give))),
        h('span', {}, h('small', {}, '받은 돈'), h('span', { class: 'num' }, won(s.get))))
    )));
    stack.classList.toggle('deal', !!deal && !reduceMotion.matches);
    $('home-empty').hidden = list.length > 0;
    $('open-dutch').hidden = list.length === 0;
  }

  // ── 사람 통장 ───────────────────────────────────
  function animateNumber(el, to) {
    const from = Number(el.dataset.v);
    el.dataset.v = to;
    const done = () => { el.textContent = won(to); };
    if (!Number.isFinite(from) || from === to || reduceMotion.matches) return done();
    const start = performance.now(), dur = 620;
    const step = now => {
      const t = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - t, 3);
      if (el.dataset.v !== String(to)) return;
      el.textContent = won(Math.round(from + (to - from) * e));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    setTimeout(() => { if (el.dataset.v === String(to)) done(); }, dur + 80);
  }

  function renderBook(opts = {}) {
    const p = person(currentId);
    if (!p) return;
    const s = stats(p.id);
    document.documentElement.style.setProperty('--c', p.color);
    const cover = $('book-cover');
    cover.dataset.mono = mono(p.name);
    $('book-name').textContent = p.name;
    if (opts.fresh) delete $('book-balance').dataset.v;
    animateNumber($('book-balance'), Math.abs(s.bal));
    $('book-pill').className = 'bal-pill ' + tone(s.bal);
    $('book-sign').textContent = sign(s.bal);
    $('book-pill').setAttribute('aria-label', `${won(s.bal)}원 ${direction(s.bal)}`);
    $('book-give').textContent = won(s.give);
    $('book-get').textContent = won(s.get);

    const rows = state.entries.filter(e => e.personId === p.id).sort(order);
    let run = 0;
    const withRun = rows.map(e => ({ e, run: (run += e.amount) })).reverse();
    const thisYear = new Date().getFullYear();
    const items = [];
    let lastYear = null;
    withRun.forEach(({ e, run }, i) => {
      const d = day(e.date), y = d.getFullYear();
      if (y !== lastYear && (y !== thisYear || lastYear !== null)) items.push(h('li', { class: 'year' }, y + '년'));
      lastYear = y;
      const give = e.amount < 0;
      items.push(h('li', {}, h('button', {
        class: 'row' + (e.id === opts.arrive ? ' arrive' : ''), type: 'button', style: `--i:${Math.min(i, 16)}`,
        'aria-label': `${d.getMonth() + 1}월 ${d.getDate()}일 ${e.memo || ''} ${give ? '준 돈' : '받은 돈'} ${won(e.amount)}원`,
        onclick: () => openEntry(e)
      },
        h('span', { class: 'r-date' }, h('b', {}, d.getDate()), h('small', {}, (d.getMonth() + 1) + '월')),
        h('span', { class: 'r-memo' + (e.memo ? '' : ' quiet') }, e.memo || (give ? '줄 것' : '받을 것')),
        h('span', { class: 'r-amt num ' + (give ? 'give' : 'get') }, (give ? '−' : '+') + won(e.amount)),
        h('span', { class: 'r-run num' }, '잔액 ' + (run < 0 ? '−' : '') + won(run))
      )));
    });
    const ledger = $('ledger');
    ledger.replaceChildren(...items);
    ledger.classList.toggle('enter', !!opts.enter && !reduceMotion.matches);
    $('ledger-empty').hidden = rows.length > 0;
  }

  // 화면 전환: 누른 통장 카드가 그대로 커져서 통장 머리가 된다(View Transitions 지원 브라우저).
  function transition(update, names) {
    if (!document.startViewTransition || reduceMotion.matches) { update(); return; }
    const [from, to] = names;
    if (from) from().style.viewTransitionName = 'cover';
    const t = document.startViewTransition(() => {
      if (from) from().style.viewTransitionName = '';
      update();
      const target = to && to();
      if (target) target.style.viewTransitionName = 'cover';
    });
    t.finished.finally(() => { const target = to && to(); if (target) target.style.viewTransitionName = ''; });
  }
  const cardOf = id => $('stack').querySelector(`[data-id="${CSS.escape(id)}"]`);

  function openBook(id, card) {
    homeScroll = window.scrollY;
    history.pushState({ book: id }, '');
    transition(() => {
      view = 'book'; currentId = id; ui.lastPerson = id;
      document.body.dataset.view = 'book';
      $('home').hidden = true; $('book').hidden = false;
      renderBook({ fresh: true, enter: true });
      window.scrollTo(0, 0);
    }, [card && (() => card), () => $('book-cover')]);
  }
  function closeBook(instant) {
    if (view !== 'book') return;
    const id = currentId;
    const update = () => {
      view = 'home';
      document.body.dataset.view = 'home';
      document.documentElement.style.removeProperty('--c');
      renderHome(false);
      $('book').hidden = true; $('home').hidden = false;
      window.scrollTo(0, homeScroll);
    };
    if (instant) { update(); return; }
    transition(update, [() => $('book-cover'), () => cardOf(id)]);
  }
  $('book-back').onclick = () => { if (history.state && history.state.book) history.back(); else closeBook(); };

  // 화면 가장자리에서 스와이프해 뒤로 가면 iOS가 이미 이전 화면을 밀어 보여 준다.
  // 그 뒤에 카드 접히는 전환을 또 돌리면 통장 화면이 다시 번쩍 나타났다가 접히므로, 이때는 전환 없이 바로 바꾼다.
  const EDGE = 30;
  let edgeTouching = false, edgeTouchEnd = 0;
  window.addEventListener('touchstart', e => {
    const x = e.touches[0] ? e.touches[0].clientX : EDGE;
    edgeTouching = x < EDGE || x > window.innerWidth - EDGE;
  }, { passive: true, capture: true });
  const endEdgeTouch = () => { if (edgeTouching) edgeTouchEnd = Date.now(); edgeTouching = false; };
  window.addEventListener('touchend', endEdgeTouch, { passive: true, capture: true });
  window.addEventListener('touchcancel', endEdgeTouch, { passive: true, capture: true });

  window.addEventListener('popstate', e => {
    const swiped = e.hasUAVisualTransition || edgeTouching || Date.now() - edgeTouchEnd < 1200;
    edgeTouchEnd = 0;
    closeSheets();
    if (view === 'book') closeBook(swiped);
  });

  // ── 시트 열고 닫기 ───────────────────────────────
  function openSheet(id) {
    const d = $(id);
    d.classList.remove('closing');
    if (!d.open) d.showModal();
  }
  function closeSheet(id) {
    const d = $(id);
    if (!d.open || d.classList.contains('closing')) return;
    if (reduceMotion.matches) { d.close(); return; }
    d.classList.add('closing');
    setTimeout(() => { d.classList.remove('closing'); d.close(); }, 210);
  }
  function closeSheets() { for (const d of document.querySelectorAll('dialog.sheet')) if (d.open) d.close(); }
  for (const d of document.querySelectorAll('dialog.sheet')) {
    d.addEventListener('cancel', e => { e.preventDefault(); closeSheet(d.id); });
    d.addEventListener('click', e => { if (e.target === d) closeSheet(d.id); }); // 바깥을 누르면 닫기
    for (const b of d.querySelectorAll('[data-close]')) b.onclick = () => closeSheet(d.id);
  }

  // ── 기록 입력 ───────────────────────────────────
  let editing = null, entryPerson = null;
  const amountInput = $('entry-amount');
  function digits(v) { return v.replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '').slice(0, 12); }
  function fitAmount() {
    const v = amountInput.value || amountInput.placeholder;
    const commas = (v.match(/,/g) || []).length;
    amountInput.style.width = `calc(${v.length - commas}ch + ${commas * 0.34}ch + 0.12ch)`;
  }
  amountInput.addEventListener('input', () => {
    const d = digits(amountInput.value);
    amountInput.value = d ? fmt.format(Number(d)) : '';
    fitAmount();
  });
  // 고칠 때는 원래 준 돈인지 받은 돈인지 금액 색과 버튼 테두리로 보여 준다. 새 기록은 중립색.
  function showKind(k) {
    const f = amountInput.closest('.amount-field');
    f.classList.remove('shake');
    f.classList.toggle('give', k === 'give');
    f.classList.toggle('get', k === 'get');
    for (const b of document.querySelectorAll('.kind-save')) b.classList.toggle('current', b.dataset.kind === k);
  }

  function setEntryPerson(id) {
    entryPerson = id;
    const p = person(id);
    $('entry-sheet').style.setProperty('--c', p ? p.color : '');
    for (const c of $('entry-people').children) c.setAttribute('aria-checked', String(c.dataset.id === id));
  }
  function dateLabel(s) {
    const t = today();
    if (s === t) return '오늘';
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (s === iso(y)) return '어제';
    const d = day(s);
    return (d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + '. ' : '') + (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
  }
  $('entry-date').addEventListener('change', () => {
    if (!$('entry-date').value) $('entry-date').value = today();
    $('entry-date-label').textContent = dateLabel($('entry-date').value);
  });

  function openEntry(entry) {
    if (!state.people.length) { openPerson(null); return; }
    editing = entry || null;
    $('entry-title').textContent = editing ? '기록 고치기' : '새 기록';
    $('entry-delete').hidden = !editing;
    const pick = editing ? editing.personId
      : view === 'book' ? currentId
      : person(ui.lastPerson) ? ui.lastPerson : peopleByRecent()[0].p.id;
    $('entry-people').replaceChildren(...peopleByRecent().map(({ p }) => h('button', {
      class: 'chip', type: 'button', role: 'radio', 'data-id': p.id, style: `--c:${p.color}`,
      onclick: () => setEntryPerson(p.id)
    }, p.name)));
    setEntryPerson(pick);
    showKind(editing ? (editing.amount < 0 ? 'give' : 'get') : null);
    amountInput.value = editing ? won(editing.amount) : '';
    fitAmount();
    $('entry-memo').value = editing ? editing.memo || '' : '';
    $('entry-date').value = editing ? editing.date : today();
    $('entry-date-label').textContent = dateLabel($('entry-date').value);
    openSheet('entry-sheet');
    const chip = $('entry-people').querySelector('[aria-checked="true"]');
    if (chip) chip.scrollIntoView({ block: 'nearest', inline: 'center' });
    // 새 기록은 바로 금액부터 친다(같은 누름 안에서 포커스해야 아이폰 키보드가 뜬다).
    if (!editing) amountInput.focus({ preventScroll: true });
  }
  $('fab').onclick = () => openEntry(null);

  // 줬어요 / 받았어요 버튼이 곧 기록 버튼이다(누르는 순간 그쪽으로 적힌다).
  let pressedKind = null; // submitter를 모르는 오래된 브라우저용
  for (const b of document.querySelectorAll('.kind-save')) b.addEventListener('click', () => { pressedKind = b.dataset.kind; });
  $('entry-form').addEventListener('submit', e => {
    e.preventDefault();
    const kind = (e.submitter && e.submitter.dataset.kind) || pressedKind;
    if (!kind) return;
    const n = Number(digits(amountInput.value));
    if (!n) {
      const f = amountInput.closest('.amount-field');
      f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake');
      amountInput.focus();
      return;
    }
    const amount = kind === 'give' ? -n : n;
    const memo = $('entry-memo').value.trim();
    const date = $('entry-date').value || today();
    let id;
    if (editing) {
      Object.assign(editing, { personId: entryPerson, amount, memo, date });
      id = editing.id;
    } else {
      id = uid();
      state.entries.push({ id, personId: entryPerson, amount, memo, date, createdAt: new Date().toISOString() });
    }
    ui.lastPerson = entryPerson;
    save();
    amountInput.blur(); $('entry-memo').blur();
    closeSheet('entry-sheet');
    const p = person(entryPerson);
    if (view === 'book') {
      if (entryPerson !== currentId) toast(`${p.name} 통장에 적었어요`);
      renderBook({ arrive: id });
    } else {
      renderHome(false);
      toast(`${p.name} 통장에 적었어요`);
    }
  });
  // 키보드의 완료/엔터는 키보드만 내린다(준 돈인지 받은 돈인지는 버튼으로 고른다).
  for (const input of [amountInput, $('entry-memo')]) input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); input.blur(); } });

  $('entry-delete').onclick = () => {
    if (!editing) return;
    const index = state.entries.indexOf(editing), removed = editing;
    state.entries.splice(index, 1);
    save();
    closeSheet('entry-sheet');
    refresh();
    toast('기록을 지웠어요', '되돌리기', () => { state.entries.splice(index, 0, removed); save(); refresh({ arrive: removed.id }); });
  };
  function refresh(opts) { if (view === 'book') renderBook(opts || {}); else renderHome(false); }

  // ── 사람 추가·고치기 ─────────────────────────────
  let editingPerson = null, personColor = COLORS[0][1], deleteArmed = false;
  $('person-colors').replaceChildren(...COLORS.map(([name, c]) => h('button', {
    class: 'swatch', type: 'button', role: 'radio', 'aria-label': name, 'data-c': c, style: `--c:${c}`,
    onclick: () => setPersonColor(c)
  })));
  function setPersonColor(c) {
    personColor = c;
    $('person-preview').style.setProperty('--c', c);
    $('person-sheet').style.setProperty('--c', c);
    for (const s of $('person-colors').children) s.setAttribute('aria-checked', String(s.dataset.c === c));
  }
  function previewName() {
    const name = $('person-name').value.trim();
    $('person-preview-name').textContent = name || '이름';
    $('person-preview').dataset.mono = mono(name);
  }
  $('person-name').addEventListener('input', previewName);
  function armDelete(on) {
    deleteArmed = on;
    const n = editingPerson ? state.entries.filter(e => e.personId === editingPerson.id).length : 0;
    $('person-delete').textContent = on ? (n ? `기록 ${n}건까지 지울까요? 한 번 더 누르기` : '한 번 더 누르면 지워요') : '삭제';
  }
  function openPerson(p) {
    editingPerson = p || null;
    $('person-title').textContent = p ? '통장 고치기' : '사람 추가';
    $('person-save').textContent = p ? '저장' : '추가하기';
    $('person-delete').hidden = !p;
    armDelete(false);
    $('person-name').value = p ? p.name : '';
    // 새 사람은 아직 안 쓴 색부터
    const used = new Set(state.people.map(x => x.color));
    setPersonColor(p ? p.color : (COLORS.find(([, c]) => !used.has(c)) || COLORS[state.people.length % COLORS.length])[1]);
    previewName();
    openSheet('person-sheet');
    if (!p) $('person-name').focus({ preventScroll: true });
  }
  $('add-person').onclick = $('empty-add').onclick = () => openPerson(null);
  $('book-more').onclick = () => openPerson(person(currentId));
  $('person-form').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('person-name').value.trim();
    if (!name) { $('person-name').focus(); return; }
    let born = null;
    if (editingPerson) Object.assign(editingPerson, { name, color: personColor });
    else { born = { id: uid(), name, color: personColor, createdAt: new Date().toISOString() }; state.people.push(born); }
    save();
    $('person-name').blur();
    closeSheet('person-sheet');
    if (view === 'book') renderBook();
    else {
      renderHome(false);
      const card = born && cardOf(born.id);
      if (card && !reduceMotion.matches) card.classList.add('born');
    }
  });
  $('person-delete').onclick = () => {
    if (!editingPerson) return;
    if (!deleteArmed) { armDelete(true); return; }
    const p = editingPerson;
    const pIndex = state.people.indexOf(p);
    const removed = state.entries.filter(e => e.personId === p.id);
    state.people.splice(pIndex, 1);
    state.entries = state.entries.filter(e => e.personId !== p.id);
    save();
    closeSheet('person-sheet');
    if (history.state && history.state.book) history.back(); else closeBook();
    toast(`${p.name} 통장을 지웠어요`, '되돌리기', () => {
      state.people.splice(pIndex, 0, p); state.entries.push(...removed); save(); refresh();
    });
  };

  // ── 더치페이 ─────────────────────────────────────
  // 같이 먹은 사람들이 총액을 나눈다. 몫 = (총액 − 모두의 '따로 먹은 것') ÷ 인원 + 그 사람의 '따로 먹은 것'.
  // 1원 단위로 나누어떨어지지 않는 나머지는 계산한 사람이 진다.
  // 정산은 늘 내가 모아서 한다.
  // 내가 계산했으면: 친구마다 그 몫을 그 친구 통장에 '받을 것'으로. 내 몫은 적지 않는다.
  // 친구 A가 계산했으면: A 몫을 뺀 나머지 모두의 몫(나 포함)을 내가 A에게 '줄 것'으로,
  //   그리고 A가 아닌 다른 친구들의 몫은 각자 통장에 '받을 것'으로(그 돈을 나에게 주고, 내가 A에게 한꺼번에 준다).
  const ME = '@me';
  let dutch = null; // { ids: [ME, personId...], payer, extras: { id: [{ memo, amount }] } }
  const dutchTotal = $('dutch-total');
  const numOf = v => Number(digits(v || '')) || 0;
  function formatMoneyInput(input) {
    const d = digits(input.value);
    input.value = d ? fmt.format(Number(d)) : '';
  }
  function fitDutchTotal() {
    const v = dutchTotal.value || dutchTotal.placeholder;
    const commas = (v.match(/,/g) || []).length;
    dutchTotal.style.width = `calc(${v.length - commas}ch + ${commas * 0.34}ch + 0.12ch)`;
  }
  const dutchName = id => id === ME ? '나' : (person(id) || {}).name || '';
  const dutchColor = id => id === ME ? 'var(--ink)' : (person(id) || {}).color;

  function splitDutch() {
    const total = numOf(dutchTotal.value);
    const ids = dutch.ids;
    const extraOf = id => (dutch.extras[id] || []).reduce((s, x) => s + x.amount, 0);
    const extras = ids.reduce((s, id) => s + extraOf(id), 0);
    const common = total - extras;
    const shares = new Map();
    if (!ids.length || common < 0) return { total, extras, common, shares, base: 0, ok: false };
    const base = Math.floor(common / ids.length);
    let rest = common - base * ids.length;
    for (const id of ids) shares.set(id, base + extraOf(id));
    if (rest) shares.set(dutch.payer, shares.get(dutch.payer) + rest);
    return { total, extras, common, shares, base, ok: total > 0 };
  }

  function renderDutchPeople() {
    const all = [ME, ...peopleByRecent().map(x => x.p.id)];
    $('dutch-people').replaceChildren(...all.map(id => h('button', {
      class: 'chip' + (id === ME ? ' me' : ''), type: 'button', role: 'checkbox', 'data-id': id, style: `--c:${dutchColor(id)}`,
      'aria-checked': String(dutch.ids.includes(id)),
      onclick: () => {
        const i = dutch.ids.indexOf(id);
        if (i >= 0) dutch.ids.splice(i, 1); else dutch.ids.push(id);
        dutch.ids.sort((a, b) => all.indexOf(a) - all.indexOf(b));
        if (!dutch.ids.includes(dutch.payer)) dutch.payer = dutch.ids.includes(ME) ? ME : dutch.ids[0];
        renderDutchPeople(); renderDutchSplit(true);
      }
    }, dutchName(id))));
    renderDutchPayer();
  }
  // 계산한 사람: 같이 먹은 사람 중 한 명
  function renderDutchPayer() {
    $('dutch-payer-wrap').hidden = dutch.ids.length < 2;
    $('dutch-payer').replaceChildren(...dutch.ids.map(id => h('button', {
      class: 'chip' + (id === ME ? ' me' : ''), type: 'button', role: 'radio', 'data-id': id, style: `--c:${dutchColor(id)}`,
      'aria-checked': String(id === dutch.payer),
      onclick: () => { dutch.payer = id; renderDutchPayer(); renderDutchSplit(true); }
    }, dutchName(id))));
  }

  // 사람별 줄: 이름 · 낼 돈, 그 아래 '따로 먹은 것' 메뉴와 금액
  function renderDutchSplit(rebuild) {
    const list = $('dutch-split');
    if (rebuild) {
      list.replaceChildren(...dutch.ids.map(id => {
        const items = dutch.extras[id] || (dutch.extras[id] = []);
        const extraRows = items.map((x, k) => h('div', { class: 'extra' },
          h('input', {
            class: 'extra-memo', maxlength: 20, autocomplete: 'off', enterkeyhint: 'done', placeholder: '메뉴 (예: 맥주)', 'aria-label': `${dutchName(id)} 따로 먹은 메뉴`, value: x.memo,
            oninput: e => { x.memo = e.target.value; }
          }),
          h('label', { class: 'extra-amt' },
            h('input', {
              class: 'num', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off', enterkeyhint: 'done', placeholder: '0', 'aria-label': `${dutchName(id)} 따로 먹은 금액`, value: x.amount ? fmt.format(x.amount) : '',
              oninput: e => { formatMoneyInput(e.target); x.amount = numOf(e.target.value); renderDutchSplit(false); }
            }), h('span', {}, '원')),
          h('button', {
            class: 'extra-del', type: 'button', 'aria-label': '이 메뉴 빼기',
            onclick: () => { items.splice(k, 1); renderDutchSplit(true); }
          })
        ));
        return h('li', { class: 'split-row', 'data-id': id, style: `--c:${dutchColor(id)}` },
          h('div', { class: 'split-top' },
            h('span', { class: 'split-name' }, dutchName(id), id === dutch.payer && dutch.ids.length > 1 ? h('small', { class: 'paid' }, '계산') : null),
            h('button', {
              class: 'extra-add', type: 'button',
              onclick: () => {
                items.push({ memo: '', amount: 0 });
                renderDutchSplit(true);
                const rows = list.querySelector(`[data-id="${CSS.escape(id)}"]`).querySelectorAll('.extra-amt input');
                rows[rows.length - 1].focus();
              }
            }, '+ 따로 먹은 것'),
            h('span', { class: 'split-share num' }, '')),
          ...extraRows);
      }));
      // 빼기 아이콘(SVG는 h()로 만들 수 없어 여기서 채운다)
      for (const b of list.querySelectorAll('.extra-del')) b.innerHTML = '<svg class="i"><use href="#i-close"/></svg>';
    }
    const r = splitDutch();
    for (const li of list.children) {
      const v = r.shares.get(li.dataset.id);
      li.querySelector('.split-share').textContent = r.ok && v != null ? won(v) + '원' : '–';
    }
    const plan = dutchPlan(r);
    const note = $('dutch-note');
    const meOut = !dutch.ids.includes(ME) && dutch.ids.length > 0;
    note.classList.toggle('bad', r.common < 0 || meOut);
    const how = `같이 먹은 ${won(r.common)}원을 ${dutch.ids.length}명이 ${won(r.base)}원씩` + (r.extras ? ', 따로 먹은 건 그 사람이' : '');
    if (!dutch.ids.length) note.textContent = '같이 먹은 사람을 골라 주세요.';
    else if (meOut) note.textContent = '나도 같이 먹어야 내 통장에 적을 게 생겨요.';
    else if (r.common < 0) note.textContent = `따로 먹은 것(${won(r.extras)}원)이 총액보다 많아요.`;
    else if (!r.total) note.textContent = `${dutch.ids.length}명이 나눠요. 총액을 넣으세요.`;
    else if (dutch.payer === ME) note.textContent = how + (plan.length ? ` · 받을 돈 ${won(plan.reduce((s, x) => s + x.amount, 0))}원` : '');
    else {
      const give = plan.find(x => x.personId === dutch.payer);
      const get = plan.filter(x => x.amount > 0).reduce((s, x) => s + x.amount, 0);
      note.textContent = how + ` · ${dutchName(dutch.payer)}에게 줄 것 ${won(give ? -give.amount : 0)}원` + (get ? `, 나머지에게 받을 것 ${won(get)}원` : '');
    }
    $('dutch-save').disabled = !(r.ok && plan.length);
    $('dutch-save').textContent = plan.length ? `${plan.length}명 통장에 나눠 적기` : '나눠서 적기';
  }
  // 실제로 적을 기록: [{ personId, amount }]
  function dutchPlan(r) {
    if (!r.ok || !dutch.ids.includes(ME)) return [];
    if (dutch.payer === ME) return dutch.ids.filter(id => id !== ME && r.shares.get(id) > 0).map(id => ({ personId: id, amount: r.shares.get(id) }));
    const others = dutch.ids.filter(id => id !== dutch.payer);
    const toPayer = others.reduce((s, id) => s + (r.shares.get(id) || 0), 0);
    const plan = toPayer > 0 ? [{ personId: dutch.payer, amount: -toPayer }] : [];
    for (const id of others) if (id !== ME && r.shares.get(id) > 0) plan.push({ personId: id, amount: r.shares.get(id) });
    return plan;
  }

  function openDutch() {
    if (!state.people.length) { openPerson(null); return; }
    dutch = { ids: [ME], payer: ME, extras: {} };
    dutchTotal.value = ''; fitDutchTotal();
    $('dutch-memo').value = '';
    $('dutch-date').value = today();
    $('dutch-date-label').textContent = dateLabel(today());
    renderDutchPeople();
    renderDutchSplit(true);
    openSheet('dutch-sheet');
  }
  $('open-dutch').onclick = openDutch;
  dutchTotal.addEventListener('input', () => { formatMoneyInput(dutchTotal); fitDutchTotal(); renderDutchSplit(false); });
  $('dutch-date').addEventListener('change', () => {
    if (!$('dutch-date').value) $('dutch-date').value = today();
    $('dutch-date-label').textContent = dateLabel($('dutch-date').value);
  });
  $('dutch-sheet').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing && e.target.tagName === 'INPUT') { e.preventDefault(); e.target.blur(); }
  });
  $('dutch-form').addEventListener('submit', e => {
    e.preventDefault();
    const r = splitDutch();
    const plan = dutchPlan(r);
    if (!plan.length) return;
    const title = $('dutch-memo').value.trim() || '더치페이';
    const date = $('dutch-date').value || today();
    const group = uid(), now = new Date().toISOString();
    const extraNote = id => {
      const own = (dutch.extras[id] || []).filter(x => x.amount > 0);
      return own.length ? ' + ' + own.map(x => x.memo.trim() || '따로').join(', ') : '';
    };
    const paidBy = dutch.payer === ME ? '' : ` · ${dutchName(dutch.payer)} 계산`;
    // 계산한 친구에게 줄 것은 '나·B·C 몫'처럼 누구 몫을 모았는지 남긴다
    const memoFor = personId => personId === dutch.payer && dutch.payer !== ME
      ? `${title} · ${dutch.ids.length}명 나눔${paidBy} · ${dutch.ids.filter(id => id !== dutch.payer).map(dutchName).join('·')} 몫`
      : `${title} · ${dutch.ids.length}명 나눔${paidBy}${extraNote(personId)}`;
    const made = plan.map(({ personId, amount }) => ({ id: uid(), personId, amount, memo: memoFor(personId), date, createdAt: now, dutch: group }));
    state.entries.push(...made);
    save();
    document.activeElement && document.activeElement.blur && document.activeElement.blur();
    closeSheet('dutch-sheet');
    renderHome(false);
    const msg = `${made.length}명 통장에 나눠 적었어요`;
    toast(msg, '되돌리기', () => {
      state.entries = state.entries.filter(x => x.dutch !== group); save(); refresh();
    });
  });

  // ── 백업 ───────────────────────────────────────
  $('open-settings').onclick = () => openSheet('settings-sheet');
  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = h('a', { href: url, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  $('backup').onclick = () => {
    download(JSON.stringify({ app: 'ogogam', exportedAt: new Date().toISOString(), ...state }, null, 1), `오고감-백업-${today()}.json`, 'application/json');
    toast('백업 파일을 만들었어요');
  };
  $('export-csv').onclick = () => {
    const q = s => '"' + String(s).replace(/"/g, '""') + '"';
    const rows = [['날짜', '사람', '준 돈', '받은 돈', '메모']];
    for (const e of [...state.entries].sort(order)) {
      const p = person(e.personId);
      rows.push([e.date, p ? p.name : '', e.amount < 0 ? -e.amount : '', e.amount > 0 ? e.amount : '', e.memo || '']);
    }
    download('﻿' + rows.map(r => r.map(q).join(',')).join('\r\n'), `오고감-${today()}.csv`, 'text/csv;charset=utf-8');
  };
  $('restore').onclick = () => $('restore-file').click();
  // 불러오기: 오고감 백업(JSON)과 태그가계부 'CSV 내보내기' 파일을 모두 받는다. 지금 기록에 더하고, 같은 기록은 한 번만.
  function mergeBackup(data) {
    if (!Array.isArray(data.people) || !Array.isArray(data.entries)) throw Error('not backup');
    const pIds = new Set(state.people.map(p => p.id)), eIds = new Set(state.entries.map(e => e.id));
    let np = 0, ne = 0;
    for (const p of data.people) if (p && p.id && p.name && !pIds.has(p.id)) { state.people.push({ id: p.id, name: String(p.name), color: p.color || COLORS[0][1], createdAt: p.createdAt || new Date().toISOString() }); np++; }
    const known = new Set(state.people.map(p => p.id));
    for (const e of data.entries) if (e && e.id && known.has(e.personId) && Number.isFinite(e.amount) && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && !eIds.has(e.id)) { state.entries.push({ id: e.id, personId: e.personId, amount: e.amount, memo: String(e.memo || ''), date: e.date, createdAt: e.createdAt || '' }); ne++; }
    return { np, ne, note: '' };
  }
  function mergeMoneyBook(text) {
    const { books, problems } = MoneyBookCsv.parse(text);
    if (!books.length) throw Error('not csv');
    const eIds = new Set(state.entries.map(e => e.id));
    let np = 0, ne = 0;
    for (const b of books) {
      if (!b.entries.length) continue; // 기록 없는 빈 가계부는 건너뛴다
      const name = b.name.trim();
      // 같은 이름의 통장이 이미 있으면 거기에 더한다
      let p = person('mb:' + name) || state.people.find(x => x.name.trim() === name);
      if (!p) {
        const used = new Set(state.people.map(x => x.color));
        const color = (COLORS.find(([, c]) => !used.has(c)) || COLORS[state.people.length % COLORS.length])[1];
        p = { id: 'mb:' + name, name, color, createdAt: new Date().toISOString() };
        state.people.push(p); np++;
      }
      // 기록 id는 내용으로 만든다(날짜·금액·태그·같은 날 같은 기록의 순번) → 같은 파일을 두 번 불러와도 겹치지 않는다
      const seen = new Map();
      b.entries.forEach((e, i) => {
        const key = `${e.date}|${e.amount}|${e.tag}`, k = seen.get(key) || 0;
        seen.set(key, k + 1);
        const id = `mb:${name}:${key}:${k}`;
        if (eIds.has(id)) return;
        state.entries.push({ id, personId: p.id, amount: e.amount, memo: e.tag, date: e.date, createdAt: `${e.date}T00:00:${String(i).padStart(4, '0')}` });
        eIds.add(id); ne++;
      });
    }
    return { np, ne, note: problems.length ? ` (읽지 못한 줄 ${problems.length}개)` : '' };
  }
  $('restore-file').onchange = async () => {
    const file = $('restore-file').files[0];
    $('restore-file').value = '';
    if (!file) return;
    const before = JSON.stringify({ people: state.people, entries: state.entries });
    let result, fromCsv = false;
    try {
      const text = await file.text();
      if (/^\s*\{/.test(text.replace(/^﻿/, ''))) result = mergeBackup(JSON.parse(text));
      else { result = mergeMoneyBook(text); fromCsv = true; }
    } catch (_) {
      toast('오고감 백업 파일이나 태그가계부 CSV 파일이 아니에요');
      return;
    }
    const { np, ne, note } = result;
    if (storageBroken && (np || ne)) storageBroken = false;
    save();
    closeSheet('settings-sheet');
    refresh();
    if (!np && !ne) { toast('새로 더할 기록이 없어요' + note); return; }
    toast(`${fromCsv ? '태그가계부에서 ' : ''}사람 ${np}명, 기록 ${ne}건을 가져왔어요${note}`, '되돌리기', () => {
      const b = JSON.parse(before);
      state.people = b.people; state.entries = b.entries;
      save(); refresh();
    });
  };

  // ── 알림 ───────────────────────────────────────
  let toastTimer = null;
  function toast(text, actionLabel, action) {
    const t = $('toast');
    $('toast-text').textContent = text;
    const b = $('toast-action');
    b.hidden = !actionLabel;
    b.textContent = actionLabel || '';
    b.onclick = () => { t.hidden = true; clearTimeout(toastTimer); if (action) action(); };
    t.hidden = true; void t.offsetWidth; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, actionLabel ? 5200 : 2600);
  }

  // ── 시작 ───────────────────────────────────────
  renderHome(true);
  if (storageBroken) toast('기존 기록을 읽지 못해 저장을 멈췄어요. 백업 파일로 복구하세요.');
  navigator.storage?.persist?.().catch(() => {});
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && view === 'home') renderHome(false); });

  let appVersion = '', swReg = null, applyUpdate = null;
  const showAppInfo = () => { $('app-info').textContent = appVersion ? `지금 버전 ${appVersion}` : '새 버전이 있으면 바로 바꿔요'; };
  // 설정의 '업데이트 확인': 새 버전을 찾아 있으면 바로 바꾸고, 없으면 최신이라고 알린다.
  $('check-update').onclick = async () => {
    if (!swReg) { toast('홈 화면 앱이나 인터넷 주소로 열었을 때 확인할 수 있어요'); return; }
    $('app-info').textContent = '확인하는 중…';
    try { await swReg.update(); } catch (_) { showAppInfo(); toast('인터넷 연결을 확인하세요'); return; }
    const waitInstall = () => new Promise(resolve => {
      const next = swReg.installing;
      if (!next) return resolve();
      next.addEventListener('statechange', () => { if (next.state !== 'installing') resolve(); });
    });
    await waitInstall();
    if (swReg.waiting && applyUpdate) applyUpdate();
    else { showAppInfo(); toast('지금이 최신 버전이에요'); }
  };
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    const sw = navigator.serviceWorker;
    let updating = false;
    const askVersion = () => {
      if (!sw.controller) return;
      const channel = new MessageChannel();
      channel.port1.onmessage = e => { appVersion = e.data; showAppInfo(); };
      sw.controller.postMessage('version', [channel.port2]);
    };
    sw.addEventListener('controllerchange', () => { if (updating) location.reload(); else askVersion(); });
    window.addEventListener('load', () => {
      sw.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
        swReg = reg;
        const offer = () => { if (reg.waiting && sw.controller) $('update-ready').hidden = false; };
        offer();
        reg.addEventListener('updatefound', () => {
          const next = reg.installing;
          if (next) next.addEventListener('statechange', () => { if (next.state === 'installed') offer(); });
        });
        applyUpdate = () => {
          if (!reg.waiting) return;
          updating = true; $('update-ready').disabled = true; $('update-ready').textContent = '바꾸는 중…';
          $('app-info').textContent = '새 버전으로 바꾸는 중…';
          reg.waiting.postMessage('skipWaiting');
        };
        $('update-ready').onclick = applyUpdate;
        const check = () => reg.update().catch(() => {});
        check();
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      }).catch(() => {});
      askVersion();
    });
  }
})();
