<?php $title = '课件工作室'; ?>

<section class="hero-x">
  <div class="hero-text">
    <h1>把你的备课资料，变成<em>一节好课</em></h1>
    <p>上传平时的 Word、PPT 或 PDF，告诉 AI 课件团队你想要什么。他们会重新梳理教学思路、制作课件、设计课堂互动并核查内容。</p>
    <div class="team-row">
      <?php foreach ($team as $k => $m): ?>
        <span class="mate" title="<?= e($m['title']) ?>"><i style="background:<?= e($m['color']) ?>"><?= e($m['icon']) ?></i><?= e($m['name']) ?></span>
      <?php endforeach; ?>
    </div>
  </div>

  <form class="starter" id="starter" onsubmit="return Starter.go(event)">
    <label class="big-label">这节课讲什么？</label>
    <input id="st-title" class="big-input" placeholder="例如：二叉树的遍历" required autocomplete="off">
    <div class="drop" id="drop">
      <input type="file" id="st-files" multiple accept=".docx,.pptx,.pdf,.txt,.md" hidden>
      <div class="drop-inner" onclick="document.getElementById('st-files').click()">
        <i class="drop-ico"><?= ico('cloud-upload') ?></i><b>添加你的备课资料</b>
        <span class="d-only">拖到这里或点击选择 · 支持 Word、PPT、PDF、TXT · 可多选 · 没有资料也可以直接开始</span><span class="m-only">Word / PPT / PDF / TXT，可多选，没有也能开始</span>
      </div>
      <div class="file-list" id="st-list"></div>
    </div>
    <div class="lib-sug" id="lib-sug" hidden></div>
    <div class="row-inline">
      <label>课时
        <select id="st-min"><option value="45">45 分钟</option><option value="90">90 分钟</option><option value="40">40 分钟</option><option value="50">50 分钟</option><option value="100">100 分钟</option></select>
      </label>
      <label>课型
        <select id="st-type"><?php foreach ($types as $k => $t): ?><option value="<?= $k ?>" title="<?= e($t[1]) ?>"><?= e($t[0]) ?></option><?php endforeach; ?></select>
      </label>
      <button type="button" class="sty-pill" id="st-style" onclick="Starter.style()" title="课件样式 / 学校模板"><?= ico('palette') ?><span id="st-style-n">样式</span></button>
      <details class="more">
        <summary>更多选项</summary>
        <label>授课对象<input id="st-aud" placeholder="例如：计算机专业大二，基础一般"></label>
        <label>放入课程<select id="st-course"><option value="0">我的课件（默认）</option><?php foreach ($courses as $c): if ($c['name'] === '我的课件') continue; ?><option value="<?= $c['id'] ?>"><?= e($c['name']) ?></option><?php endforeach; ?></select></label>
      </details>
      <button class="btn primary lg" id="st-go"><?= ico('sparkles') ?>开始制作</button>
    </div>
    <?php if (!$hasStyle): ?><a class="tpl-hint" href="/style"><?= ico('adjustments-horizontal') ?><span><b>让课件更像你自己做的</b>设置一次你的备课风格和常用技能，AI 团队每次都按你的习惯来</span><?= ico('chevron-right') ?></a><?php endif; ?>
    <?php if (!$templates): ?><a class="tpl-hint" href="/brand"><?= ico('school') ?><span><b>用学校的 PPT 模板？</b>上传一次学校模板和校徽，之后每份课件自动套用</span><?= ico('chevron-right') ?></a><?php endif; ?>
    <?php if (!$aiReady): ?><p class="warn-note">管理员还没有填写 DeepSeek API Key，AI 团队暂时无法工作。<?php if (\App\Core\Auth::isAdmin()): ?><a href="/admin">去填写</a><?php endif; ?></p><?php endif; ?>
  </form>
</section>

<div class="sec-head"><h2>我的课件</h2><span class="muted"><?= count($items) ?> 份</span></div>
<?php if (!$items): ?>
  <div class="empty-soft">还没有课件。在上面输入课题，几分钟就能得到第一份。</div>
<?php else: ?>
<div class="deck-grid">
  <?php foreach ($items as $it): ?>
  <div class="deck-card">
    <a class="thumb-wrap" href="/studio/<?= $it['id'] ?>">
      <div class="slide-preview mini" data-slide='<?= e(json_encode($it['first'], JSON_UNESCAPED_UNICODE)) ?>' data-theme="<?= e($it['theme'] ?: 'blue') ?>" data-course="<?= e($it['cname']) ?>"></div>
      <?php if (!$it['first']): ?><div class="thumb-empty">尚未生成</div><?php endif; ?>
    </a>
    <div class="dc-body">
      <a href="/studio/<?= $it['id'] ?>" class="dc-title"><?= e($it['title']) ?></a>
      <div class="dc-meta"><?= e($it['cname']) ?> · <?= (int)$it['pages'] ?> 页 · <?= (int)$it['duration_min'] ?> 分钟<?= $it['mats'] ? ' · 资料 ' . (int)$it['mats'] : '' ?></div>
      <div class="dc-meta muted"><?= e(substr(max($it['updated_at'], (string)$it['dupd']), 5, 11)) ?> 更新</div>
    </div>
    <div class="dc-actions">
      <a href="/studio/<?= $it['id'] ?>" class="btn sm" title="打开"><?= ico('presentation') ?><span class="dc-l">打开</span></a>
      <button class="btn ghost sm" onclick="Starter.rename(<?= $it['id'] ?>, this)" title="重命名" data-title="<?= e($it['title']) ?>"><?= ico('pencil') ?><span class="dc-l">重命名</span></button>
      <form method="post" action="/studio/<?= $it['id'] ?>/delete" data-confirm="删除「<?= e($it['title']) ?>」及其课件、资料和对话？不可恢复。"><?= csrf_field() ?><button class="btn ghost sm danger-text" title="删除"><?= ico('trash') ?><span class="dc-l">删除</span></button></form>
    </div>
  </div>
  <?php endforeach; ?>
</div>
<?php endif; ?>

<script src="/assets/vendor/jszip.min.js"></script>
<script src="/assets/vendor/pdf.min.js"></script>
<script src="/assets/extract.js?v=22"></script>
<script src="/assets/template.js?v=27"></script>
<script src="/assets/diagram.js?v=22"></script>
<script src="/assets/deckkit.js?v=27"></script>
<script>
var Starter = (function () {
  var files = [];
  var list = document.getElementById('st-list');
  function render() {
    list.innerHTML = files.map(function (f, i) {
      return '<div class="fchip ' + (f.err ? 'bad' : '') + '"><span>' + esc(f.file.name) + '</span><small>' + (f.err ? esc(f.err) : (f.text ? '已读取 ' + f.text.length.toLocaleString() + ' 字' : '读取中…')) + '</small><button type="button" onclick="Starter.remove(' + i + ')">×</button></div>';
    }).join('');
  }
  function add(fl) {
    Array.prototype.forEach.call(fl, function (file) {
      var item = { file: file };
      files.push(item);
      item.p = DocExtract.file(file).then(function (r) { item.text = r.text; render(); }).catch(function (e) { item.err = e.message; render(); });
    });
    render();
  }
  document.getElementById('st-files').addEventListener('change', function (e) { add(e.target.files); e.target.value = ''; });
  var drop = document.getElementById('drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { add(e.dataTransfer.files); });

  DeckKit.addTemplates(<?= json_encode($templates, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_UNESCAPED_SLASHES) ?>);
  DeckKit.setBrand(<?= json_encode($brand, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_UNESCAPED_SLASHES) ?>);
  document.querySelectorAll('.slide-preview.mini').forEach(function (el) {
    try { var s = JSON.parse(el.dataset.slide); if (s) el.innerHTML = DeckKit.preview(s, 0, el.dataset.theme, el.dataset.course); } catch (e) {}
  });

  var TPLS = <?= json_encode($templates, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_UNESCAPED_SLASHES) ?>;
  var theme = <?= json_encode($brand['prefs']['default_theme'] ?? 'blue') ?>;
  if (!DeckKit.theme(theme) || (/^tpl:/.test(theme) && !TPLS.some(function (t) { return 'tpl:' + t.id === theme; }))) theme = 'blue';
  function styleUI() { document.getElementById('st-style-n').textContent = TplKit.themeName(theme, TPLS); }
  styleUI();
  // 输入课题后，从个人资料库里推荐可能相关的资料（固定规则匹配，不调用 AI）
  var LIB = <?= (int)$libCount ?>, sugTimer, sugFor = '';
  document.getElementById('st-title').addEventListener('input', function (e) {
    if (!LIB) return;
    clearTimeout(sugTimer);
    var t = e.target.value.trim();
    sugTimer = setTimeout(function () {
      if (t === sugFor) return; sugFor = t;
      var box = document.getElementById('lib-sug');
      if (t.length < 2) { box.hidden = true; return; }
      fetch('/library/list?title=' + encodeURIComponent(t), { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (j) {
        if (t !== sugFor) return;
        if (!j.suggest.length) { box.hidden = true; box.innerHTML = ''; return; }
        box.hidden = false;
        box.innerHTML = '<span class="lib-sug-h">' + ico('database') + ' 资料库里可能相关：</span>' + j.suggest.map(function (x) { return '<label class="lib-chip"><input type="checkbox" value="' + x.id + '" checked><span>' + esc(x.filename) + '</span></label>'; }).join('');
      }).catch(function () {});
    }, 450);
  });
  return {
    style: function () { TplKit.pick(theme, TPLS, function (v, tpl) { if (tpl) TPLS.unshift(tpl); theme = v; styleUI(); }); },
    remove: function (i) { files.splice(i, 1); render(); },
    go: function (ev) {
      ev.preventDefault();
      var title = document.getElementById('st-title').value.trim();
      if (!title) return false;
      busy(true, '正在读取资料…');
      Promise.all(files.map(function (f) { return f.p; })).then(function () {
        busy(true, '正在创建课件…');
        return api('/studio', { title: title, minutes: document.getElementById('st-min').value, audience: document.getElementById('st-aud').value, course_id: document.getElementById('st-course').value, theme: theme, lesson_type: document.getElementById('st-type').value, library: Array.prototype.map.call(document.querySelectorAll('#lib-sug input:checked'), function (i) { return +i.value; }) }, false);
      }).then(function (j) {
        var ok = files.filter(function (f) { return f.text; });
        var chain = Promise.resolve();
        ok.forEach(function (f) { chain = chain.then(function () { return api('/studio/' + j.id + '/materials', { filename: f.file.name, content: f.text }, false); }); });
        return chain.then(function () { location.href = '/studio/' + j.id + '?auto=1'; });
      }).catch(function (e) { busy(false); toast(e.message, true); });
      return false;
    },
    rename: function (id, btn) {
      uiPrompt('重命名课件', '', btn.dataset.title, { ok: '保存' }).then(function (t) {
        if (!t || !t.trim()) return;
        api('/studio/' + id + '/rename', { title: t.trim() }, false).then(function () { location.reload(); }).catch(function (e) { toast(e.message, true); });
      });
    }
  };
})();
</script>
