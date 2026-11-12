<?php $title = $course['name']; $tab = 'lessons'; require __DIR__ . '/../layout/coursenav.php'; ?>

<div class="layout-side">
<div>
  <div class="card">
    <div class="card-head">
      <h3>课次（<?= count($lessons) ?>）</h3>
      <form method="post" action="/courses/<?= $course['id'] ?>/lessons" class="inline">
        <?= csrf_field() ?><input name="title" placeholder="新课次标题"><button class="btn primary sm"><?= ico('plus') ?>添加课次</button>
      </form>
    </div>
    <?php if (!$lessons): ?><p class="muted">还没有课次。可以在右侧“生成教学进度”一次建好全学期，或者手动添加。</p><?php else: ?>
    <table class="tbl lessons">
      <thead><tr><th width="40">#</th><th width="80">日期</th><th>课题</th><th>目标</th><th width="100">检查</th><th width="70">状态</th><th width="150"></th></tr></thead>
      <tbody>
      <?php foreach ($lessons as $l): ?>
      <tr>
        <td><?= (int)$l['seq'] ?></td>
        <td class="muted"><?= $l['class_date'] ? e(date('n月j日', strtotime($l['class_date']))) : '—' ?></td>
        <td><a href="/lessons/<?= $l['id'] ?>"><?= e($l['title']) ?></a></td>
        <td><?php foreach ($l['objcodes'] as $oc): ?><span class="tag sm"><?= e($oc['code']) ?></span><?php endforeach; ?></td>
        <td><?php if ($l['checks']['error']): ?><span class="err-dot"><?= $l['checks']['error'] ?></span><?php endif; ?><?php if ($l['checks']['warn']): ?><span class="warn-dot"><?= $l['checks']['warn'] ?></span><?php endif; ?><?php if (!$l['checks']['error'] && !$l['checks']['warn']): ?><span class="ok-dot">通过</span><?php endif; ?></td>
        <td><span class="st st-<?= e($l['status']) ?>"><?= ['draft' => '待备课', 'ready' => '已备好', 'taught' => '已上完'][$l['status']] ?></span></td>
        <td class="right nowrap"><a href="/lessons/<?= $l['id'] ?>">教案</a> · <a href="/studio/<?= $l['id'] ?>">课件工作室</a> · <a href="/lessons/<?= $l['id'] ?>/word">Word</a></td>
      </tr>
      <?php endforeach; ?>
      </tbody>
    </table>
    <?php endif; ?>
  </div>
</div>

<div>
  <div class="card">
    <h3>课程对齐检查</h3>
    <?php if (!$checks): ?><p class="ok-line">全部通过：每个目标都有课次覆盖、有题目评价，层级匹配。</p><?php endif; ?>
    <ul class="checks"><?php foreach ($checks as $c): ?><li class="<?= $c['level'] ?>"><?= e($c['msg']) ?></li><?php endforeach; ?></ul>
  </div>

  <div class="card">
    <h3>生成教学进度</h3>
    <form method="post" action="/courses/<?= $course['id'] ?>/schedule" class="form">
      <?= csrf_field() ?>
      <div class="row2">
        <label>开课日期<input type="date" name="start_date" required></label>
        <label>课次数<input type="number" name="count" value="<?= max(1, $course['hours'] && $course['lesson_minutes'] ? (int)round($course['hours'] * 45 / $course['lesson_minutes']) : 16) ?>"></label>
      </div>
      <div class="weekdays"><?php foreach (['一','二','三','四','五','六','日'] as $i => $w): ?><label><input type="checkbox" name="weekdays[]" value="<?= $i + 1 ?>">周<?= $w ?></label><?php endforeach; ?></div>
      <label>跳过的日期（节假日，逗号或空格分隔）<input name="skip" placeholder="2026-10-01 2026-10-02"></label>
      <button class="btn sm">生成 / 重排日期</button>
      <p class="muted small">已有课次按序号依次排日期，不够的自动补“待定”课次。</p>
    </form>
  </div>

  <div class="card">
    <h3>导出与复用</h3>
    <p><a class="btn sm ghost" href="/courses/<?= $course['id'] ?>/export">导出全部教案（Word）</a></p>
    <form method="post" action="/courses/<?= $course['id'] ?>/clone" class="form">
      <?= csrf_field() ?>
      <label>复制到新学期<input name="semester" placeholder="新学期，如 2027-2028-1"></label>
      <button class="btn sm">复制整门课</button>
      <p class="muted small">课程目标、支撑矩阵、教案、课件、题库和教学反思都会一起复制，日期会清空。</p>
    </form>
  </div>
</div>
</div>
