<?php $title = $paper['title']; $tab = 'p'; require __DIR__ . '/../layout/coursenav.php';
$total = 0; $byObj = []; $byBloom = [];
foreach ($items as $it) {
    $total += (float)$it['full'];
    $k = (int)$it['objective_id'];
    $byObj[$k][(int)$it['bloom']] = ($byObj[$k][(int)$it['bloom']] ?? 0) + (float)$it['full'];
}
$f2 = function ($x) { return $x === null ? '—' : number_format($x, 2); };
?>
<div class="page-head sub">
  <h2><?= e($paper['title']) ?> <span class="muted">（<?= count($items) ?> 题，<?= $total + 0 ?> 分）</span></h2>
  <div class="head-actions">
    <a class="btn ghost sm" href="/papers/<?= $paper['id'] ?>/word">导出试卷 Word</a>
    <a class="btn ghost sm" href="/papers/<?= $paper['id'] ?>/word?key=1">导出答案 Word</a>
    <form method="post" action="/papers/<?= $paper['id'] ?>/delete" class="inline" data-confirm="删除试卷及其成绩？"><?= csrf_field() ?><button class="btn ghost sm danger-text">删除</button></form>
  </div>
</div>

<div class="card">
  <h3>双向细目表（分值：课程目标 × 认知层级）</h3>
  <div class="scroll-x">
  <table class="tbl grid">
    <thead><tr><th>目标</th><th>应占</th><?php foreach (bloom_levels() as $k => $v): ?><th><?= $v ?></th><?php endforeach; ?><th>实占</th><th>偏差</th></tr></thead>
    <?php foreach ($objectives as $o): $row = $byObj[(int)$o['id']] ?? []; $act = $total > 0 ? array_sum($row) / $total * 100 : 0; $dev = $act - (float)$o['weight']; ?>
    <tr><td><b><?= e($o['code']) ?></b></td><td><?= e($o['weight'] + 0) ?>%</td>
      <?php foreach (bloom_levels() as $k => $v): ?><td class="center <?= $k === (int)$o['bloom'] ? 'target' : '' ?>"><?= isset($row[$k]) ? $row[$k] + 0 : '·' ?></td><?php endforeach; ?>
      <td><?= round($act, 1) ?>%</td><td class="<?= abs($dev) > 5 ? 'bad' : 'good' ?>"><?= ($dev >= 0 ? '+' : '') . round($dev, 1) ?></td></tr>
    <?php endforeach; ?>
    <?php if (!empty($byObj[0])): ?><tr><td class="muted">未关联</td><td></td><?php foreach (bloom_levels() as $k => $v): ?><td class="center"><?= isset($byObj[0][$k]) ? $byObj[0][$k] + 0 : '·' ?></td><?php endforeach; ?><td><?= $total ? round(array_sum($byObj[0]) / $total * 100, 1) : 0 ?>%</td><td></td></tr><?php endif; ?>
  </table>
  </div>
  <p class="muted small">偏差超过 ±5 个百分点标红。深色格为目标本身的层级。</p>
</div>

<details class="card">
  <summary class="card-sum"><b>编辑试卷</b> <span class="muted small">改名称、调整题目分值和顺序、移除或添加题目</span></summary>
  <form method="post" action="/papers/<?= $paper['id'] ?>/edit" class="form" style="margin-top:12px">
    <?= csrf_field() ?>
    <label>试卷名称<input name="title" value="<?= e($paper['title']) ?>"></label>
    <table class="tbl small"><tr><th width="60">顺序</th><th>题目</th><th width="90">分值</th><th width="60">移除</th></tr>
    <?php foreach ($items as $i => $it): ?>
      <tr><td><input type="number" name="item_sort[<?= $it['item_id'] ?>]" value="<?= (int)$it['sort'] ?>"></td><td><?= e(mb_substr($it['stem'], 0, 60)) ?></td>
      <td><input type="number" step="0.5" min="0" name="item_score[<?= $it['item_id'] ?>]" value="<?= e($it['full'] + 0) ?>"></td>
      <td class="center"><input type="checkbox" name="remove[]" value="<?= $it['item_id'] ?>"></td></tr>
    <?php endforeach; ?>
    </table>
    <?php if ($bank): ?>
    <label style="margin-top:12px">从题库添加题目</label>
    <div class="pick-list"><?php foreach ($bank as $q): ?><label class="pick"><input type="checkbox" name="add_qids[]" value="<?= $q['id'] ?>"> <span class="tag sm"><?= e($q['ocode'] ?: '—') ?></span><span class="tag sm"><?= e($q['qtype']) ?></span><?= e(mb_substr($q['stem'], 0, 50)) ?> <span class="muted">(<?= e($q['score'] + 0) ?>分)</span></label><?php endforeach; ?></div>
    <?php endif; ?>
    <div class="actions"><button class="btn primary">保存修改</button></div>
  </form>
</details>

<div class="card">
  <div class="card-head"><h3>导入逐题成绩</h3><a class="btn ghost sm" href="/papers/<?= $paper['id'] ?>/template">下载成绩模板 (CSV)</a></div>
  <p class="muted small">用 Excel 打开模板，每行一个学生，填写每道题的得分后另存为 CSV，再在这里上传。系统会检查得分是否超过满分；重复导入会覆盖之前的成绩。</p>
  <form method="post" action="/papers/<?= $paper['id'] ?>/scores" enctype="multipart/form-data" class="inline">
    <?= csrf_field() ?><input type="file" name="csv" accept=".csv,text/csv" required><button class="btn primary sm">上传并分析</button>
  </form>
  <?php if ($an && $an['n'] > 0): ?>
  <form method="post" action="/papers/<?= $paper['id'] ?>/scores/clear" class="inline" style="margin-top:8px" data-confirm="清空本试卷已导入的全部成绩？"><?= csrf_field() ?><button class="btn ghost sm danger-text">清空已导入成绩</button></form>
  <?php endif; ?>
</div>

<?php if ($an && $an['n'] > 0): ?>
<div class="stats">
  <div class="stat"><b><?= $an['n'] ?></b><span>参考人数</span></div>
  <div class="stat"><b><?= round($an['mean'], 1) ?></b><span>平均分 / <?= $an['full'] + 0 ?></span></div>
  <div class="stat"><b><?= round($an['sd'], 1) ?></b><span>标准差</span></div>
  <div class="stat <?= $an['alpha'] !== null && $an['alpha'] < 0.6 ? 'bad' : '' ?>"><b><?= $f2($an['alpha']) ?></b><span>信度 α</span></div>
</div>
<div class="grid2">
  <div class="card">
    <h3>成绩分布</h3>
    <?php $mx = max(1, max($an['bands'])); foreach ($an['bands'] as $k => $v): ?>
      <div class="bar-row"><span><?= $k ?></span><div class="bar"><i style="width:<?= $v / $mx * 100 ?>%"></i></div><b><?= $v ?></b></div>
    <?php endforeach; ?>
  </div>
  <div class="card">
    <h3>需要关注的题目</h3>
    <ul class="checks">
    <?php $any = false; foreach ($an['items'] as $i => $it): if (!$it['flags']) continue; $any = true; ?>
      <li class="warn">第 <?= $i + 1 ?> 题（<?= e($it['ocode'] ?: '—') ?>）：<?= e(implode('、', $it['flags'])) ?>，P=<?= $f2($it['P']) ?>，D=<?= $f2($it['D']) ?></li>
    <?php endforeach; if (!$any): ?><li class="info">所有题目的难度和区分度都在合理范围内。</li><?php endif; ?>
    </ul>
  </div>
</div>
<?php endif; ?>

<div class="card">
  <h3>试题明细<?= $an && $an['n'] ? '与题目分析' : '' ?></h3>
  <div class="scroll-x">
  <table class="tbl">
    <thead><tr><th>#</th><th>题干</th><th>目标</th><th>层级</th><th>满分</th><?php if ($an && $an['n']): ?><th>均分</th><th>难度P</th><th>区分度D</th><th>提示</th><?php endif; ?></tr></thead>
    <?php foreach ($items as $i => $it): ?>
    <tr><td><?= $i + 1 ?></td><td><?= e(mb_substr($it['stem'], 0, 60)) ?></td><td><?= e($it['ocode'] ?: '—') ?></td><td><?= e(bloom_name($it['bloom'])) ?></td><td><?= $it['full'] + 0 ?></td>
    <?php if ($an && $an['n']): ?>
      <td><?= round($it['mean'], 2) ?></td>
      <td class="<?= $it['P'] < 0.3 || $it['P'] > 0.9 ? 'bad' : '' ?>"><?= $f2($it['P']) ?></td>
      <td class="<?= $it['D'] !== null && $it['D'] < 0.2 ? 'bad' : '' ?>"><?= $f2($it['D']) ?></td>
      <td class="small"><?= e(implode('、', $it['flags'])) ?></td>
    <?php endif; ?></tr>
    <?php endforeach; ?>
  </table>
  </div>
</div>
