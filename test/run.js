/* X Sheets - jsdom 검사
 * 쓰는 법: npm install jsdom  ->  node test/run.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const EXT = path.join(__dirname, '..');

function tweet(i) {
  return `
  <article data-testid="tweet">
    <div data-testid="Tweet-User-Avatar"><img src="https://pbs.example/av${i}.jpg"></div>
    <div data-testid="User-Name">
      <a role="link" href="/user${i}"><span>사용자 ${i}</span></a>
      <a href="/user${i}/status/${1000 + i}"><time datetime="2026-09-0${(i % 8) + 1}T12:3${i % 10}:00.000Z">${i}시간</time></a>
    </div>
    <div data-testid="tweetText">첫째 줄 ${i}\n둘째 줄 내용입니다.</div>
    <div data-testid="tweetPhoto"><img src="https://pbs.example/p${i}.jpg"></div>
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
      get(defaults, cb) { cb(Object.assign({}, defaults, stored)); },
      set(patch) { Object.assign(stored, patch); }
    },
    onChanged: { addListener() {} }
  },
  runtime: { lastError: null }
};
window.IntersectionObserver = class {
  observe() {} disconnect() {} unobserve() {}
};
window.scrollTo = () => {};
window.navigator.clipboard = { writeText: () => Promise.resolve() };

for (const f of ['core.js', 'scraper.js', 'actions.js', 'grid.js', 'chrome-ui.js', 'main.js']) {
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
  check('메뉴 6개', root && root.querySelectorAll('.xs-menu').length === 6);
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
  window.document.execCommand = function (cmd, ui, value) {
    if (cmd === 'insertText') {
      const el = doc.querySelector('[data-testid="tweetTextarea_0"]');
      if (el) {
        el.textContent = (el.textContent || '') + value;
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

  console.log('\n결과: ' + (fails.length === 0 ? '모두 통과' : fails.length + '건 실패 -> ' + fails.join(', ')));
  process.exit(fails.length ? 1 : 0);
}, 1500);
