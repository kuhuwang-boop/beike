<div class="page-head">
  <div><h1>课程与教案 <span class="tag">进阶</span></h1><p class="muted">按课程管理教学进度、教案、题库、试卷和课程目标达成度。只做课件的话，用「课件工作室」就够了。</p></div>
  <div class="head-actions"><a class="btn primary" href="/courses/new"><?= ico('plus') ?>新建课程</a></div>
</div>

<?php if (!$courses): ?>
<div class="card hero">
  <h2>从一门课开始</h2>
  <p>这个工作台按照<b>逆向设计</b>的顺序帮你备课：先确定课程目标，再设计每次课的活动和检测，最后用学生的逐题成绩验证目标有没有达成，并指导下一轮的修改。</p>
  <ol class="steps">
    <li><b>新建课程，粘贴教学大纲原文</b>：这是 AI 生成内容的依据，也是系统核对 AI 引用的标准。</li>
    <li><b>设置课程目标与毕业要求支撑矩阵</b>：可以让 AI 从大纲中提取。</li>
    <li><b>一键排教学进度</b>，逐次备课：AI 起草 BOPPPS 教案，系统自动检查对齐，再一键生成 PPT 课件。</li>
    <li><b>按目标出题、组卷</b>，课后导入逐题成绩，自动算出达成度、难度、区分度和信度。</li>
  </ol>
  <a class="btn primary" href="/courses/new">新建第一门课程</a>
</div>
<?php else: ?>

<div class="grid2">
  <div class="card">
    <h3>近期要上的课</h3>
    <?php if (!$upcoming): ?><p class="muted">还没有排进度的课次。在课程页面点击“生成教学进度”。</p><?php endif; ?>
    <ul class="list">
    <?php foreach ($upcoming as $l): ?>
      <li><a href="/lessons/<?= $l['id'] ?>"><span class="date"><?= e(date('n/j', strtotime($l['class_date']))) ?></span><?= e($l['cname']) ?> · 第<?= (int)$l['seq'] ?>次 <?= e($l['title']) ?></a>
        <span class="st st-<?= e($l['status']) ?>"><?= ['draft' => '待备课', 'ready' => '已备好', 'taught' => '已上完'][$l['status']] ?></span></li>
    <?php endforeach; ?>
    </ul>
  </div>
  <div class="card">
    <h3>待写教学反思</h3>
    <?php if (!$needReflect): ?><p class="muted">没有待写的反思。</p><?php endif; ?>
    <ul class="list">
    <?php foreach ($needReflect as $l): ?>
      <li><a href="/lessons/<?= $l['id'] ?>#reflection"><span class="date"><?= e(date('n/j', strtotime($l['class_date']))) ?></span><?= e($l['cname']) ?> · <?= e($l['title']) ?></a></li>
    <?php endforeach; ?>
    </ul>
    <p class="muted small">反思会随课程一起复制到下一学期，AI 起草教案时也会参考它。</p>
  </div>
</div>

<h2 class="sec">我的课程</h2>
<div class="cards">
<?php foreach ($courses as $c): ?>
  <a class="card course-card" href="/courses/<?= $c['id'] ?>">
    <div class="cc-top"><b><?= e($c['name']) ?></b><span class="muted"><?= e($c['semester']) ?></span></div>
    <div class="cc-stats">
      <span><b><?= (int)$c['lesson_n'] ?></b> 课次</span>
      <span><b><?= (int)$c['ready_n'] ?></b> 已备</span>
      <span><b><?= (int)$c['q_n'] ?></b> 题</span>
    </div>
    <div class="cc-check">
      <?php if ($c['checks']['error'] + $c['checks']['warn'] === 0): ?><span class="ok-dot">对齐检查通过</span>
      <?php else: ?><span class="err-dot"><?= $c['checks']['error'] ?> 个错误</span><span class="warn-dot"><?= $c['checks']['warn'] ?> 个提醒</span><?php endif; ?>
    </div>
  </a>
<?php endforeach; ?>
</div>
<?php endif; ?>
