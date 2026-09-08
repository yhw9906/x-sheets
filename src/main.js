/* X Sheets - 전체 흐름 */
(function () {
  'use strict';

  const XS = window.__XSHEETS__;
  const U = XS.util;

  const M = (XS.main = {});
  const L = (XS.loader = {});

  let root = null;
  let toggleBtn = null;
  let observer = null;
  let mounted = false;
  let lastPath = location.pathname + location.search;

  /* ---------- 원본에서 더 읽어오기 ---------- */

  let pulling = false;

  // 고정 시간을 기다리지 않고, 새 글이 도착하는 즉시(또는 최대 시간까지) 반응한다.
  function waitForNewRows(baseline, timeoutMs) {
    return new Promise(function (resolve) {
      const start = Date.now();
      (function poll() {
        XS.scraper.collect();
        if (XS.store.rows.length > baseline || Date.now() - start >= timeoutMs) {
          resolve(XS.store.rows.length - baseline);
          return;
        }
        setTimeout(poll, 80);
      })();
    });
  }

  L.pull = async function (manual) {
    if (pulling) return;
    if (!XS.settings.autoLoad && !manual) return;
    pulling = true;
    XS.ui.flash('원본에서 읽는 중');

    const target = XS.settings.batchSize || 40;
    const maxSteps = 30;
    const startCount = XS.store.rows.length;
    let stagnantSteps = 0;

    try {
      for (let i = 0; i < maxSteps; i++) {
        if (XS.store.rows.length - startCount >= target) break;

        const y = window.scrollY;
        const baseline = XS.store.rows.length;

        window.scrollTo(0, y + window.innerHeight * 1.6);
        const added = await waitForNewRows(baseline, 700);

        if (added > 0) {
          XS.grid.onNewData();
          stagnantSteps = 0;
        } else {
          stagnantSteps++;
          // 더 내려갈 곳이 없거나, 여러 번 연속으로 빈손이면 그만한다.
          const atBottom = Math.abs(window.scrollY - y) < 4 &&
            window.innerHeight + window.scrollY >= document.body.scrollHeight - 10;
          if (atBottom || stagnantSteps >= 3) break;
        }
      }

      const gained = XS.store.rows.length - startCount;
      XS.ui.flash(gained > 0 ? '행 ' + gained + '개 더 불러왔습니다' : '더 읽어올 내용이 없습니다');
    } finally {
      pulling = false;
    }
  };

  /* ---------- 원본 감시 ---------- */

  const harvest = U.debounce(function () {
    const added = XS.scraper.collect();
    if (added) XS.grid.onNewData();
  }, 250);

  function startObserving() {
    if (observer) return;
    // 우리가 만든 표는 감시 대상에서 빼기 위해 X의 루트만 지켜본다.
    const target = document.getElementById('react-root') || document.body;
    observer = new MutationObserver(harvest);
    observer.observe(target, { childList: true, subtree: true });
  }

  function stopObserving() {
    if (!observer) return;
    observer.disconnect();
    observer = null;
  }

  /* ---------- 화면 붙이기 ---------- */

  function mount() {
    if (mounted) return;

    const kind = XS.scraper.pageKind();
    if (kind === 'other') return;   // 쪽지, 설정 화면은 원본 그대로 둔다.

    XS.store.reset(kind === 'notification' ? 'notification' : 'timeline', location.pathname);

    root = U.el('div', 'xs-root');
    root.id = 'x-sheets-root';

    XS.ui.build(root);
    const body = U.el('div', 'xs-body');
    root.appendChild(body);
    XS.ui.buildStatus(root);

    document.body.appendChild(root);
    document.documentElement.classList.add('xs-on-page');

    XS.grid.build(body, XS.store.kind);
    XS.ui.applySettings();

    mounted = true;
    hideToggle();

    XS.scraper.collect();
    XS.grid.rebuild();
    XS.grid.fillIfNeeded();
    startObserving();

    XS.grid.element().focus({ preventScroll: true });
  }

  function unmount() {
    stopObserving();
    if (root) { root.remove(); root = null; }
    document.documentElement.classList.remove('xs-on-page');
    mounted = false;
  }

  /* ---------- 켜고 끄기 ---------- */

  M.mount = mount;
  M.unmount = unmount;

  M.setEnabled = function (on) {
    XS.saveSettings({ enabled: on });
    if (on) { mount(); }
    else { unmount(); showToggle('표로 보기'); }
  };

  function showToggle(label) {
    if (toggleBtn) { toggleBtn.textContent = label; return; }
    toggleBtn = U.el('button', 'xs-floating', label);
    toggleBtn.type = 'button';
    toggleBtn.addEventListener('click', function () { M.setEnabled(true); });
    document.body.appendChild(toggleBtn);
  }

  function hideToggle() {
    if (toggleBtn) { toggleBtn.remove(); toggleBtn = null; }
  }

  M.refresh = function () {
    const kind = XS.scraper.pageKind();
    XS.store.reset(kind === 'notification' ? 'notification' : 'timeline', location.pathname);
    window.scrollTo(0, 0);
    XS.grid.setKind(XS.store.kind);
    XS.ui.updateTitle();
    XS.ui.setFindValue('');
    XS.grid.setQuery('');
    setTimeout(function () {
      XS.scraper.collect();
      XS.grid.onNewData();
      XS.grid.fillIfNeeded();
    }, 400);
  };

  /* ---------- 주소 변화 ---------- */

  // 콘텐츠 스크립트는 페이지 쪽 history 호출을 가로챌 수 없으므로 주소를 지켜본다.
  function watchNavigation() {
    const onChange = U.debounce(function () {
      if (!XS.settings.enabled) return;

      const kind = XS.scraper.pageKind();
      if (kind === 'other') { unmount(); hideToggle(); return; }
      if (!mounted) { mount(); return; }

      M.refresh();
    }, 350);

    function check() {
      const path = location.pathname + location.search;
      if (path === lastPath) return;
      lastPath = path;
      onChange();
    }

    setInterval(check, 400);
    window.addEventListener('popstate', check);
  }

  /* ---------- 설정 동기화 ---------- */

  function watchSettings() {
    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        const patch = {};
        Object.keys(changes).forEach(function (k) { patch[k] = changes[k].newValue; });
        const wasEnabled = XS.settings.enabled;
        Object.assign(XS.settings, patch);

        if ('enabled' in patch && patch.enabled !== wasEnabled) {
          if (patch.enabled) { hideToggle(); mount(); }
          else { unmount(); showToggle('표로 보기'); }
          return;
        }
        if (!mounted) return;
        XS.ui.applySettings();
        if ('media' in patch || 'promoted' in patch) XS.grid.rebuild();
      });
    } catch (e) { /* 무시 */ }
  }

  /* ---------- 시작 ---------- */

  async function start() {
    await XS.loadSettings();
    watchNavigation();
    watchSettings();

    if (XS.settings.enabled) {
      // X가 첫 화면을 그릴 때까지 잠깐 기다린다.
      let tries = 0;
      const timer = setInterval(function () {
        tries++;
        if (document.querySelector('article') || tries > 40) {
          clearInterval(timer);
          mount();
        }
      }, 250);
    } else {
      showToggle('표로 보기');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
