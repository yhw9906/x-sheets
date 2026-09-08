/* X Sheets - 설정 창 */
(function () {
  'use strict';

  const DEFAULTS = {
    enabled: true,
    wrap: true,
    media: 'hide',
    zoom: 100,
    autoLoad: true,
    rowLimit: 3000,
    batchSize: 40,
    promoted: 'gray',
    tweetMedia: 'hide'
  };

  const CHECKS = ['enabled', 'wrap', 'autoLoad'];
  const SELECTS = {
    media: String, zoom: Number, rowLimit: Number, batchSize: Number,
    promoted: String, tweetMedia: String
  };

  chrome.storage.local.get(DEFAULTS, function (v) {
    CHECKS.forEach(function (key) {
      const el = document.getElementById(key);
      el.checked = !!v[key];
      el.addEventListener('change', function () {
        const patch = {};
        patch[key] = el.checked;
        chrome.storage.local.set(patch);
      });
    });

    Object.keys(SELECTS).forEach(function (key) {
      const el = document.getElementById(key);
      el.value = String(v[key]);
      el.addEventListener('change', function () {
        const patch = {};
        patch[key] = SELECTS[key](el.value);
        chrome.storage.local.set(patch);
      });
    });
  });

  /* ---------- 버전, 업데이트 안내 ---------- */

  const myVersion = chrome.runtime.getManifest().version;
  document.getElementById('ver').textContent = 'v' + myVersion;

  function isNewer(a, b) {
    const pa = String(a).split('.').map(function (n) { return parseInt(n, 10) || 0; });
    const pb = String(b).split('.').map(function (n) { return parseInt(n, 10) || 0; });
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x > y;
    }
    return false;
  }

  chrome.storage.local.get(['xsUpdateCache'], function (v) {
    const cache = v && v.xsUpdateCache;
    if (!cache || !isNewer(cache.latest, myVersion)) return;
    const box = document.getElementById('updatelink');
    const a = document.getElementById('updatehref');
    a.textContent = '새 버전 v' + cache.latest + ' 받기';
    a.href = cache.url;
    box.style.display = 'block';
  });
})();
