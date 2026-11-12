<?php $tab = $tab ?? ''; ?>
<div class="page-head">
  <div>
    <div class="crumb"><a href="/courses">课程与教案</a> / <?= e($course['semester']) ?></div>
    <h1><?= e($course['name']) ?> <?php if ($course['code']): ?><span class="tag"><?= e($course['code']) ?></span><?php endif; ?></h1>
  </div>
  <div class="head-actions"><a class="btn ghost" href="/courses/<?= $course['id'] ?>/edit">编辑课程信息 / 大纲</a></div>
</div>
<div class="tabs">
  <a href="/courses/<?= $course['id'] ?>/objectives" class="<?= $tab === 'obj' ? 'on' : '' ?>">① 目标与支撑矩阵</a>
  <a href="/courses/<?= $course['id'] ?>" class="<?= $tab === 'lessons' ? 'on' : '' ?>">② 课次 · 教案 · 课件</a>
  <a href="/courses/<?= $course['id'] ?>/questions" class="<?= $tab === 'q' ? 'on' : '' ?>">③ 题库</a>
  <a href="/courses/<?= $course['id'] ?>/papers" class="<?= $tab === 'p' ? 'on' : '' ?>">④ 试卷与成绩</a>
  <a href="/courses/<?= $course['id'] ?>/analysis" class="<?= $tab === 'a' ? 'on' : '' ?>">⑤ 达成度分析</a>
</div>
