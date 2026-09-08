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
    if (p === '/' || p === '/home') return '홈';
    if (p.startsWith('/notifications')) return '알림';
    if (p.startsWith('/explore')) return '탐색';
    if (p.startsWith('/search')) return '검색';
    if (p.startsWith('/messages')) return '쪽지';
    if (p.startsWith('/i/bookmarks') || p.startsWith('/bookmarks')) return '북마크';
    if (/^\/[^/]+\/status\/\d+/.test(p)) return '게시물';
    if (/^\/[^/]+\/?$/.test(p)) return p.replace(/\//g, '') || '프로필';
    return p.replace(/^\//, '') || '시트';
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
    const hasVideo = !!article.querySelector('[data-testid="videoPlayer"], video');
    const hasCard = !!article.querySelector('[data-testid="card.wrapper"]');
    const thumbs = [];
    photos.forEach(function (img) {
      const src = img.getAttribute('src');
      if (src) thumbs.push(src);
    });
    const parts = [];
    if (photos.length) parts.push('사진 ' + photos.length);
    if (hasVideo) parts.push('동영상');
    if (hasCard && !photos.length && !hasVideo) parts.push('링크');
    return { label: parts.join(', '), thumbs: thumbs.slice(0, 4) };
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
      media: media.label,
      thumbs: media.thumbs,
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
          media: t.media,
          thumbs: t.thumbs,
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
