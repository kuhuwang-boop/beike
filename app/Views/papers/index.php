<?php $title = '试卷'; $tab = 'p'; require __DIR__ . '/../layout/coursenav.php'; ?>

<div class="card">
  <h3>已有试卷</h3>
  <?php if (!$papers): ?><p class="muted">还没有试卷。</p><?php else: ?>
  <table class="tbl">
    <thead><tr><th>名称</th><th>题数</th><th>总分</th><th>已导入成绩</th><th>创建时间</th><th></th></tr></thead>
    <?php foreach ($papers as $p): ?>
    <tr><td><a href="/papers/<?= $p['id'] ?>"><?= e($p['title']) ?></a></td><td><?= (int)$p['n'] ?></td><td><?= e($p['total'] + 0) ?></td>
      <td><?= $p['stu'] ? (int)$p['stu'] . ' 人' : '<span class="muted">未导入</span>' ?></td><td class="muted"><?= e(substr($p['created_at'], 0, 10)) ?></td>
      <td class="right"><a href="/papers/<?= $p['id'] ?>">查看 / 导入成绩</a></td></tr>
    <?php endforeach; ?>
  </table>
  <?php endif; ?>
</div>

<div class="grid2">
  <div class="card">
    <h3>按蓝图自动组卷</h3>
    <p class="muted small">按课程目标权重分配分值，优先选用层级不低于目标层级、以前没用过的题目。生成后可以在试卷页核对双向细目表。</p>
    <form method="post" action="/courses/<?= $course['id'] ?>/papers" class="form">
      <?= csrf_field() ?><input type="hidden" name="mode" value="auto">
      <div class="row2"><label>试卷名称<input name="title" placeholder="期末考试 A 卷"></label><label>目标总分<input name="total" type="number" value="100"></label></div>
      <table class="tbl small"><tr><th>目标</th><th>权重</th><th>应分配</th></tr>
      <?php foreach ($objectives as $o): ?><tr><td><?= e($o['code']) ?></td><td><?= e($o['weight'] + 0) ?>%</td><td><?= e(round($o['weight'], 1)) ?> 分</td></tr><?php endforeach; ?></table>
      <button class="btn primary">自动组卷</button>
    </form>
  </div>

  <div class="card">
    <h3>手工选题组卷</h3>
    <form method="post" action="/courses/<?= $course['id'] ?>/papers" class="form" id="manual-paper">
      <?= csrf_field() ?><input type="hidden" name="mode" value="manual">
      <label>试卷名称<input name="title" placeholder="第一单元测验"></label>
      <div class="pick-list">
      <?php foreach ($questions as $q): ?>
        <label class="pick"><input type="checkbox" name="qids[]" value="<?= $q['id'] ?>" data-score="<?= e($q['score'] + 0) ?>" onchange="pickSum()">
          <span class="tag sm"><?= e($q['ocode'] ?: '—') ?></span><span class="tag sm b<?= (int)$q['bloom'] ?>"><?= e(bloom_name($q['bloom'])) ?></span><span class="tag sm"><?= e($q['qtype']) ?></span>
          <?= e(mb_substr($q['stem'], 0, 50)) ?> <span class="muted">(<?= e($q['score'] + 0) ?>分)</span></label>
      <?php endforeach; ?>
      <?php if (!$questions): ?><p class="muted">题库为空。</p><?php endif; ?>
      </div>
      <div class="actions"><span>已选 <b id="pick-n">0</b> 题，共 <b id="pick-s">0</b> 分</span><button class="btn primary">生成试卷</button></div>
    </form>
  </div>
</div>
<script>
function pickSum(){ var n=0,s=0; document.querySelectorAll('#manual-paper input[name="qids[]"]:checked').forEach(function(c){n++; s+=parseFloat(c.dataset.score)||0;}); document.getElementById('pick-n').textContent=n; document.getElementById('pick-s').textContent=Math.round(s*10)/10; }
</script>
