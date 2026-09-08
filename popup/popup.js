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
    promoted: 'gray'
  };

  const CHECKS = ['enabled', 'wrap', 'autoLoad'];
  const SELECTS = { media: String, zoom: Number, rowLimit: Number, batchSize: Number, promoted: String };

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
})();
