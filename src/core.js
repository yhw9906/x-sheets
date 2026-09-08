/* X Sheets - 공용 상태, 설정, 유틸 */
(function () {
  'use strict';

  const XS = (window.__XSHEETS__ = window.__XSHEETS__ || {});

  XS.DEFAULTS = {
    enabled: true,      // 시트 화면 사용 여부
    wrap: true,         // 자동 줄 바꿈
    media: 'hide',      // hide | small  (이미지 표시 방식)
    zoom: 100,          // 75 | 90 | 100 | 125 | 150
    autoLoad: true,     // 아래로 내리면 원본 타임라인을 자동으로 더 읽어옴
    rowLimit: 3000,     // 한 시트에 담아둘 최대 행 수
    batchSize: 40,      // 더 불러오기 한 번에 목표로 하는 새 글 개수
    promoted: 'gray'    // show | gray | hide  (프로모션/광고 트윗 처리 방식)
  };

  XS.settings = Object.assign({}, XS.DEFAULTS);

  /* ---------- 저장소 ---------- */

  XS.store = {
    rows: [],
    index: new Map(),
    kind: '',           // timeline | notification
    key: '',            // 현재 경로 (시트 구분용)

    reset(kind, key) {
      this.rows.length = 0;
      this.index.clear();
      this.kind = kind;
      this.key = key;
    },

    add(row) {
      if (!row || !row.id || this.index.has(row.id)) return false;
      this.index.set(row.id, row);
      this.rows.push(row);
      if (this.rows.length > XS.settings.rowLimit) {
        const dropped = this.rows.shift();
        if (dropped) this.index.delete(dropped.id);
      }
      return true;
    }
  };

  /* ---------- 유틸 ---------- */

  const U = (XS.util = {});

  U.text = function (el) {
    if (!el) return '';
    return (el.innerText || el.textContent || '')
      .replace(/ /g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  };

  U.oneLine = function (s) {
    return String(s == null ? '' : s).replace(/\s*\n\s*/g, ' ').trim();
  };

  // "1.2만", "3,456", "1.2K" 같은 표기를 정렬용 숫자로 바꾼다.
  U.toNumber = function (s) {
    if (s == null) return 0;
    const t = String(s).replace(/,/g, '').trim();
    if (!t) return 0;
    const m = t.match(/^([0-9]*\.?[0-9]+)\s*(만|천|억|K|k|M|m|B|b)?/);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    if (isNaN(n)) return 0;
    switch (m[2]) {
      case '천': return n * 1e3;
      case '만': return n * 1e4;
      case '억': return n * 1e8;
      case 'K': case 'k': return n * 1e3;
      case 'M': case 'm': return n * 1e6;
      case 'B': case 'b': return n * 1e9;
      default: return n;
    }
  };

  U.pad2 = function (n) { return n < 10 ? '0' + n : String(n); };

  U.formatDate = function (iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const sameYear = d.getFullYear() === now.getFullYear();
    const date = (sameYear ? '' : d.getFullYear() + '-') +
      U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate());
    return date + ' ' + U.pad2(d.getHours()) + ':' + U.pad2(d.getMinutes());
  };

  U.colName = function (i) {
    let s = '';
    i = i + 1;
    while (i > 0) {
      const r = (i - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  };

  U.debounce = function (fn, ms) {
    let t = 0;
    return function () {
      const args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };

  U.el = function (tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  U.wait = function (ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  };

  /* ---------- 설정 로드/저장 ---------- */

  XS.loadSettings = function () {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get(XS.DEFAULTS, function (v) {
          if (!chrome.runtime.lastError && v) Object.assign(XS.settings, v);
          resolve(XS.settings);
        });
      } catch (e) {
        resolve(XS.settings);
      }
    });
  };

  XS.saveSettings = function (patch) {
    Object.assign(XS.settings, patch);
    try { chrome.storage.local.set(patch); } catch (e) { /* 무시 */ }
  };
})();
