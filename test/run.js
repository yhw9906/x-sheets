/* X Sheets - jsdom 검사
 * 쓰는 법: npm install jsdom  ->  node test/run.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const EXT = path.join(__dirname, '..');

function tweet(i, opts) {
  opts = opts || {};
  const socialLine = opts.promoted
    ? '<div data-testid="socialContext">프로모션</div>'
    : opts.ad
      ? '<div data-testid="socialContext">광고</div>'
      : '';
  const lockIcon = opts.protected
    ? '<svg aria-label="비공개 계정"></svg>'
    : '';
  const quoteBlock = opts.quote
    ? `<div class="quote-card">
        <div data-testid="User-Name"><a role="link" href="/quoteduser${i}"><span>인용대상 ${i}</span></a></div>
        <a href="/quoteduser${i}/status/${5000 + i}"><time datetime="2026-09-0${(i % 8) + 1}T10:00:00.000Z">인용시간</time></a>
        <div data-testid="tweetText">${opts.quote}</div>
        ${opts.quotePhoto ? `<div data-testid="tweetPhoto"><img src="${opts.quotePhoto}"></div>` : ''}
      </div>`
    : '';
  const videoBlock = opts.video
    ? `<div data-testid="videoPlayer"><video src="${opts.video.src || ''}" poster="${opts.video.poster || ''}"></video></div>`
    : '';
  return `
  <article data-testid="tweet">
    <div data-testid="Tweet-User-Avatar"><img src="https://pbs.example/av${i}.jpg"></div>
    <div data-testid="User-Name">
      <a role="link" href="/user${i}"><span>사용자 ${i}</span></a>
      ${lockIcon}
      <a href="/user${i}/status/${1000 + i}"><time datetime="2026-09-0${(i % 8) + 1}T12:3${i % 10}:00.000Z">${i}시간</time></a>
    </div>
    ${socialLine}
    <div data-testid="tweetText">첫째 줄 ${i}\n둘째 줄 내용입니다.</div>
    ${quoteBlock}
    <div data-testid="tweetPhoto"><img src="https://pbs.example/p${i}.jpg"></div>
    ${videoBlock}
    <div role="group" aria-label="12 답글, 34 리트윗, 56 마음, 7890 조회">
      <button data-testid="reply"><span>12</span></button>
      <button data-testid="retweet"><span>3.4만</span></button>
      <button data-testid="like"><span>56</span></button>
      <a href="/user${i}/status/${1000 + i}/analytics"><span>7,890</span></a>
    </div>
  </article>`;
}

const html = `<!doctype html><html><head></head><body>
  <div id="react-root">${Array.from({ length: 12 }, (_, i) => tweet(i + 1)).join('')}</div>
</body></html>`;

const dom = new JSDOM(html, {
  url: 'https://x.com/home',
  pretendToBeVisual: true,
  runScripts: 'outside-only'
});

const { window } = dom;

// 브라우저 기능 대역
const stored = {};
window.chrome = {
  storage: {
    local: {
      get(defaults, cb) {
        if (Array.isArray(defaults)) {
          const out = {};
          defaults.forEach(function (k) { if (k in stored) out[k] = stored[k]; });
          cb(out);
        } else {
          cb(Object.assign({}, defaults, stored));
        }
      },
      set(patch) { Object.assign(stored, patch); }
    },
    onChanged: { addListener() {} }
  },
  runtime: {
    lastError: null,
    getManifest() { return { version: '1.3.0' }; }
  }
};
window.IntersectionObserver = class {
  observe() {} disconnect() {} unobserve() {}
};
window.scrollTo = () => {};
window.navigator.clipboard = { writeText: () => Promise.resolve() };
window.fetch = function () { return Promise.reject(new Error('오프라인 - 테스트 기본값')); };

for (const f of ['core.js', 'update.js', 'scraper.js', 'actions.js', 'grid.js', 'chrome-ui.js', 'main.js']) {
  try {
    window.eval(fs.readFileSync(path.join(EXT, 'src', f), 'utf8'));
  } catch (e) {
    console.error('실행 실패: ' + f + ' - ' + e.message);
    process.exit(1);
  }
}

const fails = [];
function check(name, cond, extra) {
  if (cond) console.log('  OK   ' + name);
  else { console.log('  FAIL ' + name + (extra ? '  ' + extra : '')); fails.push(name); }
}

setTimeout(async () => {
  const XS = window.__XSHEETS__;
  const doc = window.document;

  console.log('\n[1] 데이터 추출');
  check('12개 글을 읽었다', XS.store.rows.length === 12, '실제 ' + XS.store.rows.length);
  const r = XS.store.rows[0];
  check('작성자', r && r.name === '사용자 1', JSON.stringify(r && r.name));
  check('계정', r && r.handle === '@user1', JSON.stringify(r && r.handle));
  check('본문 두 줄', r && r.text.includes('첫째 줄 1') && r.text.includes('둘째 줄'));
  check('답글 수', r && r.reply === '12');
  check('재게시 수', r && r.repost === '3.4만');
  check('조회 수', r && r.view === '7,890');
  check('미디어', r && r.media === '사진 1');
  check('링크', r && r.url === 'https://x.com/user1/status/1001');
  check('시간 형식', r && /^\d{2}-\d{2} \d{2}:\d{2}$/.test(r.time), JSON.stringify(r && r.time));
  check('중복 없음', new Set(XS.store.rows.map(x => x.id)).size === 12);

  console.log('\n[2] 화면 구성');
  const root = doc.getElementById('x-sheets-root');
  check('시트 화면이 붙었다', !!root);
  check('제목이 홈', root && root.querySelector('.xs-docname').textContent === '홈');
  check('메뉴 7개(글쓰기 포함)', root && root.querySelectorAll('.xs-menu').length === 7);
  const heads = root ? root.querySelectorAll('.xs-colhead') : [];
  check('열 머리글 19개', heads.length === 19, '실제 ' + heads.length);
  check('A열이 작성자', heads[0] && heads[0].textContent.includes('A') && heads[0].textContent.includes('작성자'));
  check('J열 문자', heads[9] && heads[9].querySelector('.xs-colletter').textContent === 'J');
  check('행 12개', root && root.querySelectorAll('.xs-rowline').length === 12);
  check('행 번호 1부터', root && root.querySelector('.xs-rowhead').textContent === '1');
  const cells = root ? root.querySelectorAll('.xs-rowline .xs-cell').length : 0;
  check('칸 수 12x19', cells === 12 * 19, '실제 ' + cells);
  check('이미지 기본 숨김', root && root.querySelectorAll('.xs-thumb').length === 0);

  console.log('\n[3] 선택과 수식 입력줄');
  XS.grid.select(2, 2, false);
  check('이름 상자 C3', root.querySelector('.xs-namebox').textContent === 'C3');
  check('수식줄에 본문', root.querySelector('.xs-formula').textContent.includes('첫째 줄 3'));
  check('선택 칸 표시', root.querySelectorAll('.xs-cell.xs-active').length === 1);

  console.log('\n[4] 정렬');
  XS.grid.sort = { key: 'like', dir: -1 };
  XS.grid.rebuild();
  check('정렬 후에도 12행', XS.grid.view.length === 12);
  XS.grid.sort = { key: 'name', dir: 1 };
  XS.grid.rebuild();
  check('이름 오름차순 첫 행', XS.grid.view[0].name === '사용자 1', XS.grid.view[0].name);
  XS.grid.clearSort();

  console.log('\n[5] 찾기');
  XS.grid.setQuery('첫째 줄 5');
  check('한 행만 남는다', XS.grid.view.length === 1, '실제 ' + XS.grid.view.length);
  check('상태줄에 표시 수', root.querySelector('.xs-statusleft').textContent.includes('표시 1개'));
  XS.grid.setQuery('');
  check('되돌리면 12행', XS.grid.view.length === 12);

  console.log('\n[6] 복사와 CSV');
  XS.grid.sel = { r: 0, c: 0, r2: 1, c2: 1 };
  const tsv = XS.grid.selectionText();
  check('탭 구분 2행 2열', tsv.split('\n').length === 2 && tsv.split('\n')[0].split('\t').length === 2);
  const csv = XS.grid.toCsv();
  check('CSV 머리글', csv.split('\r\n')[0].includes('"작성자","계정","내용"'));
  check('CSV BOM', csv.charCodeAt(0) === 0xFEFF);
  check('CSV 13줄', csv.split('\r\n').length === 13, '실제 ' + csv.split('\r\n').length);

  console.log('\n[7] 설정 반영');
  XS.saveSettings({ media: 'small' });
  XS.grid.rebuild();
  check('아주 작은 이미지 표시', root.querySelectorAll('.xs-thumb').length > 0);
  XS.saveSettings({ media: 'hide' });
  XS.grid.rebuild();
  check('다시 숨김', root.querySelectorAll('.xs-thumb').length === 0);
  XS.saveSettings({ wrap: false });
  XS.ui.applySettings();
  check('줄바꿈 끄기 반영', root.querySelector('.xs-sheet').classList.contains('xs-nowrap'));

  console.log('\n[8] 새 글이 들어올 때');
  doc.getElementById('react-root').insertAdjacentHTML('beforeend', tweet(99));
  check('새 글 1개 추가', XS.scraper.collect() === 1);
  XS.grid.onNewData();
  check('전체 13행', XS.store.rows.length === 13);

  console.log('\n[9] 실행 메뉴 - 좋아요, 리트윗, 인용');
  const targetRow = XS.store.rows.find(x => x.tweetId === '1001');
  const art = XS.scraper.findArticleById('1001');
  check('대상 글을 찾았다', !!art);

  // X의 실제 버튼 동작을 흉내낸다: 좋아요는 testid를 바로 바꾸고,
  // 리트윗은 확인 메뉴(role=menuitem)를 띄운 뒤 고른 항목에 따라 처리한다.
  const lBtn = art.querySelector('[data-testid="like"]');
  lBtn.addEventListener('click', function () {
    lBtn.setAttribute('data-testid', lBtn.getAttribute('data-testid') === 'like' ? 'unlike' : 'like');
  });
  const rBtn = art.querySelector('[data-testid="retweet"]');
  rBtn.addEventListener('click', function () {
    if (doc.querySelector('[role="menuitem"]')) return;
    const isRT = rBtn.getAttribute('data-testid') === 'unretweet';
    const menu = doc.createElement('div');
    menu.innerHTML = '<div role="menuitem">' + (isRT ? '실행 취소' : '리트윗') + '</div><div role="menuitem">인용</div>';
    doc.body.appendChild(menu);
    Array.prototype.forEach.call(menu.querySelectorAll('[role="menuitem"]'), function (mi) {
      mi.addEventListener('click', function () {
        menu.remove();
        if (/인용/.test(mi.textContent)) {
          // X의 인용 작성창을 흉내낸다.
          const dialog = doc.createElement('div');
          dialog.setAttribute('role', 'dialog');
          const editBox = doc.createElement('div');
          editBox.setAttribute('data-testid', 'tweetTextarea_0');
          editBox.contentEditable = 'true';
          editBox.tabIndex = 0; // 실제 X 작성창처럼 포커스 가능하게 (jsdom은 이게 없으면 focus가 안 먹는다)
          dialog.appendChild(editBox);
          const postBtn = doc.createElement('button');
          postBtn.setAttribute('data-testid', 'tweetButton');
          postBtn.textContent = '게시하기';
          postBtn.addEventListener('click', function () {
            window.__posted = editBox.textContent;
            dialog.remove();
          });
          dialog.appendChild(postBtn);
          doc.body.appendChild(dialog);
        } else {
          rBtn.setAttribute('data-testid', isRT ? 'retweet' : 'unretweet');
        }
      });
    });
  });

  // jsdom은 execCommand를 구현하지 않으므로, 실제 브라우저의 삽입 동작을 흉내낸다.
  // (입력칸이면 value에, contenteditable이면 textContent에 넣는다)
  window.document.execCommand = function (cmd, ui, value) {
    if (cmd === 'insertText') {
      const el = doc.activeElement;
      if (el) {
        if ('value' in el) el.value = (el.value || '') + value;
        else el.textContent = (el.textContent || '') + value;
        el.dispatchEvent(new window.Event('input', { bubbles: true }));
      }
    }
    return true;
  };

  XS.actions.toggleLike(targetRow);
  check('좋아요 버튼이 눌렸다', lBtn.getAttribute('data-testid') === 'unlike');
  check('좋아요 알림 문구', root.querySelector('.xs-statusright').textContent.includes('좋아요를 눌렀'));

  XS.actions.toggleRetweet(targetRow);
  await XS.util.wait(60);
  check('리트윗 버튼이 눌렸다', rBtn.getAttribute('data-testid') === 'unretweet');
  check('확인 메뉴가 닫혔다', !doc.querySelector('[role="menuitem"]'));

  await XS.util.wait(450);
  check('행에 좋아요 상태 반영', targetRow.liked === true);
  check('행에 리트윗 상태 반영', targetRow.retweeted === true);
  check('내 반응 열에 표시', XS.grid.valueOf(targetRow, { key: 'state' }) === '좋아요 · 리트윗');

  console.log('\n[9-1] 시트 안에서 인용 리트윗 작성');
  XS.ui.showQuoteComposer(targetRow, function (text) {
    return XS.actions.quoteWithText(targetRow, text);
  });
  check('작성창이 떴다', !!root.querySelector('.xs-modal-overlay'));
  check('원본 글 요약 표시', root.querySelector('.xs-modal-quoted-text').textContent.includes('첫째 줄 1'));

  const ta = root.querySelector('.xs-modal-textarea');
  ta.value = '테스트 코멘트입니다';
  ta.dispatchEvent(new window.Event('input', { bubbles: true }));
  check('글자 수 표시', root.querySelector('.xs-modal-counter').textContent === ta.value.length + ' / 280');

  root.querySelector('.xs-modal-actions .xs-btn-primary').click();
  await XS.util.wait(500);

  check('실제 작성창에 글이 들어갔다', window.__posted === '테스트 코멘트입니다');
  check('게시 완료 알림', root.querySelector('.xs-statusright').textContent.includes('게시했습니다'));
  check('작성창이 닫혔다', !root.querySelector('.xs-modal-overlay'));
  check('리트윗 상태는 그대로', rBtn.getAttribute('data-testid') === 'unretweet');

  console.log('\n[10] 사라진 글 처리');
  const ghostRow = { id: '999999', tweetId: '999999' };
  XS.actions.toggleLike(ghostRow);
  check('없는 글은 안내 문구만 표시', root.querySelector('.xs-statusright').textContent.includes('찾을 수 없습니다'));

  console.log('\n[11] 알림 화면 전환');
  XS.grid.setKind('notification');
  check('알림 열 6개', XS.grid.cols.length === 6);
  check('열 머리글 14개', root.querySelectorAll('.xs-colhead').length === 14);

  console.log('\n[12] 숫자 변환');
  const T = XS.util.toNumber;
  check('3.4만 = 34000', T('3.4만') === 34000);
  check('7,890 = 7890', T('7,890') === 7890);
  check('1.2K = 1200', T('1.2K') === 1200);
  check('빈값 = 0', T('') === 0);

  console.log('\n[13] 프로모션/광고 게시물, 비공개 계정 표시');
  doc.getElementById('react-root').insertAdjacentHTML('beforeend', tweet(900, { promoted: true }));
  doc.getElementById('react-root').insertAdjacentHTML('beforeend', tweet(901, { protected: true }));
  doc.getElementById('react-root').insertAdjacentHTML('beforeend', tweet(902, { ad: true }));
  const addedFlagged = XS.scraper.collect();
  check('광고글, 비공개글 추가', addedFlagged === 3, '실제 ' + addedFlagged);

  const promoRow = XS.store.rows.find(function (r) { return r.tweetId === '1900'; });
  const protRow = XS.store.rows.find(function (r) { return r.tweetId === '1901'; });
  const adRow = XS.store.rows.find(function (r) { return r.tweetId === '1902'; });
  check('프로모션 감지', !!promoRow && promoRow.promoted === true);
  check('일반 글은 프로모션 아님', !!targetRow && targetRow.promoted === false);
  check('비공개 계정 감지', !!protRow && protRow.protected === true);
  check('"광고"라고만 떠도 감지됨', !!adRow && adRow.promoted === true);

  XS.saveSettings({ promoted: 'gray' });
  XS.grid.rebuild();
  check('회색 처리 클래스가 붙는다', root.querySelectorAll('.xs-rowline .xs-promoted').length > 0);

  XS.saveSettings({ promoted: 'hide' });
  XS.grid.rebuild();
  check('제외 모드에서는 화면에서 빠진다', !XS.grid.view.some(function (r) { return r.promoted; }));
  check('저장소에는 그대로 남아있다', XS.store.rows.some(function (r) { return r.promoted; }));

  XS.saveSettings({ promoted: 'show' });
  XS.grid.rebuild();
  check('그대로 보기로 되돌리면 다시 보인다', XS.grid.view.some(function (r) { return r.promoted; }));
  check('비공개 계정 이름 칸에 표시 클래스', root.querySelectorAll('.xs-protected-cell').length > 0);

  console.log('\n[14] 더 불러오기 - 속도와 개수');
  Object.defineProperty(doc.body, 'scrollHeight', { value: 200000, configurable: true });
  window.scrollTo = function (x, y) { window.scrollY = y; };
  window.scrollY = 0;
  XS.saveSettings({ batchSize: 10, autoLoad: true });

  const beforePull = XS.store.rows.length;
  let batch = 0;
  const feeder = setInterval(function () {
    batch++;
    if (batch > 3) { clearInterval(feeder); return; }
    const frag = Array.from({ length: 5 }, function (_, k) { return tweet(2000 + batch * 10 + k); }).join('');
    doc.getElementById('react-root').insertAdjacentHTML('beforeend', frag);
  }, 120);

  const t0 = Date.now();
  await XS.loader.pull(true);
  const elapsed = Date.now() - t0;
  clearInterval(feeder);

  const gainedPull = XS.store.rows.length - beforePull;
  check('목표 개수(10개) 이상 모았다', gainedPull >= 10, '실제 ' + gainedPull);
  check('과도하게 다 긁어오지 않고 목표 근처에서 멈췄다', gainedPull < 20, '실제 ' + gainedPull);
  check('고정 대기 없이 빠르게 끝났다', elapsed < 5000, elapsed + 'ms');

  console.log('\n[15] 인용 트윗 표시');
  XS.saveSettings({ tweetMedia: 'small' });
  doc.getElementById('react-root').insertAdjacentHTML('beforeend',
    tweet(950, { quote: '이건 인용된 원본 트윗입니다.', quotePhoto: 'https://pbs.example/quoted950.jpg' }));
  XS.scraper.collect();
  XS.grid.rebuild();

  const qRow = XS.store.rows.find(function (r) { return r.tweetId === '1950'; });
  check('인용된 글의 본문이 저장된다', !!qRow && !!qRow.quoted && qRow.quoted.text === '이건 인용된 원본 트윗입니다.');
  check('인용된 글의 작성자가 저장된다', !!qRow && qRow.quoted.name === '인용대상 950');
  check('인용된 글의 계정이 저장된다', !!qRow && qRow.quoted.handle === '@quoteduser950');
  check('인용된 글의 링크가 저장된다', !!qRow && qRow.quoted.url === 'https://x.com/quoteduser950/status/5950');
  check('인용된 글의 미디어가 저장된다', !!qRow && qRow.quoted.thumbs.length === 1 &&
    qRow.quoted.thumbs[0] === 'https://pbs.example/quoted950.jpg');
  check('바깥 글 자신의 미디어와는 안 섞인다', qRow.thumbs.length === 1 &&
    qRow.thumbs[0] === 'https://pbs.example/p950.jpg');

  const qIdx = XS.grid.view.indexOf(qRow);
  const textColIdx = XS.grid.cols.findIndex(function (c) { return c.key === 'text'; });
  const qCell = qIdx !== -1 ? XS.grid.cellEls[qIdx][textColIdx] : null;
  check('본문 줄이 따로 있다', !!qCell && !!qCell.querySelector('.xs-linebody'));
  check('인용 영역이 별도로 표시된다', !!qCell && !!qCell.querySelector('.xs-linequote'));
  check('인용한 사람 정보가 표시된다', !!qCell &&
    qCell.querySelector('.xs-quotemeta').textContent.includes('인용대상 950') &&
    qCell.querySelector('.xs-quotemeta').textContent.includes('@quoteduser950'));
  check('인용문 내용이 일치한다', !!qCell &&
    qCell.querySelector('.xs-quotebody').textContent === '이건 인용된 원본 트윗입니다.');
  check('인용 안의 이미지도 보인다', !!qCell && !!qCell.querySelector('.xs-quotemedia img.xs-prevtile'));

  XS.saveSettings({ tweetMedia: 'hide' });
  XS.grid.rebuild();
  const qCellHidden = XS.grid.cellEls[XS.grid.view.indexOf(qRow)][textColIdx];
  check('미디어 숨김 설정이면 인용 안 이미지도 숨겨진다', !qCellHidden.querySelector('.xs-quotemedia'));
  check('인용문 자체는 미디어 설정과 무관하게 계속 보인다', !!qCellHidden.querySelector('.xs-quotebody'));

  console.log('\n[16] 추천/팔로우 중 시트 탭');
  const tablist = doc.createElement('div');
  tablist.setAttribute('role', 'tablist');
  tablist.innerHTML =
    '<div role="tab" aria-selected="true"><span>추천</span></div>' +
    '<div role="tab" aria-selected="false"><span>팔로우 중</span></div>';
  doc.body.appendChild(tablist);

  const tabEls = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
  tabEls.forEach(function (t) {
    t.addEventListener('click', function () {
      tabEls.forEach(function (o) { o.setAttribute('aria-selected', o === t ? 'true' : 'false'); });
    });
  });

  check('탭 2개 인식', XS.scraper.timelineTabs().length === 2);
  check('활성 탭은 추천', XS.scraper.activeTabLabel() === '추천');
  check('시트 열쇠에 탭 이름 포함', XS.scraper.sheetKey() === '/home#추천');

  // 지금까지는 store.key가 비어 있어("") 아직 어느 탭에도 속하지 않은 상태였다.
  // "추천" 시트로 한 번 자리잡게 해서 기준점을 만든다.
  XS.main.switchTimelineTab('추천');
  await XS.util.wait(500);
  const beforeSwitchCount = XS.store.rows.length;
  check('추천 탭에 기준 데이터가 채워졌다', beforeSwitchCount > 0, '실제 ' + beforeSwitchCount);

  XS.main.switchTimelineTab('팔로우 중');
  check('실제 탭도 함께 눌린다', XS.scraper.activeTabLabel() === '팔로우 중');
  check('시트 열쇠가 팔로우 중으로 바뀐다', XS.store.key === '/home#팔로우 중');
  check('새 탭은 빈 시트로 시작한다', XS.store.rows.length === 0);

  doc.getElementById('react-root').insertAdjacentHTML('beforeend', tweet(960));
  await XS.util.wait(500);
  check('팔로우 중 탭에 새 글이 쌓인다', XS.store.rows.some(function (r) { return r.tweetId === '1960'; }));

  XS.main.switchTimelineTab('추천');
  check('추천 탭으로 되돌아간다', XS.store.key === '/home#추천');
  check('추천 탭 내용이 그대로 보존된다', XS.store.rows.length === beforeSwitchCount);
  check('팔로우 중 글이 추천에 섞이지 않는다', !XS.store.rows.some(function (r) { return r.tweetId === '1960'; }));

  XS.ui.updateTitle();
  const tabBtns = root.querySelectorAll('.xs-sheettabbtn');
  check('하단에 시트 탭 버튼 2개', tabBtns.length === 2, '실제 ' + tabBtns.length);
  const onBtn = root.querySelector('.xs-sheettabbtn.xs-sheettabon');
  check('추천 탭이 활성 표시', !!onBtn && onBtn.textContent === '추천');

  console.log('\n[17] X 검색');
  const searchInput = doc.createElement('input');
  searchInput.setAttribute('data-testid', 'SearchBox_Search_Input');
  doc.body.appendChild(searchInput);

  let sawEnter = false;
  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sawEnter = true;
  });

  XS.actions.searchOnX('  고양이 밈  ');
  check('검색창에 글자가 들어간다', searchInput.value === '고양이 밈', JSON.stringify(searchInput.value));
  check('Enter 키를 대신 눌러준다', sawEnter === true);
  check('검색 알림 문구', root.querySelector('.xs-statusright').textContent.includes('검색'));

  searchInput.remove();
  const hrefBefore = window.location.href;
  XS.actions.searchOnX('');
  check('빈 검색어는 무시한다', window.location.href === hrefBefore);

  console.log('\n[18] 버전, 업데이트 확인');
  check('현재 버전을 읽어온다', XS.version === '1.3.0', XS.version);
  check('숫자 비교 - 낮은 버전', XS.update.isNewer('1.4.0', '1.3.0') === true);
  check('숫자 비교 - 같은 버전', XS.update.isNewer('1.3.0', '1.3.0') === false);
  check('숫자 비교 - 자리수가 다른 경우', XS.update.isNewer('1.3.10', '1.3.9') === true);
  check('v 접두사 무시', XS.update.isNewer('v2.0.0', '1.9.9') === true);

  const realFetch = window.fetch;
  window.fetch = function () {
    return Promise.resolve({
      ok: true,
      json: function () {
        return Promise.resolve({ tag_name: 'v1.4.0', html_url: 'https://github.com/yhw9906/x-sheets/releases/tag/v1.4.0' });
      }
    });
  };
  XS.update.check();
  await XS.util.wait(60);
  window.fetch = realFetch;

  const upLink = root.querySelector('.xs-updatelink');
  check('업데이트 안내가 뜬다', !!upLink && !upLink.hidden);
  check('새 버전 번호가 보인다', !!upLink && upLink.textContent.includes('1.4.0'));
  check('릴리즈 페이지로 연결된다', !!upLink && upLink.href.includes('releases/tag/v1.4.0'));

  console.log('\n[19] 게시물 미디어 미리보기');
  doc.getElementById('react-root').insertAdjacentHTML('beforeend',
    tweet(970, { video: { src: 'https://video.example/clip970.mp4', poster: 'https://video.example/clip970.jpg' } }));
  doc.getElementById('react-root').insertAdjacentHTML('beforeend',
    tweet(971, { video: { src: 'blob:https://x.com/xxxx-yyyy', poster: 'https://video.example/clip971.jpg' } }));
  XS.scraper.collect();

  const vidRow = XS.store.rows.find(function (r) { return r.tweetId === '1970'; });
  const blobRow = XS.store.rows.find(function (r) { return r.tweetId === '1971'; });
  check('영상 주소를 읽어온다', !!vidRow && vidRow.clips.length === 1 &&
    vidRow.clips[0].src === 'https://video.example/clip970.mp4');
  check('blob 주소는 재생 주소로 쓰지 않는다', !!blobRow && blobRow.clips[0].src === '' &&
    blobRow.clips[0].poster === 'https://video.example/clip971.jpg');

  XS.saveSettings({ tweetMedia: 'preview' });
  XS.grid.rebuild();

  const mediaColIdx = XS.grid.cols.findIndex(function (c) { return c.key === 'media'; });
  check('미디어 열이 넓어진다', XS.grid.cols[mediaColIdx].width === 160);

  const vIdx = XS.grid.view.indexOf(vidRow);
  const vCell = XS.grid.cellEls[vIdx][mediaColIdx];
  check('미리보기 상자가 생긴다', !!vCell.querySelector('.xs-mediaprev'));
  check('사진 미리보기 타일이 있다', vCell.querySelectorAll('img.xs-prevtile').length >= 1);
  const videoTile = vCell.querySelector('video.xs-prevtile');
  check('영상 미리보기 타일이 있다', !!videoTile);
  check('영상은 음소거 자동재생 반복으로 설정된다', !!videoTile && videoTile.muted && videoTile.loop && videoTile.autoplay);
  check('영상 재생 주소가 들어간다', !!videoTile && videoTile.src === 'https://video.example/clip970.mp4');

  const bIdx = XS.grid.view.indexOf(blobRow);
  const bCell = XS.grid.cellEls[bIdx][mediaColIdx];
  check('재생 불가한 영상은 사진(포스터)만 보여준다',
    !bCell.querySelector('video.xs-prevtile') && bCell.querySelectorAll('img.xs-prevtile').length >= 1);

  XS.saveSettings({ tweetMedia: 'hide' });
  XS.grid.rebuild();
  check('숨김으로 되돌리면 미디어 열이 좁아진다', XS.grid.cols[mediaColIdx].width === 90);
  check('숨김 모드에서는 미리보기 상자가 없다',
    !XS.grid.cellEls[XS.grid.view.indexOf(vidRow)][mediaColIdx].querySelector('.xs-mediaprev'));

  XS.saveSettings({ media: 'small' });
  XS.grid.rebuild();
  const nameColIdx = XS.grid.cols.findIndex(function (c) { return c.key === 'name'; });
  const vIdx2 = XS.grid.view.indexOf(vidRow);
  check('프로필 사진 설정은 게시물 미디어와 독립적으로 작동한다',
    !!XS.grid.cellEls[vIdx2][nameColIdx].querySelector('img.xs-thumb'));
  XS.saveSettings({ media: 'hide' });

  console.log('\n[20] 새 글 작성');
  check('메뉴에 글쓰기 버튼이 있다', Array.prototype.some.call(
    root.querySelectorAll('.xs-menu'), function (b) { return b.textContent === '글쓰기'; }));

  const sideBtn = doc.createElement('div');
  sideBtn.setAttribute('data-testid', 'SideNav_NewTweet_Button');
  let sideBtnClicked = false;
  sideBtn.addEventListener('click', function () {
    sideBtnClicked = true;
    const dialog = doc.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const editBox = doc.createElement('div');
    editBox.setAttribute('data-testid', 'tweetTextarea_0');
    editBox.contentEditable = 'true';
    editBox.tabIndex = 0;
    dialog.appendChild(editBox);
    const postBtn = doc.createElement('button');
    postBtn.setAttribute('data-testid', 'tweetButton');
    postBtn.addEventListener('click', function () {
      window.__newPost = editBox.textContent;
      dialog.remove();
    });
    dialog.appendChild(postBtn);
    doc.body.appendChild(dialog);
  });
  doc.body.appendChild(sideBtn);

  XS.ui.showNewPostComposer(function (text) {
    return XS.actions.postText(text);
  });
  check('작성창에 인용 요약이 없다(새 글 모드)', !root.querySelector('.xs-modal-quoted'));
  check('안내 문구가 새 글에 맞게 뜬다', root.querySelector('.xs-modal-textarea').placeholder === '무슨 일이 있었나요?');

  const postTa = root.querySelector('.xs-modal-textarea');
  postTa.value = '오늘의 기록입니다';
  postTa.dispatchEvent(new window.Event('input', { bubbles: true }));
  root.querySelector('.xs-modal-actions .xs-btn-primary').click();
  await XS.util.wait(500);

  check('사이드바 글쓰기 버튼을 대신 눌러준다', sideBtnClicked === true);
  check('실제 작성창에 글이 들어간다', window.__newPost === '오늘의 기록입니다');
  check('게시 완료 알림', root.querySelector('.xs-statusright').textContent.includes('게시했습니다'));
  check('작성창이 닫힌다', !root.querySelector('.xs-modal-overlay'));

  console.log('\n결과: ' + (fails.length === 0 ? '모두 통과' : fails.length + '건 실패 -> ' + fails.join(', ')));
  process.exit(fails.length ? 1 : 0);
}, 1500);
