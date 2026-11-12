<?php $title = $lesson['title'];
$objById = []; foreach ($objectives as $o) { $objById[$o['id']] = $o; }
$idx = 0; foreach ($siblings as $i => $s) { if ((int)$s['id'] === (int)$lesson['id']) { $idx = $i; } }
$prev = $siblings[$idx - 1] ?? null; $next = $siblings[$idx + 1] ?? null;
$segRow = function ($s, $objectives) { ob_start(); ?>
<tr class="seg">
  <td class="handle"><button type="button" class="ibtn" onclick="moveSeg(this,-1)" title="上移"><?= ico('arrow-up') ?></button><button type="button" class="ibtn" onclick="moveSeg(this,1)" title="下移"><?= ico('arrow-down') ?></button></td>
  <td><select name="seg_phase[]"><?php foreach (phases() as $k => $p): ?><option value="<?= $k ?>" <?= $s['phase'] === $k ? 'selected' : '' ?> title="<?= e($p[1]) ?>"><?= e($p[0]) ?></option><?php endforeach; ?></select>
      <input name="seg_minutes[]" type="number" min="0" value="<?= (int)$s['minutes'] ?>" class="mins" oninput="sumMinutes()"> 分钟</td>
  <td data-l="教师活动"><textarea name="seg_teacher[]" rows="3" placeholder="教师具体做什么、讲什么例子"><?= e($s['teacher_act']) ?></textarea></td>
  <td data-l="学生活动"><textarea name="seg_student[]" rows="3" placeholder="学生具体做什么（留空=只听讲）"><?= e($s['student_act']) ?></textarea></td>
  <td data-l="对应目标 / 检测"><select name="seg_obj[]"><option value="0">—</option><?php foreach ($objectives as $o): ?><option value="<?= $o['id'] ?>" <?= (int)$s['objective_id'] === (int)$o['id'] ? 'selected' : '' ?>><?= e($o['code']) ?></option><?php endforeach; ?></select>
      <input name="seg_assess[]" value="<?= e($s['assess_method']) ?>" placeholder="检测方式"></td>
  <td><button type="button" class="ibtn del" onclick="this.closest('tr').remove();sumMinutes()" title="删除"><?= ico('trash') ?></button></td>
</tr>
<?php return ob_get_clean(); };
?>
<div class="page-head">
  <div>
    <div class="crumb"><a href="/courses/<?= $course['id'] ?>"><?= e($course['name']) ?></a> / 第 <?= (int)$lesson['seq'] ?> 次课</div>
    <h1><?= e($lesson['title']) ?></h1>
  </div>
  <div class="head-actions">
    <?php if ($prev): ?><a class="btn ghost sm" href="/lessons/<?= $prev['id'] ?>"><?= ico('chevron-left') ?>上一次</a><?php endif; ?>
    <?php if ($next): ?><a class="btn ghost sm" href="/lessons/<?= $next['id'] ?>">下一次 →</a><?php endif; ?>
  </div>
</div>

<div class="layout-side wide">
<form method="post" action="/lessons/<?= $lesson['id'] ?>" id="lesson-form" class="form">
  <?= csrf_field() ?>
  <div class="card">
    <div class="row5">
      <label>序号<input type="number" name="seq" value="<?= (int)$lesson['seq'] ?>"></label>
      <label class="span2">课题<input name="title" id="f-title" value="<?= e($lesson['title']) ?>" required></label>
      <label>上课日期<input type="date" name="class_date" value="<?= e($lesson['class_date']) ?>"></label>
      <label>时长(分钟)<input type="number" name="duration_min" id="f-duration" value="<?= (int)$lesson['duration_min'] ?>" oninput="sumMinutes()"></label>
    </div>
    <div class="status-row">状态：
      <?php foreach (['draft' => '待备课', 'ready' => '已备好', 'taught' => '已上完'] as $k => $v): ?>
        <label class="radio"><input type="radio" name="status" value="<?= $k ?>" <?= $lesson['status'] === $k ? 'checked' : '' ?>><?= $v ?></label>
      <?php endforeach; ?>
    </div>
  </div>

  <div class="card">
    <h3>第一步：本次课要达成的课程目标</h3>
    <?php if (!$objectives): ?><p class="muted">课程还没有目标。<a href="/courses/<?= $course['id'] ?>/objectives">先去设置课程目标 →</a></p><?php endif; ?>
    <div class="obj-checks">
    <?php foreach ($objectives as $o): ?>
      <label class="obj-check"><input type="checkbox" name="objectives[]" value="<?= $o['id'] ?>" <?= in_array((int)$o['id'], $lessonObjIds, true) ? 'checked' : '' ?>>
        <b><?= e($o['code']) ?></b><span class="tag sm b<?= (int)$o['bloom'] ?>"><?= e(bloom_name($o['bloom'])) ?></span><?= e($o['content']) ?></label>
    <?php endforeach; ?>
    </div>
    <details class="ai-box" <?= !$segments ? 'open' : '' ?>>
      <summary><?= ico('sparkles') ?> 用 AI 生成教案草稿（依据大纲 + 所选目标<?= trim((string)$lesson['reflection']) !== '' ? ' + 上一轮反思' : '' ?>）</summary>
      <textarea id="ai-extra" rows="2" placeholder="可选：补充要求，如“采用案例教学，案例用校园外卖配送路径”“学生基础较弱”"></textarea>
      <button type="button" class="btn ai" onclick="aiLesson(<?= $lesson['id'] ?>)">生成草稿</button>
      <span class="muted small">生成后会填进下面的表单，<b>不会自动保存</b>，请修改后再保存。</span>
      <div id="ai-evidence"></div>
    </details>
  </div>

  <div class="card">
    <h3>第二步：重点、难点与学生可能的误区</h3>
    <div class="row2">
      <label>教学重点<textarea name="key_points" rows="3"><?= e($lesson['key_points']) ?></textarea></label>
      <label>教学难点<textarea name="difficult_points" rows="3"><?= e($lesson['difficult_points']) ?></textarea></label>
    </div>
    <label>预判学生误区及对策 <small class="muted">资深教师的习惯：上课前写下学生最可能错在哪、怎么纠正</small><textarea name="misconceptions" rows="3"><?= e($lesson['misconceptions']) ?></textarea></label>
  </div>

  <div class="card">
    <div class="card-head"><h3>第三步：教学过程（BOPPPS）</h3><div id="time-sum" class="time-sum"></div></div>
    <div class="scroll-x">
    <table class="tbl segs" id="seg-table">
      <thead><tr><th width="44"></th><th width="170">环节 / 时间</th><th>教师活动</th><th>学生活动</th><th width="150">对应目标 / 检测</th><th width="30"></th></tr></thead>
      <tbody>
      <?php foreach ($segments as $s) { echo $segRow($s, $objectives); } ?>
      </tbody>
    </table>
    </div>
    <template id="seg-tpl"><?= $segRow(['phase' => 'P2', 'minutes' => 10, 'teacher_act' => '', 'student_act' => '', 'objective_id' => 0, 'assess_method' => ''], $objectives) ?></template>
    <div class="actions">
      <button type="button" class="btn ghost sm" onclick="addSeg()"><?= ico('plus') ?>添加环节</button>
      <?php if (!$segments): ?><button type="button" class="btn ghost sm" onclick="boppsSkeleton()">插入 BOPPPS 六段骨架</button><?php endif; ?>
    </div>
  </div>

  <div class="card">
    <h3>第四步：思政、资源与作业</h3>
    <label>课程思政融入点<textarea name="ideology" rows="2"><?= e($lesson['ideology']) ?></textarea></label>
    <div class="row2">
      <label>教学资源<textarea name="resources" rows="3"><?= e($lesson['resources']) ?></textarea></label>
      <label>作业与课后任务<textarea name="homework" rows="3"><?= e($lesson['homework']) ?></textarea></label>
    </div>
  </div>

  <div class="card" id="reflection">
    <h3>课后：教学反思</h3>
    <p class="muted small">建议写三点：哪个目标学生没有达成（证据是什么）、哪个环节时间不准、下次准备怎么改。复制到新学期时会带过去，AI 起草教案时也会参考。</p>
    <textarea name="reflection" rows="4"><?= e($lesson['reflection']) ?></textarea>
  </div>

  <div class="savebar"><span id="dirty" class="muted"></span><button class="btn primary">保存教案</button></div>
</form>

<aside class="sticky">
  <div class="card">
    <h3>对齐检查 <small class="muted">（保存后更新）</small></h3>
    <?php if (!$checks): ?><p class="ok-line">全部通过</p><?php endif; ?>
    <ul class="checks"><?php foreach ($checks as $c): ?><li class="<?= $c['level'] ?>"><?= e($c['msg']) ?></li><?php endforeach; ?></ul>
  </div>
  <div class="card tools">
    <a class="btn block primary-soft" href="/studio/<?= $lesson['id'] ?>"><?= ico('presentation') ?>在课件工作室中制作 PPT</a>
    <button class="btn block ai" onclick="aiReview(<?= $lesson['id'] ?>)"><?= ico('stethoscope') ?>AI 督导评课</button>
    <div id="review-out"></div>
    <div class="row2 tight">
      <a class="btn ghost sm" href="/lessons/<?= $lesson['id'] ?>/word">导出 Word</a>
      <a class="btn ghost sm" href="/lessons/<?= $lesson['id'] ?>/print" target="_blank">打印 / PDF</a>
    </div>
    <div class="row2 tight">
      <form method="post" action="/lessons/<?= $lesson['id'] ?>/duplicate"><?= csrf_field() ?><button class="btn ghost sm block">复制课次</button></form>
      <form method="post" action="/lessons/<?= $lesson['id'] ?>/delete" data-confirm="确定删除这次课？"><?= csrf_field() ?><button class="btn ghost sm block danger-text">删除</button></form>
    </div>
  </div>
</aside>
</div>
<script>window.addEventListener('DOMContentLoaded', function(){ sumMinutes(); watchDirty('lesson-form'); });</script>
