/* 备课工作台（DSH 插件版）：课程与教案（逆向设计 / OBE）
 * 课程信息与大纲 → 目标与支撑矩阵 → 课次与 BOPPPS 教案 → 题库（双向细目表）→ 组卷与成绩分析 → 达成度与持续改进 */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var BLOOM = { 1: '记忆', 2: '理解', 3: '应用', 4: '分析', 5: '评价', 6: '创造' };
  var PHASE = { B: '导入', O: '目标', P1: '前测', P2: '参与式学习', P3: '后测', S: '总结' };
  var QT = ['单选', '多选', '判断', '填空', '简答', '计算', '论述', '案例分析', '设计'];
  var ST = { draft: '草稿', ready: '已备好', taught: '已上完' };
  var V = { cid: '', tab: 'home', data: null };
  var lv = function (x) { return '<li class="' + x[0] + '">' + esc(x[1]) + '</li>'; };
  var pct = function (v) { return v == null ? '—' : (v * 100).toFixed(1) + '%'; };
  var opt = function (o, v) { return Object.keys(o).map(function (k) { return '<option value="' + k + '"' + (String(k) === String(v) ? ' selected' : '') + '>' + esc(o[k]) + '</option>'; }).join(''); };
  var mk = function () { var c = V.data.course; return '备课工作台课程 ' + c.id + '《' + c.name + '》'; };
  function head(title, sub, acts) {
    return '<div class="bk-top"><button class="bk-ib bk-menu" onclick="BK.side(true)">' + ico('layout-grid') + '</button><div class="bk-title"><h2 class="bk-h2">' + title + '</h2><div class="bk-meta muted">' + sub + '</div></div>' + (acts ? '<div class="bk-acts">' + acts + '</div>' : '') + '</div>';
  }

  /* ================= 课程列表 ================= */
  function listPage() {
    V.cid = ''; V.data = null;
    $('main').innerHTML = head('课程与教案', '做专业认证、课程评估时用：毕业要求 → 课程目标 → 每次课的 BOPPPS 教案 → 题库 → 组卷 → 成绩 → 目标达成度 → 改进下一轮。每一环都有固定规则检查，结果可复核。',
      '<button class="btn primary sm" onclick="BKC.create()">' + ico('plus') + '新建课程</button>') + '<div class="bk-pane bk-page" id="pane"><p class="muted small">加载中…</p></div>';
    BK.mark && BK.mark();
    api('/courses').then(function (j) {
      $('pane').innerHTML = j.items.length ? '<div class="bk-cgrid">' + j.items.map(function (c) {
        return '<button class="bk-ccard" onclick="BKC.open(\'' + c.id + '\')"><b>' + esc(c.name) + '</b><small>' + esc([c.code, c.semester].filter(Boolean).join(' · ') || '—') + '</small>' +
          '<span>目标 ' + c.objectives + ' · 课次 ' + c.sessions + ' · 题 ' + c.questions + ' · 试卷 ' + c.papers + '</span></button>';
      }).join('') + '</div>' :
        '<div class="pl"><h4>推荐流程（第一次约 30 分钟，之后每次课约 10 分钟）</h4><ol class="bk-steps-ol">' +
        '<li><b>新建课程</b>，把教学大纲原文整段粘贴进去。AI 输出都会引用大纲原文并逐字核对。</li>' +
        '<li><b>目标与矩阵</b>：让 AI 从大纲提取课程目标，修改后保存；填写毕业要求指标点，在矩阵里标 H / M / L。</li>' +
        '<li><b>课次与教案</b>：填开课日期和每周上课星期，一键生成全学期课次；逐次让 AI 写教案草稿，看检查结果修改。</li>' +
        '<li><b>题库</b>：按“目标 × 层级”出题，双向细目表能看出哪些格子是空的。<b>组卷</b>：按目标权重自动组卷，导出 Word 试卷和答案。</li>' +
        '<li><b>考后</b>：下载成绩模板，用 Excel 填逐题得分后导入 → 自动算难度、区分度、信度和目标达成度 → 让 AI 写持续改进建议。</li>' +
        '<li><b>下学期</b>：复制到新学期，目标、矩阵、教案、题库和上一轮反思一起带过去。</li></ol>' +
        '<button class="btn primary" onclick="BKC.create()">' + ico('plus') + '新建第一门课程</button></div>';
    }, function (e) { $('pane').textContent = e.message; });
  }

  function infoForm(c) {
    c = c || { lessonMinutes: 90, threshold: 0.7 };
    return '<div class="bk-form"><div class="row2"><label>课程名称<input data-k="name" value="' + esc(c.name) + '" placeholder="例如：数据结构"></label><label>课程代码<input data-k="code" value="' + esc(c.code) + '"></label></div>' +
      '<div class="row2"><label>学期<input data-k="semester" value="' + esc(c.semester) + '" placeholder="例如：2026 秋"></label><label>授课对象<input data-k="audience" value="' + esc(c.audience) + '" placeholder="例如：计算机科学与技术 2024 级"></label></div>' +
      '<div class="row4"><label>学分<input data-k="credits" type="number" step="0.5" value="' + esc(c.credits || '') + '"></label><label>学时<input data-k="hours" type="number" value="' + esc(c.hours || '') + '"></label><label>每次课（分钟）<input data-k="lessonMinutes" type="number" value="' + esc(c.lessonMinutes) + '"></label><label>达成度阈值<input data-k="threshold" type="number" step="0.05" value="' + esc(c.threshold) + '"></label></div>' +
      '<label>教学大纲原文 <small class="muted">整段粘贴；AI 引用的原文会逐字核对</small><textarea data-k="syllabus" rows="10">' + esc(c.syllabus || '') + '</textarea></label>' +
      '<label class="btn ghost sm bk-fbtn">' + ico('upload') + '从文件读取大纲（.docx / .txt）<input type="file" accept=".docx,.txt,.md,.pptx" hidden data-syl></label></div>';
  }
  function bindSyl(bg) {
    var f = bg.querySelector('[data-syl]');
    if (f) f.onchange = function () {
      var file = f.files[0]; if (!file) return;
      fetch(BASE + '/api/extract', { method: 'POST', headers: { 'X-Beike': '1', 'X-File-Name': encodeURIComponent(file.name) }, body: file, credentials: 'same-origin' })
        .then(function (r) { return r.json(); }).then(function (j) { if (j.error) toast(j.error, true); else { bg.querySelector('[data-k=syllabus]').value = j.text; toast('已读取 ' + j.text.length + ' 字'); } });
    };
  }
  function readInfo(bg) { var o = {}; bg.querySelectorAll('[data-k]').forEach(function (el) { o[el.dataset.k] = el.value; }); return o; }
  function create() {
    uiModal({ title: '新建课程', cls: 'wide', html: infoForm(), noFocus: true, onOpen: bindSyl,
      buttons: [{ text: '取消', value: function () { return null; } }, { text: '创建', cls: 'primary', value: readInfo }]
    }).then(function (o) {
      if (!o) return;
      if (!o.name.trim()) { toast('请填写课程名称', true); return; }
      api('/course', { body: o }).then(function (j) { open(j.id, 'obj'); }, function (e) { toast(e.message, true); });
    });
  }

  /* ================= 课程页 ================= */
  function open(cid, tab) {
    V.cid = cid; if (tab) V.tab = tab;
    try { localStorage.setItem('beike-course', cid); } catch (e) {}
    return api('/course/' + cid).then(function (d) { V.data = d; render(); }, function (e) { toast(e.message, true); listPage(); });
  }
  function reload() { return open(V.cid); }
  function render() {
    var d = V.data, c = d.course;
    var nerr = d.checks.filter(function (x) { return x[0] !== 'info'; }).length;
    var tabs = [['home', '概览', nerr], ['obj', '目标与矩阵'], ['ses', '课次与教案', c.sessions.length], ['q', '题库', c.questions.length], ['paper', '组卷与成绩', c.papers.length], ['att', '达成度与改进']];
    $('main').innerHTML = head(esc(c.name), esc([c.code, c.semester, c.credits ? c.credits + ' 学分' : '', c.hours ? c.hours + ' 学时' : ''].filter(Boolean).join(' · ') || '课程与教案') + ' · <a href="#" onclick="BKC.list();return false">全部课程</a>',
      '<a class="btn ghost sm" href="' + BASE + '/api/course/' + c.id + '/docx">' + ico('file-word') + '<span>教案集</span></a>' +
      '<div class="bk-more"><button class="bk-ib" onclick="event.stopPropagation();var p=document.getElementById(\'cmore\');p.hidden=!p.hidden" title="更多">' + ico('dots') + '</button><div class="bk-menu-pop" id="cmore" hidden>' +
      '<button onclick="BKC.edit()">' + ico('pencil') + '课程信息与大纲</button><button onclick="BKC.clone()">' + ico('copy') + '复制到新学期</button><button class="danger-text" onclick="BKC.del()">' + ico('trash') + '删除课程</button></div></div>') +
      '<div class="bk-tabs">' + tabs.map(function (t) { return '<button data-t="' + t[0] + '" class="' + (V.tab === t[0] ? 'on' : '') + '">' + t[1] + (t[2] ? '<b>' + t[2] + '</b>' : '') + '</button>'; }).join('') + '</div><div class="bk-pane bk-page" id="pane"></div>';
    $('main').querySelectorAll('.bk-tabs button').forEach(function (b) { b.onclick = function () { V.tab = b.dataset.t; render(); }; });
    document.addEventListener('click', function () { var p = $('cmore'); if (p) p.hidden = true; }, { once: true });
    ({ home: tabHome, obj: tabObj, ses: tabSes, q: tabQ, paper: tabPaper, att: tabAtt })[V.tab]();
  }

  /* ---------- 概览 ---------- */
  function tabHome() {
    var d = V.data, c = d.course;
    var done = function (k) { return k ? '<i class="ok">' + ico('check') + '</i>' : '<i></i>'; };
    var steps = [
      [!!c.syllabus, '教学大纲', c.syllabus ? c.syllabus.length + ' 字' : '还没有', 'BKC.edit()'],
      [c.objectives.length > 0, '课程目标', c.objectives.length + ' 条', "BKC.tab('obj')"],
      [c.sessions.length > 0, '课次与教案', c.sessions.length + ' 次，已写环节 ' + c.sessions.filter(function (s) { return s.segments.length; }).length + ' 次', "BKC.tab('ses')"],
      [c.questions.length > 0, '题库', c.questions.length + ' 题', "BKC.tab('q')"],
      [c.papers.length > 0, '组卷与成绩', d.papers.map(function (p) { return p.title + (p.students ? '（' + p.students + ' 人成绩）' : ''); }).join('、') || '还没有', "BKC.tab('paper')"],
      [!!c.improvement, '持续改进', c.improvement ? '已写' : '还没有', "BKC.tab('att')"]
    ];
    $('pane').innerHTML = '<div class="pl"><h4>进度</h4><div class="bk-flow">' + steps.map(function (s) { return '<button class="bk-fl' + (s[0] ? ' on' : '') + '" onclick="' + s[3] + '">' + done(s[0]) + '<b>' + s[1] + '</b><small>' + esc(s[2]) + '</small></button>'; }).join('') + '</div></div>' +
      '<div class="pl"><h4>对齐检查 <small class="muted">（固定规则，不依赖 AI）</small></h4><ul class="checks">' + (d.checks.length ? d.checks.map(lv).join('') : '<li class="info">没有发现问题。</li>') + '</ul>' +
      (d.checks.length ? '<button class="btn ghost sm" onclick="BKC.ai(\'fix\')">' + ico('copy') + '复制指令，让 AI 按检查结果完善</button>' : '') + '</div>' +
      '<div class="pl"><h4>生成教学进度</h4><p class="muted small">填开课日期和每周上课的星期，一键生成全学期课次（已有课次按顺序填上日期，不够的自动新建）。</p><div class="bk-form"><div class="row4">' +
      '<label>开课日期<input type="date" id="sc-start"></label><label>上课次数<input type="number" id="sc-n" value="16"></label><label class="span2">跳过日期 <small class="muted">节假日，逗号分隔</small><input id="sc-skip" placeholder="2026-10-01,2026-10-02"></label></div>' +
      '<div class="bk-chips">' + ['一', '二', '三', '四', '五', '六', '日'].map(function (w, i) { return '<label class="bk-chip"><input type="checkbox" value="' + (i + 1) + '" data-wd>周' + w + '</label>'; }).join('') + '</div>' +
      '<button class="btn primary sm" id="sc-go">' + ico('calendar-event') + '生成</button></div></div>';
    $('sc-go').onclick = function () {
      var wd = [].map.call(document.querySelectorAll('[data-wd]:checked'), function (i) { return +i.value; });
      api('/course/' + V.cid + '/schedule', { body: { start: $('sc-start').value, count: +$('sc-n').value, skip: $('sc-skip').value, weekdays: wd } }).then(function (j) { toast('已生成 ' + j.n + ' 次课'); V.tab = 'ses'; reload(); }, function (e) { toast(e.message, true); });
    };
  }

  /* ---------- 目标与矩阵 ---------- */
  function tabObj() {
    var d = V.data, c = d.course, qs = d.qStats;
    var cover = function (o) { return c.sessions.filter(function (s) { return s.objectiveIds.indexOf(o.id) >= 0; }).length; };
    var orow = function (o) {
      o = o || { id: '', code: '', content: '', bloom: 2, weight: '' };
      return '<tr data-id="' + esc(o.id) + '"><td><input data-f="code" value="' + esc(o.code) + '" placeholder="CO1"></td><td><textarea data-f="content" rows="2" placeholder="能够……">' + esc(o.content) + '</textarea>' +
        (o.evidence ? '<div class="evi ' + (o.evidenceOk ? 'ok' : 'bad') + '">' + (o.evidenceOk ? ico('check') + '大纲依据已核实' : ico('alert-triangle') + '大纲中没有找到依据原文') + '：「' + esc(o.evidence) + '」</div>' : '') + '</td>' +
        '<td><select data-f="bloom">' + opt(BLOOM, o.bloom) + '</select></td><td><input data-f="weight" type="number" step="0.01" value="' + esc(o.weight) + '" class="w-in"></td>' +
        '<td class="small muted">' + (o.id ? cover(o) + ' 次课<br>' + ((qs[o.id] || {}).n || 0) + ' 道题' : '新增') + '</td><td><button class="bk-ib" data-rm title="删除">' + ico('x') + '</button></td></tr>';
    };
    var grow = function (g) { g = g || { id: '', code: '', content: '' }; return '<tr data-id="' + esc(g.id) + '"><td><input data-f="code" value="' + esc(g.code) + '" placeholder="1.2"></td><td><textarea data-f="content" rows="1">' + esc(g.content) + '</textarea></td><td><button class="bk-ib" data-rm>' + ico('x') + '</button></td></tr>'; };
    var w = c.objectives.reduce(function (a, o) { return a + o.weight; }, 0);
    $('pane').innerHTML = '<div class="pl"><div class="bk-row"><h4 class="grow">课程目标（CLO）</h4><button class="btn ai sm" onclick="BKC.ai(\'obj\')">' + ico('sparkles') + 'AI 从大纲提取目标</button></div>' +
      '<p class="muted small">用可观测的行为动词描述“学完能做到什么”。布鲁姆层级决定课堂上要设计什么活动、考什么样的题，系统会据此检查对齐。</p>' +
      '<div class="scroll-x"><table class="tbl edit" id="ot"><thead><tr><th style="width:80px">编号</th><th>目标表述</th><th style="width:100px">布鲁姆层级</th><th style="width:80px">权重%</th><th style="width:80px">覆盖</th><th style="width:40px"></th></tr></thead><tbody>' + c.objectives.map(orow).join('') + '</tbody>' +
      '<tfoot><tr><td colspan="3" class="right">权重合计</td><td><b id="wsum" class="' + (Math.abs(w - 100) > 0.01 ? 'bad' : 'good') + '">' + (+w.toFixed(2)) + '</b></td><td colspan="2"></td></tr></tfoot></table></div>' +
      '<div class="bk-row"><button class="btn ghost sm" id="o-add">' + ico('plus') + '添加目标</button><button class="btn primary sm" id="o-save">' + ico('check') + '保存课程目标</button></div></div>' +
      '<div class="pl"><h4>毕业要求指标点 <small class="muted">来自专业人才培养方案；不需要专业认证的课程可以不填</small></h4><table class="tbl edit" id="gt"><thead><tr><th style="width:80px">编号</th><th>指标点内容</th><th style="width:40px"></th></tr></thead><tbody>' + c.gradReqs.map(grow).join('') + '</tbody></table>' +
      '<div class="bk-row"><button class="btn ghost sm" id="g-add">' + ico('plus') + '添加指标点</button><button class="btn primary sm" id="g-save">' + ico('check') + '保存指标点</button></div></div>' +
      (c.objectives.length && c.gradReqs.length ? '<div class="pl"><h4>课程目标对毕业要求的支撑矩阵 <small class="muted">H 强 · M 中 · L 弱</small></h4><div class="scroll-x"><table class="tbl matrix" id="mt"><thead><tr><th>课程目标</th>' + c.gradReqs.map(function (g) { return '<th title="' + esc(g.content) + '">' + esc(g.code) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        c.objectives.map(function (o) { return '<tr><td><b>' + esc(o.code) + '</b> <span class="muted small">' + esc(o.content.slice(0, 24)) + '…</span></td>' + c.gradReqs.map(function (g) { var v = (o.reqs || {})[g.id] || ''; return '<td class="center"><select data-o="' + o.id + '" data-g="' + g.id + '" class="lv lv-' + v + '"><option value="">—</option>' + ['H', 'M', 'L'].map(function (x) { return '<option' + (x === v ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></td>'; }).join('') + '</tr>'; }).join('') +
        '</tbody></table></div><button class="btn primary sm" id="m-save">' + ico('check') + '保存矩阵</button></div>' : '');
    var bindRm = function (tb) { tb.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { b.closest('tr').remove(); sumW(); }; }); };
    var sumW = function () { var s = 0; $('ot').querySelectorAll('[data-f=weight]').forEach(function (i) { s += +i.value || 0; }); $('wsum').textContent = +s.toFixed(2); $('wsum').className = Math.abs(s - 100) > 0.01 ? 'bad' : 'good'; };
    bindRm($('ot')); bindRm($('gt'));
    $('ot').addEventListener('input', sumW);
    $('o-add').onclick = function () { $('ot').querySelector('tbody').insertAdjacentHTML('beforeend', orow({ id: '', code: 'CO' + ($('ot').querySelectorAll('tbody tr').length + 1), content: '', bloom: 2, weight: '' })); bindRm($('ot')); };
    $('g-add').onclick = function () { $('gt').querySelector('tbody').insertAdjacentHTML('beforeend', grow()); bindRm($('gt')); };
    var rows = function (t) { return [].map.call($(t).querySelectorAll('tbody tr'), function (tr) { var o = { id: tr.dataset.id }; tr.querySelectorAll('[data-f]').forEach(function (el) { o[el.dataset.f] = el.value; }); return o; }); };
    $('o-save').onclick = function () { api('/course/' + V.cid + '/objectives', { body: { objectives: rows('ot') } }).then(function () { toast('课程目标已保存'); reload(); }, function (e) { toast(e.message, true); }); };
    $('g-save').onclick = function () { api('/course/' + V.cid + '/gradreqs', { body: { gradReqs: rows('gt') } }).then(function () { toast('指标点已保存'); reload(); }, function (e) { toast(e.message, true); }); };
    if ($('m-save')) {
      $('mt').querySelectorAll('select').forEach(function (s) { s.onchange = function () { s.className = 'lv lv-' + s.value; }; });
      $('m-save').onclick = function () {
        var m = {}; $('mt').querySelectorAll('select').forEach(function (s) { (m[s.dataset.o] = m[s.dataset.o] || {})[s.dataset.g] = s.value; });
        api('/course/' + V.cid + '/matrix', { body: { matrix: m } }).then(function () { toast('矩阵已保存'); reload(); }, function (e) { toast(e.message, true); });
      };
    }
  }

  /* ---------- 课次与教案 ---------- */
  function tabSes() {
    var d = V.data, c = d.course, list = c.sessions.slice().sort(function (a, b) { return a.seq - b.seq; });
    var oc = function (id) { var o = c.objectives.filter(function (x) { return x.id === id; })[0]; return o ? o.code : ''; };
    $('pane').innerHTML = '<div class="pl"><div class="bk-row"><h4 class="grow">课次与教案</h4><button class="btn ghost sm" onclick="BKC.tab(\'home\')">' + ico('calendar-event') + '生成教学进度</button><button class="btn sm" id="s-add">' + ico('plus') + '新增一次课</button></div>' +
      (list.length ? '<div class="scroll-x"><table class="tbl"><thead><tr><th style="width:44px">次</th><th style="width:96px">日期</th><th>课题</th><th style="width:110px">目标</th><th style="width:70px">环节</th><th style="width:90px">检查</th><th style="width:70px">状态</th><th style="width:90px">课件</th></tr></thead><tbody>' + list.map(function (s) {
        var k = d.sessionChecks[s.id] || {}, L = s.lessonId && d.lessons[s.lessonId];
        return '<tr class="click" data-s="' + s.id + '"><td>' + s.seq + '</td><td class="small">' + esc(s.date || '—') + '</td><td><b>' + esc(s.title) + '</b></td><td class="small">' + esc(s.objectiveIds.map(oc).join(', ') || '—') + '</td><td class="small">' + s.segments.length + ' 个</td>' +
          '<td class="small">' + (k.error ? '<span class="c-num">✗ ' + k.error + '</span> ' : '') + (k.warn ? '<span class="c-ai">⚠ ' + k.warn + '</span>' : '') + (!k.error && !k.warn ? '<span class="c-src">✓</span>' : '') + '</td><td class="small">' + ST[s.status] + '</td>' +
          '<td class="small">' + (L ? '<a href="#" data-l="' + s.lessonId + '">' + L.pages + ' 页</a>' : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="muted small">还没有课次。在「概览」里一键生成全学期教学进度，或点「新增一次课」。</p>') + '</div>';
    $('s-add').onclick = function () { api('/course/' + V.cid + '/session', { body: { title: '' } }).then(function (j) { reload().then(function () { session(j.id); }); }, function (e) { toast(e.message, true); }); };
    $('pane').querySelectorAll('tr[data-s]').forEach(function (tr) { tr.onclick = function (e) { var a = e.target.closest('[data-l]'); if (a) { e.preventDefault(); BK.open(a.dataset.l); return; } session(tr.dataset.s); }; });
  }

  /** 单次课的教案编辑器 */
  function session(sid) {
    api('/course/' + V.cid + '/session/' + sid).then(function (j) {
      var c = V.data.course, s = j.session;
      var segRow = function (g) {
        g = g || { phase: 'P2', minutes: 10, teacher: '', student: '', objectiveId: '', assess: '' };
        return '<tr><td><select data-g="phase">' + opt(PHASE, g.phase) + '</select></td><td><input data-g="minutes" type="number" value="' + g.minutes + '" class="w-in"></td>' +
          '<td><textarea data-g="teacher" rows="2">' + esc(g.teacher) + '</textarea></td><td><textarea data-g="student" rows="2" placeholder="学生做什么（讨论、练习、回答…）">' + esc(g.student) + '</textarea></td>' +
          '<td><select data-g="objectiveId"><option value="">—</option>' + c.objectives.map(function (o) { return '<option value="' + o.id + '"' + (o.id === g.objectiveId ? ' selected' : '') + '>' + esc(o.code) + '</option>'; }).join('') + '</select><input data-g="assess" value="' + esc(g.assess) + '" placeholder="检测方式"></td>' +
          '<td class="nowrap"><button type="button" class="bk-ib" data-up title="上移">' + ico('arrow-up') + '</button><button type="button" class="bk-ib" data-rm title="删除">' + ico('x') + '</button></td></tr>';
      };
      var F = function (k, t, ph, rows) { return '<label>' + t + '<textarea data-k="' + k + '" rows="' + (rows || 2) + '" placeholder="' + esc(ph || '') + '">' + esc(s[k]) + '</textarea></label>'; };
      uiModal({ title: '第 ' + s.seq + ' 次课 · 教案', cls: 'wide bk-ses', noFocus: true,
        html: '<div class="bk-row bk-ai-row"><button type="button" class="btn ai sm" data-ai="draft">' + ico('sparkles') + '复制指令：AI 写教案草稿</button><button type="button" class="btn ghost sm" data-ai="review">' + ico('stethoscope') + '复制指令：AI 督导评课</button>' +
          '<button type="button" class="btn ghost sm" data-lesson>' + ico('presentation') + (s.lessonId ? '打开课件' : '为这次课做课件') + '</button><a class="btn ghost sm" href="' + BASE + '/api/course/' + V.cid + '/docx?sid=' + s.id + '">' + ico('file-word') + '下载教案</a></div>' +
          '<ul class="checks" id="s-checks">' + (j.checks.length ? j.checks.map(lv).join('') : '<li class="info">检查通过。</li>') + '</ul>' +
          '<div class="bk-form"><div class="row4"><label class="span2">课题<input data-k="title" value="' + esc(s.title) + '"></label><label>日期<input data-k="date" type="date" value="' + esc(s.date) + '"></label><label>课时（分钟）<input data-k="minutes" type="number" value="' + s.minutes + '"></label></div>' +
          '<div class="row2"><label>状态<select data-k="status">' + opt(ST, s.status) + '</select></label><div></div></div>' +
          '<label>本次课的课程目标</label><div class="bk-chips">' + (c.objectives.length ? c.objectives.map(function (o) { return '<label class="bk-chip" title="' + esc(o.content) + '"><input type="checkbox" data-obj value="' + o.id + '"' + (s.objectiveIds.indexOf(o.id) >= 0 ? ' checked' : '') + '>' + esc(o.code) + ' · ' + BLOOM[o.bloom] + '</label>'; }).join('') : '<span class="muted small">先在「目标与矩阵」里填写课程目标</span>') + '</div>' +
          '<div class="row2">' + F('key', '教学重点') + F('difficult', '教学难点') + '</div>' + F('misconceptions', '预判学生误区及对策', '学生最可能错在哪？怎么提前化解？') +
          '<label>教学过程（BOPPPS）<span class="muted small" id="seg-sum"></span></label><div class="scroll-x"><table class="tbl edit" id="seg"><thead><tr><th style="width:110px">环节</th><th style="width:70px">分钟</th><th>教师活动</th><th>学生活动</th><th style="width:110px">目标 / 检测</th><th style="width:70px"></th></tr></thead><tbody>' + s.segments.map(segRow).join('') + '</tbody></table></div>' +
          '<button type="button" class="btn ghost sm" id="seg-add">' + ico('plus') + '添加环节</button>' +
          '<div class="row2">' + F('ideology', '课程思政') + F('resources', '教学资源') + '</div><div class="row2">' + F('homework', '作业') + F('reflection', '教学反思', '课后填写：哪个目标没达成、哪个环节时间不准、下次怎么改', 3) + '</div>' +
          (s.evidence && s.evidence.length ? '<div class="small">大纲依据：' + s.evidence.map(function (e) { return '<span class="evi ' + (e.ok ? 'ok' : 'bad') + '">「' + esc(e.quote) + '」' + (e.ok ? '' : '（大纲中没有找到）') + '</span>'; }).join(' ') + '</div>' : '') + '</div>',
        buttons: [{ text: '删除这次课', cls: 'ghost danger-text', value: function () { return 'del'; } }, { text: '关闭', value: function () { return null; } }, { text: '保存', cls: 'primary', value: function (bg) { return read(bg); } }],
        onOpen: function (bg, close) {
          var tb = bg.querySelector('#seg tbody');
          var sum = function () { var n = 0; tb.querySelectorAll('[data-g=minutes]').forEach(function (i) { n += +i.value || 0; }); var m = +bg.querySelector('[data-k=minutes]').value; bg.querySelector('#seg-sum').textContent = ' 合计 ' + n + ' / ' + m + ' 分钟'; bg.querySelector('#seg-sum').className = 'small ' + (n === m ? 'c-src' : 'c-num'); };
          var bind = function () {
            tb.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { b.closest('tr').remove(); sum(); }; });
            tb.querySelectorAll('[data-up]').forEach(function (b) { b.onclick = function () { var tr = b.closest('tr'); if (tr.previousElementSibling) tr.parentNode.insertBefore(tr, tr.previousElementSibling); }; });
          };
          bind(); sum();
          bg.addEventListener('input', sum);
          bg.querySelector('#seg-add').onclick = function () { tb.insertAdjacentHTML('beforeend', segRow()); bind(); sum(); };
          bg.querySelectorAll('[data-ai]').forEach(function (b) { b.onclick = function () { aiSession(b.dataset.ai, s); }; });
          bg.querySelector('[data-lesson]').onclick = function () {
            close('noop');
            api('/course/' + V.cid + '/session/' + s.id, { body: read(bg) }).then(function () {
              return api('/course/' + V.cid + '/session/' + s.id + '/lesson', { body: {} });
            }).then(function (r) {
              if (r.created) toast('已新建课件，教案和大纲已带进去');
              BK.open(r.id);
              if (r.created) setTimeout(function () { BKX.copy('用备课工作台给课次 ' + r.id + '《' + s.title + '》做课件：先用 beike_get_lesson 看备课须知（含本次课的课程目标和教案），按备课流程制作，课件要服务这些目标，最后运行出处核对。'); }, 600);
            }, function (e) { toast(e.message, true); });
          };
        }
      }).then(function (v) {
        if (v === 'noop' || v === null || v === undefined) return;
        if (v === 'del') { uiConfirm('删除第 ' + s.seq + ' 次课的教案？（关联的课件不会删除）', { danger: true, ok: '删除' }).then(function (ok) { if (ok) api('/course/' + V.cid + '/session/' + s.id + '/delete', { body: {} }).then(reload, function (e) { toast(e.message, true); }); }); return; }
        api('/course/' + V.cid + '/session/' + s.id, { body: v }).then(function (r) {
          var e = r.checks.filter(function (x) { return x[0] === 'error'; }).length;
          toast(e ? '已保存，还有 ' + e + ' 处需要修改' : '已保存');
          reload().then(function () { if (e) session(s.id); });
        }, function (e) { toast(e.message, true); });
      });
      function read(bg) {
        var o = { objectiveIds: [].map.call(bg.querySelectorAll('[data-obj]:checked'), function (i) { return i.value; }) };
        bg.querySelectorAll('[data-k]').forEach(function (el) { o[el.dataset.k] = el.value; });
        o.segments = [].map.call(bg.querySelectorAll('#seg tbody tr'), function (tr) { var g = {}; tr.querySelectorAll('[data-g]').forEach(function (el) { g[el.dataset.g] = el.value; }); return g; });
        return o;
      }
    }, function (e) { toast(e.message, true); });
  }
  function aiSession(kind, s) {
    var t = mk() + '第 ' + s.seq + ' 次课（' + s.id + '）「' + s.title + '」';
    if (kind === 'draft') BKX.copy('请为' + t + '写教案草稿：先用 beike_course action=get 看课程目标，必要时读大纲（action=syllabus）；选定本次课覆盖的目标，写重点、难点、学生误区、BOPPPS 各环节（时长合计等于课时，学生主动学习 ≥30%，单段讲授不超过 20 分钟，每个目标都有课堂检测）、思政、作业，evidence 从大纲逐字复制 1–3 句。用 beike_session action=save 保存，然后告诉我检查结果。');
    else BKX.copy('请以教学督导的身份评' + t + '的教案：用 beike_session action=get 看教案和检查结果，对照课程目标的布鲁姆层级，指出最需要改的 3–5 处并给出具体改法（时间分配、学生活动、检测方式、误区预判）。先给我看，我同意后再用 beike_session action=save 修改。');
  }

  /* ---------- 题库 ---------- */
  var QF = '';
  function tabQ() {
    var d = V.data, c = d.course;
    var oc = function (id) { var o = c.objectives.filter(function (x) { return x.id === id; })[0]; return o ? o.code : '未关联'; };
    var list = c.questions.filter(function (q) { return !QF || q.objectiveId === QF; });
    $('pane').innerHTML = '<div class="pl"><div class="bk-row"><h4 class="grow">双向细目表 <small class="muted">目标 × 布鲁姆层级的题目数；目标所在层级及以上的格子最好都有题</small></h4><button class="btn ai sm" onclick="BKC.ai(\'q\')">' + ico('sparkles') + '复制指令：AI 出题</button></div>' +
      (d.blueprint.length ? '<div class="scroll-x"><table class="tbl bp"><thead><tr><th>目标</th>' + [1, 2, 3, 4, 5, 6].map(function (b) { return '<th>' + b + ' ' + BLOOM[b] + '</th>'; }).join('') + '</tr></thead><tbody>' + d.blueprint.map(function (r) {
        return '<tr><td><b>' + esc(r.code) + '</b> <small class="muted">目标层级 ' + r.bloom + '</small></td>' + r.cells.map(function (n, i) { return '<td class="center' + (i + 1 === r.bloom ? ' tgt' : '') + (i + 1 >= r.bloom && !n ? ' gap' : '') + '">' + (n || '') + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody></table></div>' : '<p class="muted small">先在「目标与矩阵」里填写课程目标。</p>') + '</div>' +
      '<div class="pl"><div class="bk-row"><h4 class="grow">题目（' + list.length + '）</h4><select id="qf"><option value="">全部目标</option>' + c.objectives.map(function (o) { return '<option value="' + o.id + '"' + (o.id === QF ? ' selected' : '') + '>' + esc(o.code) + '</option>'; }).join('') + '</select><button class="btn sm" id="q-add">' + ico('plus') + '新增题目</button></div>' +
      (list.length ? '<ul class="bk-qs">' + list.map(function (q) {
        return '<li><div><span class="bk-tag">' + esc(oc(q.objectiveId)) + ' · ' + BLOOM[q.bloom] + ' · ' + esc(q.qtype) + ' · ' + q.score + ' 分</span>' + (q.source === 'AI' ? '<span class="bk-tag">AI</span>' : '') + (q.evidence && !q.evidenceOk ? '<span class="bk-tag bad">依据待核对</span>' : '') +
          '<p>' + nl2br(q.stem) + '</p>' + (q.options.length ? '<small class="muted">' + q.options.map(esc).join('　') + '</small>' : '') + '</div><button class="btn ghost sm" data-e="' + q.id + '">' + ico('pencil') + '编辑</button><button class="bk-ib" data-d="' + q.id + '">' + ico('trash') + '</button></li>';
      }).join('') + '</ul>' : '<p class="muted small">还没有题目。</p>') + '</div>';
    $('qf').onchange = function () { QF = this.value; tabQ(); };
    $('q-add').onclick = function () { editQ(null); };
    $('pane').querySelectorAll('[data-e]').forEach(function (b) { b.onclick = function () { editQ(c.questions.filter(function (q) { return q.id === b.dataset.e; })[0]); }; });
    $('pane').querySelectorAll('[data-d]').forEach(function (b) { b.onclick = function () { uiConfirm('删除这道题？', { danger: true, ok: '删除' }).then(function (ok) { if (ok) api('/course/' + V.cid + '/question/' + b.dataset.d + '/delete', { body: {} }).then(reload, function (e) { toast(e.message, true); }); }); }; });
  }
  function editQ(q) {
    var c = V.data.course;
    q = q || { objectiveId: QF || (c.objectives[0] || {}).id || '', bloom: 2, qtype: '单选', stem: '', options: [], answer: '', analysis: '', difficulty: 3, score: 10 };
    var qt = {}; QT.forEach(function (t) { qt[t] = t; });
    uiModal({ title: q.id ? '编辑题目' : '新增题目', cls: 'wide', noFocus: true,
      html: '<div class="bk-form"><div class="row4"><label>课程目标<select data-k="objectiveId"><option value="">—</option>' + c.objectives.map(function (o) { return '<option value="' + o.id + '"' + (o.id === q.objectiveId ? ' selected' : '') + '>' + esc(o.code) + '</option>'; }).join('') + '</select></label>' +
        '<label>布鲁姆层级<select data-k="bloom">' + opt(BLOOM, q.bloom) + '</select></label><label>题型<select data-k="qtype">' + opt(qt, q.qtype) + '</select></label><label>分值<input data-k="score" type="number" step="0.5" value="' + q.score + '"></label></div>' +
        '<label>题干<textarea data-k="stem" rows="3">' + esc(q.stem) + '</textarea></label><label>选项 <small class="muted">选择题每行一个，例如 A. ……</small><textarea data-k="options" rows="4">' + esc(q.options.join('\n')) + '</textarea></label>' +
        '<div class="row2"><label>答案<textarea data-k="answer" rows="2">' + esc(q.answer) + '</textarea></label><label>解析<textarea data-k="analysis" rows="2">' + esc(q.analysis) + '</textarea></label></div>' +
        '<div class="row2"><label>预估难度（1 易 – 5 难）<input data-k="difficulty" type="number" min="1" max="5" value="' + q.difficulty + '"></label><label>命题依据 <small class="muted">大纲或目标原文，可不填</small><input data-k="evidence" value="' + esc(q.evidence || '') + '"></label></div></div>',
      buttons: [{ text: '取消', value: function () { return null; } }, { text: '保存', cls: 'primary', value: function (bg) { var o = { id: q.id }; bg.querySelectorAll('[data-k]').forEach(function (el) { o[el.dataset.k] = el.value; }); return o; } }]
    }).then(function (o) { if (o) api('/course/' + V.cid + '/question', { body: o }).then(function () { toast('已保存'); reload(); }, function (e) { toast(e.message, true); }); });
  }

  /* ---------- 组卷与成绩 ---------- */
  var PID = '';
  function tabPaper() {
    var d = V.data;
    $('pane').innerHTML = '<div class="pl"><div class="bk-row"><h4 class="grow">试卷</h4><button class="btn sm" id="p-new">' + ico('plus') + '组卷</button></div>' +
      (d.papers.length ? '<ul class="bk-mats">' + d.papers.map(function (p) {
        return '<li' + (p.id === PID ? ' class="on"' : '') + '>' + ico('file-certificate') + '<div><b>' + esc(p.title) + '</b><small>' + p.items + ' 题 · ' + p.full + ' 分 · ' + (p.students ? p.students + ' 人成绩' : '未导入成绩') + '</small></div><button class="btn ghost sm" data-p="' + p.id + '">' + ico('eye') + '打开</button></li>';
      }).join('') + '</ul>' : '<p class="muted small">还没有试卷。按课程目标权重从题库自动组卷，或手工挑题。</p>') + '</div><div id="pdetail"></div>';
    $('p-new').onclick = newPaper;
    $('pane').querySelectorAll('[data-p]').forEach(function (b) { b.onclick = function () { PID = b.dataset.p; paper(); }; });
    if (PID && d.papers.some(function (p) { return p.id === PID; })) paper();
  }
  function newPaper() {
    var c = V.data.course;
    var oc = function (id) { var o = c.objectives.filter(function (x) { return x.id === id; })[0]; return o ? o.code : '—'; };
    uiModal({ title: '组卷', cls: 'wide', noFocus: true,
      html: '<div class="bk-form"><div class="row2"><label>试卷名称<input id="pt" value="期末考试"></label><label>总分 <small class="muted">自动组卷时</small><input id="ptot" type="number" value="100"></label></div>' +
        '<label class="bk-ck"><input type="radio" name="pm" value="auto" checked><span><b>按课程目标权重自动组卷</b><small>每个目标按权重分配分值，优先选层级不低于目标、用得少的题</small></span></label>' +
        '<label class="bk-ck"><input type="radio" name="pm" value="pick"><span><b>手工挑题</b><small>勾选下面的题目，按顺序组成试卷</small></span></label>' +
        '<div class="bk-cklist" id="ppick">' + c.questions.map(function (q) { return '<label class="bk-ck"><input type="checkbox" value="' + q.id + '"><span><b>' + esc(q.stem.slice(0, 60)) + '</b><small>' + esc(oc(q.objectiveId)) + ' · ' + BLOOM[q.bloom] + ' · ' + esc(q.qtype) + ' · ' + q.score + ' 分</small></span></label>'; }).join('') + '</div></div>',
      buttons: [{ text: '取消', value: function () { return null; } }, { text: '生成试卷', cls: 'primary', value: function (bg) {
        var pick = bg.querySelector('input[name=pm]:checked').value === 'pick';
        return { title: bg.querySelector('#pt').value, total: +bg.querySelector('#ptot').value, questionIds: pick ? [].map.call(bg.querySelectorAll('#ppick input:checked'), function (i) { return i.value; }) : null };
      } }]
    }).then(function (o) { if (o) api('/course/' + V.cid + '/paper', { body: o }).then(function (j) { PID = j.id; toast('试卷已生成'); reload(); }, function (e) { toast(e.message, true); }); });
  }
  function paper() {
    var c = V.data.course;
    var oc = function (id) { var o = c.objectives.filter(function (x) { return x.id === id; })[0]; return o ? o.code : '—'; };
    api('/course/' + V.cid + '/paper/' + PID).then(function (j) {
      var a = j.analysis, P = BASE + '/api/course/' + V.cid + '/paper/' + PID;
      var by = {}; j.items.forEach(function (i) { var k = oc(i.q.objectiveId); by[k] = (by[k] || 0) + i.full; });
      var full = j.items.reduce(function (s, i) { return s + i.full; }, 0);
      $('pdetail').innerHTML = '<div class="pl"><div class="bk-row"><h4 class="grow">' + esc(j.paper.title) + ' <small class="muted">' + j.items.length + ' 题 · ' + full + ' 分 · ' + Object.keys(by).map(function (k) { return k + ' ' + by[k] + ' 分'; }).join('，') + '</small></h4>' +
        '<a class="btn ghost sm" href="' + P + '/docx">' + ico('file-word') + '试卷</a><a class="btn ghost sm" href="' + P + '/docx?key=1">' + ico('file-word') + '答案</a><button class="bk-ib" id="pdel" title="删除试卷">' + ico('trash') + '</button></div>' +
        '<div class="scroll-x"><table class="tbl" id="pit"><thead><tr><th style="width:40px">题</th><th>题干</th><th style="width:90px">目标 / 层级</th><th style="width:80px">分值</th><th style="width:40px"></th></tr></thead><tbody>' + j.items.map(function (i) {
          return '<tr data-id="' + i.id + '"><td>' + i.no + '</td><td class="small">' + esc(i.q.qtype) + '｜' + esc(i.q.stem.slice(0, 80)) + '</td><td class="small">' + esc(oc(i.q.objectiveId)) + ' · ' + BLOOM[i.q.bloom] + '</td><td><input type="number" step="0.5" value="' + i.full + '" class="w-in"></td><td><button class="bk-ib" data-rm>' + ico('x') + '</button></td></tr>';
        }).join('') + '</tbody></table></div><button class="btn sm" id="psave">' + ico('check') + '保存分值与题目</button></div>' +
        '<div class="pl"><h4>成绩</h4><p class="muted small">下载成绩模板，用 Excel 填写每个学生每道题的得分（第一列学号），另存为 CSV 后导入。Excel 中文版默认的 GBK 编码也能识别。</p>' +
        '<div class="bk-row"><a class="btn ghost sm" href="' + P + '/template">' + ico('download') + '下载成绩模板</a><label class="btn sm">' + ico('upload') + '导入成绩（CSV）<input type="file" accept=".csv,text/csv" hidden id="pcsv"></label>' + (a.n ? '<button class="btn ghost sm" id="pclear">清空成绩</button>' : '') + '</div>' +
        (a.n ? '<div class="bk-kpis"><div><b>' + a.n + '</b><small>人</small></div><div><b>' + a.mean.toFixed(1) + '</b><small>平均分 / ' + a.full + '</small></div><div><b>' + a.sd.toFixed(1) + '</b><small>标准差</small></div><div><b>' + (a.alpha == null ? '—' : a.alpha.toFixed(2)) + '</b><small>信度 α' + (a.alpha != null && a.alpha < 0.6 ? '（偏低）' : '') + '</small></div></div>' +
          '<div class="bk-bands">' + Object.keys(a.bands).map(function (k) { var v = a.bands[k]; return '<div><i style="height:' + Math.round(v / a.n * 100) + '%"></i><b>' + v + '</b><small>' + k + '</small></div>'; }).join('') + '</div>' +
          '<div class="scroll-x"><table class="tbl"><thead><tr><th>题</th><th>题型</th><th>目标</th><th>平均分</th><th>难度 P</th><th>区分度 D</th><th>提示</th></tr></thead><tbody>' + a.items.map(function (i) {
            return '<tr><td>' + i.no + '</td><td class="small">' + esc(i.qtype) + '</td><td class="small">' + esc(oc(i.objectiveId)) + '</td><td>' + i.mean.toFixed(1) + ' / ' + i.full + '</td><td>' + i.P.toFixed(2) + '</td><td>' + (i.D == null ? '—' : i.D.toFixed(2)) + '</td><td class="small c-num">' + esc(i.flags.join('、')) + '</td></tr>';
          }).join('') + '</tbody></table></div><p class="muted small">难度 P 0.3–0.9 较合适；区分度 D ≥0.4 优，0.2–0.4 可用，&lt;0.2 差，负值通常说明答案或题意有问题；信度 α ≥0.7 较好（课程考试 ≥0.6 可接受）。区分度需要至少 4 人。</p>' : '') + '</div>';
      $('pit').querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { b.closest('tr').remove(); }; });
      $('psave').onclick = function () {
        var items = [].map.call($('pit').querySelectorAll('tbody tr'), function (tr) { return { id: tr.dataset.id, score: +tr.querySelector('input').value }; });
        api('/course/' + V.cid + '/paper/' + PID, { body: { items: items } }).then(function () { toast('已保存'); reload(); }, function (e) { toast(e.message, true); });
      };
      $('pdel').onclick = function () { uiConfirm('删除这份试卷和它的成绩？', { danger: true, ok: '删除' }).then(function (ok) { if (ok) api('/course/' + V.cid + '/paper/' + PID + '/delete', { body: {} }).then(function () { PID = ''; reload(); }, function (e) { toast(e.message, true); }); }); };
      $('pcsv').onchange = function () {
        var f = this.files[0]; if (!f) return;
        fetch(P + '/scores', { method: 'POST', headers: { 'X-Beike': '1' }, body: f, credentials: 'same-origin' }).then(function (r) { return r.json(); })
          .then(function (r) { if (r.error) toast(r.error, true); else { toast('已导入 ' + r.n + ' 名学生的逐题成绩'); reload(); } });
      };
      if ($('pclear')) $('pclear').onclick = function () { uiConfirm('清空这份试卷的成绩？', { danger: true, ok: '清空' }).then(function (ok) { if (ok) api('/course/' + V.cid + '/paper/' + PID + '/scores/clear', { body: {} }).then(reload); }); };
      $('pdetail').scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, function (e) { toast(e.message, true); });
  }

  /* ---------- 达成度与改进 ---------- */
  function tabAtt() {
    var d = V.data, c = d.course, th = c.threshold;
    var any = d.attainment.some(function (a) { return a.attain != null; });
    $('pane').innerHTML = '<div class="pl"><h4>课程目标达成度 <small class="muted">合并所有已导入成绩的试卷；达成度 = 该目标各题平均分之和 ÷ 满分之和，阈值 ' + th + '</small></h4>' +
      (any ? '<div class="bk-att">' + d.attainment.map(function (a) {
        var v = a.attain;
        return '<div class="bk-attr"><b>' + esc(a.code) + '</b><div class="bk-attbar"><i style="width:' + (v == null ? 0 : Math.min(100, v * 100)) + '%" class="' + (v != null && v < th ? 'low' : '') + '"></i><s style="left:' + th * 100 + '%"></s></div><span>' + pct(v) + '</span>' +
          '<small class="muted">' + (v == null ? '没有关联题目的成绩' : '个人未达阈值 ' + a.below + ' / ' + a.students + ' 人 · ' + a.items + ' 道题') + '｜' + esc(a.content.slice(0, 40)) + '</small></div>';
      }).join('') + '</div>' : '<p class="muted small">还没有成绩。在「组卷与成绩」里导入逐题成绩后自动计算。</p>') + '</div>' +
      '<div class="pl"><div class="bk-row"><h4 class="grow">持续改进建议</h4><button class="btn ai sm" onclick="BKC.ai(\'improve\')">' + ico('sparkles') + '复制指令：AI 生成改进建议</button></div>' +
      '<textarea id="imp" rows="12" placeholder="根据达成度、试题分析和教学反思，写下一轮的改进措施">' + esc(c.improvement || '') + '</textarea><button class="btn primary sm" id="imp-save">' + ico('check') + '保存</button></div>';
    $('imp-save').onclick = function () { api('/course/' + V.cid + '/improvement', { body: { text: $('imp').value } }).then(function () { toast('已保存'); }, function (e) { toast(e.message, true); }); };
  }

  /* ---------- 指令与操作 ---------- */
  function ai(kind) {
    var t = mk();
    var m = {
      obj: '请为' + t + '从教学大纲提取课程目标：用 beike_course action=syllabus 读完大纲，提取 2–6 条可观测的课程目标（能够……），标布鲁姆层级和权重（合计 100），每条附从大纲逐字复制的一句原文作依据；大纲里有毕业要求指标点的一并填上并标支撑强度 H/M/L。用 beike_course_objectives 保存，然后告诉我检查结果。',
      q: '请为' + t + '出题：先用 beike_course action=get 看课程目标和双向细目表，优先补空格（目标层级及以上），每个目标 3–5 题，题型多样，选择题干扰项来自学生常见误区，每题附答案、解析和从大纲或目标逐字复制的命题依据。用 beike_question action=add 保存。',
      improve: '请为' + t + '写持续改进建议：用 beike_course action=report 看达成度、试题分析和教学反思，只依据这些数据，逐个说明未达成或偏低的目标、可能原因和下一轮可执行的改进措施，问题题目给出修改方向。用 beike_course action=save_improvement 保存。',
      fix: '请按对齐检查结果完善' + t + '：先用 beike_course action=get 看检查结果，逐条处理（目标权重、支撑矩阵、课次覆盖、题库缺口、评价层级），能直接改的就改，需要我决定的列出来问我。'
    };
    BKX.copy(m[kind]);
  }
  window.BKC = {
    list: listPage, listPage: listPage, open: open, create: create, ai: ai,
    tab: function (t) { V.tab = t; render(); },
    edit: function () {
      var c = V.data.course;
      uiModal({ title: '课程信息与大纲', cls: 'wide', html: infoForm(c), noFocus: true, onOpen: bindSyl, buttons: [{ text: '取消', value: function () { return null; } }, { text: '保存', cls: 'primary', value: readInfo }] })
        .then(function (o) { if (o) api('/course/' + V.cid, { body: o }).then(function () { toast('已保存'); reload(); }, function (e) { toast(e.message, true); }); });
    },
    clone: function () {
      uiModal({ title: '复制到新学期', html: '<div class="bk-form"><p class="muted small">课程目标、支撑矩阵、教案、题库和上一轮反思都会带过去（不带成绩和日期）。</p><label>新学期<input value="' + esc((V.data.course.semester || '') + '(新)') + '"></label></div>', enterIndex: 1,
        buttons: [{ text: '取消', value: function () { return null; } }, { text: '复制', cls: 'primary', value: function (bg) { return bg.querySelector('input').value; } }] })
        .then(function (sem) { if (sem !== null && sem !== undefined) api('/course/' + V.cid + '/clone', { body: { semester: sem } }).then(function (j) { toast('已复制到新学期'); open(j.id, 'home'); }, function (e) { toast(e.message, true); }); });
    },
    del: function () {
      uiConfirm('删除课程《' + V.data.course.name + '》以及它的目标、教案、题库、试卷和成绩？（关联的课件不会删除）此操作无法恢复。', { danger: true, ok: '删除' }).then(function (ok) { if (ok) api('/course/' + V.cid + '/delete', { body: {} }).then(function () { toast('已删除'); listPage(); }, function (e) { toast(e.message, true); }); });
    },
    page: function () { var last = ''; try { last = localStorage.getItem('beike-course') || ''; } catch (e) {} if (V.cid) return open(V.cid); if (last) return open(last).catch(listPage); listPage(); }
  };
})();
