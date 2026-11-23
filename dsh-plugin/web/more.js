/* 备课工作台（DSH 插件版）：因人而异的设置页和弹窗——
 * 我的资料库、我的备课风格与技能、学校模板与校徽、设置（配图 / 视频 Key），
 * 以及教学方法选择、配图、教学视频、版本历史、常用指令。 */
(function () {
  var ME = null;
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (iso) { if (!iso) return ''; var d = new Date(iso); return (d.getMonth() + 1) + '-' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

  /** 读取个人设置，并把学校模板与校徽交给渲染内核 */
  function loadMe() {
    return api('/me').then(function (j) {
      ME = j;
      DeckKit.addTemplates(JSON.parse(JSON.stringify(j.templates || [])));
      DeckKit.setBrand(j.renderBrand || null);
      return j;
    });
  }
  function themeName(v) {
    if (/^tpl:/.test(v)) { var t = (ME && ME.templates || []).filter(function (x) { return 'tpl:' + x.id === v; })[0]; return t ? t.name : '学院蓝'; }
    return (DeckKit.THEMES[v] || DeckKit.THEMES.blue).name;
  }

  /* ================= 主区域页面 ================= */
  function page(title, sub, body) {
    $('main').innerHTML = '<div class="bk-top"><button class="bk-ib bk-menu" onclick="BK.side(true)">' + ico('layout-grid') + '</button><div class="bk-title"><h2 class="bk-h2">' + esc(title) + '</h2><div class="bk-meta muted">' + sub + '</div></div></div><div class="bk-pane bk-page" id="pane">' + body + '</div>';
    BK.mark && BK.mark();
  }

  /* ---------- 我的资料库 ---------- */
  var LIB = { q: '', folder: '' };
  function libraryPage() {
    page('我的资料库', '讲义、旧课件、教案放进来一次，以后每节课都能用。新建课次时会自动推荐相关资料；课次里上传的资料也会自动存进来。',
      '<div class="pl"><label class="bk-drop" id="ldrop">' + ico('upload') + '<b>点击选择文件，或把文件拖到这里</b><small>Word（.docx）、PowerPoint（.pptx）、文本（.txt / .md），可以一次选多个</small><input type="file" id="lf" class="bk-file" multiple accept=".docx,.pptx,.txt,.md,.markdown,.csv,.html,.htm"></label>' +
      '<div class="bk-row"><label class="bk-inl">存到课程<input id="lfolder" list="lfolders" placeholder="例如：数据结构（可不填）"></label><datalist id="lfolders"></datalist>' +
      '<details class="bk-paste"><summary>粘贴文字</summary><input id="lp-name" placeholder="资料名称"><textarea id="lp-text" rows="5" placeholder="把资料文字粘贴到这里"></textarea><button class="btn sm" id="lp-add">存入资料库</button></details></div></div>' +
      '<div class="pl"><div class="bk-row"><input class="bk-search" id="lq" placeholder="搜索资料名称或全文" value="' + esc(LIB.q) + '"><select id="lfsel"><option value="">全部课程</option></select></div><div id="llist" class="muted small">加载中…</div></div>');
    var load = function () {
      api('/library?q=' + encodeURIComponent(LIB.q)).then(function (j) {
        $('lfolders').innerHTML = j.folders.map(function (f) { return '<option value="' + esc(f) + '">'; }).join('');
        $('lfsel').innerHTML = '<option value="">全部课程</option>' + j.folders.map(function (f) { return '<option' + (f === LIB.folder ? ' selected' : '') + '>' + esc(f) + '</option>'; }).join('') + '<option value="~"' + (LIB.folder === '~' ? ' selected' : '') + '>未分类</option>';
        var items = j.items.filter(function (x) { return !LIB.folder || (LIB.folder === '~' ? !x.folder : x.folder === LIB.folder); });
        if (!items.length) { $('llist').innerHTML = '<p class="muted small">' + (j.items.length || LIB.q ? '没有匹配的资料。' : '资料库还是空的。') + '</p>'; return; }
        var groups = {}, order = [];
        items.forEach(function (x) { var g = x.folder || '未分类'; if (!groups[g]) { groups[g] = []; order.push(g); } groups[g].push(x); });
        $('llist').innerHTML = order.map(function (g) {
          return '<div class="bk-gh">' + esc(g) + '<span>' + groups[g].length + '</span></div><ul class="bk-mats">' + groups[g].map(function (x) {
            return '<li>' + ico('file-text') + '<div><b>' + esc(x.name) + '</b><small>' + x.chars.toLocaleString() + ' 字 · ' + fmt(x.addedAt) + '</small></div>' +
              '<button class="btn ghost sm" data-make="' + x.id + '" title="用这份资料新建一节课">' + ico('plus') + '做课件</button>' +
              '<button class="btn ghost sm" data-view="' + x.id + '">' + ico('eye') + '查看</button><button class="bk-ib" data-del="' + x.id + '" title="删除">' + ico('trash') + '</button></li>';
          }).join('') + '</ul>';
        }).join('');
        $('llist').querySelectorAll('[data-view]').forEach(function (b) { b.onclick = function () { viewLib(b.dataset.view, load); }; });
        $('llist').querySelectorAll('[data-make]').forEach(function (b) { b.onclick = function () { var x = items.filter(function (i) { return i.id === b.dataset.make; })[0]; BK.newLesson({ title: x.name.replace(/\.(docx|pptx|txt|md)$/i, ''), course: x.folder, library: [x.id] }); }; });
        $('llist').querySelectorAll('[data-del]').forEach(function (b) {
          b.onclick = function () { uiConfirm('从资料库删除这份资料？已经加进课次的资料不受影响。', { danger: true, ok: '删除' }).then(function (ok) { if (ok) api('/library/' + b.dataset.del + '/delete', { body: {} }).then(load, function (e) { toast(e.message, true); }); }); };
        });
      }, function (e) { $('llist').textContent = e.message; });
    };
    var t;
    $('lq').oninput = function () { clearTimeout(t); var v = this.value; t = setTimeout(function () { LIB.q = v.trim(); load(); }, 300); };
    $('lfsel').onchange = function () { LIB.folder = this.value; load(); };
    var up = function (files) {
      var arr = [].slice.call(files || []), i = 0, n = 0, folder = $('lfolder').value.trim();
      if (!arr.length) return;
      var next = function () {
        if (i >= arr.length) { toast('已存入 ' + n + ' 份资料'); return load(); }
        var f = arr[i++]; toast('正在读取：' + f.name);
        fetch(BASE + '/api/library', { method: 'POST', headers: { 'X-Beike': '1', 'X-File-Name': encodeURIComponent(f.name), 'X-Folder': encodeURIComponent(folder) }, body: f, credentials: 'same-origin' })
          .then(function (r) { return r.json(); }).then(function (j) { if (j.error) toast(f.name + '：' + j.error, true); else { n++; if (j.dup) toast(f.name + '：资料库里已有相同内容'); } next(); }, function () { toast(f.name + ' 上传失败', true); next(); });
      };
      next();
    };
    $('lf').onchange = function () { up(this.files); this.value = ''; };
    var d = $('ldrop');
    d.ondragover = function (e) { e.preventDefault(); d.classList.add('over'); };
    d.ondragleave = function () { d.classList.remove('over'); };
    d.ondrop = function (e) { e.preventDefault(); d.classList.remove('over'); up(e.dataTransfer.files); };
    $('lp-add').onclick = function () {
      var tx = $('lp-text').value.trim(); if (!tx) { toast('请先粘贴文字', true); return; }
      api('/library', { body: { name: $('lp-name').value.trim() || '粘贴的文字', text: tx, folder: $('lfolder').value.trim() } }).then(function () { toast('已存入资料库'); $('lp-text').value = ''; load(); }, function (e) { toast(e.message, true); });
    };
    load();
  }
  function viewLib(id, after) {
    api('/library/' + id).then(function (x) {
      uiModal({ title: '资料库 · ' + x.name, cls: 'wide', noFocus: true,
        html: '<div class="bk-form"><div class="row2"><label>名称<input data-k="name" value="' + esc(x.name) + '"></label><label>课程<input data-k="folder" value="' + esc(x.folder) + '"></label></div><label>文字 <small class="muted">可以直接修改，例如删掉无关的页眉页脚</small><textarea data-k="text" rows="16" class="bk-mat-edit">' + esc(x.text) + '</textarea></label></div>',
        buttons: [{ text: '关闭', value: function () { return null; } }, { text: '保存修改', cls: 'primary', value: function (bg) { var o = {}; bg.querySelectorAll('[data-k]').forEach(function (el) { o[el.dataset.k] = el.value; }); return o; } }]
      }).then(function (o) { if (o) api('/library/' + id, { body: o }).then(function () { toast('已保存'); after && after(); }, function (e) { toast(e.message, true); }); });
    }, function (e) { toast(e.message, true); });
  }
  /** 从资料库选资料加入课次 */
  function pickLibrary(L, done) {
    Promise.all([api('/library/suggest?title=' + encodeURIComponent(L.title + ' ' + L.course)), api('/library')]).then(function (r) {
      var sug = r[0].items, all = r[1].items, sid = sug.map(function (x) { return x.id; });
      if (!all.length) { uiModal({ title: '从资料库添加', html: '<p class="ui-msg">资料库还是空的。先到左侧「我的资料库」上传讲义、旧课件、教案。</p>', buttons: [{ text: '知道了' }] }); return; }
      var row = function (x, on) { return '<label class="bk-ck"><input type="checkbox" value="' + x.id + '"' + (on ? ' checked' : '') + '><span><b>' + esc(x.name) + '</b><small>' + esc(x.folder || '未分类') + ' · ' + x.chars.toLocaleString() + ' 字</small></span></label>'; };
      uiModal({ title: '从资料库添加到《' + L.title + '》', cls: 'wide', noFocus: true,
        html: (sug.length ? '<div class="bk-gh">可能相关</div>' + sug.map(function (x) { return row(x, true); }).join('') : '') +
          '<div class="bk-gh">全部资料</div><div class="bk-cklist">' + all.filter(function (x) { return sid.indexOf(x.id) < 0; }).map(function (x) { return row(x, false); }).join('') + '</div>',
        buttons: [{ text: '取消', value: function () { return null; } }, { text: '加入这节课', cls: 'primary', value: function (bg) { return [].map.call(bg.querySelectorAll('input:checked'), function (i) { return i.value; }); } }]
      }).then(function (ids) {
        if (!ids || !ids.length) return;
        api('/lesson/' + L.id + '/attach', { body: { ids: ids } }).then(function (j) { toast(j.names.length ? '已加入 ' + j.names.length + ' 份资料' : '这些资料已经在课次里了'); done && done(); }, function (e) { toast(e.message, true); });
      });
    }, function (e) { toast(e.message, true); });
  }

  /* ---------- 我的备课风格 + 我的技能 + 常用指令 ---------- */
  function stylePage() {
    var s = ME.style;
    var opt = function (o, v) { return Object.keys(o).map(function (k) { return '<option value="' + k + '"' + (k === v ? ' selected' : '') + '>' + esc(o[k]) + '</option>'; }).join(''); };
    var mine = ME.methods.filter(function (m) { return m.mine; });
    page('我的备课风格', '填一次，以后 AI 做每一份课件都按你的习惯来。也可以在 DSH 对话里说“从我的资料库学习我的备课风格”。',
      '<div class="pl"><h4>备课偏好</h4><div class="bk-form">' +
      '<label>我的学生 <small class="muted">专业、年级、基础，例如“护理专业大一，基础一般，动手能力强”</small><input data-s="students" value="' + esc(s.students) + '" maxlength="200"></label>' +
      '<div class="row2"><label>语言风格<select data-s="tone">' + opt(ME.tones, s.tone) + '</select></label><label>每页信息量<select data-s="density">' + opt(ME.density, s.density) + '</select></label></div>' +
      '<label>每节课必须有</label><div class="bk-chips">' + Object.keys(ME.must).map(function (k) { return '<label class="bk-chip"><input type="checkbox" data-must="' + k + '"' + (s.must.indexOf(k) >= 0 ? ' checked' : '') + '>' + esc(ME.must[k]) + '</label>'; }).join('') + '</div>' +
      '<label>常用案例 <small class="muted">例如“多用医院真实场景、本地企业案例”</small><input data-s="cases" value="' + esc(s.cases) + '" maxlength="200"></label>' +
      '<label>不要这样做<textarea data-s="avoid" rows="2" maxlength="300">' + esc(s.avoid) + '</textarea></label>' +
      '<label>其他习惯<textarea data-s="notes" rows="3" maxlength="800">' + esc(s.notes) + '</textarea></label>' +
      '<div><button class="btn primary" id="st-save">' + ico('check') + '保存备课风格</button> <button class="btn ghost" id="st-learn">' + ico('sparkles') + '让 AI 从资料库学习我的风格</button></div></div></div>' +
      '<div class="pl"><h4>我的技能 <small class="muted">一条可以反复使用的具体要求，AI 会优先遵守</small></h4>' +
      (mine.length ? '<ul class="bk-skills">' + mine.map(function (m) {
        var auto = ME.autoMethods.indexOf(m.key) >= 0;
        return '<li><div><b>' + esc(m.name) + '</b>' + (auto ? '<em class="bk-tag">新课次默认带上</em>' : '') + '<p class="small">' + esc(m.instructions) + '</p></div><button class="btn ghost sm" data-edit="' + m.key + '">' + ico('pencil') + '修改</button><button class="bk-ib" data-del="' + m.key + '">' + ico('trash') + '</button></li>';
      }).join('') + '</ul>' : '<p class="muted small">还没有技能。例如：“每个新概念先抛问题让学生猜，再揭晓答案”。</p>') +
      '<button class="btn sm" id="sk-new">' + ico('plus') + '新建技能</button> <button class="btn ghost sm" id="sk-ai">' + ico('sparkles') + '一句话让 AI 帮我写</button></div>' +
      '<div class="pl"><h4>新课次默认采用的教学方法 <small class="muted">最多 ' + ME.maxMethods + ' 个，新建课次时自动带上</small></h4><div id="auto-m" class="bk-chips"></div><button class="btn ghost sm" id="auto-edit">' + ico('pencil') + '选择</button></div>' +
      '<div class="pl"><h4>常用指令 <small class="muted">在课件页一点就复制，发给 AI</small></h4><textarea id="cmds" rows="5" placeholder="每行一条，最多 12 条，例如：每页不超过 4 条，案例换成护理专业的">' + esc(ME.cmds.join('\n')) + '</textarea><button class="btn sm" id="cmds-save">' + ico('check') + '保存常用指令</button></div>');
    var autoShow = function () { var ms = ME.methods.filter(function (m) { return ME.autoMethods.indexOf(m.key) >= 0; }); $('auto-m').innerHTML = ms.length ? ms.map(function (m) { return '<span class="bk-chip on">' + esc(m.name) + '</span>'; }).join('') : '<span class="muted small">未设置</span>'; };
    autoShow();
    $('st-save').onclick = function () {
      var o = { must: [] };
      $('pane').querySelectorAll('[data-s]').forEach(function (el) { o[el.dataset.s] = el.value; });
      $('pane').querySelectorAll('[data-must]:checked').forEach(function (el) { o.must.push(el.dataset.must); });
      api('/me/style', { body: o }).then(function (j) { ME.style = j.style; toast('备课风格已保存，以后 AI 做课件都会按这个来'); }, function (e) { toast(e.message, true); });
    };
    $('st-learn').onclick = function () { copyText('请读我备课工作台资料库里最近的旧课件和教案（beike_library），总结我的备课风格：学生情况、语言风格、每页信息量、每节课必有的环节、常用案例、不喜欢的做法。逐条说明依据，只补充我还没填的项，等我确认后再用 beike_profile action=save_style 保存。'); };
    $('sk-new').onclick = function () { editSkill(null); };
    $('sk-ai').onclick = function () { copyText('帮我写一条备课工作台的“我的技能”：我想要的效果是【在这里写一句话】。写成具体、可执行、AI 能落实到课件和讲稿里的要求，给我看过后用 beike_profile action=save_skill 保存。'); };
    $('pane').querySelectorAll('[data-edit]').forEach(function (b) { b.onclick = function () { editSkill(ME.skills.filter(function (x) { return x.id === b.dataset.edit; })[0]); }; });
    $('pane').querySelectorAll('[data-del]').forEach(function (b) {
      b.onclick = function () { uiConfirm('删除这条技能？', { danger: true, ok: '删除' }).then(function (ok) { if (ok) api('/me/skill/' + b.dataset.del + '/delete', { body: {} }).then(function () { loadMe().then(stylePage); }, function (e) { toast(e.message, true); }); }); };
    });
    $('auto-edit').onclick = function () { pickMethods(ME.autoMethods, '新课次默认采用的教学方法').then(function (keys) { if (keys) api('/me/auto', { body: { keys: keys } }).then(function (j) { ME.autoMethods = j.auto; autoShow(); toast('已保存'); }, function (e) { toast(e.message, true); }); }); };
    $('cmds-save').onclick = function () { api('/me/cmds', { body: { cmds: $('cmds').value.split('\n') } }).then(function (j) { ME.cmds = j.cmds; toast('已保存 ' + j.cmds.length + ' 条常用指令'); }, function (e) { toast(e.message, true); }); };
  }
  function editSkill(s) {
    s = s || {};
    var auto = s.id && ME.autoMethods.indexOf(s.id) >= 0;
    uiModal({ title: s.id ? '修改技能' : '新建技能', cls: 'wide',
      html: '<div class="bk-form"><label>名称<input data-k="name" value="' + esc(s.name) + '" maxlength="30" placeholder="例如：先猜后讲"></label><label>一句说明（可选）<input data-k="summary" value="' + esc(s.summary) + '" maxlength="80"></label>' +
        '<label>具体要求 <small class="muted">写清楚 AI 在课件、讲稿、练习里要怎么做</small><textarea data-k="instructions" rows="6" maxlength="1500">' + esc(s.instructions) + '</textarea></label><label class="bk-ck"><input type="checkbox" data-k="auto"' + (auto ? ' checked' : '') + '><span>以后新建的课次都自动带上</span></label></div>',
      buttons: [{ text: '取消', value: function () { return null; } }, { text: '保存', cls: 'primary', value: function (bg) { var o = { id: s.id }; bg.querySelectorAll('[data-k]').forEach(function (el) { o[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value; }); return o; } }]
    }).then(function (o) { if (o) api('/me/skill', { body: o }).then(function () { toast('技能已保存'); loadMe().then(stylePage); }, function (e) { toast(e.message, true); }); });
  }

  /* ---------- 教学方法选择 ---------- */
  function pickMethods(cur, title) {
    var groups = {}, order = [];
    ME.methods.forEach(function (m) { if (!groups[m.category]) { groups[m.category] = []; order.push(m.category); } groups[m.category].push(m); });
    return uiModal({ title: title || '教学方法', cls: 'wide', noFocus: true,
      html: '<p class="ui-msg muted small">选 1–4 种（太多反而落实不了）。选定后，AI 必须把这些做法落实到课件、讲稿和练习里，体检时也会检查。</p>' +
        order.map(function (g) {
          return '<div class="bk-gh">' + esc(g) + '</div><div class="bk-mgrid">' + groups[g].map(function (m) {
            return '<label class="bk-mcard"><input type="checkbox" value="' + esc(m.key) + '"' + (cur.indexOf(m.key) >= 0 ? ' checked' : '') + '><span><b>' + esc(m.name) + '</b><small>' + esc(m.summary || m.instructions.slice(0, 60)) + '</small></span></label>';
          }).join('') + '</div>';
        }).join(''),
      onOpen: function (bg) {
        bg.addEventListener('change', function (e) {
          if (e.target.type !== 'checkbox') return;
          if (bg.querySelectorAll('input:checked').length > ME.maxMethods) { e.target.checked = false; toast('最多选 ' + ME.maxMethods + ' 种', true); }
        });
      },
      buttons: [{ text: '取消', value: function () { return null; } }, { text: '确定', cls: 'primary', value: function (bg) { return [].map.call(bg.querySelectorAll('input:checked'), function (i) { return i.value; }); } }]
    });
  }

  /* ---------- 学校模板与校徽 ---------- */
  function brandPage() {
    var b = ME.brand, p = b.prefs || {};
    var sample = [{ layout: 'title', title: '这节课的题目', subtitle: '课程名称 · 第几章' }, { layout: 'bullets', title: '内容页标题', bullets: ['第一个要点', '第二个要点', '第三个要点'] }];
    var ck = function (k, t) { return '<label class="bk-ck"><input type="checkbox" data-p="' + k + '"' + (+p[k] ? ' checked' : '') + '><span>' + t + '</span></label>'; };
    var img = function (k, t, hint) {
      return '<div class="bk-logo"><div class="bk-logo-box">' + (b[k] ? '<img src="' + esc(b[k].src) + '" alt="">' : '<span class="muted small">未上传</span>') + '</div><div><b>' + t + '</b><small class="muted">' + hint + '</small><div><label class="btn ghost sm">' + ico('upload') + (b[k] ? '更换' : '上传') + '<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-img="' + k + '" hidden></label>' + (b[k] ? ' <button class="btn ghost sm" data-rm="' + k + '">' + ico('trash') + '去掉</button>' : '') + '</div></div></div>';
    };
    var tpls = ME.templates || [];
    var themeOpts = '<optgroup label="学校模板">' + tpls.map(function (t) { return '<option value="tpl:' + t.id + '"' + ('tpl:' + t.id === p.default_theme ? ' selected' : '') + '>' + esc(t.name) + '</option>'; }).join('') + '</optgroup><optgroup label="内置配色">' +
      Object.keys(DeckKit.THEMES).map(function (k) { return '<option value="' + k + '"' + (k === p.default_theme ? ' selected' : '') + '>' + esc(DeckKit.THEMES[k].name) + '</option>'; }).join('') + '</optgroup>';
    page('学校模板与校徽', '学校要求统一模板？上传一次学校的 .pptx 模板，任何一节课都能一键套用。没有模板也可以只放学校名称、Logo 和校徽。',
      '<div class="pl"><h4>学校 PPT 模板</h4><div class="bk-tpls">' + tpls.map(function (t) {
        return '<div class="bk-tpl"><div class="slide-preview">' + DeckKit.preview(sample[1], 1, 'tpl:' + t.id, '') + '</div><b>' + esc(t.name) + '</b><span><button class="btn ghost sm" data-rn="' + t.id + '">' + ico('pencil') + '改名</button><button class="bk-ib" data-tdel="' + t.id + '">' + ico('trash') + '</button></span></div>';
      }).join('') + '<button class="bk-tpl bk-tpl-up" id="tpl-up">' + ico('upload') + '<b>上传学校模板</b><small>.pptx / .potx · 16:9</small></button></div>' +
      '<label class="bk-inl">新课次默认样式<select id="def-theme">' + themeOpts + '</select></label></div>' +
      '<div class="pl"><h4>学校名称与标志 <small class="muted">只出现在你的课件上</small></h4><div class="bk-form"><label>学校名称<input id="b-name" value="' + esc(b.name) + '" maxlength="40" placeholder="例如：某某职业技术学院"></label></div>' +
      img('logo', '横版 Logo', '显示在封面左上角，建议透明底 PNG') + img('icon', '方形校徽', '显示在内容页右上角，建议透明底 PNG') +
      '<div class="bk-chips">' + ck('cover_logo', '封面显示 Logo') + ck('corner_icon', '内容页显示校徽') + ck('footer_name', '页脚显示学校名称') + ck('on_template', '使用学校模板时也叠加') + '</div>' +
      '<div class="bk-bprev">' + sample.map(function (s, i) { return '<div class="slide-preview">' + DeckKit.preview(s, i, 'blue', '课程名称') + '</div>'; }).join('') + '</div></div>');
    var saveB = function (o) { return api('/me/brand', { body: o }).then(function () { return loadMe().then(brandPage); }, function (e) { toast(e.message, true); }); };
    $('b-name').onchange = function () { saveB({ name: this.value }); };
    $('def-theme').onchange = function () { saveB({ prefs: { default_theme: this.value } }).then(function () { toast('新课次会默认使用「' + themeName(ME.brand.prefs.default_theme) + '」'); }); };
    $('pane').querySelectorAll('[data-p]').forEach(function (el) { el.onchange = function () { var o = {}; o[el.dataset.p] = el.checked; saveB({ prefs: o }); }; });
    $('pane').querySelectorAll('[data-img]').forEach(function (el) {
      el.onchange = function () {
        var f = el.files[0]; if (!f) return;
        if (f.size > 5 * 1024 * 1024) { toast('请选择 5MB 以内的图片', true); return; }
        fetch(BASE + '/api/me/brand/' + el.dataset.img, { method: 'POST', headers: { 'X-Beike': '1' }, body: f, credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) { if (j.error) toast(j.error, true); else { toast('已上传'); loadMe().then(brandPage); } });
      };
    });
    $('pane').querySelectorAll('[data-rm]').forEach(function (b2) { b2.onclick = function () { var o = {}; o[b2.dataset.rm] = null; saveB(o); }; });
    $('tpl-up').onclick = function () { uploadTemplate(function () { loadMe().then(brandPage); }); };
    $('pane').querySelectorAll('[data-rn]').forEach(function (b2) {
      b2.onclick = function () {
        var t = tpls.filter(function (x) { return x.id === b2.dataset.rn; })[0];
        uiModal({ title: '模板改名', html: '<div class="bk-form"><input value="' + esc(t.name) + '" maxlength="40"></div>', enterIndex: 1, buttons: [{ text: '取消', value: function () { return null; } }, { text: '保存', cls: 'primary', value: function (bg) { return bg.querySelector('input').value.trim(); } }] })
          .then(function (n) { if (n) api('/me/template/' + t.id + '/rename', { body: { name: n } }).then(function () { loadMe().then(brandPage); }, function (e) { toast(e.message, true); }); });
      };
    });
    $('pane').querySelectorAll('[data-tdel]').forEach(function (b2) {
      b2.onclick = function () { uiConfirm('删除这个模板？用到它的课件会改回“学院蓝”配色。', { danger: true, ok: '删除' }).then(function (ok) { if (ok) api('/me/template/' + b2.dataset.tdel + '/delete', { body: {} }).then(function () { loadMe().then(brandPage); }, function (e) { toast(e.message, true); }); }); };
    });
  }
  /** 上传学校模板：浏览器里解析 .pptx（TplKit.parse），预览确认后保存 */
  function uploadTemplate(onSaved) {
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.pptx,.potx';
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return;
      if (!/\.(pptx|potx)$/i.test(f.name)) { toast('请选择 .pptx 格式的 PPT 模板（.ppt 旧格式请先在 PowerPoint 里另存为 .pptx）', true); return; }
      if (f.size > 60 * 1024 * 1024) { toast('模板文件太大（超过 60MB）', true); return; }
      busy(true, '正在读取模板…');
      TplKit.parse(f).then(function (r) {
        busy(false);
        var urls = {}, d = JSON.stringify(r.data);
        Object.keys(r.files).forEach(function (k) { urls[k] = URL.createObjectURL(r.files[k].blob); d = d.split('"@' + k + '"').join(JSON.stringify(urls[k])); });
        DeckKit.addTemplates([{ id: 'preview', name: r.name, data: JSON.parse(d) }]);
        var sample = [{ layout: 'title', title: '这节课的题目', subtitle: '课程名称 · 第几章' }, { layout: 'bullets', title: '内容页标题', bullets: ['第一个要点', '第二个要点', '第三个要点'] },
          { layout: 'diagram', title: '结构图页', lead: '一句导语', diagram: { type: 'flow', hi: 1, items: [{ t: '第一步', d: '说明' }, { t: '第二步', d: '说明' }, { t: '第三步', d: '说明' }] } }];
        uiModal({ title: '套用学校模板', cls: 'wide',
          html: '<p class="ui-msg muted small">读取了模板里的背景、校徽、色条、标题位置和主题色。下面是套用后的效果，确认没问题再保存。' + (r.skipped ? '<br>有 ' + r.skipped + ' 张图片是 EMF / SVG 等格式，暂时无法使用，已略过。' : '') + '</p>' +
            '<div class="tpl-prev">' + sample.map(function (sl, i) { return '<div class="slide-preview">' + DeckKit.preview(sl, i, 'tpl:preview', '') + '</div>'; }).join('') + '</div>' +
            '<div class="bk-form"><label>模板名称<input value="' + esc(r.name) + '" maxlength="40"></label></div>',
          buttons: [{ text: '取消', value: function () { return null; } }, { text: '保存并使用', cls: 'primary', value: function (bg) { return bg.querySelector('input').value.trim() || r.name; } }]
        }).then(function (name) {
          Object.keys(urls).forEach(function (k) { URL.revokeObjectURL(urls[k]); });
          if (!name) return;
          busy(true, '正在保存模板…');
          var keys = Object.keys(r.files), images = {};
          Promise.all(keys.map(function (k) { return b64(r.files[k].blob).then(function (s) { images[k] = s; }); })).then(function () {
            return api('/me/template', { body: { name: name, data: r.data, images: images } });
          }).then(function (j) { busy(false); toast('模板已保存'); onSaved && onSaved(j.template); }, function (e) { busy(false); toast(e.message, true); });
        });
      }).catch(function (e) { busy(false); toast(e.message || '读取模板失败', true); });
    };
    inp.click();
  }
  function b64(blob) { return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1] || ''); }; r.onerror = no; r.readAsDataURL(blob); }); }

  /** 课件样式窗口：学校模板 + 36 套内置配色 */
  function pickStyle(L, onPick) {
    var b = DeckKit.THEMES, groups = [], gi = {};
    Object.keys(b).forEach(function (k) { var g = b[k].g || '其他'; if (!(g in gi)) { gi[g] = groups.length; groups.push([g, []]); } groups[gi[g]][1].push(k); });
    var sample = L.slides[0] || { layout: 'title', title: L.title, subtitle: L.course };
    var card = function (k, name, tag) {
      var t = b[k], sw = t ? '<i class="sty-sw">' + [t.cover, t.primary, t.accent, t.soft, t.bg].map(function (x) { return '<i style="background:#' + x + '"></i>'; }).join('') + '</i>' : '';
      return '<button type="button" class="sty' + (k === L.theme ? ' on' : '') + '" data-v="' + esc(k) + '"><div class="slide-preview">' + DeckKit.preview(sample, 0, k, L.course) + '</div><span><b>' + esc(name || t.name) + '</b>' + sw + (tag ? '<em>' + tag + '</em>' : '') + '</span></button>';
    };
    var tpls = ME.templates || [];
    uiModal({ title: '课件样式', cls: 'wide sty-modal', buttons: [{ text: '关闭' }], noFocus: true,
      html: '<div class="sty-h"><b>学校模板</b><a href="#" id="sty-brand" class="small">学校模板与校徽设置 ›</a></div><div class="sty-grid">' + tpls.map(function (t) { return card('tpl:' + t.id, t.name, '学校模板'); }).join('') +
        '<button type="button" class="sty sty-up" data-v="__upload"><span class="sty-up-i">' + ico('upload') + '</span><b>上传学校模板</b><small>.pptx · 16:9</small></button></div>' +
        '<div class="sty-h"><b>内置配色</b><span class="muted small">' + Object.keys(b).length + ' 套</span></div>' +
        '<div class="sty-tabs">' + groups.map(function (g, i) { return '<button type="button" class="sty-tab" data-g="' + i + '">' + g[0] + '</button>'; }).join('') + '</div>' +
        groups.map(function (g, i) { return '<div class="sty-grid sty-gp" data-g="' + i + '">' + g[1].map(function (k) { return card(k); }).join('') + '</div>'; }).join(''),
      onOpen: function (bg, done) {
        var tabs = bg.querySelectorAll('.sty-tab'), gps = bg.querySelectorAll('.sty-gp');
        var show = function (i) { tabs.forEach(function (t) { t.classList.toggle('on', t.dataset.g == i); }); gps.forEach(function (g) { g.hidden = g.dataset.g != i; }); };
        tabs.forEach(function (t) { t.onclick = function () { show(t.dataset.g); }; });
        var cur = bg.querySelector('.sty-gp .sty.on'); show(cur ? cur.closest('.sty-gp').dataset.g : 0);
        bg.querySelector('#sty-brand').onclick = function (e) { e.preventDefault(); done(); BK.page('brand'); };
        bg.querySelectorAll('.sty').forEach(function (btn) {
          btn.onclick = function () {
            done();
            if (btn.dataset.v === '__upload') uploadTemplate(function (t) { loadMe().then(function () { onPick('tpl:' + t.id); }); });
            else onPick(btn.dataset.v);
          };
        });
      }
    });
  }

  /* ---------- 设置：配图与视频服务 ---------- */
  function settingsPage() {
    var k = ME.keys;
    var row = function (id, t, on, mask, hint) {
      return '<label>' + t + (on ? ' <em class="bk-tag ok">已填写 ' + esc(mask) + '</em>' : '') + '<input id="' + id + '" type="password" autocomplete="off" placeholder="' + (on ? '留空表示不修改；要删除请填 -' : '粘贴 API Key') + '"><small class="muted">' + hint + '</small></label>';
    };
    page('设置', '课件和资料保存在：<code>' + esc(ME.dataDir) + '</code>',
      '<div class="pl"><h4>AI 配图与教学视频（MiniMax）</h4><p class="muted small">填写后可以：给课件页 AI 生成写实示意图（H3-Image）、生成 4–15 秒带声音的课堂短视频（海螺 H3）。Key 只保存在你的电脑上，由插件直接调用 MiniMax。到 <a href="https://platform.minimaxi.com" target="_blank" rel="noopener">MiniMax 开放平台</a> 创建 API Key。</p><div class="bk-form">' +
      row('k-mm', 'MiniMax API Key', k.minimax, k.minimax_mask, '') +
      '<div class="row2"><label>接入点<select id="k-host"><option value="https://api.minimax.cn"' + (k.minimax_host !== 'https://api.minimax.io' ? ' selected' : '') + '>国内站 api.minimax.cn</option><option value="https://api.minimax.io"' + (k.minimax_host === 'https://api.minimax.io' ? ' selected' : '') + '>国际站 api.minimax.io</option></select></label>' +
      '<label>视频模型<select id="k-vm">' + [['MiniMax-H3', '效果最好（推荐）'], ['MiniMax-H3-Highspeed', '更快'], ['MiniMax-H3-Lite', '更便宜'], ['MiniMax-H3-Max', '最强，较慢较贵']].map(function (m) { return '<option value="' + m[0] + '"' + (m[0] === k.video_model ? ' selected' : '') + '>' + m[0] + '（' + m[1] + '）</option>'; }).join('') + '</select></label></div>' +
      '<div><button class="btn primary" id="k-save">' + ico('check') + '保存</button> <button class="btn ghost" id="k-ping"' + (k.minimax ? '' : ' disabled') + '>' + ico('refresh') + '测试连接</button></div></div></div>' +
      '<div class="pl"><h4>免费图库</h4><p class="muted small">不填也能用 Openverse 搜图；填了 Pexels / Pixabay 的免费 Key，搜到的照片更多更好。</p><div class="bk-form">' +
      row('k-px', 'Pexels API Key', k.pexels, k.pexels_mask, '在 pexels.com/api 免费申请') + row('k-pb', 'Pixabay API Key', k.pixabay, k.pixabay_mask, '在 pixabay.com/api/docs 免费申请') +
      '<div><button class="btn primary" id="k-save2">' + ico('check') + '保存</button></div></div></div>');
    var save = function () {
      var o = { minimax_host: $('k-host').value, video_model: $('k-vm').value };
      [['k-mm', 'minimax_key'], ['k-px', 'pexels_key'], ['k-pb', 'pixabay_key']].forEach(function (x) { var v = $(x[0]).value.trim(); if (v === '-') o[x[1]] = ''; else if (v) o[x[1]] = v; });
      api('/me/keys', { body: o }).then(function (j) { ME.keys = j.keys; toast('已保存'); settingsPage(); }, function (e) { toast(e.message, true); });
    };
    $('k-save').onclick = save; $('k-save2').onclick = save;
    $('k-ping').onclick = function () { toast('正在测试…'); api('/me/ping', { body: {} }).then(function (j) { toast(j.msg); }, function (e) { toast(e.message, true); }); };
  }

  /* ================= 课件页上的弹窗 ================= */
  /** 配图：搜索图库 / AI 生成 / 上传 / 去掉 */
  function imageDialog(L, idx, done) {
    var s = L.slides[idx];
    var q0 = s.title || L.title, page = 1, items = [];
    uiModal({ title: '第 ' + (idx + 1) + ' 页配图', cls: 'wide bk-imgdlg', noFocus: true,
      html: '<div class="bk-row"><input id="iq" class="bk-search" value="' + esc(q0) + '" placeholder="描述画面里看得见的东西，例如：图书馆 书架"><button class="btn sm" id="is">' + ico('search') + '搜索</button><button class="btn ghost sm" id="imore" hidden>换一批</button></div>' +
        '<div id="igrid" class="bk-igrid"><p class="muted small">输入关键词搜索免费图库（Openverse' + (ME.keys.pexels ? '、Pexels' : '') + (ME.keys.pixabay ? '、Pixabay' : '') + '）。</p></div>' +
        '<div class="bk-row bk-iacts"><button class="btn ghost sm" id="iai"' + (ME.keys.minimax ? '' : ' title="需要先在「设置」里填写 MiniMax Key"') + '>' + ico('sparkles') + 'AI 生成一张</button>' +
        '<label class="btn ghost sm">' + ico('upload') + '上传本地图片<input type="file" accept="image/*" id="iup" hidden></label>' + (s.image ? '<button class="btn ghost sm" id="irm">' + ico('trash') + '去掉图片</button>' : '') + '</div>',
      buttons: [{ text: '关闭' }],
      onOpen: function (bg, close) {
        var grid = bg.querySelector('#igrid');
        var search = function () {
          var q = bg.querySelector('#iq').value.trim(); if (!q) return;
          grid.innerHTML = '<p class="muted small">正在搜索…</p>';
          api('/images?q=' + encodeURIComponent(q) + '&page=' + page).then(function (j) {
            items = j.items;
            bg.querySelector('#imore').hidden = !items.length;
            grid.innerHTML = items.length ? items.map(function (x, i) { return '<button type="button" class="bk-ipick" data-i="' + i + '"><img src="' + esc(x.thumb) + '" loading="lazy" alt=""><small>' + esc(x.credit) + '</small></button>'; }).join('') : '<p class="muted small">没有搜到，换个更具体的画面关键词试试。</p>';
            grid.querySelectorAll('.bk-ipick').forEach(function (b) {
              b.onclick = function () {
                var x = items[+b.dataset.i]; close(); toast('正在下载图片…');
                api('/lesson/' + L.id + '/image/url', { body: { index: idx + 1, url: x.url, credit: x.credit } }).then(function () { toast('已配图'); done(); }, function (e) { toast(e.message, true); });
              };
            });
          }, function (e) { grid.innerHTML = '<p class="small c-ai">' + esc(e.message) + '</p>'; });
        };
        bg.querySelector('#is').onclick = function () { page = 1; search(); };
        bg.querySelector('#iq').onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); page = 1; search(); } };
        bg.querySelector('#imore').onclick = function () { page++; search(); };
        bg.querySelector('#iai').onclick = function () {
          if (!ME.keys.minimax) { toast('请先在左下角「设置」里填写 MiniMax API Key', true); return; }
          close();
          uiModal({ title: 'AI 生成配图', html: '<div class="bk-form"><label>画面描述 <small class="muted">主体、场景、构图、光线；写实风格，不要文字</small><textarea rows="4">' + esc((s.title || '') + '：' + (s.bullets || []).slice(0, 2).join('，') + '。写实照片风格，课堂投影用') + '</textarea></label></div>',
            buttons: [{ text: '取消', value: function () { return null; } }, { text: '生成', cls: 'primary', value: function (b2) { return b2.querySelector('textarea').value.trim(); } }]
          }).then(function (pr) {
            if (!pr) return;
            busy(true, 'MiniMax 正在生成图片，大约 20–60 秒…');
            api('/lesson/' + L.id + '/image/ai', { body: { index: idx + 1, prompt: pr } }).then(function () { busy(false); toast('已生成并配图'); done(); }, function (e) { busy(false); toast(e.message, true); });
          });
        };
        bg.querySelector('#iup').onchange = function () {
          var f = this.files[0]; if (!f) return;
          if (f.size > 8 * 1024 * 1024) { toast('请选择 8MB 以内的图片', true); return; }
          close();
          fetch(BASE + '/api/lesson/' + L.id + '/image?index=' + (idx + 1), { method: 'POST', headers: { 'X-Beike': '1' }, body: f, credentials: 'same-origin' })
            .then(function (r) { return r.json(); }).then(function (j) { if (j.error) toast(j.error, true); else { toast('已配图'); done(); } });
        };
        var rm = bg.querySelector('#irm');
        if (rm) rm.onclick = function () { close(); api('/lesson/' + L.id + '/image/remove', { body: { index: idx + 1 } }).then(function () { toast('已去掉图片'); done(); }, function (e) { toast(e.message, true); }); };
        if (!s.image) search();
      }
    });
  }

  /** AI 教学视频（MiniMax H3） */
  function videoDialog(L, idx, done) {
    if (!ME.keys.minimax) {
      uiModal({ title: 'AI 教学视频', html: '<p class="ui-msg">生成教学视频需要 MiniMax（海螺 H3）。请先在左下角「设置」里填写 MiniMax API Key。</p>', buttons: [{ text: '取消', value: function () { return false; } }, { text: '去设置', cls: 'primary', value: function () { return true; } }] })
        .then(function (go) { if (go) BK.page('settings'); });
      return;
    }
    var s = L.slides[idx] || {}, K = ME.videoKinds;
    var withImg = L.slides.map(function (x, i) { return x.image ? i : -1; }).filter(function (i) { return i >= 0; });
    uiModal({ title: '在第 ' + (idx + 1) + ' 页后插入教学视频', cls: 'wide',
      html: '<div class="bk-form"><label>类型</label><div class="bk-chips">' + Object.keys(K).map(function (k, i) { return '<label class="bk-chip"><input type="radio" name="vk" value="' + k + '"' + (i === 0 ? ' checked' : '') + '>' + esc(K[k][0]) + '</label>'; }).join('') + '</div>' +
        '<label>画面描述 <small class="muted">主体、动作、场景、镜头运动、光线；画面里不会有文字，讲解由你在课上完成</small><textarea id="vp" rows="5" placeholder="例如：快递分拣中心里，包裹在传送带上被机械臂按大小依次排好，镜头从高处缓缓推近"></textarea></label>' +
        '<button type="button" class="btn ghost sm" id="vai">' + ico('copy') + '复制指令，让 DSH 里的 AI 帮我写并生成</button>' +
        '<div class="row2"><label>时长<select id="vd">' + [4, 6, 8, 10, 15].map(function (d) { return '<option value="' + d + '"' + (d === 6 ? ' selected' : '') + '>' + d + ' 秒</option>'; }).join('') + '</select></label>' +
        '<label>第一帧（可选）<select id="vf"><option value="">不指定</option>' + withImg.map(function (i) { return '<option value="' + (i + 1) + '">用第 ' + (i + 1) + ' 页的配图</option>'; }).join('') + '</select></label></div>' +
        '<label>视频页标题<input id="vt" placeholder="例如：生活中的排序"></label><p class="muted small">一般 1–5 分钟完成，期间可以继续做别的；完成后自动下载到本机，上课和导出的 PPT 里都能播放。</p></div>',
      buttons: [{ text: '取消', value: function () { return null; } }, { text: '开始生成', cls: 'primary', value: function (bg) {
        return { kind: (bg.querySelector('input[name=vk]:checked') || {}).value, prompt: bg.querySelector('#vp').value.trim(), duration: +bg.querySelector('#vd').value, firstFramePage: +bg.querySelector('#vf').value || undefined, title: bg.querySelector('#vt').value.trim(), after: idx + 1 };
      } }],
      onOpen: function (bg) {
        bg.querySelector('#vai').onclick = function () {
          var k = (bg.querySelector('input[name=vk]:checked') || {}).value;
          copyText('请为备课工作台课次 ' + L.id + '《' + L.title + '》第 ' + (idx + 1) + ' 页「' + (s.title || '') + '」之后生成一段' + K[k][0] + '教学视频（' + K[k][1] + '）。先结合本页和本节课内容写好具体画面描述（主体、动作、场景、镜头、光线，不要画面文字），再用 beike_video action=create（after=' + (idx + 1) + '，kind=' + k + '）生成，并在讲稿里写好课堂用法。');
        };
      }
    }).then(function (o) {
      if (!o) return;
      if (o.prompt.length < 8) { toast('请把画面描述写具体一些', true); return; }
      busy(true, '正在提交给 MiniMax…');
      api('/lesson/' + L.id + '/video', { body: o }).then(function (j) { busy(false); toast('已提交，视频页插在第 ' + j.page + ' 页，生成好会自动出现'); done(j.page - 1); }, function (e) { busy(false); toast(e.message, true); });
    });
  }

  /** 版本历史 */
  function versionsDialog(L, done) {
    api('/lesson/' + L.id + '/versions').then(function (j) {
      if (!j.items.length) { toast('还没有历史版本'); return; }
      uiModal({ title: '版本历史', cls: 'wide', noFocus: true,
        html: '<p class="ui-msg muted small">每次修改前都会保存一个版本（最多 20 个）。回到某个版本后，当前版本也会留在历史里，可以再撤销。</p><ul class="bk-vers">' + j.items.map(function (v) {
          return '<li><div><b>' + esc(v.note) + '</b><small>' + fmt(v.at) + ' · ' + v.pages + ' 页</small></div><button class="btn ghost sm" data-i="' + v.i + '">' + ico('history') + '回到这个版本之前</button></li>';
        }).join('') + '</ul>',
        buttons: [{ text: '关闭' }],
        onOpen: function (bg, close) {
          bg.querySelectorAll('[data-i]').forEach(function (b) { b.onclick = function () { close(); api('/lesson/' + L.id + '/restore', { body: { i: +b.dataset.i } }).then(function () { toast('已回到该版本'); done(); }, function (e) { toast(e.message, true); }); }; });
        }
      });
    }, function (e) { toast(e.message, true); });
  }

  function copyText(text) {
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast('已复制。粘贴到 DSH 对话框发给 AI 即可'); }, function () {
      uiModal({ title: '复制下面的文字', html: '<textarea class="bk-copy" rows="6" readonly>' + esc(text) + '</textarea>', buttons: [{ text: '关闭' }] });
    });
  }

  window.BKX = {
    me: function () { return ME; }, loadMe: loadMe, themeName: themeName,
    libraryPage: libraryPage, stylePage: stylePage, brandPage: brandPage, settingsPage: settingsPage,
    pickLibrary: pickLibrary, pickMethods: pickMethods, pickStyle: pickStyle, imageDialog: imageDialog, videoDialog: videoDialog, versionsDialog: versionsDialog,
    copy: copyText, viewLib: viewLib
  };
})();
