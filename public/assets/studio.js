/* 课件工作室：对话 + 课件预览 + AI 团队任务面板 */
(function () {
  var C = window.STUDIO, S = C.state, team = C.team;
  var cur = 0, focus = 0, running = false, stopFlag = false, curRun = 0;
  var $ = function (id) { return document.getElementById(id); };
  var isMobile = function () { return window.matchMedia('(max-width: 900px)').matches; };
  function themeUI() {
    DeckKit.addTemplates(S.templates || []);
    DeckKit.setBrand(S.brand);
    var nm = TplKit.themeName(S.theme || 'blue', S.templates || []);
    $('b-style-n').textContent = nm; var mn = $('m-style-n'); if (mn) mn.textContent = nm;
  }
  themeUI();

  /* ---------- 对话 ---------- */
  function avatar(agent, cls) {
    var m = team[agent] || { icon: '·', color: '#999' };
    return '<i class="' + (cls || 'av') + '" style="background:' + m.color + '">' + esc(m.icon) + '</i>';
  }
  function msgHtml(m) {
    if (m.role === 'user') return '<div class="m user"><div class="bubble">' + nl2br(m.content) + '</div></div>';
    if (m.role === 'system') return '<div class="m sys">' + esc(m.content) + '</div>';
    var t = team[m.agent] || { name: 'AI' };
    return '<div class="m agent">' + avatar(m.agent) + '<div><div class="who">' + esc(t.name) + '</div><div class="bubble">' + nl2br(m.content) + '</div></div></div>';
  }
  function renderMsgs() {
    var box = $('msgs');
    if (!C.msgs.length) {
      box.innerHTML = '<div class="welcome"><h3>你好，我们是你的 AI 课件团队</h3><p>' +
        (S.materials.length ? '已经收到你的资料。' : '可以先点下方的回形针按钮上传备课资料（Word / PPT / PDF），也可以直接告诉我们这节课的想法。') +
        '</p><p class="muted small">用平常说话的方式提要求就行，例如“做一套 45 分钟的课件”“第3页举个生活中的例子”“精品模式，全员打磨”。每次修改都能撤销。</p></div>';
    } else box.innerHTML = C.msgs.map(msgHtml).join('');
    box.scrollTop = box.scrollHeight;
  }
  function push(m) { C.msgs.push(m); if (C.msgs.length === 1) renderMsgs(); else $('msgs').insertAdjacentHTML('beforeend', msgHtml(m)); $('msgs').scrollTop = 1e9; }
  var VERB = { leader: '正在理解你的需求、安排分工…', analyst: '正在分析学生情况…', designer: '正在做教学设计…', expert: '正在整理内容要点…', slides: '正在制作课件页面…',
    case: '正在设计案例与思政…', quiz: '正在设计互动和测验…', illustrator: '正在搜索合适的图片…', script: '正在撰写授课讲稿…', reviewer: '正在核查内容与质量…' };
  function working(agent) {
    var id = 'w' + Date.now();
    $('msgs').insertAdjacentHTML('beforeend', '<div class="m agent working" id="' + id + '">' + avatar(agent) + '<div><div class="who">' + esc((team[agent] || {}).name || '') + '</div><div class="bubble"><span class="dots"><i></i><i></i><i></i></span> ' + esc(VERB[agent] || '工作中…') + '</div></div></div>');
    $('msgs').scrollTop = 1e9;
    return id;
  }
  function doneWorking(id) { var el = $(id); if (el) el.remove(); }

  function lock(on) {
    running = on;
    $('send').disabled = on; $('say').disabled = on;
    $('send').innerHTML = on ? ico('loader-2', 'spin') + '<span>工作中</span>' : ico('send') + '<span>发送</span>';
    renderPanel();
  }

  /* ---------- 任务执行 ---------- */
  function setTask(id, patch) {
    (S.tasks || []).forEach(function (t) { if (+t.id === +id) Object.keys(patch).forEach(function (k) { t[k] = patch[k]; }); });
    renderPanel();
  }
  function runTasks(list) {
    var chain = Promise.resolve();
    list.forEach(function (s) {
      chain = chain.then(function () {
        if (stopFlag) throw new Error('__stopped');
        var wid = working(s.agent);
        setTask(s.id, { status: 'running', _t0: Date.now() });
        return api('/studio/' + C.id + '/agent', { task_id: s.id }, false).then(function (r) {
          doneWorking(wid);
          push({ role: 'agent', agent: s.agent, content: r.message });
          return refresh().then(function () {
            if (isMobile() && !$('st-main').classList.contains('pane-stage') && S.slides.length) $('pane-dot').classList.add('on');
          });
        }, function (e) {
          doneWorking(wid);
          push({ role: 'agent', agent: s.agent, content: '这一步没有完成：' + e.message + '\n可以在团队面板里点“重试”。' });
          return refresh().then(function () { throw new Error('__failed'); });
        });
      });
    });
    return chain;
  }

  function send(text) {
    text = (text || $('say').value).trim();
    if (!text || running) return;
    if (!C.aiReady) { toast('管理员还没有配置 AI 模型的 API Key', true); return; }
    $('say').value = ''; autosize();
    push({ role: 'user', content: (focus ? '【第' + focus + '页】' : '') + text });
    stopFlag = false;
    lock(true);
    var w = working('leader');
    api('/studio/' + C.id + '/chat', { message: text, focus: focus }, false).then(function (j) {
      doneWorking(w);
      curRun = j.run;
      var names = j.steps.map(function (s) { return (team[s.agent] || {}).name; });
      if (j.notice) push({ role: 'system', content: j.notice });
      push({ role: 'agent', agent: 'leader', content: j.reply + (names.length ? '\n' + names.join(' → ') : '') });
      return refresh().then(function () { return runTasks(j.steps); });
    }).catch(function (e) {
      doneWorking(w);
      if (e.message === '__stopped') push({ role: 'system', content: '已停止' });
      else if (e.message !== '__failed') toast(e.message, true);
    }).finally(function () { lock(false); setFocus(0); renderChips(); refresh(); });
  }

  /* ---------- 团队面板 ---------- */
  var ST = { pending: [ico('circle-dashed'), '等待中'], running: ['', '进行中'], done: [ico('check'), '已完成'], failed: [ico('x'), '失败'], cancelled: [ico('player-stop'), '已停止'] };
  function fmtMs(ms) { ms = +ms || 0; return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(ms < 10000 ? 1 : 0) + 's'; }
  function taskHtml(t) {
    var st = ST[t.status] || ST.pending, r = t.result || {};
    var t0 = t._t0 || Date.parse(String(t.started_at || '').replace(' ', 'T')) || Date.now();
    var elapsed = t.status === 'running' ? '<span class="el" data-t0="' + t0 + '"></span>' : (t.ms > 0 ? fmtMs(t.ms) : '');
    return '<div class="tk st-' + t.status + '" data-id="' + t.id + '">' +
      '<div class="tk-row" onclick="this.parentNode.classList.toggle(\'open\')">' +
      '<span class="tk-st">' + (t.status === 'running' ? '<span class="mini-spin"></span>' : st[0]) + '</span>' + avatar(t.agent, 'tk-av') +
      '<div class="tk-main"><div class="tk-name">' + esc((team[t.agent] || {}).name || t.agent) + '<span class="tk-badge">' + st[1] + '</span></div>' +
      '<div class="tk-task">' + esc(t.task || '') + '</div>' +
      '<div class="tk-meta">' + elapsed + [t.model, t.tokens > 0 ? t.tokens + ' tokens' : ''].filter(Boolean).map(function (x) { return ' · ' + esc(x); }).join('') + '</div></div></div>' +
      '<div class="tk-detail"><b>任务</b><p>' + nl2br(t.task || '') + '</p>' +
      (r.message ? '<b>' + (t.status === 'failed' ? '错误' : '结果') + '</b><p>' + nl2br(r.message) + '</p>' : '') +
      (r.detail ? '<b>详情</b><p class="pre">' + nl2br(r.detail) + '</p>' : '') +
      ((t.status === 'failed' || t.status === 'cancelled') && !running && t.agent !== 'leader' ? '<button class="btn sm" onclick="Studio.retry(' + t.id + ')">' + ico('refresh') + '重试这一步及后续</button>' : '') + '</div></div>';
  }
  function renderPanel() {
    var tasks = S.tasks || [];
    var runs = [];
    tasks.forEach(function (t) { if (runs.indexOf(+t.run_id) < 0) runs.push(+t.run_id); });
    var latest = runs[0];
    var cur = tasks.filter(function (t) { return +t.run_id === latest; });
    var statusOf = {};
    cur.forEach(function (t) { statusOf[t.agent] = t.status; });
    $('tp-members').innerHTML = Object.keys(team).map(function (k) {
      var m = team[k], s = m.enabled === false ? 'off' : (statusOf[k] || 'idle');
      var label = { off: '未启用', idle: '空闲', pending: '排队中', running: '工作中', done: '已完成', failed: '出错', cancelled: '已停止' }[s];
      return '<div class="mb mb-' + s + '" title="' + esc(m.desc || '') + '">' + avatar(k, 'mb-av') + '<div class="mb-txt"><b>' + esc(m.name) + '</b><small>' + esc(m.title || '') + '</small></div><span class="mb-st">' + label + '</span></div>';
    }).join('');
    if (!cur.length) {
      $('tp-run').innerHTML = '<div class="tp-empty">还没有任务。在对话里告诉团队你想做什么，组长会安排分工，每一步的进度和结果都会显示在这里。</div>';
      $('tp-stop').innerHTML = ''; $('tp-sum').textContent = '';
    } else {
      var done = cur.filter(function (t) { return t.status === 'done'; }).length;
      var pct = Math.round(done / cur.length * 100);
      var totalMs = cur.reduce(function (a, t) { return a + (+t.ms || 0); }, 0);
      $('tp-run').innerHTML = '<div class="tp-progress"><i style="width:' + pct + '%"></i></div><div class="tp-pinfo">第 ' + latest + ' 轮 · ' + done + '/' + cur.length + ' 完成' + (totalMs ? ' · 累计用时 ' + fmtMs(totalMs) : '') + '</div>' + cur.map(taskHtml).join('');
      $('tp-stop').innerHTML = running ? '<button class="link small danger-text" onclick="Studio.stop()">' + ico('player-stop') + ' 停止</button>' : '';
      $('tp-sum').textContent = running ? '工作中 ' + done + '/' + cur.length : '';
    }
    var hist = runs.slice(1);
    $('tp-hist-h').style.display = hist.length ? '' : 'none';
    $('tp-hist').innerHTML = hist.map(function (rid) {
      var ts = tasks.filter(function (t) { return +t.run_id === rid; });
      var first = ts[0] || {};
      var ok = ts.filter(function (t) { return t.status === 'done'; }).length;
      return '<details class="hrun"><summary><span>第 ' + rid + ' 轮</span><em>' + esc((first.task || '').slice(0, 24)) + '</em><small>' + ok + '/' + ts.length + '</small></summary>' + ts.map(taskHtml).join('') + '</details>';
    }).join('');
    var dot = $('task-dot'); if (dot) dot.classList.toggle('on', running && isMobile() && !$('st-main').classList.contains('pane-tasks'));
    tick();
  }
  function tick() {
    document.querySelectorAll('.tk .el').forEach(function (el) { el.textContent = fmtMs(Date.now() - (+el.dataset.t0)); });
  }
  setInterval(tick, 1000);

  /* ---------- 资料 ---------- */
  function renderMats() {
    $('mats').innerHTML = S.materials.map(function (m) {
      return '<span class="mat"><a href="#" onclick="Studio.viewMat(' + m.id + ');return false">' + ico('file-text') + ' ' + esc(m.filename) + '</a><small>' + Number(m.chars).toLocaleString() + '字</small><button title="删除这份资料" onclick="Studio.delMat(' + m.id + ')">' + ico('x') + '</button></span>';
    }).join('') + '<span class="mat add" onclick="Studio.fromLibrary()" title="从我的资料库里选">' + ico('database') + ' 资料库</span><span class="mat add" onclick="Studio.pasteMat()">' + ico('plus') + ' 粘贴文字</span>' + skillChip();
  }
  function skillChip() {
    var all = S.skills || [];
    if (!all.length) return '';
    var on = all.filter(function (k) { return k.on; });
    return '<span class="mat skill' + (on.length ? ' has' : '') + '" onclick="Studio.skills()" title="选择本节课要用的教学方法和我自己的技能，AI 团队会按它落实">' + ico('bulb') + ' ' +
      (on.length ? esc(on.map(function (k) { return k.name; }).join('、')) : '方法与技能') + '</span>';
  }
  function upload(fileList) {
    var arr = Array.prototype.slice.call(fileList);
    if (!arr.length) return;
    busy(true, '正在读取资料…');
    var chain = Promise.resolve();
    arr.forEach(function (f) {
      chain = chain.then(function () {
        return DocExtract.file(f).then(function (r) {
          return api('/studio/' + C.id + '/materials', { filename: r.name, content: r.text }, false).then(function (j) {
            push({ role: 'system', content: '已导入资料「' + r.name + '」（约 ' + j.chars.toLocaleString() + ' 字）' });
          });
        }).catch(function (e) { toast(e.message, true); });
      });
    });
    chain.then(refresh).finally(function () { busy(false); renderChips(); });
  }
  $('f-up').addEventListener('change', function (e) { upload(e.target.files); e.target.value = ''; });
  var chatEl = document.querySelector('.chat');
  ['dragover', 'dragenter'].forEach(function (ev) { chatEl.addEventListener(ev, function (e) { e.preventDefault(); chatEl.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { chatEl.addEventListener(ev, function (e) { e.preventDefault(); chatEl.classList.remove('over'); }); });
  chatEl.addEventListener('drop', function (e) { upload(e.dataTransfer.files); });

  function modal(title, body, buttons) {
    var el = document.createElement('div');
    el.className = 'modal-bg';
    el.innerHTML = '<div class="modal"><h3>' + esc(title) + '</h3>' + body + '<div class="actions right">' + buttons + '</div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) { if (e.target === el) el.remove(); });
    return el;
  }

  /* ---------- 建议 ---------- */
  function renderChips() {
    var list;
    if (!S.slides.length) {
      list = S.materials.length ? ['根据我的资料，生成一套完整课件', '精品模式：全员协作打磨一套课件', '先帮我分析学情、梳理教学思路'] : ['帮我生成一套完整课件', '精品模式：全员协作打磨一套课件', '我先说说这节课的想法'];
    } else {
      list = ['把适合的页面改成结构图', '文字太多了，整体精简一下', '给每页写好授课讲稿和板书', '增加课堂互动和测验', '加一个真实的行业案例', '给合适的页面配上真实图片', '请督导检查有没有错误'];
    }
    var mine = (S.cmds || []).map(function (t) { return '<button class="chip mine" title="我的常用指令" onclick="Studio.send(this.textContent)">' + esc(t) + '</button>'; }).join('');
    $('chips').innerHTML = mine + list.map(function (t) { return '<button class="chip" onclick="Studio.send(this.textContent)">' + esc(t) + '</button>'; }).join('') +
      '<button class="chip add" onclick="Studio.saveCmd()" title="把输入框里的话存成常用指令，以后一点就发">' + ico('plus') + '存为常用</button>';
  }

  /* ---------- 预览 ---------- */
  var IMG_LAYOUTS = ['title', 'bullets', 'objectives', 'summary', 'section'];
  var lastBig = '';
  function renderDeck() {
    var n = S.slides.length;
    if (cur >= n) cur = Math.max(0, n - 1);
    var tools = document.querySelector('.slide-tools');
    if (!n) {
      $('big').innerHTML = '<div class="sp empty-stage"><div><b>课件会在这里出现</b><span>在对话里和 AI 团队说说你的要求</span></div></div>';
      $('strip').innerHTML = ''; $('pg').textContent = ''; $('notes').innerHTML = '';
      tools.style.display = 'none';
      return;
    }
    tools.style.display = '';
    var s = S.slides[cur];
    var imgOk = IMG_LAYOUTS.indexOf(s.layout) >= 0;
    $('b-img').style.display = imgOk ? '' : 'none';
    $('b-img').innerHTML = ico('photo') + (s.image ? '换图' : '配图');
    $('edit-this').href = '/lessons/' + C.id + '/slides#' + (cur + 1);
    var bigHtml = DeckKit.preview(s, cur, S.theme, C.course, { live: true });
    if (bigHtml !== lastBig) { $('big').innerHTML = bigHtml; lastBig = bigHtml; }
    var bv = $('b-video'); if (bv) bv.innerHTML = ico('movie') + (s.layout === 'video' ? '重新生成' : '视频');
    $('pg').textContent = '第 ' + (cur + 1) + ' / ' + n + ' 页 · ' + (DeckKit.PHASES[s.phase] || '');
    var note = (s.notes || '') + (s.layout === 'quiz' && s.answer ? '\n答案：' + s.answer : '');
    $('notes').innerHTML = note ? '<b>讲稿备注</b>' + nl2br(note) : '';
    $('strip').innerHTML = S.slides.map(function (sl, i) {
      return '<div class="th' + (i === cur ? ' on' : '') + '" onclick="Studio.show(' + i + ')"><div class="slide-preview">' + DeckKit.preview(sl, i, S.theme, C.course) + '</div><span>' + (i + 1) + (sl.image ? ' ' + ico('photo') : '') + '</span></div>';
    }).join('');
    var on = $('strip').querySelector('.on');
    if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  function renderPlan() {
    var p = S.plan, ph = DeckKit.PHASES;
    if (!S.hasPlan && !S.objectives && !S.learner && !S.content) { $('tab-plan').innerHTML = '<div class="empty-soft">还没有教学设计。生成课件时，学情分析师和教学设计师会先梳理教学思路。</div>'; return; }
    var row = function (k, v, cls) { return v ? '<div class="pl"><h4>' + k + '</h4><p class="' + (cls || '') + '">' + nl2br(v) + '</p></div>' : ''; };
    var sk = (S.skills || []).filter(function (k) { return k.on; }).map(function (k) { return k.name; }).join('、');
    $('tab-plan').innerHTML = '<div class="plan">' + row('采用的教学方法', sk) + row('学情分析', S.learner) + row('学习目标', S.objectives) + row('教学重点', p.key) + row('教学难点', p.diff) + row('学生可能的误区', p.mis) +
      (p.segs.length ? '<div class="pl"><h4>课堂流程</h4><div class="scroll-x"><table class="tbl"><tr><th>环节</th><th>时间</th><th>老师做什么</th><th>学生做什么</th></tr>' + p.segs.map(function (s) {
        return '<tr><td class="nowrap">' + esc(ph[s.phase] || s.phase) + '</td><td>' + s.minutes + '′</td><td>' + nl2br(s.teacher_act) + '</td><td>' + nl2br(s.student_act) + '</td></tr>';
      }).join('') + '</table></div></div>' : '') + row('学科专家：内容要点', S.content, 'pre') + row('思政融入', p.ideo) + row('板书设计', S.board, 'pre') + row('课后作业', p.hw) +
      '<p class="muted small">想调整？直接在对话里说，例如“导入环节换成一个视频案例”。也可以 <a href="/lessons/' + C.id + '/word">下载教案 Word</a>。</p></div>';
  }
  function renderCheck() {
    var warn = S.health.filter(function (h) { return h[0] === 'warn'; }).length;
    $('check-n').textContent = warn ? warn : '';
    var h = '<div class="plan"><div class="pl"><h4>课件体检 <small class="muted">（按固定规则自动检查，不依赖 AI）</small></h4><ul class="checks">' +
      (S.health.length ? S.health.map(function (x) { return '<li class="' + (x[0] === 'ok' ? 'info' : x[0]) + '">' + esc(x[1]) + '</li>'; }).join('') : '<li class="info">生成课件后会自动检查。</li>') + '</ul>' +
      (warn ? '<button class="btn sm" onclick="Studio.send(\'请根据课件体检的提示逐条修改\')">让 AI 按体检结果修改</button>' : '') + '</div>';
    if (S.improvements && S.improvements.length) {
      h += '<div class="pl"><h4>相比你的原始资料，做了这些调整</h4><ul class="imp">' + S.improvements.map(function (x) {
        return '<li><b>原资料：</b>' + esc(x.issue || '') + '<br><b>调整：</b>' + esc(x.change || '') + '</li>';
      }).join('') + '</ul></div>';
    }
    $('tab-check').innerHTML = h + '</div>';
  }
  function renderAll() { renderDeck(); renderPlan(); renderCheck(); renderMats(); renderPanel(); $('btn-undo').disabled = !S.versions; }
  function refresh() {
    return fetch('/studio/' + C.id + '/state', { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (j) {
      var t0 = {}; (S.tasks || []).forEach(function (t) { if (t._t0) t0[t.id] = t._t0; });
      (j.tasks || []).forEach(function (t) { if (t.status === 'running' && t0[t.id]) t._t0 = t0[t.id]; });
      S = j; themeUI(); renderAll(); watchVideos();
    });
  }

  /* ---------- AI 教学视频：后台轮询生成进度 ---------- */
  var vWatch = {};
  function watchVideos() {
    (S.slides || []).forEach(function (sl) {
      var v = sl.layout === 'video' && sl.video;
      if (!v || !v.id || vWatch[v.id] || (v.status !== 'queued' && v.status !== 'running')) return;
      vWatch[v.id] = true;
      var tick = function () {
        fetch('/studio/' + C.id + '/video/' + v.id, { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (j) {
          if (j.status === 'succeeded' || j.status === 'failed' || j.error && !j.status) {
            delete vWatch[v.id];
            toast(j.status === 'succeeded' ? '教学视频生成好了' : ('视频生成失败：' + (j.error || '请重试')), j.status !== 'succeeded');
            refresh();
          } else setTimeout(tick, 8000);
        }).catch(function () { setTimeout(tick, 15000); });
      };
      setTimeout(tick, 5000);
    });
  }
  setTimeout(watchVideos, 500);

  function setFocus(n) {
    focus = n;
    var t = $('focus-tag');
    t.hidden = !n;
    t.innerHTML = n ? '只改第 ' + n + ' 页 <button onclick="Studio.unfocus()" aria-label="取消">' + ico('x') + '</button>' : '';
  }

  /* ---------- 面板显示 / 隐藏 ---------- */
  function applyPanel(open) {
    document.body.classList.toggle('panel-closed', !open);
    $('btn-panel').classList.toggle('on', open);
    try { localStorage.setItem('beike-panel', open ? '1' : '0'); } catch (e) {}
  }
  var saved = null;
  try { saved = localStorage.getItem('beike-panel'); } catch (e) {}
  applyPanel(saved === null ? !window.matchMedia('(max-width: 1280px)').matches : saved === '1');

  document.querySelectorAll('.stage-tabs button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.stage-tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
      ['deck', 'plan', 'check'].forEach(function (k) { $('tab-' + k).hidden = k !== b.dataset.tab; });
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowLeft') Studio.go(-1);
    if (e.key === 'ArrowRight') Studio.go(1);
  });
  document.addEventListener('click', function (e) { document.querySelectorAll('.dropdown.open').forEach(function (d) { if (!d.contains(e.target)) d.classList.remove('open'); }); });
  var ta = $('say');
  function autosize() { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; }
  ta.addEventListener('input', autosize);
  ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); } });

  (function () {
    var x0 = null, y0 = null, el = $('big');
    el.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) Studio.go(dx < 0 ? 1 : -1);
      x0 = null;
    }, { passive: true });
  })();

  $('img-up').addEventListener('change', function (e) {
    var f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    var fd = new FormData(); fd.append('index', cur + 1); fd.append('file', f);
    busy(true, '正在上传图片…');
    fetch('/studio/' + C.id + '/image/upload', { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-CSRF-Token': CSRF, Accept: 'application/json' } })
      .then(function (r) { return r.json(); }).then(function (j) { if (j.error) throw new Error(j.error); toast('已上传'); return refresh(); })
      .catch(function (e) { toast(e.message, true); }).finally(function () { busy(false); });
  });

  window.Studio = {
    send: send,
    pane: function (p) {
      ['chat', 'stage', 'tasks'].forEach(function (k) { $('st-main').classList.toggle('pane-' + k, k === p); });
      document.querySelectorAll('.m-switch button').forEach(function (b) { b.classList.toggle('on', b.dataset.pane === p); });
      if (p === 'stage') { $('pane-dot').classList.remove('on'); renderDeck(); }
      if (p === 'tasks') { $('task-dot').classList.remove('on'); }
      if (p === 'chat') $('msgs').scrollTop = 1e9;
    },
    video: function () {
      var s = S.slides[cur] || null, idx = cur + 1, isV = s && s.layout === 'video';
      fetch('/studio/' + C.id + '/video', { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (info) {
        if (info.error || !info.on) { toast(info.error || '管理员还没有开启 AI 教学视频', true); return; }
        var left = info.quota ? Math.max(0, info.quota - info.used) : -1;
        var kinds = Object.keys(info.kinds).map(function (k, i) { return '<label class="vk"><input type="radio" name="vk" value="' + k + '"' + (i === 0 ? ' checked' : '') + '><b>' + esc(info.kinds[k][0]) + '</b><small>' + esc(info.kinds[k][1]) + '</small></label>'; }).join('');
        var durs = [5, 6, 8, 10, 12, 15].filter(function (d) { return d >= info.min; }).map(function (d) { return '<option value="' + d + '"' + (d === 8 ? ' selected' : '') + '>' + d + ' 秒</option>'; }).join('');
        var imgPages = S.slides.map(function (sl, i) { return sl.image && sl.image.src ? '<option value="' + (i + 1) + '">第 ' + (i + 1) + ' 页的配图</option>' : ''; }).join('');
        var old = isV ? (s.video.prompt || '') : '';
        var html = '<div class="vd">' +
          '<p class="muted small">用 MiniMax 海螺 H3 生成一段带声音的短视频，' + (isV ? '替换第 ' + idx + ' 页现有的视频。' : '作为新的一页插在第 ' + idx + ' 页后面。') + '画面里不会有文字，讲解仍由你在课上完成。' +
          (left >= 0 ? '本月还可生成 <b>' + left + '</b> 条。' : '') + '</p>' +
          (isV ? '' : '<div class="vk-grid">' + kinds + '</div>') +
          '<label>你的想法（可选）<input class="vd-idea" placeholder="例如：用一个快递分拣的场景引出“排序”"></label>' +
          '<div class="vd-row"><button type="button" class="btn ghost sm vd-ai">' + ico('sparkles') + 'AI 帮我写画面描述</button><span class="muted small vd-st"></span></div>' +
          '<label>视频标题<input class="vd-title" maxlength="30" value="' + esc(isV ? s.title : '') + '" placeholder="例如：快递分拣中的排序"></label>' +
          '<label>画面描述 <small class="muted">场景、动作、镜头、光线、风格；越具体越好</small><textarea class="vd-prompt" rows="6" placeholder="例如：俯拍一条繁忙的快递分拣流水线，包裹沿传送带移动，机械臂按大小把包裹依次放进不同通道，镜头缓慢推进到通道末端，暖色工业灯光，写实摄影风格">' + esc(old) + '</textarea></label>' +
          '<div class="row3"><label>时长<select class="vd-dur">' + durs + '</select></label>' +
          '<label>画面比例<select class="vd-ratio"><option value="16:9">16:9 横屏（投影推荐）</option><option value="4:3">4:3</option><option value="1:1">1:1</option></select></label>' +
          '<label>第一帧<select class="vd-first"><option value="0">由 AI 自由生成</option>' + imgPages + '</select></label></div>' +
          '<p class="muted small vd-note">当前模型 ' + esc(info.model) + ' · ' + esc(info.resolution) + '。提交后一般 1–5 分钟完成，期间可以继续做别的，好了会提醒你。</p>' +
          '<div class="actions right"><button type="button" class="btn ghost vd-cancel">取消</button><button type="button" class="btn primary vd-go">' + ico('movie') + '开始生成</button></div></div>';
        uiModal({ title: isV ? '重新生成第 ' + idx + ' 页的视频' : '生成教学视频', cls: 'wide vd-modal', html: html, buttons: [],
          onOpen: function (bg, done) {
            var q = function (c) { return bg.querySelector(c); }, teach = '';
            q('.vd-cancel').onclick = function () { done(null); };
            q('.vd-ai').onclick = function () {
              var btn = this, kind = (bg.querySelector('input[name=vk]:checked') || {}).value || 'intro';
              btn.disabled = true; q('.vd-st').textContent = 'AI 正在构思画面…';
              api('/studio/' + C.id + '/video/draft', { index: idx, kind: kind, idea: q('.vd-idea').value }, false).then(function (j) {
                q('.vd-prompt').value = j.prompt; if (!q('.vd-title').value) q('.vd-title').value = j.title;
                var d = q('.vd-dur'); if ([].some.call(d.options, function (o) { return +o.value === j.duration; })) d.value = j.duration;
                teach = j.teach || ''; q('.vd-st').textContent = teach ? '课堂用法：' + teach : '写好了，可以再改改';
              }).catch(function (e) { q('.vd-st').textContent = e.message; }).then(function () { btn.disabled = false; });
            };
            q('.vd-go').onclick = function () {
              var pr = q('.vd-prompt').value.trim();
              if (pr.length < 8) { q('.vd-prompt').focus(); toast('请先写几句画面描述，或点「AI 帮我写」', true); return; }
              var go = this; go.disabled = true; go.textContent = '正在提交…';
              api('/studio/' + C.id + '/video', { prompt: pr, title: q('.vd-title').value.trim(), duration: +q('.vd-dur').value, ratio: q('.vd-ratio').value,
                first_frame: +q('.vd-first').value, after: idx, replace: isV ? idx : 0, teach: teach }, false).then(function (j) {
                done(true); toast('已提交，视频生成中，好了会提醒你'); cur = j.index - 1; refresh();
              }).catch(function (e) { toast(e.message, true); go.disabled = false; go.innerHTML = ico('movie') + '开始生成'; });
            };
          }
        });
      });
    },
    togglePanel: function () { applyPanel(document.body.classList.contains('panel-closed')); },
    show: function (i) { cur = i; renderDeck(); },
    go: function (d) { if (!S.slides.length) return; cur = Math.max(0, Math.min(S.slides.length - 1, cur + d)); renderDeck(); },
    focusCur: function () { if (!S.slides.length) return; setFocus(cur + 1); if (isMobile()) Studio.pane('chat'); ta.focus(); },
    unfocus: function () { setFocus(0); },
    stop: function () {
      stopFlag = true;
      api('/studio/' + C.id + '/cancel', { run: curRun || ((S.tasks || [])[0] || {}).run_id }, false).then(refresh);
      toast('当前这一步完成后停止');
    },
    retry: function (tid) {
      if (running) return;
      var t = (S.tasks || []).filter(function (x) { return +x.id === +tid; })[0];
      if (!t) return;
      var list = S.tasks.filter(function (x) { return +x.run_id === +t.run_id && +x.sort >= +t.sort && ['failed', 'pending', 'cancelled'].indexOf(x.status) >= 0 && x.agent !== 'leader'; })
        .sort(function (a, b) { return a.sort - b.sort; });
      curRun = t.run_id; stopFlag = false; lock(true);
      api('/studio/' + C.id + '/retry', { ids: list.map(function (x) { return x.id; }) }, false)
        .then(function () { return runTasks(list); }).catch(function () {}).finally(function () { lock(false); refresh(); });
    },
    download: function () {
      if (!S.slides.length) { toast('还没有课件可以下载', true); return; }
      busy(true, '正在生成 PPT…');
      DeckKit.exportPptx(S.slides, S.theme, C.course, $('t-title').value).then(function (n) { toast('已下载 ' + n); }).catch(function (e) { toast(e.message, true); }).finally(function () { busy(false); });
    },
    imgReplace: function () { Studio.imgPick(); },
    imgPick: function () {
      var s = S.slides[cur], idx = cur + 1, lastQ = (s.image && (s.image.query_zh || s.image.query_en)) || s.title, page = 1;
      var btns = [{ text: '上传本地图片', icon: 'upload', value: function () { return 'upload'; } }, { text: 'AI 生成一张', icon: 'sparkles', value: function (bg) { lastQ = bg.querySelector('.pk-q').value.trim() || lastQ; return 'ai'; } }];
      if (s.image) btns.push({ text: '去掉图片', icon: 'trash', cls: 'ghost danger-text', value: function () { return 'remove'; } });
      btns.push({ text: '关闭', value: function () { return null; } });
      uiModal({
        title: '为第 ' + idx + ' 页选图', cls: 'picker', buttons: btns,
        html: '<div class="pk-bar"><input class="pk-q" value="' + esc(lastQ) + '" placeholder="输入关键词，中文即可，例如：图书馆 书架"><button type="button" class="btn primary sm pk-go">搜索</button></div>' +
          '<div class="pk-note muted small"></div><div class="pk-grid"></div><div class="pk-more"><button type="button" class="btn ghost sm pk-next">换一批</button></div>',
        onOpen: function (bg, done) {
          var grid = bg.querySelector('.pk-grid'), note = bg.querySelector('.pk-note'), more = bg.querySelector('.pk-more'), input = bg.querySelector('.pk-q');
          var names = { pexels: 'Pexels', pixabay: 'Pixabay', openverse: 'Openverse' };
          function search() {
            lastQ = input.value.trim();
            if (!lastQ) { input.focus(); return; }
            grid.innerHTML = Array(6).join('<div class="pk-skel"></div>') + '<div class="pk-skel"></div>';
            more.style.display = 'none';
            note.textContent = '正在搜索真实照片…';
            api('/studio/' + C.id + '/image/search', { q: lastQ, page: page }, false).then(function (j) {
              note.textContent = j.sources.length ? '来源：' + j.sources.map(function (x) { return names[x] || x; }).join(' · ') + '，点击图片即可使用' : '没有可用的图库，可以上传本地图片或用 AI 生成';
              if (!j.items.length) {
                grid.innerHTML = '<div class="pk-empty">没有找到合适的照片。可以换个更具体的关键词（描述画面里看得见的东西），或者用 AI 生成一张。</div>';
                return;
              }
              grid.innerHTML = j.items.map(function (it, k) {
                return '<button type="button" class="pk-item" data-k="' + k + '"><img src="' + esc(it.thumb) + '" loading="lazy" referrerpolicy="no-referrer" alt=""><span>' + esc(it.credit) + '</span></button>';
              }).join('');
              more.style.display = '';
              grid.querySelectorAll('.pk-item').forEach(function (el) {
                el.querySelector('img').addEventListener('error', function () { el.remove(); });
                el.addEventListener('click', function () {
                  if (grid.classList.contains('busy')) return;
                  var it = j.items[+el.dataset.k];
                  grid.classList.add('busy'); el.classList.add('picking');
                  api('/studio/' + C.id + '/image/pick', { index: idx, url: it.url, credit: it.credit, link: it.link, source: it.source, q: lastQ }, false)
                    .then(function () { done('picked'); })
                    .catch(function (e) { toast(e.message, true); grid.classList.remove('busy'); el.classList.remove('picking'); });
                });
              });
            }).catch(function (e) { note.textContent = ''; grid.innerHTML = '<div class="pk-empty">' + esc(e.message) + '</div>'; });
          }
          bg.querySelector('.pk-go').addEventListener('click', function () { page = 1; search(); });
          bg.querySelector('.pk-next').addEventListener('click', function () { page++; search(); });
          input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); page = 1; search(); } });
          search();
        }
      }).then(function (v) {
        if (v === 'picked') { toast('已换图'); return refresh(); }
        if (v === 'upload') { $('img-up').click(); return; }
        if (v === 'remove') { Studio.imgRemove(); return; }
        if (v === 'ai') {
          busy(true, 'AI 正在生成图片（约 20–40 秒）…');
          return api('/studio/' + C.id + '/image', { index: idx, query: lastQ, ai: true }, false).then(function () { toast('已生成并配图'); return refresh(); })
            .catch(function (e) { toast(e.message, true); }).finally(function () { busy(false); });
        }
      });
    },
    imgRemove: function () {
      api('/studio/' + C.id + '/image/remove', { index: cur + 1 }, false).then(refresh).catch(function (e) { toast(e.message, true); });
    },
    undo: function () {
      if (running) return;
      api('/studio/' + C.id + '/undo', {}, false).then(function () { push({ role: 'system', content: '已撤销上一次修改' }); return refresh(); }).catch(function (e) { toast(e.message, true); });
    },
    pickStyle: function () {
      document.querySelectorAll('.dropdown.open').forEach(function (d) { d.classList.remove('open'); });
      TplKit.pick(S.theme || 'blue', S.templates || [], function (v, tpl) {
        if (tpl) refresh().then(function () { Studio.theme(v); }); else Studio.theme(v);
      }, C.course);
    },
    theme: function (t) {
      if (t === '__upload' || t === '__manage') {
        themeUI(); // 先把下拉框恢复成当前配色
        document.querySelectorAll('.dropdown.open').forEach(function (d) { d.classList.remove('open'); });
        var after = function (tpl) { refresh().then(function () { if (tpl) Studio.theme('tpl:' + tpl.id); }); };
        if (t === '__upload') TplKit.upload(after); else TplKit.manage(S.templates || [], function () { after(null); });
        return;
      }
      S.theme = t; themeUI(); renderDeck();
      api('/studio/' + C.id + '/theme', { theme: t }, false).catch(function (e) { toast(e.message, true); });
    },
    rename: function () {
      api('/studio/' + C.id + '/rename', { title: $('t-title').value, minutes: $('t-min').value }, false).then(function () { toast('已保存'); refresh(); }).catch(function (e) { toast(e.message, true); });
    },
    clearChat: function () {
      uiConfirm('清空和 AI 团队的全部对话记录？课件、资料和任务记录不受影响。', { danger: true, ok: '清空' }).then(function (ok) {
        if (ok) api('/studio/' + C.id + '/clear', {}, false).then(function () { C.msgs = []; renderMsgs(); });
      });
    },
    delMat: function (mid) {
      uiConfirm('删除这份资料？已生成的课件不受影响。', { danger: true, ok: '删除' }).then(function (ok) {
        if (ok) api('/studio/' + C.id + '/materials/' + mid + '/delete', {}, false).then(refresh).catch(function (e) { toast(e.message, true); });
      });
    },
    viewMat: function (mid) {
      fetch('/studio/' + C.id + '/materials/' + mid, { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (m) {
        var el = modal('查看 / 编辑资料', '<label>名称<input id="mm-name" value="' + esc(m.filename) + '"></label><label>内容 <small class="muted">（从文件中读出的文字，可以修改，AI 以修改后的内容为准）</small><textarea id="mm-text" rows="16">' + esc(m.content) + '</textarea></label>',
          '<button class="btn ghost" data-x>取消</button><button class="btn primary" data-save>保存</button>');
        el.querySelector('[data-x]').onclick = function () { el.remove(); };
        el.querySelector('[data-save]').onclick = function () {
          api('/studio/' + C.id + '/materials/' + mid, { filename: $('mm-name').value, content: $('mm-text').value }, false).then(function () { el.remove(); toast('已保存'); refresh(); }).catch(function (e) { toast(e.message, true); });
        };
      });
    },
    skills: function () {
      var all = S.skills || [], cat = null, html = '<p class="ui-msg muted small">最多选 6 项。“我的技能”是你自己的要求，会优先遵守；选中后，AI 团队生成或修改课件时会落实到课件、讲稿和练习中。<a href="/style#skills">管理我的技能 ›</a></p><div class="sk-pick">';
      all.forEach(function (k) {
        if (k.cat !== cat) { cat = k.cat; html += '<div class="sk-cat">' + esc(cat) + '</div>'; }
        html += '<label class="sk-opt"><input type="checkbox" value="' + k.id + '"' + (k.on ? ' checked' : '') + '><span><b>' + esc(k.name) + '</b><small>' + esc(k.sum) + '</small>' + (k.ev ? '<em>依据：' + esc(k.ev) + '</em>' : '') + '</span></label>';
      });
      html += '</div>';
      uiModal({ title: '本节课的方法与技能', html: html, cls: 'wide', buttons: [
        { text: '取消', value: function () { return null; } },
        { text: '清空', value: function () { return []; } },
        { text: '确定', cls: 'primary', value: function (bg) { return Array.prototype.map.call(bg.querySelectorAll('.sk-pick input:checked'), function (i) { return +i.value; }); } }
      ], onOpen: function (bg) {
        var box = bg.querySelector('.sk-pick');
        box.addEventListener('change', function (e) {
          if (box.querySelectorAll('input:checked').length > 6) { e.target.checked = false; toast('一节课最多选 6 项，太多反而落实不了', true); }
        });
      } }).then(function (ids) {
        if (ids === null) return;
        api('/studio/' + C.id + '/skills', { ids: ids }, false).then(function (j) {
          S.skills = j.skills; renderMats(); renderPlan();
          if (ids.length && S.slides.length) {
            var names = j.skills.filter(function (k) { return k.on; }).map(function (k) { return k.name; }).join('、');
            uiConfirm('已选定：' + names + '。\n要现在让 AI 团队按这些方法改进课件吗？', { ok: '现在改进' }).then(function (ok) { if (ok) Studio.send('请按我选定的教学方法（' + names + '）改进课件、讲稿和练习'); });
          } else toast(ids.length ? '已选定，下次生成课件时生效' : '已清空教学方法');
        }).catch(function (e) { toast(e.message, true); });
      });
    },
    setType: function (v) {
      api('/studio/' + C.id + '/type', { type: v }, false).then(function () {
        S.lessonType = v;
        var nm = v ? $('t-type').selectedOptions[0].textContent : '';
        if (v && S.slides.length) uiConfirm('课型已改为「' + nm + '」。要现在让 AI 团队按这个课型调整课件吗？', { ok: '现在调整' }).then(function (ok) { if (ok) Studio.send('这节课是' + nm + '，请按这个课型重新组织课件'); });
        else toast(v ? '课型：' + nm + '，生成课件时生效' : '已取消课型');
      }).catch(function (e) { toast(e.message, true); });
    },
    saveCmd: function () {
      var cur = $('say').value.trim();
      uiPrompt('存为常用指令', '写下你经常对 AI 团队说的一句话，以后一点就发（最多 12 条，可在「我的备课风格」里管理）', cur, { ok: '保存', placeholder: '例如：每页不超过4条，案例换成护理专业的' }).then(function (t) {
        if (!t || !t.trim()) return;
        api('/style/cmds', { cmds: [t.trim()].concat(S.cmds || []) }, false).then(function (j) { S.cmds = j.cmds; renderChips(); toast('已存为常用指令'); }).catch(function (e) { toast(e.message, true); });
      });
    },
    fromLibrary: function () {
      fetch('/library/list?title=' + encodeURIComponent($('t-title').value), { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j.items.length) { uiConfirm('你的资料库还是空的。在这里上传的资料会自动存进资料库；也可以去资料库一次上传多份。', { ok: '去我的资料库', title: '我的资料库' }).then(function (ok) { if (ok) location.href = '/library'; }); return; }
        var have = {}; S.materials.forEach(function (m) { have[m.filename] = 1; });
        var sug = {}; j.suggest.forEach(function (x) { sug[x.id] = 1; });
        var row = function (x, tag) { return '<label class="sk-opt lib-opt" data-t="' + esc((x.filename + ' ' + x.folder).toLowerCase()) + '"><input type="checkbox" value="' + x.id + '"' + (sug[x.id] && !have[x.filename] ? ' checked' : '') + '><span><b>' + esc(x.filename) + (tag ? ' <i class="lib-tag">可能相关</i>' : '') + (have[x.filename] ? ' <i class="lib-tag used">已加入</i>' : '') + '</b><small>' + (x.folder ? esc(x.folder) + ' · ' : '') + Number(x.chars).toLocaleString() + ' 字</small></span></label>'; };
        var rest = j.items.filter(function (x) { return !sug[x.id]; });
        var html = '<input class="ui-input lib-q" placeholder="搜索资料名称或分类">' + '<div class="sk-pick">' +
          (j.suggest.length ? '<div class="sk-cat">按课题推荐</div>' + j.suggest.map(function (x) { return row(x, true); }).join('') : '') +
          (rest.length ? '<div class="sk-cat">全部资料</div>' + rest.map(function (x) { return row(x); }).join('') : '') + '</div>';
        uiModal({ title: '从我的资料库添加', html: html, cls: 'wide', buttons: [
          { text: '取消', value: function () { return null; } },
          { text: '加入这节课', cls: 'primary', value: function (bg) { return Array.prototype.map.call(bg.querySelectorAll('.sk-pick input:checked'), function (i) { return +i.value; }); } }
        ], onOpen: function (bg) {
          bg.querySelector('.lib-q').addEventListener('input', function (e) { var q = e.target.value.trim().toLowerCase(); bg.querySelectorAll('.lib-opt').forEach(function (el) { el.style.display = !q || el.dataset.t.indexOf(q) >= 0 ? '' : 'none'; }); });
        } }).then(function (ids) {
          if (!ids || !ids.length) return;
          api('/studio/' + C.id + '/library', { ids: ids }, false).then(function (r) { toast(r.added ? '已加入 ' + r.added + ' 份资料' : '这些资料已经在这节课里了'); return refresh(); }).then(renderChips).catch(function (e) { toast(e.message, true); });
        });
      }).catch(function () { toast('读取资料库失败', true); });
    },
    pasteMat: function () {
      var el = modal('粘贴文字资料', '<label>名称<input id="pm-name" value="粘贴的资料"></label><label>内容<textarea id="pm-text" rows="14" placeholder="把教案、讲稿、大纲等文字直接粘贴到这里"></textarea></label>',
        '<button class="btn ghost" data-x>取消</button><button class="btn primary" data-save>添加</button>');
      el.querySelector('[data-x]').onclick = function () { el.remove(); };
      el.querySelector('[data-save]').onclick = function () {
        var nm = $('pm-name').value || '粘贴的资料';
        api('/studio/' + C.id + '/materials', { filename: nm, content: $('pm-text').value }, false).then(function () {
          el.remove(); push({ role: 'system', content: '已导入资料「' + nm + '」' }); refresh().then(renderChips);
        }).catch(function (e) { toast(e.message, true); });
      };
    }
  };

  renderMsgs(); renderAll(); renderChips();
  if (/[?&]auto=1/.test(location.search)) {
    history.replaceState(null, '', location.pathname);
    if (!S.slides.length && !C.msgs.some(function (m) { return m.role === 'user'; })) {
      send(S.materials.length ? '请根据我上传的资料，生成一套完整的课件' : '请为这节课生成一套完整的课件');
    }
  }
})();
