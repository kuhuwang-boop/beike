<?php $title = '达成度分析'; $tab = 'a'; require __DIR__ . '/../layout/coursenav.php'; ?>

<?php if (!$att): ?>
<div class="card empty">
  <h3>还没有成绩数据</h3>
  <p>在「④ 试卷与成绩」中导入至少一份试卷的逐题成绩后，这里会自动计算每个课程目标的达成度。</p>
  <p class="muted small">达成度 = Σ该目标各题平均分 ÷ Σ该目标各题满分；多份试卷会合并计算。</p>
</div>
<?php else: ?>

<div class="stats">
  <div class="stat <?= $overall !== null && $overall < $th ? 'bad' : 'good' ?>"><b><?= $overall === null ? '—' : number_format($overall, 2) ?></b><span>课程总体达成度（按权重）</span></div>
  <div class="stat"><b><?= number_format($th, 2) ?></b><span>达成阈值</span></div>
  <div class="stat"><b><?= count($papers) ?></b><span>参与计算的试卷</span></div>
</div>

<div class="card">
  <h3>课程目标达成情况</h3>
  <table class="tbl">
    <thead><tr><th>目标</th><th>层级</th><th>权重</th><th width="35%">达成度</th><th>题数</th><th>个人未达成</th><th>结论</th></tr></thead>
    <?php foreach ($objectives as $o): $a = $att[$o['id']] ?? null; ?>
    <tr>
      <td><b><?= e($o['code']) ?></b> <span class="small muted"><?= e(mb_substr($o['content'], 0, 30)) ?></span></td>
      <td><?= e(bloom_name($o['bloom'])) ?></td><td><?= e($o['weight'] + 0) ?>%</td>
      <td><?php if ($a): ?><div class="attain"><div class="bar"><i class="<?= $a['attain'] < $th ? 'low' : '' ?>" style="width:<?= min(100, $a['attain'] * 100) ?>%"></i><em style="left:<?= $th * 100 ?>%"></em></div><b><?= number_format($a['attain'], 2) ?></b></div><?php else: ?><span class="muted">无题目数据</span><?php endif; ?></td>
      <td><?= $a ? $a['items'] : 0 ?></td>
      <td><?= $a ? $a['below'] . ' / ' . $a['students'] : '—' ?></td>
      <td><?php if (!$a): ?><span class="pill">无法评价</span><?php elseif ($a['attain'] < $th): ?><span class="pill bad">未达成</span><?php else: ?><span class="pill ok">达成</span><?php endif; ?></td>
    </tr>
    <?php endforeach; ?>
  </table>
  <p class="muted small">“个人未达成”表示该目标个人得分率低于阈值的学生人数——即使总体达成了，如果这个数字很大，也说明有相当一部分学生没有掌握。</p>
</div>

<?php if ($weakLessons): ?>
<div class="card">
  <h3>回到教案：需要改进的课次</h3>
  <?php foreach ($weakLessons as $oid => $ls): $o = null; foreach ($objectives as $x) { if ((int)$x['id'] === (int)$oid) { $o = $x; } } ?>
    <p><b><?= e($o['code']) ?></b> 未达成，涉及：
    <?php foreach ($ls as $l): ?><a class="tag" href="/lessons/<?= $l['id'] ?>#reflection">第<?= (int)$l['seq'] ?>次 <?= e($l['title']) ?></a><?php endforeach; ?>
    <?php if (!$ls): ?><span class="muted">没有课次覆盖这个目标——这可能就是原因。</span><?php endif; ?></p>
  <?php endforeach; ?>
</div>
<?php endif; ?>

<div class="card">
  <div class="card-head"><h3><?= ico('bulb') ?> 持续改进建议</h3><button class="btn ai sm" onclick="aiImprove(<?= $course['id'] ?>)">让 AI 分析数据</button></div>
  <p class="muted small">AI 会先区分“考的问题”（试题本身区分度差）和“教的问题”，再针对具体课次给出修改建议。它只能看到上面这些数据和你的教学反思。</p>
  <div id="improve-out"></div>
</div>
<?php endif; ?>
