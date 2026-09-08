/* X Sheets - 새 버전이 나왔는지 GitHub에서 확인 */
(function () {
  'use strict';

  const XS = window.__XSHEETS__;

  const REPO = 'yhw9906/x-sheets';
  const API = 'https://api.github.com/repos/' + REPO + '/releases/latest';
  const RECHECK_MS = 6 * 60 * 60 * 1000; // 6시간에 한 번만 물어본다.

  const U = (XS.update = {});

  function parts(v) {
    return String(v || '').replace(/^v/i, '').split('.').map(function (n) {
      return parseInt(n, 10) || 0;
    });
  }

  // a가 b보다 새 버전이면 true.
  U.isNewer = function (a, b) {
    const pa = parts(a), pb = parts(b);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x > y;
    }
    return false;
  };

  function applyResult(latest, url) {
    if (latest && url && U.isNewer(latest, XS.version) && XS.ui && XS.ui.showUpdate) {
      XS.ui.showUpdate(latest, url);
    }
  }

  function checkNow() {
    fetch(API)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.tag_name) return;
        const latest = data.tag_name.replace(/^v/i, '');
        const url = data.html_url || ('https://github.com/' + REPO + '/releases');
        try {
          chrome.storage.local.set({
            xsUpdateCache: { checkedAt: Date.now(), latest: latest, url: url }
          });
        } catch (e) { /* 무시 */ }
        applyResult(latest, url);
      })
      .catch(function () { /* 오프라인이거나 API 제한이면 조용히 넘어간다 */ });
  }

  // 너무 자주 묻지 않도록 최근 확인 결과를 재사용한다.
  U.check = function () {
    try {
      chrome.storage.local.get(['xsUpdateCache'], function (v) {
        const cache = v && v.xsUpdateCache;
        if (cache && Date.now() - cache.checkedAt < RECHECK_MS) {
          applyResult(cache.latest, cache.url);
          return;
        }
        checkNow();
      });
    } catch (e) { /* 무시 */ }
  };
})();
