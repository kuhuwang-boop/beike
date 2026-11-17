/* 上课模式：放映视图 + 演讲者视图，两个窗口用 BroadcastChannel 同步 */
(function () {
  var P = window.PRESENT, S = P.slides, N = S.length;
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'beike-pr-' + P.id;
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(KEY + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch (e) {} }
  };
  DeckKit.addTemplates(P.templates || []);
  DeckKit.setBrand(P.brand);
  var qs = new URLSearchParams(location.search);
  var view = qs.get('view') || store.get('view', 'screen');
  var follower = qs.get('follow') === '1'; // 投影窗口：只跟随，不记计时
  var i = Math.max(0, Math.min(N - 1, +store.get('i', 0) || 0)), black = false, ans = false;
  var fs = store.get('fs', 20);
  var ch = window.BroadcastChannel ? new BroadcastChannel(KEY) : null;
  var post = function (m) { if (ch) ch.postMessage(m); };

  /* ---------- 计时 ---------- */
  var T = store.get('timer', null);
  if (!T || T.day !== new Date().toDateString()) T = { day: new Date().toDateString(), start: Date.now(), paused: 0, pausedAt: 0 };
  function elapsed() { return ((T.pausedAt || Date.now()) - T.start - T.paused) / 1000; }
  function saveT() { store.set('timer', T); }
  function mmss(sec) { sec = Math.max(0, Math.round(sec)); var m = Math.floor(sec / 60), s = sec % 60; return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }

  /* ---------- 渲染 ---------- */
  var last = {};
  function put(el, html) { if (last[el.id] !== html) { el.innerHTML = html; last[el.id] = html; } }
  function answerIndex(s) {
    var a = String(s.answer || '').trim(), m = a.match(/^[（(]?\s*([A-Fa-f])\b/);
    return m ? m[1].toUpperCase().charCodeAt(0) - 65 : -1;
  }
  function render() {
    var s = S[i], quiz = s.layout === 'quiz' && (s.answer || '').trim();
    // 放映视图
    put($('cur'), DeckKit.preview(s, i, P.theme, P.course, { live: view === 'screen' }));
    $('pg').textContent = (i + 1) + ' / ' + N;
    $('black').hidden = !black;
    $('b-ans').hidden = !quiz;
    var opts = $('cur').querySelectorAll('.opt'), k = answerIndex(s);
    opts.forEach(function (o, j) { o.classList.toggle('pr-right', ans && j === k); });
    $('ans').hidden = !(ans && quiz);
    $('ans').innerHTML = quiz ? '<b>答案</b>' + esc(s.answer) : '';
    // 演讲者视图
    if (view === 'presenter') {
      put($('p-cur'), DeckKit.preview(s, i, P.theme, P.course));
      put($('p-next'), i + 1 < N ? DeckKit.preview(S[i + 1], i + 1, P.theme, P.course) : '<div class="pp-end">最后一页</div>');
      $('p-pg').textContent = '第 ' + (i + 1) + ' / ' + N + ' 页' + (DeckKit.PHASES[s.phase] ? ' · ' + DeckKit.PHASES[s.phase] : '');
      $('p-min').textContent = P.pace[i] ? '建议约 ' + P.pace[i] + ' 分钟' : '';
      var notes = String(s.notes || '').trim();
      $('p-notes').innerHTML = (notes ? nl2br(notes) : '<span class="muted">这一页没有讲稿。</span>') +
        (quiz ? '<div class="pp-a"><b>答案</b>' + nl2br(s.answer) + '</div>' : '') +
        (s.layout === 'video' && s.video && s.video.src ? '<div class="pp-v"><button class="btn sm" onclick="Pr.video(\'play\')">' + ico('player-play') + '在投影上播放视频</button> <button class="btn ghost sm" onclick="Pr.video(\'pause\')">暂停</button></div>' : '');
      $('p-notes').style.fontSize = fs + 'px';
      $('p-ans-b').hidden = !quiz;
      $('p-ans-b').textContent = ans ? '隐藏答案' : '在屏幕上显示答案';
      $('p-strip').querySelectorAll('.ps').forEach(function (el, j) { el.classList.toggle('on', j === i); });
      var on = $('p-strip').querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
      tick();
    }
    store.set('i', i);
  }
  function tick() {
    if (view !== 'presenter') return;
    var el = elapsed() / 60;
    $('t-el').textContent = mmss(elapsed());
    $('t-el').classList.toggle('over', P.minutes && el > P.minutes);
    // 按每页建议时长，算当前进度比计划快还是慢
    var plan = 0; for (var k = 0; k < i; k++) plan += +P.pace[k] || 0;
    var d = el - plan, txt;
    if (el < 2) txt = '开始上课吧';
    else if (Math.abs(d) < 1.5) txt = '<b class="ok">进度正好</b>';
    else if (d > 0) txt = '<b class="slow">比计划慢 ' + Math.round(d) + ' 分钟</b>';
    else txt = '<b class="fast">比计划快 ' + Math.round(-d) + ' 分钟</b>';
    var rest = 0; for (k = i; k < N; k++) rest += +P.pace[k] || 0;
    $('pace').innerHTML = txt + '<small>剩余内容约 ' + Math.round(rest) + ' 分钟' + (P.minutes ? '，距下课 ' + Math.max(0, Math.round(P.minutes - el)) + ' 分钟' : '') + '</small>';
    $('b-timer').innerHTML = T.pausedAt ? ico('player-play') + '继续计时' : ico('player-pause') + '暂停计时';
  }

  function go(n, silent) {
    var j = Math.max(0, Math.min(N - 1, n));
    if (j !== i) { i = j; ans = false; }
    black = false;
    render();
    if (!silent) post({ t: 'go', i: i });
  }

  /* ---------- 视图切换 ---------- */
  function setView(v) {
    view = v;
    if (!follower) store.set('view', v);
    $('screen').hidden = v !== 'screen';
    $('pres').hidden = v !== 'presenter';
    document.body.classList.toggle('is-pres', v === 'presenter');
    last = {};
    render();
  }

  if (ch) ch.onmessage = function (ev) {
    var m = ev.data || {};
    if (m.t === 'go') go(m.i, true);
    else if (m.t === 'black') { black = m.v; render(); }
    else if (m.t === 'ans') { ans = m.v; render(); }
    else if (m.t === 'video' && view === 'screen') {
      var v = $('cur').querySelector('video'); if (v) { if (m.a === 'play') v.play().catch(function () {}); else v.pause(); }
    } else if (m.t === 'hello') post({ t: 'go', i: i });
  };

  window.Pr = {
    go: function (d) { go(i + d); },
    to: function (n) { go(n); },
    mode: setView,
    black: function () { black = !black; render(); post({ t: 'black', v: black }); },
    answer: function () { ans = !ans; render(); post({ t: 'ans', v: ans }); },
    video: function (a) { post({ t: 'video', a: a }); var v = view === 'screen' && $('cur').querySelector('video'); if (v) { if (a === 'play') v.play(); else v.pause(); } },
    full: function () {
      var d = document;
      if (d.fullscreenElement) d.exitFullscreen(); else if (d.documentElement.requestFullscreen) d.documentElement.requestFullscreen().catch(function () {});
    },
    screen: function () {
      var w = window.open(location.pathname + '?view=screen&follow=1', 'beike-screen-' + P.id, 'width=1280,height=720');
      if (!w) toast('浏览器拦截了新窗口，请允许本网站弹出窗口', true);
      else toast('已打开投影窗口：把它拖到投影屏幕上，按 F 全屏。这边翻页，投影会同步。');
    },
    timer: function () {
      if (T.pausedAt) { T.paused += Date.now() - T.pausedAt; T.pausedAt = 0; } else T.pausedAt = Date.now();
      saveT(); tick();
    },
    resetTimer: function () { T = { day: new Date().toDateString(), start: Date.now(), paused: 0, pausedAt: 0 }; saveT(); tick(); },
    font: function (d) { fs = Math.max(14, Math.min(36, fs + d * 2)); store.set('fs', fs); render(); },
    help: function () {
      uiModal({ title: '上课模式快捷键', html: '<table class="tbl small"><tr><td>下一页</td><td>→ ↓ 空格 PageDown（翻页笔可用）</td></tr><tr><td>上一页</td><td>← ↑ PageUp</td></tr><tr><td>第一页 / 最后一页</td><td>Home / End</td></tr><tr><td>跳到某页</td><td>输入页码后按回车</td></tr><tr><td>黑屏（学生讨论时）</td><td>B</td></tr><tr><td>显示 / 隐藏答案</td><td>A（课堂提问页）</td></tr><tr><td>播放 / 暂停视频</td><td>V</td></tr><tr><td>演讲者视图（讲稿、计时）</td><td>P</td></tr><tr><td>全屏</td><td>F</td></tr></table>' +
        '<p class="muted small">接投影时：在演讲者视图点「打开投影窗口」，把新窗口拖到投影屏幕并按 F 全屏；你在自己屏幕上看讲稿和计时，翻页两边同步。电脑只接一块屏幕时，直接用放映视图即可。</p>', buttons: [{ text: '知道了', cls: 'primary' }] });
    }
  };

  /* ---------- 键盘、翻页笔、触屏 ---------- */
  var num = '';
  document.addEventListener('keydown', function (e) {
    if (document.querySelector('.ui-modal')) return;
    var k = e.key;
    if (/^[0-9]$/.test(k)) { num += k; return; }
    if (k === 'Enter' && num) { go(+num - 1); num = ''; e.preventDefault(); return; }
    num = '';
    if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'].indexOf(k) >= 0) { e.preventDefault(); Pr.go(1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].indexOf(k) >= 0) { e.preventDefault(); Pr.go(-1); }
    else if (k === 'Home') go(0);
    else if (k === 'End') go(N - 1);
    else if (k === 'b' || k === 'B' || k === '.') Pr.black();
    else if (k === 'a' || k === 'A') { if (S[i].layout === 'quiz') Pr.answer(); }
    else if (k === 'v' || k === 'V') { var v = $('cur').querySelector('video'); Pr.video(v && !v.paused ? 'pause' : 'play'); }
    else if (k === 'f' || k === 'F') Pr.full();
    else if ((k === 'p' || k === 'P') && !follower) setView(view === 'presenter' ? 'screen' : 'presenter');
    else if (k === '?') Pr.help();
    else if (k === 'Escape') { if (black || ans) { black = false; ans = false; render(); post({ t: 'black', v: false }); post({ t: 'ans', v: false }); } }
  });
  var tx = null;
  $('screen').addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
  $('screen').addEventListener('touchend', function (e) {
    if (tx === null) return; var dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 50) Pr.go(dx < 0 ? 1 : -1);
  });
  // 点击画面左右两侧翻页（视频和按钮除外）
  $('screen').addEventListener('click', function (e) {
    if (e.target.closest('video,.pr-bar,a,button')) return;
    Pr.go(e.clientX < innerWidth * 0.3 ? -1 : 1);
  });
  // 鼠标不动 2.5 秒后隐藏工具条
  var hideT;
  document.addEventListener('mousemove', function () { document.body.classList.remove('idle'); clearTimeout(hideT); hideT = setTimeout(function () { document.body.classList.add('idle'); }, 2500); });

  /* ---------- 启动 ---------- */
  $('p-strip').innerHTML = S.map(function (s, j) { return '<button class="ps" onclick="Pr.to(' + j + ')"><div class="slide-preview">' + DeckKit.preview(s, j, P.theme, P.course) + '</div><span>' + (j + 1) + '</span></button>'; }).join('');
  if (follower) document.body.classList.add('follower');
  if (!follower) saveT();
  setView(follower ? 'screen' : view);
  if (follower) post({ t: 'hello' });
  setInterval(tick, 1000);
})();
