/* 备课工作台（DSH 插件版）：课次列表 + 课件预览与编辑 + 体检与出处核对 + 资料 + 教学设计 */
(function () {
  var S = { lessons: [], version: -1, L: null, cur: 0, tab: 'deck', selfAt: 0 };
  var $ = function (id) { return document.getElementById(id); };
  var LAYOUTS = DeckKit.LAYOUTS, PH = DeckKit.PHASES;
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('beike-' + k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('beike-' + k, v); } catch (e) {} }
  };
  var fmt = function (iso) { if (!iso) return ''; var d = new Date(iso); return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  var copy = function (text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('已复制。粘贴到 DSH 对话框发给 AI 即可'); }, function () {
      uiModal({ title: '复制下面的文字', html: '<textarea class="bk-copy" rows="6" readonly>' + esc(text) + '</textarea>', buttons: [{ text: '关闭' }] });
    });
  };

  /* ---------------- 左侧：课次列表 ---------------- */
  function renderSide() {
    var q = ($('q').value || '').trim().toLowerCase();
    var list = S.lessons.filter(function (l) { return !q || (l.title + ' ' + l.course).toLowerCase().indexOf(q) >= 0; });
    if (!S.lessons.length) { $('list').innerHTML = '<div class="bk-empty-side">还没有课次。<br>点上方「新建课次」，或在 DSH 对话里让 AI 帮你做一节课。</div>'; return; }
    if (!list.length) { $('list').innerHTML = '<div class="bk-empty-side">没有匹配的课次</div>'; return; }
    var groups = {}, order = [];
    list.forEach(function (l) { if (!groups[l.course]) { groups[l.course] = []; order.push(l.course); } groups[l.course].push(l); });
    $('list').innerHTML = order.map(function (c) {
      return '<div class="bk-group"><div class="bk-gh">' + esc(c) + '<span>' + groups[c].length + '</span></div>' + groups[c].map(function (l) {
        return '<button class="bk-item' + (S.L && S.L.id === l.id ? ' on' : '') + '" onclick="BK.open(\'' + l.id + '\')">' +
          '<div class="slide-preview mini">' + (l.first ? DeckKit.preview(l.first, 0, l.theme || 'blue', l.course) : '<div class="bk-noprev">还没有课件</div>') + '</div>' +
          '<div class="bk-it"><b>' + esc(l.title) + '</b><small>' + (l.pages ? l.pages + ' 页 · ' : '') + l.minutes + ' 分钟' + (l.materials ? ' · 资料 ' + l.materials : '') + '</small><small>' + fmt(l.updatedAt) + ' 更新</small></div></button>';
      }).join('') + '</div>';
    }).join('');
  }

  /* ---------------- 主区域 ---------------- */
  function renderWelcome() {
    var ex = [
      '用备课工作台，把 D:\\讲义\\第三章 排序.docx 做成一节 45 分钟的课件，课程是《数据结构》',
      '在备课工作台里继续完善《冒泡排序》：给每页写讲稿，再加两道课堂提问',
      '核对备课工作台里《冒泡排序》的出处，把资料里找不到依据的内容改正',
      '把《冒泡排序》导出成 PPT 放到当前工作区'
    ];
    $('main').innerHTML = '<div class="bk-top"><button class="bk-ib bk-menu" onclick="BK.side(true)">' + ico('layout-grid') + '</button></div>' +
      '<div class="bk-welcome"><h1>备课工作台</h1><p class="muted">上传资料，和 DeepSeek 说说你想怎么上这节课；课件、讲稿、课堂提问会出现在这里，可以预览、修改、核对出处、直接上课或下载 PPT。</p>' +
      '<div class="bk-steps">' +
      '<div><i>1</i><b>在 DSH 对话里说需求</b><span>例如下面这些，点一下即可复制：</span>' + ex.map(function (t) { return '<button class="bk-ex" data-t="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div>' +
      '<div><i>2</i><b>在这里查看和修改</b><span>AI 每改一次，这里自动刷新。也可以自己新建课次、上传资料、逐页编辑。</span></div>' +
      '<div><i>3</i><b>核对后上课</b><span>「体检与出处」逐条对照你的资料，揪出资料里没有的数字；点「上课」直接在浏览器里放映。</span></div>' +
      '</div></div>';
    $('main').querySelectorAll('.bk-ex').forEach(function (b) { b.onclick = function () { copy(b.dataset.t); }; });
  }

  function lessonHead() {
    var L = S.L, mins = [30, 40, 45, 50, 60, 80, 90, 100, 120], ME = BKX.me() || { types: {} };
    if (mins.indexOf(L.minutes) < 0) mins.push(L.minutes);
    return '<div class="bk-top">' +
      '<button class="bk-ib bk-menu" onclick="BK.side(true)">' + ico('layout-grid') + '</button>' +
      '<div class="bk-title"><input id="t-title" value="' + esc(L.title) + '" title="点击修改课题">' +
      '<div class="bk-meta"><input id="t-course" value="' + esc(L.course) + '" title="课程名称"> · <select id="t-min">' + mins.sort(function (a, b) { return a - b; }).map(function (m) { return '<option value="' + m + '"' + (m === L.minutes ? ' selected' : '') + '>' + m + ' 分钟</option>'; }).join('') + '</select>' +
      ' · <select id="t-type" title="课型">' + Object.keys(ME.types).map(function (k) { return '<option value="' + k + '"' + (k === (L.lessonType || 'new') ? ' selected' : '') + '>' + esc(ME.types[k][0]) + '</option>'; }).join('') + '</select>' +
      ' · <span class="muted">编号 ' + L.id + '</span></div></div>' +
      '<div class="bk-acts">' +
      '<button class="btn ghost sm" onclick="BK.pickTheme()">' + ico('palette') + '<span>' + esc(BKX.themeName(L.theme)) + '</span></button>' +
      '<button class="btn ghost sm" onclick="BK.undo()"' + (L.versions ? '' : ' disabled') + ' title="撤销上一次修改">' + ico('arrow-back-up') + '<span>撤销</span></button>' +
      '<a class="btn ghost sm" href="' + BASE + '/present/' + L.id + '" target="_blank"' + (L.slides.length ? '' : ' hidden') + '>' + ico('presentation-analytics') + '<span>上课</span></a>' +
      '<a class="btn primary sm" href="' + BASE + '/api/lesson/' + L.id + '/pptx"' + (L.slides.length ? '' : ' hidden') + '>' + ico('download') + '<span>下载 PPT</span></a>' +
      '<div class="bk-more"><button class="bk-ib" onclick="BK.more(event)" title="更多">' + ico('dots') + '</button><div class="bk-menu-pop" id="more-pop" hidden>' +
      '<a href="' + BASE + '/api/lesson/' + L.id + '/docx">' + ico('file-word') + '下载教案（Word）</a>' +
      '<a href="' + BASE + '/print/' + L.id + '" target="_blank">' + ico('printer') + '打印教案 / 存 PDF</a>' +
      '<button onclick="BK.versions()">' + ico('history') + '版本历史</button>' +
      '<button onclick="BK.methods()">' + ico('bulb') + '教学方法</button>' +
      '<button onclick="BK.del()" class="danger-text">' + ico('trash') + '删除这节课</button></div></div>' +
      '</div></div>';
  }

  function renderLesson() {
    var L = S.L;
    var warn = L.health.filter(function (h) { return h[0] === 'warn'; }).length + ((L.ground.sum || {}).nums ? 1 : 0);
    var tabs = [['deck', '课件'], ['check', '体检与出处', warn], ['mats', '资料', L.materials.length], ['plan', '教学设计']];
    $('main').innerHTML = lessonHead() +
      '<div class="bk-tabs">' + tabs.map(function (t) { return '<button data-tab="' + t[0] + '" class="' + (S.tab === t[0] ? 'on' : '') + '">' + t[1] + (t[2] ? '<b>' + t[2] + '</b>' : '') + '</button>'; }).join('') + '</div>' +
      '<div class="bk-pane" id="pane"></div>';
    $('main').querySelectorAll('.bk-tabs button').forEach(function (b) { b.onclick = function () { S.tab = b.dataset.tab; store.set('tab', S.tab); renderLesson(); }; });
    var save = function (k, v) { var b = {}; b[k] = v; api('/lesson/' + L.id, { body: b }).then(function () { S.selfAt = Date.now(); L[k] = v; poll(true); }, function (e) { toast(e.message, true); }); };
    $('t-title').onchange = function () { if (this.value.trim()) save('title', this.value.trim()); };
    $('t-course').onchange = function () { if (this.value.trim()) save('course', this.value.trim()); };
    $('t-min').onchange = function () { save('minutes', +this.value); setTimeout(reload, 200); };
    $('t-type').onchange = function () { save('lessonType', this.value); toast('课型已改为「' + this.options[this.selectedIndex].text + '」，让 AI 修改课件时会按新课型来'); };
    ({ deck: paneDeck, check: paneCheck, mats: paneMats, plan: panePlan })[S.tab]();
  }

  /* 课件 */
  function paneDeck() {
    var L = S.L, n = L.slides.length;
    if (!n) {
      $('pane').innerHTML = '<div class="empty-soft bk-emptydeck"><b>这节课还没有课件</b><p>在 DSH 对话里说：“用备课工作台给《' + esc(L.title) + '》做课件（课次编号 ' + L.id + '）”，或者先在「资料」里上传讲义，再让 AI 依据资料制作。</p>' +
        '<button class="btn sm" onclick="BK.copyMake()">' + ico('copy') + '复制这句话</button> <button class="btn ghost sm" onclick="BK.addSlide()">' + ico('plus') + '自己从空白页开始</button></div>';
      return;
    }
    if (S.cur >= n) S.cur = n - 1;
    var s = L.slides[S.cur], pm = L.pace[S.cur];
    var gi = (L.ground.items || []).filter(function (x) { return x.page === S.cur + 1; });
    var na = gi.filter(function (x) { return x.status === 'ai'; }).length, nn = gi.filter(function (x) { return x.nums.length; }).length;
    $('pane').innerHTML =
      '<div class="bk-stage"><div class="slide-preview bk-big">' + DeckKit.preview(s, S.cur, L.theme, L.course) + '</div></div>' +
      '<div class="bk-pg"><span class="muted">第 ' + (S.cur + 1) + ' / ' + n + ' 页 · ' + (LAYOUTS[s.layout] || '') + (PH[s.phase] ? ' · ' + PH[s.phase] : '') + (pm ? ' · 约 ' + pm + ' 分钟' : '') + '</span>' +
      '<span class="bk-tools">' +
      '<button class="btn ghost sm" onclick="BK.edit()">' + ico('pencil') + '编辑本页</button>' +
      '<button class="btn ghost sm" onclick="BK.addSlide()">' + ico('plus') + '后面加一页</button>' +
      (s.layout === 'video' ? (s.video && s.video.status === 'failed' ? '<button class="btn ghost sm" onclick="BK.retryVideo()">' + ico('refresh') + '重新生成视频</button>' : '') :
        '<button class="btn ghost sm" onclick="BK.img()">' + ico('photo') + (s.image ? '换图' : '配图') + '</button>') +
      '<button class="btn ghost sm" onclick="BK.video()" title="用 MiniMax 生成课堂短视频，插在本页后面">' + ico('movie') + '视频</button>' +
      '<button class="btn ghost sm" onclick="BK.only()" title="复制“只改这一页”的指令，发给 AI">' + ico('focus-2') + '只改这一页</button>' +
      '<button class="bk-ib" onclick="BK.dup()" title="复制本页">' + ico('copy') + '</button>' +
      '<button class="bk-ib" onclick="BK.move(-1)" title="上移"' + (S.cur ? '' : ' disabled') + '>' + ico('arrow-up') + '</button>' +
      '<button class="bk-ib" onclick="BK.move(1)" title="下移"' + (S.cur < n - 1 ? '' : ' disabled') + '>' + ico('arrow-down') + '</button>' +
      '<button class="bk-ib" onclick="BK.delSlide()" title="删除本页">' + ico('trash') + '</button>' +
      '</span></div>' +
      (na || nn ? '<div class="ground-here">' + (nn ? ico('alert-triangle') + '本页有 ' + nn + ' 处数字在你的资料里找不到' : ico('info-circle') + '本页有 ' + na + ' 条内容是 AI 补充的') + '，<a href="#" onclick="BK.tab(\'check\');return false">去核对</a></div>' : '') +
      cmdsBar() +
      '<div class="notes-box">' + (s.notes || (s.layout === 'quiz' && s.answer) ? '<b>讲稿备注</b>' + nl2br(s.notes || '') + (s.layout === 'quiz' && s.answer ? '<br><b class="bk-ans">答案</b>' + nl2br(s.answer) : '') : '') + '</div>' +
      '<div class="strip">' + L.slides.map(function (sl, i) {
        return '<div class="th' + (i === S.cur ? ' on' : '') + '" onclick="BK.go(' + i + ')"><div class="slide-preview">' + DeckKit.preview(sl, i, L.theme, L.course) + '</div><span>' + (i + 1) + '</span></div>';
      }).join('') + '</div>';
    var on = $('pane').querySelector('.th.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  /** 常用指令：一点就复制（带上课次和页码），发给 DSH 里的 AI */
  function cmdsBar() {
    var c = (BKX.me() || {}).cmds || [];
    return '<div class="bk-cmds">' + c.map(function (x, i) { return '<button class="bk-cmd" onclick="BK.cmd(' + i + ')" title="复制这条指令">' + esc(x) + '</button>'; }).join('') +
      '<button class="bk-cmd add" onclick="BK.page(\'style\')" title="在「我的备课风格」里管理常用指令">' + ico('plus') + (c.length ? '' : '常用指令') + '</button></div>';
  }

  /* 体检与出处 */
  function paneCheck() {
    var L = S.L, G = L.ground || {}, u = G.sum || {};
    var h = '<div class="plan"><div class="pl"><h4>课件体检 <small class="muted">（按固定规则自动检查，不依赖 AI）</small></h4><ul class="checks">' +
      (L.health.length ? L.health.map(function (x) { return '<li class="' + (x[0] === 'ok' ? 'info' : x[0]) + '">' + esc(x[1]) + '</li>'; }).join('') : '<li class="info">有课件后自动检查。</li>') + '</ul>' +
      (L.health.some(function (x) { return x[0] === 'warn'; }) ? '<button class="btn sm" onclick="BK.copyFix()">' + ico('copy') + '复制修改指令，发给 AI</button>' : '') + '</div>';
    h += '<div class="pl gr"><h4>出处核对 <small class="muted">（逐条对照你的资料）</small></h4>';
    if (!L.slides.length) h += '<p class="muted small">有课件后自动核对。</p>';
    else if (!G.has) h += '<p class="muted small">这节课还没有资料可对照。在「资料」里上传讲义、教材或旧课件后，这里会逐条标出哪些内容来自你的资料、哪些是 AI 补充的，以及资料里查不到的数字。</p>';
    else if (!u.all) h += '<p class="muted small">课件里没有需要核对的要点。</p>';
    else {
      var pc = function (k) { return Math.round((u[k] || 0) * 100 / u.all); };
      h += '<div class="gr-bar"><i class="src" style="width:' + pc('src') + '%"></i><i class="part" style="width:' + pc('part') + '%"></i><i class="ai" style="width:' + pc('ai') + '%"></i></div>' +
        '<p class="gr-sum small">共核对 ' + u.all + ' 条：<b class="c-src">有出处 ' + (u.src || 0) + '</b> · <b class="c-part">部分有出处 ' + (u.part || 0) + '</b> · <b class="c-ai">AI 补充 ' + (u.ai || 0) + '</b>' + (u.nums ? ' · <b class="c-num">' + u.nums + ' 处数字资料里没有</b>' : '') + '</p>' +
        '<p class="muted small">AI 补充不一定是错的（举例、过渡语），上课前扫一眼即可；数字、年份、百分比请务必核实。</p>';
      var items = G.items || [], lab = { ai: 'AI 补充', part: '部分有出处', num: '讲稿数字' };
      if (!items.length) h += '<p class="ok-line small">' + ico('check') + '所有内容都能在资料里找到出处。</p>';
      else {
        h += '<ul class="gr-list">' + items.slice(0, 40).map(function (x, k) {
          return '<li class="g-' + x.status + (x.nums.length ? ' g-num' : '') + '"><div class="gr-h"><a href="#" onclick="BK.go(' + (x.page - 1) + ');BK.tab(\'deck\');return false">第 ' + x.page + ' 页</a><span class="gr-tag">' + (x.nums.length ? '数字待核实' : lab[x.status]) + '</span><span class="muted">' + esc(x.field) + '</span></div>' +
            '<div class="gr-t">' + esc(x.text) + '</div>' +
            (x.nums.length ? '<div class="gr-n">资料里找不到：' + x.nums.map(function (n) { return '<code>' + esc(n) + '</code>'; }).join(' ') + '</div>' : '') +
            (x.quote ? '<div class="gr-q"><span>最接近的资料原文</span>' + esc(x.quote) + '</div>' : '') +
            '<button class="btn ghost sm" onclick="BK.copyVerify(' + k + ')">' + ico('copy') + '复制核对指令</button></li>';
        }).join('') + '</ul>';
        h += '<button class="btn sm" onclick="BK.copyVerifyAll()">' + ico('shield-check') + '复制全部核对指令，发给 AI</button>';
      }
    }
    $('pane').innerHTML = h + '</div></div>';
  }

  /* 资料 */
  function paneMats() {
    var L = S.L;
    $('pane').innerHTML = '<div class="plan"><div class="pl"><h4>本节课的资料</h4><p class="muted small">讲义、教材章节、旧课件、教学大纲都可以。AI 会以这些资料为准制作课件，「出处核对」也用它们来对照。支持 Word（.docx）、PowerPoint（.pptx）、文本（.txt / .md）；PDF 请让 AI 先转成文字。</p>' +
      '<label class="bk-drop" id="drop">' + ico('upload') + '<b>点击选择文件，或把文件拖到这里</b><small>可以一次选多个</small><input type="file" id="f-up" class="bk-file" multiple accept=".docx,.pptx,.txt,.md,.markdown,.csv,.html,.htm"></label>' +
      '<div class="bk-row"><button class="btn sm" onclick="BK.fromLib()">' + ico('books') + '从我的资料库添加</button><span class="muted small">上传的资料也会自动存进资料库，以后的课可以复用</span></div>' +
      '<details class="bk-paste"><summary>粘贴文字</summary><input id="p-name" placeholder="资料名称，例如：教材第三章"><textarea id="p-text" rows="6" placeholder="把资料文字粘贴到这里"></textarea><button class="btn sm" onclick="BK.paste()">添加</button></details>' +
      (L.materials.length ? '<ul class="bk-mats">' + L.materials.map(function (m) {
        return '<li>' + ico('file-text') + '<div><b>' + esc(m.name) + '</b><small>' + m.chars.toLocaleString() + ' 字 · ' + fmt(m.addedAt) + '</small></div><button class="btn ghost sm" onclick="BK.viewMat(\'' + m.id + '\')">' + ico('pencil') + '查看 / 修改</button><button class="bk-ib" onclick="BK.delMat(\'' + m.id + '\')" title="删除">' + ico('trash') + '</button></li>';
      }).join('') + '</ul>' : '<p class="muted small bk-nomat">还没有资料。</p>') + '</div></div>';
    var up = function (files) {
      var arr = [].slice.call(files || []);
      if (!arr.length) return;
      var i = 0;
      var next = function () {
        if (i >= arr.length) { toast('已添加 ' + arr.length + ' 份资料'); return reload(); }
        var f = arr[i++];
        toast('正在读取：' + f.name);
        fetch(BASE + '/api/lesson/' + L.id + '/material', { method: 'POST', headers: { 'X-Beike': '1', 'X-File-Name': encodeURIComponent(f.name) }, body: f, credentials: 'same-origin' })
          .then(function (r) { return r.json(); }).then(function (j) { if (j.error) toast(f.name + '：' + j.error, true); S.selfAt = Date.now(); next(); }, function () { toast(f.name + ' 上传失败', true); next(); });
      };
      next();
    };
    $('f-up').onchange = function () { up(this.files); this.value = ''; };
    var d = $('drop');
    d.ondragover = function (e) { e.preventDefault(); d.classList.add('over'); };
    d.ondragleave = function () { d.classList.remove('over'); };
    d.ondrop = function (e) { e.preventDefault(); d.classList.remove('over'); up(e.dataTransfer.files); };
  }

  /* 教学设计 */
  function panePlan() {
    var L = S.L, P = L.plan || {};
    var F = [['analysis', '学情分析', '学生已有的基础、可能的困难、学习特点'], ['objectives', '学习目标', '学完能够……（可观测：说出 / 解释 / 计算 / 分析 / 设计）'], ['key', '教学重点', ''], ['difficult', '教学难点', ''], ['misconceptions', '学生可能的误区及对策', ''],
      ['process', '教学过程（BOPPPS）', '导入 → 目标 → 前测 → 参与式学习 → 后测 → 总结，每段写时长与师生活动'], ['ideology', '课程思政', '融入点和方式（自然融入，不贴标签）'], ['homework', '作业与课后任务', ''], ['board', '板书设计', ''], ['reflection', '课后反思', '哪个目标没达成、哪个环节时间不准、下次怎么改']];
    var ms = L.methods || [];
    $('pane').innerHTML = '<div class="plan"><div class="pl"><h4>教学方法 <small class="muted">选定后 AI 必须落实到课件、讲稿和练习里</small></h4><div class="bk-chips">' +
      (ms.length ? ms.map(function (m) { return '<span class="bk-chip on" title="' + esc(m.summary || '') + '">' + esc(m.name) + (m.mine ? ' · 我的技能' : '') + '</span>'; }).join('') : '<span class="muted small">还没有选择</span>') +
      '</div><button class="btn ghost sm" onclick="BK.methods()">' + ico('pencil') + '选择教学方法</button></div>' +
      '<div class="pl"><div class="bk-form"><label>授课对象 <small class="muted">例如“计算机专业大二，基础一般”，学情分析和讲解深度会更贴合</small><input id="aud" value="' + esc(L.audience || '') + '" maxlength="200"></label></div></div>' +
      '<div class="pl bk-planf"><p class="muted small">可以自己填写，也可以在 DSH 对话里说“为《' + esc(L.title) + '》写教学设计”，AI 会写进这里。' +
      ' <a href="' + BASE + '/api/lesson/' + L.id + '/docx">下载 Word 教案</a> · <a href="' + BASE + '/print/' + L.id + '" target="_blank">打印 / 存 PDF</a></p>' +
      F.map(function (f) { return '<label><b>' + f[1] + '</b><textarea data-k="' + f[0] + '" rows="' + (f[0] === 'process' ? 7 : 3) + '" placeholder="' + esc(f[2]) + '">' + esc(P[f[0]] || '') + '</textarea></label>'; }).join('') +
      '<button class="btn primary" onclick="BK.savePlan()">' + ico('check') + '保存教学设计</button></div></div>';
    $('aud').onchange = function () { S.selfAt = Date.now(); api('/lesson/' + L.id, { body: { audience: this.value } }).then(function () { toast('已保存授课对象'); reload(); }, function (e) { toast(e.message, true); }); };
  }

  /* ---------------- 编辑 ---------------- */
  function saveSlides(slides, note) {
    S.selfAt = Date.now();
    return api('/lesson/' + S.L.id + '/slides', { body: { slides: slides, note: note } }).then(reload, function (e) { toast(e.message, true); });
  }
  var lines = function (v) { return String(v || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); };
  function editForm(s) {
    var opt = function (o, v) { return Object.keys(o).map(function (k) { return '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + esc(o[k]) + '</option>'; }).join(''); };
    var lay = {}; Object.keys(LAYOUTS).forEach(function (k) { if ((k === 'video') === (s.layout === 'video')) lay[k] = LAYOUTS[k]; });
    var ph = { '': '（不标）' }; Object.keys(PH).forEach(function (k) { ph[k] = PH[k]; });
    return '<div class="bk-form"><div class="row2"><label>版式<select data-k="layout">' + opt(lay, s.layout) + '</select></label><label>教学环节<select data-k="phase">' + opt(ph, s.phase) + '</select></label></div>' +
      '<label>标题<input data-k="title" value="' + esc(s.title) + '"></label>' +
      '<label class="f-sub">副标题<input data-k="subtitle" value="' + esc(s.subtitle) + '"></label>' +
      '<label class="f-bul">要点 <small class="muted">每行一条，每条不超过 25 字效果最好</small><textarea data-k="bullets" rows="5">' + esc((s.bullets || []).join('\n')) + '</textarea></label>' +
      '<div class="row2 f-two"><label>左栏标题<input data-k="left_title" value="' + esc(s.left_title) + '"></label><label>右栏标题<input data-k="right_title" value="' + esc(s.right_title) + '"></label>' +
      '<label>左栏（每行一条）<textarea data-k="left" rows="4">' + esc((s.left || []).join('\n')) + '</textarea></label><label>右栏（每行一条）<textarea data-k="right" rows="4">' + esc((s.right || []).join('\n')) + '</textarea></label></div>' +
      '<div class="f-quiz"><label>题目<textarea data-k="question" rows="2">' + esc(s.question) + '</textarea></label><label>选项（每行一个，例如 A. ……）<textarea data-k="options" rows="4">' + esc((s.options || []).join('\n')) + '</textarea></label><label>答案与讲解 <small class="muted">不显示在幻灯片上，上课时按 A 才显示</small><input data-k="answer" value="' + esc(s.answer) + '"></label></div>' +
      '<div class="f-dg"><label>导语<input data-k="lead" value="' + esc(s.lead) + '"></label><label>结构图数据 <small class="muted">一般让 AI 来改；高级用户可直接编辑 JSON</small><textarea data-k="diagram" rows="6" class="mono">' + esc(s.diagram ? JSON.stringify(s.diagram, null, 1) : '') + '</textarea></label></div>' +
      '<label>讲稿备注 <small class="muted">开头写“【约3分钟】”可让课时估算更准</small><textarea data-k="notes" rows="5">' + esc(s.notes) + '</textarea></label></div>';
  }
  function syncForm(bg) {
    var l = bg.querySelector('[data-k=layout]').value;
    var show = function (cls, on) { bg.querySelectorAll(cls).forEach(function (el) { el.hidden = !on; }); };
    show('.f-sub', ['title', 'section'].indexOf(l) >= 0);
    show('.f-bul', ['bullets', 'objectives', 'summary'].indexOf(l) >= 0);
    show('.f-two', l === 'two'); show('.f-quiz', l === 'quiz'); show('.f-dg', l === 'diagram');
  }
  function readForm(bg, base) {
    var g = function (k) { var el = bg.querySelector('[data-k=' + k + ']'); return el ? el.value : ''; };
    var s = Object.assign({}, base, { layout: g('layout'), phase: g('phase'), title: g('title'), subtitle: g('subtitle'), bullets: lines(g('bullets')), left_title: g('left_title'), right_title: g('right_title'),
      left: lines(g('left')), right: lines(g('right')), question: g('question'), options: lines(g('options')), answer: g('answer'), lead: g('lead'), notes: g('notes') });
    var dj = g('diagram').trim();
    if (s.layout === 'diagram') { try { s.diagram = dj ? JSON.parse(dj) : null; } catch (e) { throw new Error('结构图 JSON 格式有误：' + e.message); } }
    return s;
  }
  function editSlide(idx, isNew) {
    var L = S.L, base = isNew ? { layout: 'bullets', phase: (L.slides[idx - 1] || {}).phase || '', title: '', bullets: [], notes: '' } : L.slides[idx];
    uiModal({ title: isNew ? '在第 ' + idx + ' 页后新增一页' : '编辑第 ' + (idx + 1) + ' 页', cls: 'wide bk-edit', html: editForm(base), noFocus: true,
      buttons: [{ text: '取消', value: function () { return null; } }, { text: '保存', cls: 'primary', value: function (bg) { try { return readForm(bg, base); } catch (e) { toast(e.message, true); return null; } } }],
      onOpen: function (bg) { syncForm(bg); bg.querySelector('[data-k=layout]').onchange = function () { syncForm(bg); }; }
    }).then(function (s) {
      if (!s) return;
      var arr = L.slides.slice();
      if (isNew) { arr.splice(idx, 0, s); S.cur = idx; } else arr[idx] = s;
      if (s.layout === 'diagram' && !s.diagram) toast('结构图数据不完整，这一页会按要点页显示', true);
      saveSlides(arr, isNew ? '新增第' + (idx + 1) + '页' : '编辑第' + (idx + 1) + '页');
    });
  }

  function pickTheme() {
    BKX.pickStyle(S.L, function (v) {
      S.selfAt = Date.now();
      api('/lesson/' + S.L.id, { body: { theme: v } }).then(function () { toast('已换成「' + BKX.themeName(v) + '」'); reload(); }, function (e) { toast(e.message, true); });
    });
  }

  /* ---------------- 数据加载与自动刷新 ---------------- */
  function reload() {
    if (!S.L) return poll(true);
    return api('/lesson/' + S.L.id).then(function (L) { S.L = L; renderLesson(); poll(true); }, function (e) { toast(e.message, true); S.L = null; renderWelcome(); poll(true); });
  }
  function poll(force) {
    return api('/state').then(function (j) {
      if (!force && j.version === S.version) return;
      // 编辑窗口打开时不打断老师：先不记下新版本号，关闭后下一次轮询再刷新
      if (!force && document.querySelector('.ui-modal')) return;
      var prevTop = S.top;
      if (S.version >= 0 && j.version !== S.version) BKX.loadMe().catch(function () {});
      S.version = j.version; S.lessons = j.lessons; renderSide();
      // 在 DSH 右侧栏里：跟着 AI 走——AI 刚新建或修改的课次自动切换过来
      var top = j.lessons[0];
      S.top = top ? top.id + '@' + top.updatedAt : '';
      if (window.EMBED === 'side' && top && prevTop !== undefined && S.top !== prevTop && (!S.L || S.L.id !== top.id) && Date.now() - S.selfAt > 4000) {
        toast('AI 正在修改《' + top.title + '》，已切换过来'); BK.open(top.id); return;
      }
      if (S.L) {
        var me = j.lessons.filter(function (l) { return l.id === S.L.id; })[0];
        if (!me) { S.L = null; renderWelcome(); return; }
        if (me.updatedAt !== S.L.updatedAt) {
          api('/lesson/' + S.L.id).then(function (L) { S.L = L; renderLesson(); if (Date.now() - S.selfAt > 4000) toast('课件已更新'); });
        }
      }
    }).catch(function () {});
  }
  setInterval(poll, 2500);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
  document.addEventListener('keydown', function (e) {
    if (!S.L || S.tab !== 'deck' || document.querySelector('.ui-modal') || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); BK.go(S.cur + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); BK.go(S.cur - 1); }
  });

  var mk = function (L) { return '用备课工作台给课次 ' + L.id + '《' + L.title + '》（' + L.course + '，' + L.minutes + ' 分钟）'; };
  window.BK = {
    renderSide: renderSide,
    side: function (on) { document.body.classList.toggle('side-open', !!on); },
    open: function (id) {
      BK.side(false);
      api('/lesson/' + id).then(function (L) { var same = S.L && S.L.id === id; S.L = L; S.view = ''; store.set('view', ''); if (!same) S.cur = 0; store.set('last', id); renderLesson(); renderSide(); BK.mark(); }, function (e) { toast(e.message, true); });
    },
    tab: function (t) { S.tab = t; renderLesson(); },
    go: function (i) { if (!S.L) return; S.cur = Math.max(0, Math.min(S.L.slides.length - 1, i)); paneDeck(); },
    newLesson: function (pre) {
      pre = pre || {};
      var ME = BKX.me() || { types: {} }, lib = pre.library || [];
      uiModal({ title: '新建课次', cls: 'wide', html: '<div class="bk-form"><label>课题<input id="n-title" value="' + esc(pre.title || '') + '" placeholder="例如：冒泡排序"></label>' +
        '<div class="row2"><label>课程<input id="n-course" value="' + esc(pre.course || (S.lessons[0] || {}).course || '') + '" placeholder="例如：数据结构"></label>' +
        '<label>课时<select id="n-min">' + [40, 45, 50, 80, 90, 100].map(function (m) { return '<option' + (m === 45 ? ' selected' : '') + '>' + m + '</option>'; }).join('') + '</select></label></div>' +
        '<label>课型</label><div class="bk-chips" id="n-type">' + Object.keys(ME.types).map(function (k, i) { return '<label class="bk-chip" title="' + esc(ME.types[k][1]) + '"><input type="radio" name="nt" value="' + k + '"' + (i === 0 ? ' checked' : '') + '>' + esc(ME.types[k][0]) + '</label>'; }).join('') + '</div>' +
        '<label>授课对象（可选）<input id="n-aud" placeholder="例如：计算机专业大二，基础一般"></label>' +
        '<div id="n-sug"></div></div>',
        noFocus: true,
        buttons: [{ text: '取消', value: function () { return null; } }, { text: '创建', cls: 'primary', value: function (bg) {
          return { title: bg.querySelector('#n-title').value.trim(), course: bg.querySelector('#n-course').value.trim(), minutes: +bg.querySelector('#n-min').value,
            lessonType: (bg.querySelector('input[name=nt]:checked') || {}).value, audience: bg.querySelector('#n-aud').value.trim(),
            library: [].map.call(bg.querySelectorAll('#n-sug input:checked'), function (i) { return i.value; }) };
        } }],
        onOpen: function (bg) {
          var t, sug = function () {
            var q = bg.querySelector('#n-title').value.trim() + ' ' + bg.querySelector('#n-course').value.trim();
            if (!q.trim()) { bg.querySelector('#n-sug').innerHTML = ''; return; }
            api('/library/suggest?title=' + encodeURIComponent(q)).then(function (j) {
              var ids = j.items.map(function (x) { return x.id; }); lib.forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
              bg.querySelector('#n-sug').innerHTML = j.items.length || lib.length ? '<label>资料库里可能相关的资料 <small class="muted">勾选的会一起带进这节课</small></label>' + j.items.map(function (x) {
                return '<label class="bk-ck"><input type="checkbox" value="' + x.id + '" checked><span><b>' + esc(x.name) + '</b><small>' + esc(x.folder || '未分类') + ' · ' + x.chars.toLocaleString() + ' 字</small></span></label>';
              }).join('') + lib.filter(function (id) { return !j.items.some(function (x) { return x.id === id; }); }).map(function (id) { return '<input type="checkbox" value="' + id + '" checked hidden>'; }).join('') : '';
            }).catch(function () {});
          };
          ['#n-title', '#n-course'].forEach(function (k) { bg.querySelector(k).addEventListener('input', function () { clearTimeout(t); t = setTimeout(sug, 400); }); });
          bg.querySelector('#n-title').focus();
          sug();
        }
      }).then(function (b) {
        if (!b) return;
        if (!b.title) { toast('请填写课题', true); return; }
        api('/lesson', { body: b }).then(function (j) { if (j.attached && j.attached.length) toast('已带入 ' + j.attached.length + ' 份资料'); S.tab = 'mats'; BK.open(j.id); poll(true); }, function (e) { toast(e.message, true); });
      });
    },
    del: function () {
      BK.closeMore();
      uiConfirm('删除《' + S.L.title + '》以及它的课件、资料和图片？此操作无法恢复。', { danger: true, ok: '删除' }).then(function (ok) {
        if (!ok) return;
        api('/lesson/' + S.L.id + '/delete', { body: {} }).then(function () { toast('已删除'); S.L = null; renderWelcome(); poll(true); }, function (e) { toast(e.message, true); });
      });
    },
    undo: function () { S.selfAt = Date.now(); api('/lesson/' + S.L.id + '/undo', { body: {} }).then(function (j) { toast('已撤销：' + j.note); reload(); }, function (e) { toast(e.message, true); }); },
    edit: function () { editSlide(S.cur, false); },
    addSlide: function () { editSlide(S.L.slides.length ? S.cur + 1 : 0, true); },
    move: function (d) {
      var a = S.L.slides.slice(), i = S.cur, j = i + d;
      if (j < 0 || j >= a.length) return;
      var t = a[i]; a[i] = a[j]; a[j] = t; S.cur = j;
      saveSlides(a, '第' + (i + 1) + '页' + (d < 0 ? '上移' : '下移'));
    },
    delSlide: function () {
      uiConfirm('删除第 ' + (S.cur + 1) + ' 页「' + (S.L.slides[S.cur].title || '') + '」？可以用「撤销」恢复。', { danger: true, ok: '删除' }).then(function (ok) {
        if (!ok) return;
        var a = S.L.slides.slice(); a.splice(S.cur, 1); saveSlides(a, '删除第' + (S.cur + 1) + '页');
      });
    },
    img: function () {
      var sl = S.L.slides[S.cur];
      if (['title', 'bullets', 'objectives', 'summary', 'section'].indexOf(sl.layout) < 0) { toast('封面、要点、学习目标、小结、章节过渡页可以配图', true); return; }
      BKX.imageDialog(S.L, S.cur, function () { S.selfAt = Date.now(); reload(); });
    },
    video: function () { BKX.videoDialog(S.L, S.cur, function (i) { S.selfAt = Date.now(); if (i !== undefined) S.cur = i; reload(); }); },
    retryVideo: function () {
      S.selfAt = Date.now();
      api('/lesson/' + S.L.id + '/video/retry', { body: { index: S.cur + 1 } }).then(function () { toast('已重新提交，生成好会自动出现'); reload(); }, function (e) { toast(e.message, true); });
    },
    dup: function () {
      var a = S.L.slides.slice(), c = JSON.parse(JSON.stringify(a[S.cur]));
      if (c.layout === 'video') { toast('视频页不能复制，可以用「视频」再生成一段', true); return; }
      a.splice(S.cur + 1, 0, c); S.cur++;
      saveSlides(a, '复制第' + S.cur + '页');
    },
    only: function () {
      var sl = S.L.slides[S.cur];
      uiModal({ title: '只改第 ' + (S.cur + 1) + ' 页', html: '<div class="bk-form"><label>想怎么改？<textarea rows="3" placeholder="例如：例子换成医学专业学生熟悉的场景；字太多，精简到 4 条"></textarea></label><p class="muted small">点「复制」后，粘贴到 DSH 对话框发给 AI。AI 只会改这一页，其他页不动。</p></div>',
        buttons: [{ text: '取消', value: function () { return null; } }, { text: '复制', cls: 'primary', value: function (bg) { return bg.querySelector('textarea').value.trim(); } }]
      }).then(function (t) {
        if (t === null) return;
        BKX.copy(mk(S.L) + '只修改第 ' + (S.cur + 1) + ' 页「' + (sl.title || '') + '」：' + (t || '请改得更好') + '。用 beike_save_slides 的 patch 模式只更新这一页，不要动其他页。');
      });
    },
    cmd: function (i) {
      var c = (BKX.me().cmds || [])[i]; if (!c) return;
      BKX.copy(mk(S.L) + (S.tab === 'deck' && S.L.slides.length ? '（当前看的是第 ' + (S.cur + 1) + ' 页）' : '') + '：' + c);
    },
    fromLib: function () { BKX.pickLibrary(S.L, function () { S.selfAt = Date.now(); reload(); }); },
    methods: function () {
      BK.closeMore();
      BKX.pickMethods((S.L.methods || []).map(function (m) { return m.key; }), '《' + S.L.title + '》的教学方法').then(function (keys) {
        if (!keys) return;
        S.selfAt = Date.now();
        api('/lesson/' + S.L.id, { body: { methods: keys } }).then(function () {
          reload();
          if (S.L.slides.length && keys.length) uiConfirm('已保存。要现在让 AI 按这些方法改进课件吗？（会复制一句指令，粘贴到 DSH 对话框发送）', { ok: '复制指令' }).then(function (ok) { if (ok) BKX.copy(mk(S.L) + '按这节课选定的教学方法改进课件：先用 beike_get_lesson 看备课须知，把每种方法落实到具体页面、讲稿和练习，并告诉我落实在哪几页。'); });
        }, function (e) { toast(e.message, true); });
      });
    },
    versions: function () { BK.closeMore(); BKX.versionsDialog(S.L, function () { S.selfAt = Date.now(); reload(); }); },
    more: function (e) { e.stopPropagation(); var p = $('more-pop'); p.hidden = !p.hidden; },
    closeMore: function () { var p = $('more-pop'); if (p) p.hidden = true; },
    page: function (name) {
      BK.side(false); S.L = null; S.view = name; store.set('view', name); renderSide();
      ({ library: BKX.libraryPage, style: BKX.stylePage, brand: BKX.brandPage, settings: BKX.settingsPage })[name]();
    },
    mark: function () { document.querySelectorAll('.bk-nav button').forEach(function (b) { b.classList.toggle('on', !S.L && b.dataset.page === S.view); }); },
    pickTheme: pickTheme,
    paste: function () {
      var t = $('p-text').value.trim(); if (!t) { toast('请先粘贴文字', true); return; }
      S.selfAt = Date.now();
      api('/lesson/' + S.L.id + '/material', { body: { name: $('p-name').value.trim() || '粘贴的文字', text: t } }).then(function () { toast('已添加'); reload(); }, function (e) { toast(e.message, true); });
    },
    viewMat: function (mid) {
      api('/lesson/' + S.L.id + '/material/' + mid).then(function (j) {
        var m = S.L.materials.filter(function (x) { return x.id === mid; })[0] || {};
        uiModal({ title: '资料', cls: 'wide', noFocus: true,
          html: '<div class="bk-form"><label>名称<input data-k="name" value="' + esc(m.name || '') + '"></label><label>文字 <small class="muted">可以直接修改，例如删掉无关的页眉页脚；出处核对按修改后的文字对照</small><textarea data-k="text" rows="16" class="bk-mat-edit">' + esc(j.text) + '</textarea></label></div>',
          buttons: [{ text: '关闭', value: function () { return null; } }, { text: '保存修改', cls: 'primary', value: function (bg) { return { name: bg.querySelector('[data-k=name]').value, text: bg.querySelector('[data-k=text]').value }; } }]
        }).then(function (o) {
          if (!o) return;
          S.selfAt = Date.now();
          api('/lesson/' + S.L.id + '/material/' + mid, { body: o }).then(function () { toast('已保存'); reload(); }, function (e) { toast(e.message, true); });
        });
      }, function (e) { toast(e.message, true); });
    },
    delMat: function (mid) {
      uiConfirm('删除这份资料？', { danger: true, ok: '删除' }).then(function (ok) {
        if (!ok) return; S.selfAt = Date.now();
        api('/lesson/' + S.L.id + '/material/' + mid + '/delete', { body: {} }).then(reload, function (e) { toast(e.message, true); });
      });
    },
    savePlan: function () {
      var plan = {}; $('pane').querySelectorAll('textarea[data-k]').forEach(function (t) { plan[t.dataset.k] = t.value; });
      S.selfAt = Date.now();
      api('/lesson/' + S.L.id, { body: { plan: plan } }).then(function () { toast('教学设计已保存'); reload(); }, function (e) { toast(e.message, true); });
    },
    copyMake: function () { copy(mk(S.L) + '制作课件：先读资料，再按备课工作台的方法做教学设计和课件，最后运行出处核对。'); },
    copyFix: function () { copy('请按备课工作台的课件体检结果修改课次 ' + S.L.id + '《' + S.L.title + '》：先用 beike_check 看提示，再逐条修改。'); },
    copyVerify: function (k) {
      var x = S.L.ground.items[k];
      copy('请对照资料核对备课工作台课次 ' + S.L.id + '《' + S.L.title + '》第 ' + x.page + ' 页的这条内容：「' + x.text + '」。' + (x.nums.length ? '其中 ' + x.nums.join('、') + ' 在资料里找不到。' : '') + '以资料为准：有依据的改成资料的准确说法；资料没有、又不能确定的数字或说法，删掉或改成定性描述，并在讲稿里注明“需核实”。不要改动其他内容。');
    },
    copyVerifyAll: function () { copy('请用 beike_check 查看备课工作台课次 ' + S.L.id + '《' + S.L.title + '》的出处核对结果，逐条核对在资料里找不到出处的内容和数字：以资料为准改正；资料没有又不能确定的，删掉或改成定性描述，并在讲稿注明“需核实”；举例、过渡语可以保留。'); }
  };

  document.addEventListener('click', function () { BK.closeMore(); });
  BKX.loadMe().catch(function (e) { toast(e.message, true); }).then(function () { return poll(true); }).then(function () {
    var last = store.get('last', ''), view = store.get('view', '');
    S.tab = store.get('tab', 'deck');
    if (view && window.EMBED !== 'side') { BK.page(view); return; }
    if (window.EMBED === 'side' && S.lessons.length) BK.open(S.lessons[0].id);
    else if (last && S.lessons.some(function (l) { return l.id === last; })) BK.open(last);
    else if (S.lessons.length && innerWidth > 900) BK.open(S.lessons[0].id);
    else renderWelcome();
  });
})();
