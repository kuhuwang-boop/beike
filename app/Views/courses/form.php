<?php $c = $course ?: ['name' => '', 'code' => '', 'semester' => '', 'credits' => '', 'hours' => '', 'lesson_minutes' => 90, 'audience' => '', 'syllabus' => '', 'attain_threshold' => '0.70']; ?>
<div class="page-head"><h1><?= $course ? '编辑课程' : '新建课程' ?></h1></div>
<form method="post" action="<?= $course ? '/courses/' . $course['id'] : '/courses' ?>" class="card form">
  <?= csrf_field() ?>
  <div class="row3">
    <label>课程名称 *<input name="name" value="<?= e($c['name']) ?>" required placeholder="如：数据结构"></label>
    <label>课程代码<input name="code" value="<?= e($c['code']) ?>"></label>
    <label>学期<input name="semester" value="<?= e($c['semester']) ?>" placeholder="如：2026-2027-1"></label>
  </div>
  <div class="row4">
    <label>学分<input name="credits" type="number" step="0.5" value="<?= e($c['credits']) ?>"></label>
    <label>总学时<input name="hours" type="number" value="<?= e($c['hours']) ?>"></label>
    <label>每次课时长(分钟)<input name="lesson_minutes" type="number" value="<?= e($c['lesson_minutes']) ?>"></label>
    <label>达成度阈值<input name="attain_threshold" type="number" step="0.01" min="0" max="1" value="<?= e($c['attain_threshold']) ?>"></label>
  </div>
  <label>授课对象<input name="audience" value="<?= e($c['audience']) ?>" placeholder="如：计算机科学与技术专业 2024级本科生，已学过C语言"></label>
  <label>课程教学大纲原文
    <small class="muted">请整段粘贴（课程目标、教学内容与学时分配、考核方式等）。AI 生成的所有内容都以它为依据，系统也会用它逐字核对 AI 的引用。</small>
    <textarea name="syllabus" rows="16" placeholder="直接从 Word 版大纲复制粘贴即可"><?= e($c['syllabus']) ?></textarea>
  </label>
  <div class="actions">
    <button class="btn primary">保存</button>
    <?php if ($course): ?><a class="btn ghost" href="/courses/<?= $course['id'] ?>">取消</a><?php endif; ?>
  </div>
</form>
<?php if ($course): ?>
<form method="post" action="/courses/<?= $course['id'] ?>/delete" class="danger-zone" data-confirm="确定删除这门课程及其全部课次、题库、试卷和成绩？此操作不可恢复。">
  <?= csrf_field() ?><button class="btn danger">删除课程</button>
</form>
<?php endif; ?>
