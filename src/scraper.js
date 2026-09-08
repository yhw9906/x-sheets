/* X Sheets - 원본 페이지 DOM에서 데이터 추출 */
(function () {
  'use strict';

  const XS = window.__XSHEETS__;
  const U = XS.util;

  const S = (XS.scraper = {});

  /* ---------- 페이지 종류 판별 ---------- */

  S.pageKind = function () {
    const p = location.pathname;
    if (/^\/(notifications)/.test(p)) return 'notification';
    if (/^\/(messages)/.test(p)) return 'other';
    if (/^\/(settings|i\/)/.test(p)) return 'other';
    return 'timeline';
  };

  S.pageTitle = function () {
    const p = location.pathname;
    if (p === '/' || p === '/home') return S.activeTabLabel() || '홈';
    if (p.startsWith('/notifications')) return '알림';
    if (p.startsWith('/explore')) return '탐색';
    if (p.startsWith('/search')) return '검색';
    if (p.startsWith('/messages')) return '쪽지';
    if (p.startsWith('/i/bookmarks') || p.startsWith('/bookmarks')) return '북마크';
    if (/^\/[^/]+\/status\/\d+/.test(p)) return '게시물';
    if (/^\/[^/]+\/?$/.test(p)) return p.replace(/\//g, '') || '프로필';
    return p.replace(/^\//, '') || '시트';
  };

  /* ---------- 홈 화면의 추천/팔로우 중 탭 ---------- */

  // 프로필의 게시물/답글/미디어 탭 등과 헷갈리지 않도록 홈 화면에서만 읽는다.
  function homeTabs() {
    const p = location.pathname;
    if (p !== '/' && p !== '/home') return [];
    return Array.prototype.slice.call(document.querySelectorAll('[role="tablist"] [role="tab"]'));
  }

  S.timelineTabs = function () {
    return homeTabs().map(function (t) { return U.oneLine(U.text(t)); }).filter(Boolean);
  };

  S.activeTabLabel = function () {
    const tabs = homeTabs();
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i].getAttribute('aria-selected') === 'true') return U.oneLine(U.text(tabs[i]));
    }
    return '';
  };

  S.clickTab = function (label) {
    const tabs = homeTabs();
    for (let i = 0; i < tabs.length; i++) {
      if (U.oneLine(U.text(tabs[i])) === label) { tabs[i].click(); return true; }
    }
    return false;
  };

  // 시트를 구분하는 열쇠. 홈 화면은 추천/팔로우 중 탭까지 포함해서 서로 다른 시트로 다룬다.
  S.sheetKey = function () {
    const p = location.pathname;
    if (p === '/' || p === '/home') {
      const tab = S.activeTabLabel();
      return tab ? '/home#' + tab : '/home';
    }
    return p + location.search;
  };

  /* ---------- 부분 추출기 ---------- */

  function relative(href) {
    if (!href) return '';
    if (href.charAt(0) === '/') return href;
    try { return new URL(href, location.origin).pathname; } catch (e) { return ''; }
  }

  function permalink(article) {
    const t = article.querySelector('time');
    const a = t && t.closest('a[href*="/status/"]');
    const href = a ? relative(a.getAttribute('href')) : '';
    if (href) return href;
    const any = article.querySelector('a[href*="/status/"]');
    return any ? relative(any.getAttribute('href')) : '';
  }

  function metric(article, testid) {
    const btn = article.querySelector('[data-testid="' + testid + '"]');
    if (!btn) return '';
    const v = U.oneLine(U.text(btn));
    return v || '0';
  }

  function views(article) {
    const a = article.querySelector('a[href$="/analytics"]');
    if (a) return U.oneLine(U.text(a)) || '0';
    const group = article.querySelector('[role="group"]');
    const label = group && group.getAttribute('aria-label');
    if (label) {
      const m = label.match(/([\d.,]+)\s*(조회|views)/i);
      if (m) return m[1];
    }
    return '';
  }

  function mediaInfo(article) {
    const photos = article.querySelectorAll('[data-testid="tweetPhoto"] img');
    const players = article.querySelectorAll('[data-testid="videoPlayer"] video, video');
    const hasCard = !!article.querySelector('[data-testid="card.wrapper"]');

    const thumbs = [];
    photos.forEach(function (img) {
      const src = img.getAttribute('src');
      if (src) thumbs.push(src);
    });

    // 움짤/동영상 재생 주소. blob: 주소는 원래 재생기에서만 쓸 수 있어 우리 칸에서는 못 쓴다.
    const clips = [];
    players.forEach(function (video) {
      const poster = video.getAttribute('poster') || '';
      let src = video.currentSrc || video.getAttribute('src') || '';
      if (!src) {
        const source = video.querySelector('source');
        if (source) src = source.getAttribute('src') || '';
      }
      if (/^blob:/i.test(src)) src = '';
      if (src || poster) clips.push({ src: src, poster: poster });
    });

    const parts = [];
    if (photos.length) parts.push('사진 ' + photos.length);
    if (clips.length) parts.push('동영상');
    if (hasCard && !photos.length && !clips.length) parts.push('링크');

    return { label: parts.join(', '), thumbs: thumbs.slice(0, 4), clips: clips.slice(0, 4) };
  }

  function avatar(article) {
    const img = article.querySelector('[data-testid^="UserAvatar-Container"] img, [data-testid="Tweet-User-Avatar"] img');
    return img ? img.getAttribute('src') : '';
  }

  // 좋아요/리트윗 버튼은 눌린 상태일 때 testid가 unlike/unretweet로 바뀐다.
  function actionState(article) {
    const likeBtn = article.querySelector('[data-testid="like"], [data-testid="unlike"]');
    const rtBtn = article.querySelector('[data-testid="retweet"], [data-testid="unretweet"]');
    return {
      liked: !!(likeBtn && likeBtn.getAttribute('data-testid') === 'unlike'),
      retweeted: !!(rtBtn && rtBtn.getAttribute('data-testid') === 'unretweet')
    };
  }

  // 프로모션(광고) 게시물은 리트윗 표시 자리에 "프로모션"이라는 문구가 대신 뜬다.
  // "프로모션"이라고 뜨는 것과 "광고"라고만 짧게 뜨는 것 둘 다 잡는다.
  const PROMOTED_RE = /프로모션|광고|promoted|\bad\b/i;

  function isPromoted(article) {
    if (article.querySelector('[data-testid="promotedIndicator"]')) return true;
    const social = article.querySelector('[data-testid="socialContext"]');
    if (social && PROMOTED_RE.test(U.text(social))) return true;
    return false;
  }

  // 비공개(잠금) 계정은 이름 옆에 자물쇠 아이콘이 붙는다.
  function isProtected(article) {
    if (article.querySelector('[data-testid="icon-lock"]')) return true;
    const nameBlock = article.querySelector('[data-testid="User-Name"]') || article;
    const svgs = nameBlock.querySelectorAll('svg[aria-label]');
    for (let i = 0; i < svgs.length; i++) {
      const label = svgs[i].getAttribute('aria-label') || '';
      if (/protected|비공개/i.test(label)) return true;
    }
    return false;
  }

  /* ---------- 게시물 한 건 ---------- */

  S.parseTweet = function (article) {
    const href = permalink(article);
    const m = href && href.match(/^\/([^/]+)\/status\/(\d+)/);
    if (!m) return null;

    const handle = '@' + m[1];
    const id = m[2];

    const nameBlock = article.querySelector('[data-testid="User-Name"]');
    let name = '';
    if (nameBlock) {
      const first = nameBlock.querySelector('a[role="link"] span');
      name = U.oneLine(U.text(first)) || U.oneLine(U.text(nameBlock).split('\n')[0]);
    }

    const texts = article.querySelectorAll('[data-testid="tweetText"]');
    const body = texts.length ? U.text(texts[0]) : '';
    const quote = texts.length > 1 ? U.text(texts[1]) : '';

    const timeEl = article.querySelector('time');
    const iso = timeEl ? timeEl.getAttribute('datetime') : '';
    const rel = U.oneLine(U.text(timeEl));

    const social = article.querySelector('[data-testid="socialContext"]');
    const media = mediaInfo(article);
    const state = actionState(article);

    return {
      id: id,
      tweetId: id,
      kind: 'timeline',
      name: name,
      handle: handle,
      text: body,
      quote: quote,
      context: U.oneLine(U.text(social)),
      iso: iso,
      time: iso ? U.formatDate(iso) : rel,
      rel: rel,
      reply: metric(article, 'reply'),
      repost: metric(article, 'retweet') || metric(article, 'unretweet'),
      like: metric(article, 'like') || metric(article, 'unlike'),
      view: views(article),
      liked: state.liked,
      retweeted: state.retweeted,
      promoted: isPromoted(article),
      protected: isProtected(article),
      media: media.label,
      thumbs: media.thumbs,
      clips: media.clips,
      avatar: avatar(article),
      url: 'https://x.com' + href
    };
  };

  // 우클릭 메뉴에서 실제 동작 버튼을 찾을 때 쓴다. 시트는 오래 전에 읽은 글도
  // 계속 들고 있지만, 실제 페이지는 화면에서 멀어진 글의 DOM을 지워버리므로
  // 매번 새로 찾는다.
  S.findArticleById = function (tweetId) {
    if (!tweetId) return null;
    const arts = document.querySelectorAll('article[data-testid="tweet"]');
    for (let i = 0; i < arts.length; i++) {
      const href = permalink(arts[i]);
      const m = href && href.match(/\/status\/(\d+)/);
      if (m && m[1] === tweetId) return arts[i];
    }
    return null;
  };

  /* ---------- 알림 한 건 ---------- */

  S.parseNotification = function (article) {
    const full = U.text(article);
    if (!full) return null;

    const lines = full.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);

    // 알림 문장은 보통 첫 줄, 인용된 본문은 그 뒤에 온다.
    const head = lines[0] || '';
    const rest = lines.slice(1).join('\n');

    const actorLinks = article.querySelectorAll('a[role="link"][href^="/"]:not([href*="/status/"])');
    const actors = [];
    actorLinks.forEach(function (a) {
      const t = U.oneLine(U.text(a));
      if (t && actors.indexOf(t) === -1) actors.push(t);
    });

    const timeEl = article.querySelector('time');
    const iso = timeEl ? timeEl.getAttribute('datetime') : '';
    const rel = U.oneLine(U.text(timeEl));

    const link = article.querySelector('a[href*="/status/"]');
    const href = link ? relative(link.getAttribute('href')) : '';

    const media = mediaInfo(article);

    // 같은 문구가 반복될 수 있으므로 내용 기반 키를 만든다.
    const id = 'n:' + (href || '') + ':' + head.slice(0, 80) + ':' + rest.slice(0, 40);

    return {
      id: id,
      kind: 'notification',
      name: actors[0] || '',
      actors: actors.join(', '),
      text: head,
      quote: rest,
      iso: iso,
      time: iso ? U.formatDate(iso) : rel,
      rel: rel,
      media: media.label,
      thumbs: media.thumbs,
      clips: media.clips,
      avatar: avatar(article),
      url: href ? 'https://x.com' + href : ''
    };
  };

  /* ---------- 화면 전체 훑기 ---------- */

  S.collect = function () {
    const kind = XS.store.kind;
    let added = 0;

    if (kind === 'notification') {
      document.querySelectorAll('article[data-testid="notification"]').forEach(function (a) {
        const row = S.parseNotification(a);
        if (row && XS.store.add(row)) added++;
      });
      // 알림 화면에도 일반 게시물 카드가 섞여 나온다.
      document.querySelectorAll('article[data-testid="tweet"]').forEach(function (a) {
        const t = S.parseTweet(a);
        if (!t) return;
        const row = {
          id: 'n:' + t.id,
          tweetId: t.id,
          kind: 'notification',
          name: t.name,
          actors: t.name + ' ' + t.handle,
          text: t.text,
          quote: t.quote,
          iso: t.iso,
          time: t.time,
          rel: t.rel,
          liked: t.liked,
          retweeted: t.retweeted,
          promoted: t.promoted,
          protected: t.protected,
          media: t.media,
          thumbs: t.thumbs,
          clips: t.clips,
          avatar: t.avatar,
          url: t.url
        };
        if (XS.store.add(row)) added++;
      });
    } else {
      document.querySelectorAll('article[data-testid="tweet"]').forEach(function (a) {
        const row = S.parseTweet(a);
        if (row && XS.store.add(row)) added++;
      });
    }

    return added;
  };
})();
