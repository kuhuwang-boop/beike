/* PPT 课件编辑器：网页预览 + PptxGenJS 导出（与预览使用同一套主题） */
(function () {
  var I = window.DECK_INIT;
  var THEMES = DeckKit.THEMES;
  var LAYOUTS = DeckKit.LAYOUTS;
  var FONT = 'Microsoft YaHei';

  var D = { slides: I.slides || [], theme: I.theme || 'blue', cur: 0, dirty: false, templates: I.templates || [] };
  function themeUI() { DeckKit.addTemplates(D.templates); DeckKit.setBrand(I.brand); document.getElementById('theme-n').textContent = TplKit.themeName(D.theme, D.templates); }
  themeUI();

  function blank(layout) {
    return { layout: layout || 'bullets', phase: 'P2', title: '', subtitle: '', bullets: [], left_title: '', left: [], right_title: '', right: [], question: '', options: [], answer: '', lead: '', diagram: null, notes: '' };
  }
  function T() { return THEMES[D.theme] || THEMES.blue; }
  function c(h) { return '#' + h; }
  function lines(a) { return (a || []).filter(function (x) { return String(x).trim() !== ''; }); }
  function markDirty() { D.dirty = true; }
  window.addEventListener('beforeunload', function (e) { if (D.dirty) { e.preventDefault(); e.returnValue = ''; } });

  /* ---------- 列表 ---------- */
  function renderList() {
    var el = document.getElementById('deck-list');
    if (!D.slides.length) {
      el.innerHTML = '<p class="muted small" style="padding:8px">还没有幻灯片。用上方按钮生成，或 <a href="#" onclick="Deck.add(\'title\');return false">手动添加第一页</a>。</p>';
      return;
    }
    el.innerHTML = D.slides.map(function (s, i) {
      return '<div class="thumb' + (i === D.cur ? ' on' : '') + '" onclick="Deck.go(' + i + ')"><span class="n">' + (i + 1) + '</span><span class="t">' + esc(s.title || s.question || '（无标题）') +
        '<br><span class="ph">' + (LAYOUTS[s.layout] || '') + (s.phase ? ' · ' + (I.phases[s.phase] || s.phase) : '') + '</span></span></div>';
    }).join('') +
      '<div class="deck-tools"><button class="btn ghost sm" onclick="Deck.add()">' + ico('plus') + '新页</button><button class="btn ghost sm" onclick="Deck.dup()">' + ico('copy') + '复制</button>' +
      '<button class="btn ghost sm" onclick="Deck.move(-1)" title="上移">' + ico('arrow-up') + '</button><button class="btn ghost sm" onclick="Deck.move(1)" title="下移">' + ico('arrow-down') + '</button><button class="btn ghost sm danger-text" onclick="Deck.del()">' + ico('trash') + '删除</button></div>';
  }

  /* ---------- 预览 ---------- */
  function previewHtml(s, idx) { return DeckKit.preview(s, idx, D.theme, I.course); }

  /* ---------- 编辑器 ---------- */
  function field(label, key, type, rows) {
    var s = D.slides[D.cur];
    var v = Array.isArray(s[key]) ? s[key].join('\n') : (s[key] || '');
    if (type === 'area') return '<label>' + label + '<textarea data-k="' + key + '" data-arr="' + (Array.isArray(s[key]) ? 1 : 0) + '" rows="' + (rows || 4) + '">' + esc(v) + '</textarea></label>';
    return '<label>' + label + '<input data-k="' + key + '" value="' + esc(v) + '"></label>';
  }
  /* ---------- 结构图编辑 ---------- */
  var DT = window.DiagramKit ? DiagramKit.TYPES : {};
  var USE_SUB = { compare: 1, tree: 1, layers: 1 }, USE_CENTER = { cycle: '中心词', hub: '中心主体', pillars: '顶部结论', tree: '总概念', compare: '中间标签（默认 VS）' }, USE_NOTE = { pillars: '底部“地基”一句话', kpi: '底部说明' };
  function ensureDiagram(s) {
    if (s.diagram && s.diagram.type) return;
    var src = lines(s.bullets).length ? lines(s.bullets) : lines(s.left).concat(lines(s.right));
    var items = src.slice(0, 6).map(function (b) { var m = String(b).split(/[：:]/); return { t: m[0].slice(0, 16), d: m.slice(1).join('：') || '' }; });
    while (items.length < 3) items.push({ t: '', d: '' });
    s.diagram = { type: 'matrix', style: 'rounded', items: items };
  }
  function diagramEditor(s) {
    ensureDiagram(s);
    var d = s.diagram, meta = DT[d.type] || {};
    var h = '<div class="dg-ed"><div class="row3"><label>结构图版式<select data-dg="type">' + Object.keys(DT).map(function (k) { return '<option value="' + k + '"' + (d.type === k ? ' selected' : '') + '>' + DT[k].name + ' — ' + DT[k].when + '</option>'; }).join('') + '</select></label>' +
      '<label>风格<select data-dg="style">' + Object.keys(DiagramKit.STYLES).map(function (k) { return '<option value="' + k + '"' + ((d.style || 'rounded') === k ? ' selected' : '') + '>' + DiagramKit.STYLES[k] + '</option>'; }).join('') + '</select></label>' +
      '<label>重点突出<select data-dg="hi"><option value="">不突出</option>' + (d.items || []).map(function (x, i) { return '<option value="' + i + '"' + (d.hi === i ? ' selected' : '') + '>第 ' + (i + 1) + ' 条' + (x.t ? '：' + esc(x.t) : '') + '</option>'; }).join('') + '</select></label></div>';
    h += '<label>导语（一句话点明这张图的结论，可留空）<input data-k="lead" value="' + esc(s.lead || '') + '" maxlength="60"></label>';
    if (USE_CENTER[d.type]) h += '<label>' + USE_CENTER[d.type] + '<input data-dg="center" value="' + esc(d.center || '') + '" maxlength="16"></label>';
    if (USE_NOTE[d.type]) h += '<label>' + USE_NOTE[d.type] + '<input data-dg="note" value="' + esc(d.note || '') + '" maxlength="60"></label>';
    if (d.type === 'pipeline') h += '<label>三个栏名（用 | 分隔）<input data-dg="cols" value="' + esc((d.cols || ['类型', '内容', '用途']).join(' | ')) + '"></label>';
    var tLabel = { timeline: '时间', kpi: '数字', layers: '层名', tree: '分类', compare: '标题' }[d.type] || '标题';
    h += '<div class="dg-items"><div class="dg-ih"><b>条目</b><span class="muted small">' + esc(meta.name || '') + '建议 ' + meta.min + '–' + meta.max + ' 条，每条都要有标题和内容</span></div>';
    (d.items || []).forEach(function (x, i) {
      h += '<div class="dg-it"><span class="dg-n">' + (i + 1) + '</span><div class="dg-f">' +
        '<input data-it="' + i + '" data-f="t" value="' + esc(x.t || '') + '" placeholder="' + tLabel + '" maxlength="20">' +
        (USE_SUB[d.type] ? '<textarea data-it="' + i + '" data-f="sub" rows="2" placeholder="子条目，每行一个">' + esc((x.sub || []).join('\n')) + '</textarea>'
          : '<input data-it="' + i + '" data-f="d" value="' + esc(x.d || '') + '" placeholder="' + (d.type === 'kpi' ? '指标名称' : d.type === 'pipeline' ? '内容' : '一行说明') + '" maxlength="80">') +
        (d.type === 'pipeline' ? '<input data-it="' + i + '" data-f="u" value="' + esc(x.u || '') + '" placeholder="用途" maxlength="40">' : '') +
        '</div><div class="dg-b"><button type="button" class="ibtn" title="上移" onclick="Deck.itMove(' + i + ',-1)">' + ico('arrow-up') + '</button><button type="button" class="ibtn" title="下移" onclick="Deck.itMove(' + i + ',1)">' + ico('arrow-down') + '</button><button type="button" class="ibtn del" title="删除" onclick="Deck.itDel(' + i + ')">' + ico('trash') + '</button></div></div>';
    });
    if ((d.items || []).length < (meta.max || 6)) h += '<button type="button" class="btn ghost sm" onclick="Deck.itAdd()">' + ico('plus') + '添加条目</button>';
    h += '</div>';
    var warn = DiagramKit.check(D.slides);
    var short = (d.items || []).filter(function (x) { return !x.t || (!x.d && !(x.sub || []).length); }).length;
    if (short) warn.push('有 ' + short + ' 个条目缺标题或内容，保存时会被去掉；条目少于 ' + meta.min + ' 条时这一页会退回成要点页');
    if (warn.length) h += '<p class="small" style="color:var(--warn)">' + warn.map(esc).join('<br>') + '</p>';
    return h + '</div>';
  }
  function onDiagram(e) {
    var s = D.slides[D.cur], d = s.diagram, t = e.target;
    if (t.dataset.dg) {
      var k = t.dataset.dg, v = t.value;
      if (k === 'hi') { if (v === '') delete d.hi; else d.hi = +v; }
      else if (k === 'cols') d.cols = v.split('|').map(function (x) { return x.trim(); }).slice(0, 3);
      else d[k] = v;
    } else {
      var it = d.items[+t.dataset.it], f = t.dataset.f;
      it[f] = f === 'sub' ? t.value.split('\n') : t.value;
    }
    markDirty();
    document.getElementById('preview').innerHTML = previewHtml(s, D.cur);
    if (e.type === 'change' && (t.dataset.dg === 'type' || t.dataset.dg === 'style')) renderEditor();
  }
  function renderEditor() {
    var ed = document.getElementById('editor');
    var pv = document.getElementById('preview');
    if (!D.slides.length) { ed.innerHTML = ''; pv.innerHTML = '<div class="sp" style="background:#fafafa;justify-content:center;align-items:center;color:#999">预览区</div>'; return; }
    var s = D.slides[D.cur];
    pv.innerHTML = previewHtml(s, D.cur);
    var h = '<div class="row3"><label>版式<select data-k="layout">' + Object.keys(LAYOUTS).filter(function (k) { return k !== 'video' || s.layout === 'video'; }).map(function (k) { return '<option value="' + k + '"' + (s.layout === k ? ' selected' : '') + '>' + LAYOUTS[k] + '</option>'; }).join('') + '</select></label>' +
      '<label>对应教学环节<select data-k="phase"><option value="">—</option>' + Object.keys(I.phases).map(function (k) { return '<option value="' + k + '"' + (s.phase === k ? ' selected' : '') + '>' + esc(I.phases[k]) + '</option>'; }).join('') + '</select></label><span></span></div>';
    h += field(s.layout === 'quiz' ? '标题（如“课堂检测”）' : '标题', 'title');
    if (s.layout === 'title' || s.layout === 'section') h += field('副标题', 'subtitle');
    if (['objectives', 'bullets', 'summary'].indexOf(s.layout) >= 0) h += field('要点（每行一条，建议不超过 5 条、每条 25 字内）', 'bullets', 'area', 6);
    if (s.layout === 'two') h += '<div class="row2"><div>' + field('左栏标题', 'left_title') + field('左栏要点', 'left', 'area', 5) + '</div><div>' + field('右栏标题', 'right_title') + field('右栏要点', 'right', 'area', 5) + '</div></div>';
    if (s.layout === 'diagram') h += diagramEditor(s);
    if (s.layout === 'quiz') h += field('题目', 'question', 'area', 2) + field('选项（每行一个）', 'options', 'area', 4) + field('答案（只写入讲稿备注，不在幻灯片上显示）', 'answer');
    h += field('讲稿备注（导出后在 PowerPoint 演讲者视图中可见）', 'notes', 'area', 5);
    ed.innerHTML = h;
    var lenWarn = lines(s.bullets).filter(function (b) { return b.length > 30; }).length;
    if (lenWarn || lines(s.bullets).length > 6) ed.insertAdjacentHTML('beforeend', '<p class="small" style="color:var(--warn)">本页文字偏多：PPT 是给学生看的提示，详细讲解建议放进讲稿备注。</p>');
  }
  document.addEventListener('input', onEdit);
  document.addEventListener('change', onEdit);
  function onEdit(e) {
    if (e.target.dataset && (e.target.dataset.dg || e.target.dataset.it) && e.target.closest('#editor')) return onDiagram(e);
    var k = e.target.dataset && e.target.dataset.k;
    if (!k || !e.target.closest('#editor')) return;
    var s = D.slides[D.cur];
    s[k] = e.target.dataset.arr === '1' ? e.target.value.split('\n') : e.target.value;
    markDirty();
    document.getElementById('preview').innerHTML = previewHtml(s, D.cur);
    if (k === 'layout' && e.type === 'change') { ['bullets', 'left', 'right', 'options'].forEach(function (x) { if (!Array.isArray(s[x])) s[x] = []; }); if (s.layout === 'diagram') ensureDiagram(s); document.getElementById('preview').innerHTML = previewHtml(s, D.cur); renderEditor(); }
    if (k === 'title' || k === 'layout' || k === 'phase') renderList();
  }
  function render() { renderList(); renderEditor(); }

  /* ---------- 导出 PPTX ---------- */
  function exportPptx() {
    DeckKit.exportPptx(D.slides, D.theme, I.course, I.title).then(function (n) { toast('已导出 ' + n); }).catch(function (e) { toast(e.message, true); });
  }

  /* ---------- 对外接口 ---------- */
  window.Deck = {
    go: function (i) { D.cur = i; render(); },
    itAdd: function () { var d = D.slides[D.cur].diagram; d.items.push({ t: '', d: '' }); markDirty(); renderEditor(); },
    itDel: function (i) { var d = D.slides[D.cur].diagram; d.items.splice(i, 1); if (d.hi === i) delete d.hi; markDirty(); renderEditor(); },
    itMove: function (i, k) { var a = D.slides[D.cur].diagram.items, j = i + k; if (j < 0 || j >= a.length) return; var x = a[i]; a[i] = a[j]; a[j] = x; markDirty(); renderEditor(); },
    add: function (layout) { D.slides.splice(D.cur + 1, 0, blank(layout)); D.cur = Math.min(D.cur + 1, D.slides.length - 1); if (D.slides.length === 1) D.cur = 0; markDirty(); render(); },
    dup: function () { if (!D.slides.length) return; D.slides.splice(D.cur + 1, 0, JSON.parse(JSON.stringify(D.slides[D.cur]))); D.cur++; markDirty(); render(); },
    del: function () { if (!D.slides.length) return; uiConfirm('删除这一页？', { danger: true, ok: '删除' }).then(function (ok) { if (!ok) return; D.slides.splice(D.cur, 1); D.cur = Math.max(0, D.cur - 1); markDirty(); render(); }); },
    move: function (d) { var j = D.cur + d; if (j < 0 || j >= D.slides.length) return; var x = D.slides[D.cur]; D.slides[D.cur] = D.slides[j]; D.slides[j] = x; D.cur = j; markDirty(); render(); },
    pickStyle: function () {
      TplKit.pick(D.theme, D.templates, function (v, tpl) {
        if (tpl) D.templates.unshift(tpl);
        Deck.setTheme(v);
      }, I.course);
    },
    setTheme: function (v) {
      if (v === '__upload' || v === '__manage') {
        themeUI();
        var reload = function () { location.reload(); };
        if (v === '__upload') TplKit.upload(function (tpl) { D.templates.unshift(tpl); D.theme = 'tpl:' + tpl.id; themeUI(); markDirty(); render(); Deck.save(true); });
        else TplKit.manage(D.templates, function () { if (D.dirty) Deck.save(true).then(reload); else reload(); });
        return;
      }
      D.theme = v; themeUI(); markDirty(); render();
    },
    save: function (silent) {
      return api('/lessons/' + I.lessonId + '/slides', { theme: D.theme, slides: D.slides }, false).then(function (j) { D.dirty = false; if (!silent) toast('已保存 ' + j.count + ' 页'); })
        .catch(function (e) { toast(e.message, true); });
    },
    exportPptx: function () { Deck.save(true).then(exportPptx); },
    load: function (slides) {
      (D.slides.length ? uiConfirm('将用新生成的 ' + slides.length + ' 页替换当前课件，替换后点“保存”才会写入。') : Promise.resolve(true)).then(function (ok) {
        if (!ok) return;
        D.slides = slides; D.cur = 0; markDirty(); render();
        toast('已生成 ' + slides.length + ' 页，请逐页检查后保存');
      });
    },
    aiGenerate: function (id) {
      api('/ai/slides/' + id, { pages: document.getElementById('pages').value, extra: document.getElementById('slides-extra').value }, 'AI 正在依据教案制作课件…')
        .then(function (j) { Deck.load(j.slides); }).catch(function (e) { toast(e.message, true); });
    },
    fromLesson: function (id) {
      api('/lessons/' + id + '/slides/from-lesson', {}, false).then(function (j) { Deck.load(j.slides); }).catch(function (e) { toast(e.message, true); });
    }
  };
  var h = parseInt((location.hash || '').slice(1), 10);
  if (h > 0 && h <= D.slides.length) D.cur = h - 1;
  render();
})();
