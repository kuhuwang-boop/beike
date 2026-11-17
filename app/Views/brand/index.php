<?php
$logo = $school['logo'];
$icon = $school['icon'];
?>
<div class="page-head">
  <div><h1>学校模板与校徽</h1><p class="muted">上传一次，之后你的每份课件都能套用自己学校的模板、Logo 和校徽。这些信息只属于你的账号，不会影响其他老师。</p></div>
</div>

<div class="brand-grid">
  <form method="post" action="/brand/school" enctype="multipart/form-data" class="card form brand-school">
    <?= csrf_field() ?>
    <div class="card-head"><h3><?= ico('school') ?> 学校信息</h3><span class="muted small">只用在你自己的课件上</span></div>
    <label>学校名称<input name="name" value="<?= e($school['name']) ?>" maxlength="40" placeholder="例如：某某大学 计算机学院"></label>

    <div class="up-row">
      <div class="up-box logo <?= $logo ? 'has' : '' ?>">
        <?php if ($logo): ?><img src="<?= e($logo['src']) ?>" alt="学校 Logo"><?php else: ?><span class="up-ph"><?= ico('photo', 'xl') ?><small>横版 Logo</small></span><?php endif; ?>
      </div>
      <div class="up-info">
        <b>横版 Logo</b>
        <p class="muted small">放在课件封面左上角。建议透明底 PNG，宽 600 像素以上。</p>
        <label class="btn ghost sm up-btn"><?= ico('upload') ?>选择图片<input type="file" name="logo" accept="image/png,image/jpeg,image/webp,image/gif" onchange="Brand.pick(this)"></label>
        <?php if ($logo): ?><label class="chk small"><input type="checkbox" name="remove_logo" value="1">删除 Logo</label><?php endif; ?>
      </div>
    </div>

    <div class="up-row">
      <div class="up-box icon <?= $icon ? 'has' : '' ?>">
        <?php if ($icon): ?><img src="<?= e($icon['src']) ?>" alt="校徽"><?php else: ?><span class="up-ph"><?= ico('school', 'xl') ?><small>校徽</small></span><?php endif; ?>
      </div>
      <div class="up-info">
        <b>校徽 / 图标</b>
        <p class="muted small">放在课件内容页右上角。建议正方形透明底 PNG，512×512 像素。</p>
        <label class="btn ghost sm up-btn"><?= ico('upload') ?>选择图片<input type="file" name="icon" accept="image/png,image/jpeg,image/webp,image/gif" onchange="Brand.pick(this)"></label>
        <?php if ($icon): ?><label class="chk small"><input type="checkbox" name="remove_icon" value="1">删除校徽</label><?php endif; ?>
      </div>
    </div>
    <div class="actions"><button class="btn primary"><?= ico('check') ?>保存学校信息</button></div>
  </form>

  <form method="post" action="/brand/prefs" class="card form brand-prefs" id="prefs-form">
    <?= csrf_field() ?>
    <div class="card-head"><h3><?= ico('presentation') ?> 我的课件上显示</h3></div>
    <div class="bp-prev"><div class="slide-preview" id="bp-cover"></div><div class="slide-preview" id="bp-body"></div></div>
    <label class="switch"><input type="checkbox" name="cover_logo" value="1" <?= $prefs['cover_logo'] ? 'checked' : '' ?>><i></i><span>封面显示学校 Logo</span></label>
    <label class="switch"><input type="checkbox" name="corner_icon" value="1" <?= $prefs['corner_icon'] ? 'checked' : '' ?>><i></i><span>内容页右上角显示校徽</span></label>
    <label class="switch"><input type="checkbox" name="footer_name" value="1" <?= $prefs['footer_name'] ? 'checked' : '' ?>><i></i><span>页脚显示学校名称</span></label>
    <label class="switch"><input type="checkbox" name="on_template" value="1" <?= $prefs['on_template'] ? 'checked' : '' ?>><i></i><span>使用学校模板时也叠加 Logo 和校徽<small class="muted">（模板里通常已有，默认关闭）</small></span></label>
    <label>新课件默认样式<select name="default_theme" id="bp-theme">
      <optgroup label="学校模板"><?php foreach ($templates as $t): ?><option value="tpl:<?= $t['id'] ?>" <?= $prefs['default_theme'] === 'tpl:' . $t['id'] ? 'selected' : '' ?>><?= e($t['name']) ?></option><?php endforeach; ?><?php if (!$templates): ?><option disabled>（还没有上传学校模板）</option><?php endif; ?></optgroup>
      <?php foreach (\App\Services\Themes::grouped() as $gname => $gl): ?><optgroup label="内置配色 · <?= e($gname) ?>"><?php foreach ($gl as $k => $n): ?><option value="<?= $k ?>" <?= $prefs['default_theme'] === $k ? 'selected' : '' ?>><?= $n ?></option><?php endforeach; ?></optgroup><?php endforeach; ?>
    </select></label>
    <div class="actions"><button class="btn primary"><?= ico('check') ?>保存</button></div>
  </form>
</div>

<div class="card" id="tpls">
  <div class="card-head"><h3><?= ico('layout-grid') ?> 我的学校模板</h3><button class="btn primary sm" onclick="TplKit.upload(function(){location.reload()})"><?= ico('upload') ?>上传学校模板</button></div>
  <p class="muted small">上传学校统一的 PPT 模板（16:9 的 .pptx），系统会读取背景、校徽、色条、标题位置、主题色和字体。课件里点「样式」就能切换。</p>
  <?php if (!$templates): ?>
    <button class="tpl-empty" onclick="TplKit.upload(function(){location.reload()})"><?= ico('cloud-upload', 'xl') ?><b>上传第一份学校模板</b><span>点这里选择 .pptx 文件</span></button>
  <?php else: ?>
  <div class="tpl-cards">
    <?php foreach ($templates as $t): ?>
    <div class="tpl-card" data-id="<?= $t['id'] ?>">
      <div class="tpl-pv"><div class="slide-preview" data-k="0"></div><div class="slide-preview" data-k="1"></div></div>
      <div class="tpl-cb">
        <b><?= e($t['name']) ?></b><?php if ($prefs['default_theme'] === 'tpl:' . $t['id']): ?><span class="tag sm">新课件默认</span><?php endif; ?>
      </div>
      <div class="tpl-ca">
        <?php if ($prefs['default_theme'] !== 'tpl:' . $t['id']): ?><button class="btn ghost sm" onclick="Brand.setDefault(<?= $t['id'] ?>)"><?= ico('check') ?>设为默认</button><?php endif; ?>
        <button class="btn ghost sm" onclick="Brand.rename(<?= $t['id'] ?>, this)" data-name="<?= e($t['name']) ?>"><?= ico('pencil') ?>改名</button>
        <button class="btn ghost sm danger-text" onclick="Brand.del(<?= $t['id'] ?>, this)" data-name="<?= e($t['name']) ?>"><?= ico('trash') ?>删除</button>
      </div>
    </div>
    <?php endforeach; ?>
  </div>
  <?php endif; ?>
</div>

<script src="/assets/vendor/jszip.min.js"></script>
<script src="/assets/template.js?v=27"></script>
<script src="/assets/diagram.js?v=22"></script>
<script src="/assets/deckkit.js?v=27"></script>
<script>
var Brand = (function () {
  var school = <?= json_encode($school, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_UNESCAPED_SLASHES) ?>;
  var tpls = <?= json_encode($templates, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_UNESCAPED_SLASHES) ?>;
  DeckKit.addTemplates(tpls);
  var SAMPLE = [{ layout: 'title', title: '二叉树的遍历', subtitle: '数据结构 · 第 5 章' }, { layout: 'bullets', title: '学完本节你能够', bullets: ['说出三种遍历的访问顺序', '手工写出遍历序列', '用递归实现三种遍历'] }];
  var form = document.getElementById('prefs-form');
  function prefs() {
    var p = {};
    ['cover_logo', 'corner_icon', 'footer_name', 'on_template'].forEach(function (k) { p[k] = form.elements[k].checked ? 1 : 0; });
    return p;
  }
  function drawPrefs() {
    DeckKit.setBrand({ name: school.name, logo: school.logo, icon: school.icon, prefs: prefs() });
    var th = document.getElementById('bp-theme').value || 'blue';
    document.getElementById('bp-cover').innerHTML = DeckKit.preview(SAMPLE[0], 0, th, '数据结构');
    document.getElementById('bp-body').innerHTML = DeckKit.preview(SAMPLE[1], 1, th, '数据结构');
  }
  form.addEventListener('change', drawPrefs);
  drawPrefs();
  // 模板卡片缩略图（不叠加校徽，展示模板本身）
  DeckKit.setBrand(null);
  document.querySelectorAll('.tpl-card').forEach(function (c) {
    c.querySelectorAll('.slide-preview').forEach(function (el) { el.innerHTML = DeckKit.preview(SAMPLE[+el.dataset.k], +el.dataset.k, 'tpl:' + c.dataset.id, '数据结构'); });
  });
  drawPrefs();
  return {
    pick: function (inp) {
      var f = inp.files[0], box = inp.closest('.up-row').querySelector('.up-box');
      if (!f) return;
      if (f.size > 5 * 1024 * 1024) { toast('图片超过 5MB，请压缩后再上传', true); inp.value = ''; return; }
      var u = URL.createObjectURL(f);
      box.classList.add('has');
      box.innerHTML = '<img src="' + u + '" alt="">';
      toast('已选择，点「保存学校信息」后生效');
    },
    setDefault: function (id) {
      document.getElementById('bp-theme').value = 'tpl:' + id;
      form.submit();
    },
    rename: function (id, btn) {
      uiPrompt('模板改名', '', btn.dataset.name, { ok: '保存' }).then(function (n) {
        if (!n || !n.trim()) return;
        api('/templates/' + id + '/rename', { name: n.trim() }, false).then(function () { location.reload(); }).catch(function (e) { toast(e.message, true); });
      });
    },
    del: function (id, btn) {
      uiConfirm('删除模板「' + btn.dataset.name + '」？用到它的课件会改回“学院蓝”配色。', { danger: true, ok: '删除' }).then(function (ok) {
        if (!ok) return;
        api('/templates/' + id + '/delete', {}, false).then(function () { location.reload(); }).catch(function (e) { toast(e.message, true); });
      });
    }
  };
})();
</script>
