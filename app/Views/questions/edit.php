<?php $title = '编辑题目'; $tab = 'q'; require __DIR__ . '/../layout/coursenav.php'; ?>
<form method="post" action="/questions/<?= $q['id'] ?>" class="card form">
  <?= csrf_field() ?>
  <div class="row4">
    <label>目标<select name="objective_id"><option value="0">—</option><?php foreach ($objectives as $o): ?><option value="<?= $o['id'] ?>" <?= (int)$q['objective_id'] === (int)$o['id'] ? 'selected' : '' ?>><?= e($o['code']) ?></option><?php endforeach; ?></select></label>
    <label>层级<select name="bloom"><?php foreach (bloom_levels() as $k => $v): ?><option value="<?= $k ?>" <?= (int)$q['bloom'] === $k ? 'selected' : '' ?>><?= $k ?> <?= $v ?></option><?php endforeach; ?></select></label>
    <label>题型<select name="qtype"><?php foreach (qtypes() as $t): ?><option <?= $q['qtype'] === $t ? 'selected' : '' ?>><?= $t ?></option><?php endforeach; ?></select></label>
    <label>分值<input name="score" type="number" step="0.5" value="<?= e($q['score'] + 0) ?>"></label>
  </div>
  <label>预估难度（1易–5难）<input name="difficulty_est" type="number" min="1" max="5" value="<?= (int)$q['difficulty_est'] ?>"></label>
  <label>题干<textarea name="stem" rows="4" required><?= e($q['stem']) ?></textarea></label>
  <label>选项（每行一个）<textarea name="options" rows="3"><?= e($q['options']) ?></textarea></label>
  <label>答案<textarea name="answer" rows="3"><?= e($q['answer']) ?></textarea></label>
  <label>解析 / 评分要点<textarea name="analysis" rows="3"><?= e($q['analysis']) ?></textarea></label>
  <?php if ($q['evidence']): ?><p class="small muted">AI 命题依据：<?= e($q['evidence']) ?> <span class="pill <?= $q['evidence_ok'] ? 'ok' : 'bad' ?>"><?= $q['evidence_ok'] ? '已核验' : '未在大纲中找到' ?></span></p><?php endif; ?>
  <div class="actions"><button class="btn primary">保存</button><a class="btn ghost" href="/courses/<?= $course['id'] ?>/questions">返回</a></div>
</form>
