<?php
use App\Services\Style;
$skillForm = function ($s, $roles, $action) { ob_start(); $ag = array_filter(explode(',', (string)($s['agents'] ?? ''))); ?>
  <form method="post" action="<?= $action ?>" class="form skill-form"><?= csrf_field() ?>
    <label>技能名称<input name="name" value="<?= e($s['name'] ?? '') ?>" maxlength="60" required placeholder="例如：我的板书式讲解"></label>
    <label>一句话说明<input name="summary" value="<?= e($s['summary'] ?? '') ?>" maxlength="200" placeholder="可留空"></label>
    <label>具体要求（AI 团队会照着做）<textarea name="instructions" rows="5" required placeholder="例如：每个新概念先给一个生活中的类比，再给定义；每讲完一个知识点紧跟一道两分钟的小练习；讲稿里写出我常用的过渡语“我们换个角度想”。"><?= e($s['instructions'] ?? '') ?></textarea></label>
    <div class="sk-agents"><span class="muted small">由谁落实（不选 = 全员）：</span><?php foreach ($roles as $rk => $r): if ($rk === 'leader') continue; ?>
      <label class="chk"><input type="checkbox" name="agents[]" value="<?= $rk ?>" <?= in_array($rk, $ag, true) ? 'checked' : '' ?>><?= e($r['name']) ?></label><?php endforeach; ?></div>
    <input type="hidden" name="enabled" value="1">
    <?php if (!isset($s['id'])): ?><label class="chk"><input type="checkbox" name="as_default" value="1" checked>以后新课件都自动带上这个技能</label><?php endif; ?>
    <div class="actions"><button class="btn primary sm"><?= ico('check') ?><?= isset($s['id']) ? '保存修改' : '保存技能' ?></button></div>
  </form>
<?php return ob_get_clean(); };
?>
<div class="page-head">
  <div><h1>我的备课风格</h1><p class="muted">每位老师的课都不一样。在这里告诉 AI 团队你的习惯，之后生成和修改课件都会按你的风格来。这些设置只属于你自己。</p></div>
</div>

<form method="post" action="/style" class="card form" id="style-form">
  <?= csrf_field() ?>
  <div class="card-head"><h3><?= ico('adjustments-horizontal') ?> 备课偏好</h3>
    <button type="button" class="btn ai sm" onclick="Mine.learn()" <?= $aiReady ? '' : 'disabled' ?> title="AI 阅读你资料库里最近的资料，总结出你的风格，由你确认"><?= ico('sparkles') ?>从我的资料库学习风格<?= $libCount ? '（' . $libCount . ' 份资料）' : '' ?></button></div>
  <div id="learn-note"></div>
  <div class="grid2">
    <label>我的学生<input name="students" value="<?= e($p['students']) ?>" maxlength="200" placeholder="例如：高职护理专业大一，基础一般，喜欢动手"></label>
    <label>我常用的案例<input name="cases" value="<?= e($p['cases']) ?>" maxlength="200" placeholder="例如：优先用医院临床场景、本地企业的例子"></label>
    <label>语言风格<select name="tone"><?php foreach (Style::TONES as $k => $v): ?><option value="<?= $k ?>" <?= $p['tone'] === $k ? 'selected' : '' ?>><?= e($v) ?></option><?php endforeach; ?></select></label>
    <label>每页信息量<select name="density"><?php foreach (Style::DENSITY as $k => $v): ?><option value="<?= $k ?>" <?= $p['density'] === $k ? 'selected' : '' ?>><?= e($v) ?></option><?php endforeach; ?></select></label>
  </div>
  <div class="sk-agents"><span class="muted small">每节课必须有：</span><?php foreach (Style::MUST as $k => $v): ?><label class="chk"><input type="checkbox" name="must[]" value="<?= $k ?>" <?= in_array($k, $p['must'], true) ? 'checked' : '' ?>><?= e($v) ?></label><?php endforeach; ?></div>
  <label>不要这样做<input name="avoid" value="<?= e($p['avoid']) ?>" maxlength="300" placeholder="例如：不要用网络流行语；不要出现英文缩写而不解释"></label>
  <label>其他习惯<textarea name="notes" rows="3" maxlength="800" placeholder="例如：每节课开头用 3 分钟回顾上节课；结尾留一道思考题；板书分左右两栏"><?= e($p['notes']) ?></textarea></label>
  <div class="actions"><button class="btn primary"><?= ico('check') ?>保存备课偏好</button></div>
</form>

<div class="card" id="skills">
  <div class="card-head"><h3><?= ico('bulb') ?> 我的技能</h3><span class="muted small">技能是一条可以反复使用的要求。做课件时点「方法与技能」勾选，AI 团队会优先遵守</span></div>
  <?php if (!$mine): ?><p class="muted">还没有自己的技能。把你最看重的一条备课习惯写下来，就是第一个技能。</p><?php endif; ?>
  <div class="skill-list">
  <?php foreach ($mine as $s): ?>
    <details class="sk-item">
      <summary><b><?= e($s['name']) ?></b><span class="muted small"><?= e($s['summary'] ?: mb_substr($s['instructions'], 0, 50)) ?></span><?php if (in_array((int)$s['id'], $defaults, true)): ?><span class="tag sm">新课件默认</span><?php endif; ?></summary>
      <div class="sk-body">
        <?= $skillForm($s, $roles, '/myskills/' . $s['id']) ?>
        <form method="post" action="/myskills/<?= $s['id'] ?>/delete" class="inline" data-confirm="删除技能「<?= e($s['name']) ?>」？"><?= csrf_field() ?><button class="btn ghost sm danger-text"><?= ico('trash') ?>删除</button></form>
      </div>
    </details>
  <?php endforeach; ?>
  </div>
  <details class="sk-add" id="new-skill" <?= $mine ? '' : 'open' ?>><summary class="btn ghost sm"><?= ico('plus') ?>新建技能</summary>
    <div class="draft-bar"><input id="draft-want" placeholder="不想自己写？用一句话说说你想要的效果，例如：我喜欢先抛一个问题让学生猜，再揭晓答案" maxlength="600"><button type="button" class="btn ai sm" onclick="Mine.draft()" <?= $aiReady ? '' : 'disabled' ?>><?= ico('wand') ?>AI 帮我写</button></div>
    <?= $skillForm([], $roles, '/myskills') ?>
  </details>
</div>

<form method="post" action="/style/defaults" class="card form">
  <?= csrf_field() ?>
  <div class="card-head"><h3><?= ico('checklist') ?> 新课件默认带上的技能</h3><span class="muted small">最多 6 项；每份课件里还可以单独增减</span></div>
  <div class="def-grid" id="def-grid">
    <?php if ($mine): ?><div class="sk-cat">我的技能</div><?php foreach ($mine as $s): ?><label class="def-opt"><input type="checkbox" name="ids[]" value="<?= $s['id'] ?>" <?= in_array((int)$s['id'], $defaults, true) ? 'checked' : '' ?>><span><b><?= e($s['name']) ?></b><small><?= e($s['summary'] ?: mb_substr($s['instructions'], 0, 40)) ?></small></span></label><?php endforeach; endif; ?>
    <?php $cat = null; foreach ($system as $s): if ($s['category'] !== $cat): $cat = $s['category']; ?><div class="sk-cat"><?= e($cat) ?></div><?php endif; ?>
      <label class="def-opt"><input type="checkbox" name="ids[]" value="<?= $s['id'] ?>" <?= in_array((int)$s['id'], $defaults, true) ? 'checked' : '' ?>><span><b><?= e($s['name']) ?></b><small><?= e($s['summary']) ?></small></span></label>
    <?php endforeach; ?>
  </div>
  <div class="actions"><button class="btn primary"><?= ico('check') ?>保存默认技能</button></div>
</form>

<div class="card" id="cmds">
  <div class="card-head"><h3><?= ico('message-circle') ?> 我的常用指令</h3><span class="muted small">你经常对 AI 团队说的话，会出现在课件工作室的对话框上方，一点就发</span></div>
  <div class="cmd-list" id="cmd-list"></div>
  <div class="draft-bar"><input id="cmd-new" placeholder="例如：每页不超过 4 条，把细节挪到讲稿" maxlength="120"><button type="button" class="btn primary sm" onclick="Mine.addCmd()"><?= ico('plus') ?>添加</button></div>
</div>

<script>
var Mine = (function () {
  var cmds = <?= json_encode($cmds, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?>;
  function drawCmds() {
    document.getElementById('cmd-list').innerHTML = cmds.length ? cmds.map(function (c, i) { return '<span class="cmd"><span>' + esc(c) + '</span><button type="button" title="删除" onclick="Mine.delCmd(' + i + ')">' + ico('x') + '</button></span>'; }).join('') : '<p class="muted small">还没有常用指令。</p>';
  }
  function saveCmds() { return api('/style/cmds', { cmds: cmds }, false).then(function (j) { cmds = j.cmds; drawCmds(); }).catch(function (e) { toast(e.message, true); }); }
  drawCmds();
  document.getElementById('cmd-new').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); Mine.addCmd(); } });
  var grid = document.getElementById('def-grid');
  grid.addEventListener('change', function (e) { if (grid.querySelectorAll('input:checked').length > 6) { e.target.checked = false; toast('最多默认带上 6 项', true); } });
  return {
    addCmd: function () { var el = document.getElementById('cmd-new'), t = el.value.trim(); if (!t) return; if (cmds.length >= 12) { toast('最多 12 条常用指令', true); return; } cmds.push(t); el.value = ''; saveCmds(); },
    delCmd: function (i) { cmds.splice(i, 1); saveCmds(); },
    learn: function () {
      api('/style/learn', {}, 'AI 正在阅读你的资料，总结你的备课风格…').then(function (j) {
        var f = document.getElementById('style-form'), p = j.profile, n = 0;
        ['students', 'cases', 'notes'].forEach(function (k) { if (p[k] && !f.elements[k].value.trim()) { f.elements[k].value = p[k]; n++; } });
        ['tone', 'density'].forEach(function (k) { if (p[k] && !f.elements[k].value) { f.elements[k].value = p[k]; n++; } });
        (p.must || []).forEach(function (k) { var c = f.querySelector('input[name="must[]"][value="' + k + '"]'); if (c && !c.checked) { c.checked = true; n++; } });
        document.getElementById('learn-note').innerHTML = '<div class="tip"><b>AI 的总结（读了 ' + j.files.length + ' 份资料：' + esc(j.files.slice(0, 3).join('、')) + (j.files.length > 3 ? ' 等' : '') + '）</b>' + esc(j.evidence || '') + '<br>' + (n ? '已把建议填进下面空着的 ' + n + ' 项（你已经填过的没有改动）。请检查修改，满意后点「保存备课偏好」才会生效。' : '你已经填过的内容没有改动。') + '</div>';
      }).catch(function (e) { toast(e.message, true); });
    },
    draft: function () {
      var want = document.getElementById('draft-want').value.trim();
      if (want.length < 4) { toast('先用一两句话说说你想要的效果', true); return; }
      api('/myskills/draft', { want: want }, 'AI 正在把你的想法写成技能…').then(function (j) {
        var f = document.querySelector('#new-skill .skill-form');
        f.elements.name.value = j.name; f.elements.summary.value = j.summary; f.elements.instructions.value = j.instructions;
        toast('已写好草稿，请检查修改后点「保存技能」');
      }).catch(function (e) { toast(e.message, true); });
    }
  };
})();
</script>
