(function (root) {
  'use strict';
  // 태그가계부(MoneyBook) 'CSV 내보내기' 파일 읽기.
  // 가계부마다 한 묶음이고 빈 줄로 나뉜다:
  //   깡모,,
  //   id,date,tag,price
  //   1,26 6월 2023,"#송츄","-115,000"
  //   ...
  //   total,,,"122,320"
  // price는 받은 돈(수입)이 +, 준 돈(지출)이 −. 오고감과 같은 방향이다.

  function splitCsvLine(line) {
    const out = [];
    let cur = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map(s => s.trim());
  }

  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const pad = n => String(n).padStart(2, '0');
  function valid(y, m, d) {
    const t = new Date(y, m - 1, d);
    return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
  }
  // '26 6월 2023' · '26 Jun 2023' · '2023-06-26' · '2023. 6. 26.' · '2023년 6월 26일'
  function parseDate(s) {
    let m;
    s = s.trim();
    if ((m = s.match(/^(\d{1,2})\s*(\d{1,2})월\s*(\d{4})$/))) return valid(+m[3], +m[2], +m[1]);
    if ((m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?,?\s+(\d{4})$/)) && MONTHS[m[2].toLowerCase()]) return valid(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    if ((m = s.match(/^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*[.일]?$/))) return valid(+m[1], +m[2], +m[3]);
    return null;
  }
  function parseAmount(s) {
    const t = s.replace(/[,\s원₩]/g, '').replace(/−/g, '-');
    return /^[+-]?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
  }

  // 결과: { books: [{ name, entries: [{date, tag, amount}], total, sum }], problems: [문장] }
  function parse(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/);
    const books = [], problems = [];
    let book = null;
    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      if (!raw.trim()) { book = null; continue; }
      const cells = splitCsvLine(raw);
      const head = cells[0];
      if (!book) {
        // 가계부 이름 줄 다음에는 반드시 id,date,tag,price 머리줄이 온다.
        const next = splitCsvLine(lines[i + 1] || '');
        if (next[0] === 'id' && next[1] === 'date') {
          book = { name: head, entries: [], total: null, sum: 0 };
          books.push(book);
          i++;
        }
        continue;
      }
      if (head === 'total') { book.total = parseAmount(cells[cells.length - 1] || ''); continue; }
      const date = parseDate(cells[1] || ''), amount = parseAmount(cells[3] || '');
      if (!date || amount === null) { problems.push(`${book.name} ${i + 1}번째 줄을 읽지 못했어요`); continue; }
      const tag = (cells[2] || '').split(/\s+/).map(t => t.replace(/^#/, '')).filter(Boolean).join(' ');
      book.entries.push({ date, tag, amount });
      book.sum += amount;
    }
    for (const b of books) {
      b.sum = Math.round(b.sum * 100) / 100;
      // 원래 앱은 total을 부호 없이 적는다(준 게 더 많아도 26,150).
      if (b.total !== null && Math.abs(b.total) !== Math.abs(b.sum)) problems.push(`${b.name}: 원래 앱 합계 ${b.total}, 읽은 합계 ${b.sum}`);
    }
    return { books, problems };
  }

  const api = { parse, parseDate, splitCsvLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MoneyBookCsv = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
