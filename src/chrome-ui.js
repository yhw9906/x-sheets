/* X Sheets - 제목 표시줄, 메뉴, 도구 모음, 수식 입력줄, 상태 표시줄 */
(function () {
  'use strict';

  const XS = window.__XSHEETS__;
  const U = XS.util;
  const UI = (XS.ui = {});

  let root, docName, nameBox, formula, statusLeft, statusRight, sheetTab, findInput;
  let flashTimer = 0;

  /* ---------- 작은 아이콘 ---------- */

  function icon(kind) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('class', 'xs-icon');
    const path = document.createElementNS(ns, 'path');
    const d = {
      find: 'M7 2a5 5 0 1 0 3.1 8.9l3 3 1-1-3-3A5 5 0 0 0 7 2zm0 1.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z',
      back: 'M9.5 3 5 8l4.5 5 1.1-1L7.2 8l3.4-4z',
      forward: 'M6.5 3 11 8l-4.5 5-1.1-1L8.8 8 5.4 4z',
      reload: 'M8 3a5 5 0 1 0 4.7 3.3l-1.4.5A3.5 3.5 0 1 1 8 4.5V7l3.5-2.5L8 2z',
      sheet: 'M2 2h12v12H2V2zm1.5 3.5v2h3v-2h-3zm4.5 0v2h4.5v-2H8zm-4.5 3v2h3v-2h-3zm4.5 0v2h4.5v-2H8z'
    }[kind] || '';
    path.setAttribute('d', d);
    svg.appendChild(path);
    return svg;
  }

  /* ---------- 만들기 ---------- */

  UI.build = function (container) {
    root = container;
    root.appendChild(titleBar());
    root.appendChild(menuBar());
    root.appendChild(toolBar());
    root.appendChild(formulaBar());
  };

  UI.buildStatus = function (container) {
    container.appendChild(statusBar());
  };

  function titleBar() {
    const bar = U.el('div', 'xs-titlebar');

    const mark = U.el('div', 'xs-appmark');
    mark.appendChild(icon('sheet'));
    bar.appendChild(mark);

    const box = U.el('div', 'xs-titlebox');
    docName = U.el('div', 'xs-docname', XS.scraper.pageTitle());
    box.appendChild(docName);
    box.appendChild(U.el('div', 'xs-docsub', 'X Sheets'));
    bar.appendChild(box);

    return bar;
  }

  function menuBar() {
    const bar = U.el('div', 'xs-menubar');
    const items = [
      { label: '홈', path: '/home' },
      { label: '탐색', path: '/explore' },
      { label: '알림', path: '/notifications' },
      { label: '쪽지', path: '/messages' },
      { label: '북마크', path: '/i/bookmarks' },
      { label: '프로필', path: null }
    ];

    items.forEach(function (item) {
      const b = U.el('button', 'xs-menu', item.label);
      b.type = 'button';
      b.addEventListener('click', function () {
        const path = item.path || profilePath();
        if (path) navigate(path);
      });
      bar.appendChild(b);
    });

    return bar;
  }

  function profilePath() {
    const a = document.querySelector('[data-testid="AppTabBar_Profile_Link"]');
    return a ? a.getAttribute('href') : null;
  }

  function navigate(path) {
    const link = document.querySelector('a[href="' + path + '"]');
    if (link) { link.click(); return; }
    location.href = path;
  }

  function toolBar() {
    const bar = U.el('div', 'xs-toolbar');

    // 찾기
    const find = U.el('label', 'xs-find');
    find.appendChild(icon('find'));
    findInput = U.el('input');
    findInput.type = 'text';
    findInput.placeholder = '표에서 찾기';
    findInput.addEventListener('input', U.debounce(function () {
      XS.grid.setQuery(findInput.value);
    }, 200));
    findInput.addEventListener('keydown', function (e) { e.stopPropagation(); });
    find.appendChild(findInput);
    bar.appendChild(find);

    bar.appendChild(U.el('span', 'xs-sep'));

    bar.appendChild(iconButton('back', '뒤로', function () { history.back(); }));
    bar.appendChild(iconButton('forward', '앞으로', function () { history.forward(); }));
    bar.appendChild(iconButton('reload', '새로 읽기', function () { XS.main.refresh(); }));

    bar.appendChild(U.el('span', 'xs-sep'));

    // 확대
    const zoom = U.el('select', 'xs-select');
    [75, 90, 100, 125, 150].forEach(function (z) {
      const o = U.el('option', null, z + '%');
      o.value = String(z);
      zoom.appendChild(o);
    });
    zoom.value = String(XS.settings.zoom);
    zoom.title = '확대 비율';
    zoom.addEventListener('change', function () {
      XS.saveSettings({ zoom: Number(zoom.value) });
      UI.applySettings();
    });
    bar.appendChild(zoom);

    bar.appendChild(U.el('span', 'xs-sep'));

    // 자동 줄 바꿈
    const wrap = U.el('button', 'xs-toggle', '자동 줄 바꿈');
    wrap.type = 'button';
    wrap.classList.toggle('xs-pressed', XS.settings.wrap);
    wrap.addEventListener('click', function () {
      XS.saveSettings({ wrap: !XS.settings.wrap });
      wrap.classList.toggle('xs-pressed', XS.settings.wrap);
      UI.applySettings();
    });
    bar.appendChild(wrap);

    // 이미지
    const media = U.el('select', 'xs-select');
    [['hide', '이미지 숨김'], ['small', '이미지 아주 작게']].forEach(function (p) {
      const o = U.el('option', null, p[1]);
      o.value = p[0];
      media.appendChild(o);
    });
    media.value = XS.settings.media;
    media.title = '이미지 표시 방식';
    media.addEventListener('change', function () {
      XS.saveSettings({ media: media.value });
      XS.grid.rebuild();
    });
    bar.appendChild(media);

    // 프로모션(광고) 게시물
    const promoted = U.el('select', 'xs-select');
    [['show', '프로모션 그대로'], ['gray', '프로모션 회색 처리'], ['hide', '프로모션 제외']].forEach(function (p) {
      const o = U.el('option', null, p[1]);
      o.value = p[0];
      promoted.appendChild(o);
    });
    promoted.value = XS.settings.promoted;
    promoted.title = '프로모션(광고) 게시물 처리 방식';
    promoted.addEventListener('change', function () {
      XS.saveSettings({ promoted: promoted.value });
      XS.grid.rebuild();
    });
    bar.appendChild(promoted);

    bar.appendChild(U.el('span', 'xs-sep'));

    bar.appendChild(textButton('정렬 해제', function () { XS.grid.clearSort(); }));
    bar.appendChild(textButton('더 불러오기', function () { XS.loader.pull(true); }));
    bar.appendChild(textButton('CSV 저장', function () { UI.exportCsv(); }));

    const right = U.el('div', 'xs-toolright');
    right.appendChild(textButton('원본 보기', function () { XS.main.setEnabled(false); }));
    bar.appendChild(right);

    return bar;
  }

  function iconButton(kind, title, onClick) {
    const b = U.el('button', 'xs-iconbtn');
    b.type = 'button';
    b.title = title;
    b.appendChild(icon(kind));
    b.addEventListener('click', onClick);
    return b;
  }

  function textButton(label, onClick) {
    const b = U.el('button', 'xs-btn', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  function formulaBar() {
    const bar = U.el('div', 'xs-formulabar');

    nameBox = U.el('div', 'xs-namebox', 'A1');
    bar.appendChild(nameBox);

    bar.appendChild(U.el('div', 'xs-fx', 'fx'));

    formula = U.el('div', 'xs-formula');
    bar.appendChild(formula);

    return bar;
  }

  function statusBar() {
    const bar = U.el('div', 'xs-statusbar');

    sheetTab = U.el('div', 'xs-sheettab', XS.scraper.pageTitle());
    bar.appendChild(sheetTab);

    statusLeft = U.el('div', 'xs-statusleft', '');
    bar.appendChild(statusLeft);

    statusRight = U.el('div', 'xs-statusright', '');
    bar.appendChild(statusRight);

    return bar;
  }

  /* ---------- 갱신 ---------- */

  UI.updateFormula = function () {
    const G = XS.grid;
    nameBox.textContent = U.colName(G.sel.c) + (G.sel.r + 1);
    const row = G.activeRow();
    const col = G.activeCol();
    formula.textContent = row && col ? G.valueOf(row, col) : '';
    formula.title = formula.textContent;
  };

  UI.updateStatus = function () {
    const G = XS.grid;
    const total = XS.store.rows.length;
    const shown = G.view.length;
    const parts = ['행 ' + total + '개'];
    if (shown !== total) parts.push('표시 ' + shown + '개');
    parts.push('그린 행 ' + G.rendered + '개');
    if (G.sort) {
      const col = G.cols.find(function (c) { return c.key === G.sort.key; });
      if (col) parts.push('정렬 ' + col.label + (G.sort.dir === 1 ? ' 오름차순' : ' 내림차순'));
    }
    statusLeft.textContent = '';
    parts.forEach(function (p) { statusLeft.appendChild(U.el('span', 'xs-stat', p)); });
  };

  UI.updateTitle = function () {
    const t = XS.scraper.pageTitle();
    if (docName) docName.textContent = t;
    if (sheetTab) sheetTab.textContent = t;
  };

  UI.flash = function (msg) {
    if (!statusRight) return;
    statusRight.textContent = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { statusRight.textContent = ''; }, 2500);
  };

  UI.applySettings = function () {
    XS.grid.setZoom(XS.settings.zoom);
    XS.grid.setWrap(XS.settings.wrap);
  };

  UI.exportCsv = function () {
    const csv = XS.grid.toCsv();
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'x-sheets-' + XS.scraper.pageTitle() + '-' +
      new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    UI.flash('CSV 파일로 저장했습니다');
  };

  UI.setFindValue = function (v) {
    if (findInput) findInput.value = v || '';
  };

  /* ---------- 인용 리트윗 작성창 ---------- */

  const QUOTE_LIMIT = 280;

  UI.showQuoteComposer = function (row, onSubmit) {
    const overlay = U.el('div', 'xs-modal-overlay');
    const box = U.el('div', 'xs-modal');

    box.appendChild(U.el('div', 'xs-modal-title', '인용 리트윗 작성'));

    const quoted = U.el('div', 'xs-modal-quoted');
    quoted.appendChild(U.el('div', 'xs-modal-quoted-name', [row.name, row.handle].filter(Boolean).join(' ')));
    quoted.appendChild(U.el('div', 'xs-modal-quoted-text', U.oneLine(row.text || '')));
    box.appendChild(quoted);

    const textarea = document.createElement('textarea');
    textarea.className = 'xs-modal-textarea';
    textarea.maxLength = QUOTE_LIMIT;
    textarea.placeholder = '코멘트를 입력하세요';
    box.appendChild(textarea);

    const counter = U.el('div', 'xs-modal-counter', '0 / ' + QUOTE_LIMIT);
    box.appendChild(counter);
    textarea.addEventListener('input', function () {
      counter.textContent = textarea.value.length + ' / ' + QUOTE_LIMIT;
    });

    const actions = U.el('div', 'xs-modal-actions');
    const cancelBtn = U.el('button', 'xs-btn', '취소');
    cancelBtn.type = 'button';
    const postBtn = U.el('button', 'xs-btn xs-btn-primary', '게시');
    postBtn.type = 'button';
    actions.appendChild(cancelBtn);
    actions.appendChild(postBtn);
    box.appendChild(actions);

    overlay.appendChild(box);
    root.appendChild(overlay);
    textarea.focus();

    function close() {
      overlay.remove();
      document.removeEventListener('keydown', onEsc, true);
    }
    function onEsc(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onEsc, true);

    cancelBtn.addEventListener('click', close);
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) close();
    });
    box.addEventListener('keydown', function (e) { e.stopPropagation(); });

    postBtn.addEventListener('click', function () {
      const text = textarea.value.trim();
      if (!text) { textarea.focus(); return; }

      postBtn.disabled = true;
      cancelBtn.disabled = true;
      postBtn.textContent = '게시하는 중';

      Promise.resolve(onSubmit(text)).then(function (ok) {
        if (ok) {
          close();
        } else {
          postBtn.disabled = false;
          cancelBtn.disabled = false;
          postBtn.textContent = '게시';
        }
      });
    });
  };
})();
