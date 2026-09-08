/* X Sheets - 표 화면 */
(function () {
  'use strict';

  const XS = window.__XSHEETS__;
  const U = XS.util;

  const FILLER_COLS = 8;      // 데이터 뒤에 붙는 빈 열
  const CHUNK = 60;           // 한 번에 그리는 행 수

  const COLSETS = {
    timeline: [
      { key: 'name',   label: '작성자', width: 130, type: 'text' },
      { key: 'handle', label: '계정',   width: 140, type: 'text' },
      { key: 'text',   label: '내용',   width: 520, type: 'body' },
      { key: 'time',   label: '시간',   width: 110, type: 'time' },
      { key: 'reply',  label: '답글',   width: 68,  type: 'num' },
      { key: 'repost', label: '재게시', width: 80,  type: 'num' },
      { key: 'like',   label: '마음',   width: 68,  type: 'num' },
      { key: 'view',   label: '조회',   width: 72,  type: 'num' },
      { key: 'state',  label: '내 반응', width: 110, type: 'state' },
      { key: 'media',  label: '미디어', width: 90,  type: 'media' },
      { key: 'url',    label: '링크',   width: 230, type: 'link' }
    ],
    notification: [
      { key: 'name',   label: '보낸사람', width: 150, type: 'text' },
      { key: 'text',   label: '내용',     width: 560, type: 'body' },
      { key: 'time',   label: '시간',     width: 110, type: 'time' },
      { key: 'state',  label: '내 반응',   width: 110, type: 'state' },
      { key: 'media',  label: '미디어',   width: 90,  type: 'media' },
      { key: 'url',    label: '링크',     width: 230, type: 'link' }
    ]
  };

  const G = (XS.grid = {});

  G.cols = [];
  G.view = [];
  G.sort = null;              // { key, dir }
  G.query = '';
  G.rendered = 0;
  G.firstId = null;
  G.sel = { r: 0, c: 0, r2: 0, c2: 0 };
  G.cellEls = [];             // [행][열] -> 요소

  let root, table, sheet, sentinel, io;
  let dragging = false;

  /* ---------- 값 ---------- */

  function valueOf(row, col) {
    if (col.key === 'text') {
      let v = row.text || '';
      if (row.context) v = row.context + '\n' + v;
      if (row.quote) v = v + '\n' + row.quote;
      return v;
    }
    if (col.key === 'state') {
      const parts = [];
      if (row.liked) parts.push('좋아요');
      if (row.retweeted) parts.push('리트윗');
      return parts.join(' · ');
    }
    return row[col.key] == null ? '' : String(row[col.key]);
  }

  G.valueOf = valueOf;

  function sortValue(row, col) {
    if (col.type === 'num') return U.toNumber(row[col.key]);
    if (col.type === 'time') return row.iso ? Date.parse(row.iso) || 0 : 0;
    return valueOf(row, col).toLowerCase();
  }

  /* ---------- 데이터 정리 ---------- */

  G.recompute = function () {
    const q = G.query.trim().toLowerCase();
    let list = XS.store.rows.slice();

    if (XS.settings.promoted === 'hide') {
      list = list.filter(function (row) { return !row.promoted; });
    }

    if (q) {
      list = list.filter(function (row) {
        return G.cols.some(function (col) {
          return valueOf(row, col).toLowerCase().indexOf(q) !== -1;
        });
      });
    }

    if (G.sort) {
      const col = G.cols.find(function (c) { return c.key === G.sort.key; });
      if (col) {
        const dir = G.sort.dir;
        list.sort(function (a, b) {
          const va = sortValue(a, col), vb = sortValue(b, col);
          if (va < vb) return -dir;
          if (va > vb) return dir;
          return 0;
        });
      }
    }

    G.view = list;
  };

  /* ---------- 만들기 ---------- */

  G.build = function (container, kind) {
    root = container;
    G.cols = (COLSETS[kind] || COLSETS.timeline).map(function (c) {
      return Object.assign({}, c);
    });

    sheet = U.el('div', 'xs-sheet');
    sheet.tabIndex = 0;

    table = U.el('div', 'xs-table');
    sheet.appendChild(table);

    sentinel = U.el('div', 'xs-sentinel');
    sheet.appendChild(sentinel);

    root.appendChild(sheet);

    applyTemplate();
    buildHeader();
    bindEvents();

    io = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) G.growOrLoad();
    }, { root: sheet, rootMargin: '400px' });
    io.observe(sentinel);

    return sheet;
  };

  function applyTemplate() {
    const parts = ['var(--xs-rowhead)'];
    G.cols.forEach(function (c) { parts.push(c.width + 'px'); });
    for (let i = 0; i < FILLER_COLS; i++) parts.push('100px');
    table.style.gridTemplateColumns = parts.join(' ');
  }

  function buildHeader() {
    const old = table.querySelector('.xs-headline');
    if (old) old.remove();

    const line = U.el('div', 'xs-headline');

    const corner = U.el('div', 'xs-corner');
    line.appendChild(corner);

    const total = G.cols.length + FILLER_COLS;
    for (let i = 0; i < total; i++) {
      const col = G.cols[i];
      const cell = U.el('div', 'xs-colhead');
      cell.dataset.c = String(i);

      const letter = U.el('span', 'xs-colletter', U.colName(i));
      cell.appendChild(letter);

      if (col) {
        cell.appendChild(U.el('span', 'xs-collabel', col.label));
        cell.title = col.label + ' 열 · 눌러서 정렬';
        const mark = U.el('span', 'xs-sortmark');
        cell.appendChild(mark);
        const handle = U.el('span', 'xs-resize');
        handle.dataset.c = String(i);
        cell.appendChild(handle);
      }
      line.appendChild(cell);
    }

    table.insertBefore(line, table.firstChild);
  }

  /* ---------- 행 그리기 ---------- */

  // 게시물 미디어를 "미리보기"로 두면 사진/영상이 잘 보이게 그 열만 넓혀준다.
  // 설정이 실제로 바뀐 순간에만 적용해서, 사용자가 손으로 조절한 열 너비를 덮어쓰지 않는다.
  let lastMediaMode = null;
  function syncMediaWidth() {
    const mode = XS.settings.tweetMedia;
    if (mode === lastMediaMode) return;
    lastMediaMode = mode;
    const col = G.cols.find(function (c) { return c.key === 'media'; });
    if (!col) return;
    col.width = mode === 'preview' ? 160 : 90;
    applyTemplate();
  }

  G.rebuild = function () {
    syncMediaWidth();
    const keep = Math.max(CHUNK, G.rendered);
    G.recompute();
    clearRows();
    G.rendered = 0;
    G.appendRows(Math.min(keep, G.view.length));
    G.firstId = G.view.length ? G.view[0].id : null;
    G.paint();
    XS.ui && XS.ui.updateStatus();
  };

  // 원본에서 새 글을 읽어왔을 때. 앞부분이 그대로면 다시 그리지 않는다.
  G.onNewData = function () {
    const prevFirst = G.firstId;
    const prevLen = G.view.length;
    G.recompute();
    const newFirst = G.view.length ? G.view[0].id : null;

    if (G.sort || G.query || prevFirst !== newFirst || G.view.length < prevLen) {
      G.rebuild();
    } else {
      XS.ui && XS.ui.updateStatus();
      G.fillIfNeeded();
    }
  };

  // 화면 아래가 비어 있으면 채운다.
  G.fillIfNeeded = function () {
    for (let i = 0; i < 30; i++) {
      if (G.rendered >= G.view.length) break;
      const rect = sentinel.getBoundingClientRect();
      const box = sheet.getBoundingClientRect();
      if (rect.top > box.bottom + 400) break;
      G.appendRows(CHUNK);
    }
    G.paint();
    XS.ui && XS.ui.updateStatus();
  };

  // 다른 화면(타임라인 <-> 알림)으로 옮겨갈 때 열 구성을 바꾼다.
  G.setKind = function (kind) {
    G.cols = (COLSETS[kind] || COLSETS.timeline).map(function (c) {
      return Object.assign({}, c);
    });
    lastMediaMode = null;
    G.sort = null;
    G.query = '';
    G.sel = { r: 0, c: 0, r2: 0, c2: 0 };
    clearRows();
    G.rendered = 0;
    G.view = [];
    applyTemplate();
    buildHeader();
    XS.ui && XS.ui.updateStatus();
    XS.ui && XS.ui.updateFormula();
  };

  function clearRows() {
    table.querySelectorAll('.xs-rowline').forEach(function (n) { n.remove(); });
    G.cellEls.length = 0;
  }

  G.appendRows = function (count) {
    const end = Math.min(G.view.length, G.rendered + count);
    if (end <= G.rendered) return;

    const frag = document.createDocumentFragment();
    for (let r = G.rendered; r < end; r++) {
      frag.appendChild(buildRow(r, G.view[r]));
    }
    table.appendChild(frag);
    G.rendered = end;
  };

  function buildRow(r, row) {
    const line = U.el('div', 'xs-rowline');
    line.dataset.r = String(r);

    const grayed = !!row.promoted && XS.settings.promoted === 'gray';

    const head = U.el('div', 'xs-rowhead', String(r + 1));
    head.dataset.r = String(r);
    if (grayed) head.classList.add('xs-promoted');
    line.appendChild(head);

    const list = [];
    const total = G.cols.length + FILLER_COLS;

    for (let c = 0; c < total; c++) {
      const col = G.cols[c];
      const cell = U.el('div', 'xs-cell');
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      if (grayed) cell.classList.add('xs-promoted');

      if (col) {
        if (col.type === 'num') cell.classList.add('xs-right');
        if (col.type === 'time') cell.classList.add('xs-center');
        if (col.type === 'link') cell.classList.add('xs-link');
        if (col.key === 'name' && row.protected) cell.classList.add('xs-protected-cell');
        fillCell(cell, row, col);
      } else {
        cell.classList.add('xs-empty');
      }
      list.push(cell);
      line.appendChild(cell);
    }

    G.cellEls[r] = list;
    return line;
  }

  function fillCell(cell, row, col) {
    // 프로필 사진은 예전 그대로 hide/small 두 단계만 쓴다.
    if (col.key === 'name' && XS.settings.media === 'small' && row.avatar) {
      const img = U.el('img', 'xs-thumb');
      img.src = row.avatar;
      img.loading = 'lazy';
      cell.appendChild(img);
    }

    // 게시물 속 사진/영상은 별도 설정(hide/small/preview)을 따른다.
    if (col.key === 'media') {
      const mode = XS.settings.tweetMedia;
      if (mode === 'small' && row.thumbs && row.thumbs.length) {
        row.thumbs.forEach(function (src) {
          const img = U.el('img', 'xs-thumb');
          img.src = src;
          img.loading = 'lazy';
          cell.appendChild(img);
        });
      } else if (mode === 'preview') {
        appendMediaPreview(cell, row);
      }
    }

    // 내용 칸은 인용한 원본 글을 옅은 회색 줄로 따로 구분해서 보여준다.
    if (col.key === 'text') {
      let head = row.text || '';
      if (row.context) head = row.context + '\n' + head;
      if (head) cell.appendChild(U.el('div', 'xs-linebody', head));
      if (row.quote) cell.appendChild(U.el('div', 'xs-linequote', row.quote));
      return;
    }

    const v = valueOf(row, col);
    if (v) cell.appendChild(U.el('span', 'xs-val', v));
  }

  // 정방형 미리보기. 사진은 그대로, 움짤/영상은 재생 주소가 있으면 음소거 자동재생으로 보여주고
  // 없으면(재생기 내부 임시 주소뿐이면) 첫 장면 이미지만 보여준다.
  function appendMediaPreview(cell, row) {
    const items = [];
    (row.thumbs || []).forEach(function (src) { items.push({ type: 'img', src: src }); });
    (row.clips || []).forEach(function (clip) {
      if (clip.src) items.push({ type: 'video', src: clip.src, poster: clip.poster });
      else if (clip.poster) items.push({ type: 'img', src: clip.poster });
    });
    if (!items.length) return;

    const box = U.el('div', 'xs-mediaprev');
    items.forEach(function (item) {
      let el;
      if (item.type === 'video') {
        el = document.createElement('video');
        el.className = 'xs-prevtile';
        el.src = item.src;
        if (item.poster) el.poster = item.poster;
        el.muted = true;
        el.loop = true;
        el.autoplay = true;
        el.playsInline = true;
      } else {
        el = U.el('img', 'xs-prevtile');
        el.src = item.src;
        el.loading = 'lazy';
      }
      box.appendChild(el);
    });
    cell.appendChild(box);
  }

  // 실행 메뉴로 실제 동작을 수행한 뒤, 그 행의 칸만 다시 그린다.
  G.refreshRow = function (row) {
    const r = G.view.indexOf(row);
    const line = G.cellEls[r];
    if (r === -1 || !line) return;

    const total = G.cols.length + FILLER_COLS;
    for (let c = 0; c < total; c++) {
      const col = G.cols[c];
      if (!col) continue;
      const cell = line[c];
      cell.textContent = '';
      fillCell(cell, row, col);
    }
  };

  /* ---------- 더 채우기 ---------- */

  G.growOrLoad = function () {
    if (G.rendered < G.view.length) {
      G.appendRows(CHUNK);
      G.paint();
      XS.ui && XS.ui.updateStatus();
      return;
    }
    if (XS.settings.autoLoad && XS.loader) XS.loader.pull();
  };

  /* ---------- 선택 ---------- */

  function normSel() {
    return {
      r1: Math.min(G.sel.r, G.sel.r2),
      r2: Math.max(G.sel.r, G.sel.r2),
      c1: Math.min(G.sel.c, G.sel.c2),
      c2: Math.max(G.sel.c, G.sel.c2)
    };
  }

  G.paint = function () {
    const n = normSel();
    table.querySelectorAll('.xs-on, .xs-active').forEach(function (el) {
      el.classList.remove('xs-on', 'xs-active');
    });

    for (let r = n.r1; r <= n.r2; r++) {
      const line = G.cellEls[r];
      if (!line) continue;
      for (let c = n.c1; c <= n.c2; c++) {
        if (line[c]) line[c].classList.add('xs-on');
      }
    }
    const active = G.cellEls[G.sel.r] && G.cellEls[G.sel.r][G.sel.c];
    if (active) active.classList.add('xs-active');

    table.querySelectorAll('.xs-rowhead').forEach(function (el) {
      const r = Number(el.dataset.r);
      el.classList.toggle('xs-headon', r >= n.r1 && r <= n.r2);
    });
    table.querySelectorAll('.xs-colhead').forEach(function (el) {
      const c = Number(el.dataset.c);
      el.classList.toggle('xs-headon', c >= n.c1 && c <= n.c2);
    });

    XS.ui && XS.ui.updateFormula();
  };

  G.select = function (r, c, extend) {
    const maxR = Math.max(0, G.rendered - 1);
    const maxC = G.cols.length + FILLER_COLS - 1;
    r = Math.max(0, Math.min(r, maxR));
    c = Math.max(0, Math.min(c, maxC));

    if (extend) {
      G.sel.r2 = r;
      G.sel.c2 = c;
    } else {
      G.sel = { r: r, c: c, r2: r, c2: c };
    }
    G.paint();
  };

  G.moveTo = function (r, c, extend) {
    if (!extend) { G.sel.r = r; G.sel.c = c; }
    G.select(r, c, extend);
    const el = G.cellEls[extend ? G.sel.r2 : G.sel.r];
    const cell = el && el[extend ? G.sel.c2 : G.sel.c];
    if (cell) cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  G.activeRow = function () {
    return G.view[G.sel.r] || null;
  };

  G.activeCol = function () {
    return G.cols[G.sel.c] || null;
  };

  G.selectionText = function () {
    const n = normSel();
    const lines = [];
    for (let r = n.r1; r <= n.r2; r++) {
      const row = G.view[r];
      if (!row) continue;
      const cells = [];
      for (let c = n.c1; c <= n.c2; c++) {
        const col = G.cols[c];
        cells.push(col ? U.oneLine(valueOf(row, col)) : '');
      }
      lines.push(cells.join('\t'));
    }
    return lines.join('\n');
  };

  G.copySelection = function () {
    const text = G.selectionText();
    if (!text) return;
    const done = function () { XS.ui && XS.ui.flash('복사했습니다'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { copyFallback(text, done); });
    } else {
      copyFallback(text, done);
    }
  };

  function copyFallback(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* 무시 */ }
    ta.remove();
    sheet.focus({ preventScroll: true });
  }

  G.toCsv = function () {
    const head = G.cols.map(function (c) { return c.label; });
    const lines = [head.map(csvCell).join(',')];
    G.view.forEach(function (row) {
      lines.push(G.cols.map(function (col) {
        return csvCell(valueOf(row, col));
      }).join(','));
    });
    return '\uFEFF' + lines.join('\r\n');   // 엑셀에서 한글이 깨지지 않도록
  };

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return '"' + s.replace(/"/g, '""') + '"';
  }

  /* ---------- 이벤트 ---------- */

  function bindEvents() {
    table.addEventListener('mousedown', function (e) {
      const resize = e.target.closest('.xs-resize');
      if (resize) { startResize(e, Number(resize.dataset.c)); return; }

      const head = e.target.closest('.xs-colhead');
      if (head) {
        const c = Number(head.dataset.c);
        const col = G.cols[c];
        if (col) toggleSort(col.key);
        selectColumn(c);
        e.preventDefault();
        return;
      }

      const rowHead = e.target.closest('.xs-rowhead');
      if (rowHead) {
        selectRow(Number(rowHead.dataset.r));
        e.preventDefault();
        return;
      }

      const cell = e.target.closest('.xs-cell');
      if (!cell) return;
      sheet.focus({ preventScroll: true });
      G.select(Number(cell.dataset.r), Number(cell.dataset.c), e.shiftKey);
      dragging = true;
      e.preventDefault();
    });

    table.addEventListener('mouseover', function (e) {
      if (!dragging) return;
      const cell = e.target.closest('.xs-cell');
      if (cell) G.select(Number(cell.dataset.r), Number(cell.dataset.c), true);
    });

    window.addEventListener('mouseup', function () { dragging = false; });

    table.addEventListener('dblclick', function (e) {
      const cell = e.target.closest('.xs-cell');
      if (!cell) return;
      const row = G.view[Number(cell.dataset.r)];
      if (row && row.url) window.open(row.url, '_blank', 'noopener');
    });

    sheet.addEventListener('keydown', onKey);

    sheet.addEventListener('copy', function (e) {
      const text = G.selectionText();
      if (!text) return;
      e.clipboardData.setData('text/plain', text);
      e.preventDefault();
      XS.ui && XS.ui.flash('복사했습니다');
    });

    table.addEventListener('contextmenu', function (e) {
      const cell = e.target.closest('.xs-cell');
      const rowHead = e.target.closest('.xs-rowhead');
      const hit = cell || rowHead;
      if (!hit) return;

      const r = Number(hit.dataset.r);
      const row = G.view[r];
      if (!row) return;

      e.preventDefault();
      selectRow(r);
      openRowMenu(row, e.clientX, e.clientY);
    });

    sheet.addEventListener('scroll', closeRowMenu);
    window.addEventListener('resize', closeRowMenu);
  }

  /* ---------- 우클릭 실행 메뉴 ---------- */

  let menuEl = null;

  function closeRowMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
    document.removeEventListener('mousedown', onOutsideMenuClick, true);
    document.removeEventListener('keydown', onMenuEscape, true);
  }

  function onOutsideMenuClick(e) {
    if (menuEl && !menuEl.contains(e.target)) closeRowMenu();
  }

  function onMenuEscape(e) {
    if (e.key === 'Escape') closeRowMenu();
  }

  function menuItem(label, disabled, onPick) {
    const it = U.el('button', 'xs-menuitem', label);
    it.type = 'button';
    if (disabled) {
      it.disabled = true;
      it.classList.add('xs-menuitem-off');
    } else {
      it.addEventListener('click', function () {
        closeRowMenu();
        onPick();
      });
    }
    return it;
  }

  function openRowMenu(row, x, y) {
    closeRowMenu();

    const hasTweet = !!row.tweetId;
    menuEl = U.el('div', 'xs-menupop');

    if (hasTweet) {
      menuEl.appendChild(menuItem(row.liked ? '좋아요 취소' : '좋아요', false, function () {
        XS.actions.toggleLike(row);
      }));
      menuEl.appendChild(menuItem(row.retweeted ? '리트윗 취소' : '리트윗', false, function () {
        XS.actions.toggleRetweet(row);
      }));
      menuEl.appendChild(menuItem('인용 리트윗 작성', false, function () {
        XS.ui.showQuoteComposer(row, function (text) {
          return XS.actions.quoteWithText(row, text);
        });
      }));
      menuEl.appendChild(U.el('div', 'xs-menusep'));
    }

    menuEl.appendChild(menuItem('원본 글 열기', !row.url, function () {
      window.open(row.url, '_blank', 'noopener');
    }));
    menuEl.appendChild(menuItem('복사', false, function () {
      G.copySelection();
    }));

    root.appendChild(menuEl);

    const pad = 6;
    const rect = menuEl.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - rect.width - pad);
    const top = Math.min(y, window.innerHeight - rect.height - pad);
    menuEl.style.left = Math.max(pad, left) + 'px';
    menuEl.style.top = Math.max(pad, top) + 'px';

    setTimeout(function () {
      document.addEventListener('mousedown', onOutsideMenuClick, true);
      document.addEventListener('keydown', onMenuEscape, true);
    }, 0);
  }

  function selectColumn(c) {
    G.sel = { r: 0, c: c, r2: Math.max(0, G.rendered - 1), c2: c };
    G.paint();
  }

  function selectRow(r) {
    G.sel = { r: r, c: 0, r2: r, c2: G.cols.length + FILLER_COLS - 1 };
    G.paint();
  }

  function toggleSort(key) {
    if (!G.sort || G.sort.key !== key) G.sort = { key: key, dir: 1 };
    else if (G.sort.dir === 1) G.sort = { key: key, dir: -1 };
    else G.sort = null;
    updateSortMarks();
    G.rebuild();
  }

  G.clearSort = function () {
    G.sort = null;
    updateSortMarks();
    G.rebuild();
  };

  function updateSortMarks() {
    table.querySelectorAll('.xs-colhead').forEach(function (el) {
      const c = Number(el.dataset.c);
      const col = G.cols[c];
      el.classList.remove('xs-asc', 'xs-desc');
      if (col && G.sort && G.sort.key === col.key) {
        el.classList.add(G.sort.dir === 1 ? 'xs-asc' : 'xs-desc');
      }
    });
  }

  function onKey(e) {
    const k = e.key;
    const step = e.ctrlKey ? 20 : 1;

    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'c') {
      G.copySelection();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'a') {
      G.sel = { r: 0, c: 0, r2: Math.max(0, G.rendered - 1), c2: G.cols.length - 1 };
      G.paint();
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (k === 'ArrowDown') { G.moveTo(G.sel.r + step, G.sel.c, e.shiftKey); }
    else if (k === 'ArrowUp') { G.moveTo(G.sel.r - step, G.sel.c, e.shiftKey); }
    else if (k === 'ArrowRight') { G.moveTo(G.sel.r, G.sel.c + step, e.shiftKey); }
    else if (k === 'ArrowLeft') { G.moveTo(G.sel.r, G.sel.c - step, e.shiftKey); }
    else if (k === 'PageDown') { G.moveTo(G.sel.r + 20, G.sel.c, e.shiftKey); }
    else if (k === 'PageUp') { G.moveTo(G.sel.r - 20, G.sel.c, e.shiftKey); }
    else if (k === 'Home') { G.moveTo(e.ctrlKey ? 0 : G.sel.r, 0, e.shiftKey); }
    else if (k === 'End') { G.moveTo(e.ctrlKey ? G.rendered - 1 : G.sel.r, G.cols.length - 1, e.shiftKey); }
    else if (k === 'Enter') {
      const row = G.activeRow();
      if (row && row.url) window.open(row.url, '_blank', 'noopener');
    } else if (k === 'Escape') {
      G.select(G.sel.r, G.sel.c, false);
    } else {
      // 나머지는 원본 페이지 단축키로 흘려보내지 않는다.
      if (!e.ctrlKey && !e.metaKey && k.length === 1) e.stopPropagation();
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (G.sel.r >= G.rendered - 5) G.growOrLoad();
  }

  /* ---------- 열 너비 조절 ---------- */

  function startResize(e, c) {
    const col = G.cols[c];
    if (!col) return;
    const startX = e.clientX;
    const startW = col.width;
    document.body.classList.add('xs-resizing');

    function move(ev) {
      col.width = Math.max(40, startW + (ev.clientX - startX));
      applyTemplate();
    }
    function up() {
      document.body.classList.remove('xs-resizing');
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    }
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    e.preventDefault();
    e.stopPropagation();
  }

  /* ---------- 외부에서 부르는 것들 ---------- */

  G.setQuery = function (q) {
    G.query = q || '';
    G.rendered = 0;
    G.sel = { r: 0, c: 0, r2: 0, c2: 0 };
    G.rebuild();
  };

  G.setWrap = function (on) {
    sheet.classList.toggle('xs-nowrap', !on);
  };

  G.setZoom = function (pct) {
    table.style.zoom = (pct || 100) / 100;
  };

  G.scrollTop = function () {
    sheet.scrollTop = 0;
  };

  G.element = function () { return sheet; };
})();
