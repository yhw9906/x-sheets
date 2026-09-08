/* X Sheets - 좋아요, 리트윗, 인용 리트윗을 원본 페이지에서 직접 실행 */
(function () {
  'use strict';

  const XS = window.__XSHEETS__;
  const S = XS.scraper;

  const A = (XS.actions = {});

  const QUOTE_RE = /인용|quote/i;

  /* ---------- 도우미 ---------- */

  function likeBtn(article) {
    return article.querySelector('[data-testid="like"], [data-testid="unlike"]');
  }

  function retweetBtn(article) {
    return article.querySelector('[data-testid="retweet"], [data-testid="unretweet"]');
  }

  // 리트윗 버튼을 누르면 뜨는 확인 메뉴가 나타날 때까지 기다린다.
  function waitForMenuItems(timeoutMs) {
    return new Promise(function (resolve) {
      const read = function () { return Array.prototype.slice.call(document.querySelectorAll('[role="menuitem"]')); };
      let items = read();
      if (items.length) { resolve(items); return; }

      const ob = new MutationObserver(function () {
        items = read();
        if (items.length) { ob.disconnect(); resolve(items); }
      });
      ob.observe(document.body, { childList: true, subtree: true });

      setTimeout(function () { ob.disconnect(); resolve(read()); }, timeoutMs || 1500);
    });
  }

  function pickMenuItem(items, wantQuote) {
    if (!items.length) return null;
    if (items.length === 1) return items[0];
    if (wantQuote) return items.find(function (it) { return QUOTE_RE.test(it.textContent); }) || null;
    return items.find(function (it) { return !QUOTE_RE.test(it.textContent); }) || items[0];
  }

  function closeMenu() {
    document.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true
    }));
  }

  // 인용 작성창처럼 나중에 나타나는 요소를 기다린다.
  function waitForSelector(selector, timeoutMs) {
    return new Promise(function (resolve) {
      const read = function () { return document.querySelector(selector); };
      let el = read();
      if (el) { resolve(el); return; }

      const ob = new MutationObserver(function () {
        el = read();
        if (el) { ob.disconnect(); resolve(el); }
      });
      ob.observe(document.body, { childList: true, subtree: true });

      setTimeout(function () { ob.disconnect(); resolve(read()); }, timeoutMs || 2000);
    });
  }

  // 작성창(contenteditable)에 사람이 입력한 것과 같은 방식으로 글자를 넣는다.
  // React 계열 편집기는 값을 직접 바꾸는 걸 무시하므로 execCommand로 넣어야 한다.
  function insertComposerText(box, text) {
    box.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
  }

  function findArticle(row) {
    return S.findArticleById(row.tweetId || row.id);
  }

  function refreshRowState(row) {
    const article = findArticle(row);
    if (!article) return;
    const fresh = S.parseTweet(article);
    if (!fresh) return;
    row.reply = fresh.reply;
    row.repost = fresh.repost;
    row.like = fresh.like;
    row.view = fresh.view;
    row.liked = fresh.liked;
    row.retweeted = fresh.retweeted;
    XS.grid.refreshRow(row);
  }

  /* ---------- 좋아요 ---------- */

  A.toggleLike = function (row) {
    const article = findArticle(row);
    if (!article) { XS.ui.flash('원본 글을 찾을 수 없습니다 (화면에서 사라진 글입니다)'); return; }

    const btn = likeBtn(article);
    if (!btn) { XS.ui.flash('좋아요 버튼을 찾을 수 없습니다'); return; }

    const already = btn.getAttribute('data-testid') === 'unlike';
    btn.click();
    XS.ui.flash(already ? '좋아요를 취소했습니다' : '좋아요를 눌렀습니다');
    setTimeout(function () { refreshRowState(row); }, 350);
  };

  /* ---------- 리트윗 ---------- */

  A.toggleRetweet = function (row) {
    const article = findArticle(row);
    if (!article) { XS.ui.flash('원본 글을 찾을 수 없습니다 (화면에서 사라진 글입니다)'); return; }

    const btn = retweetBtn(article);
    if (!btn) { XS.ui.flash('리트윗 버튼을 찾을 수 없습니다'); return; }

    const already = btn.getAttribute('data-testid') === 'unretweet';
    btn.click();

    waitForMenuItems(1500).then(function (items) {
      const item = pickMenuItem(items, false);
      if (!item) { closeMenu(); XS.ui.flash('리트윗 확인 창을 찾지 못했습니다'); return; }
      item.click();
      XS.ui.flash(already ? '리트윗을 취소했습니다' : '리트윗했습니다');
      setTimeout(function () { refreshRowState(row); }, 400);
    });
  };

  /* ---------- X 검색 ---------- */

  // 시트가 화면 전체를 덮고 있어서 원본의 검색창을 직접 누를 수 없기 때문에,
  // 검색창을 찾아 대신 글자를 넣고 Enter를 눌러준다.
  A.searchOnX = function (query) {
    query = String(query || '').trim();
    if (!query) return;

    const input = document.querySelector('[data-testid="SearchBox_Search_Input"]');
    if (!input) {
      // 검색창을 못 찾으면(다른 화면이거나 구조가 바뀌었으면) 주소로 바로 이동한다.
      location.href = 'https://x.com/search?q=' + encodeURIComponent(query) + '&src=typed_query';
      return;
    }

    input.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, query);

    const enter = new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true
    });
    input.dispatchEvent(enter);
    XS.ui.flash('X에서 "' + query + '" 검색 중');
  };

  /* ---------- 인용 리트윗 ---------- */

  // 시트 안 작성창에서 쓴 글을 받아서, 원본 페이지의 인용 작성창을 열고
  // 대신 입력한 뒤 게시 버튼까지 눌러준다. 성공하면 true를 준다.
  A.quoteWithText = function (row, text) {
    const article = findArticle(row);
    if (!article) { XS.ui.flash('원본 글을 찾을 수 없습니다 (화면에서 사라진 글입니다)'); return Promise.resolve(false); }

    const btn = retweetBtn(article);
    if (!btn) { XS.ui.flash('리트윗 버튼을 찾을 수 없습니다'); return Promise.resolve(false); }

    btn.click();

    return waitForMenuItems(1500).then(function (items) {
      const item = pickMenuItem(items, true);
      if (!item) { closeMenu(); XS.ui.flash('인용 메뉴를 찾지 못했습니다'); return false; }
      item.click();

      return waitForSelector('[data-testid="tweetTextarea_0"]', 2000).then(function (box) {
        if (!box) {
          XS.ui.flash('작성창을 찾지 못했습니다. 원본에서 직접 완료해 주세요');
          return false;
        }

        insertComposerText(box, text);

        return new Promise(function (resolve) {
          setTimeout(function () {
            const dialog = box.closest('[role="dialog"]') || document;
            const postBtn = dialog.querySelector('[data-testid="tweetButton"]');
            if (!postBtn || postBtn.disabled || postBtn.getAttribute('aria-disabled') === 'true') {
              XS.ui.flash('게시 버튼을 찾지 못했습니다. 작성창에서 직접 게시해 주세요');
              resolve(false);
              return;
            }
            postBtn.click();
            XS.ui.flash('인용 리트윗을 게시했습니다');
            setTimeout(function () { refreshRowState(row); }, 600);
            resolve(true);
          }, 200);
        });
      });
    });
  };
})();
