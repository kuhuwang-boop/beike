<?php $title = '目标与矩阵'; $tab = 'obj'; require __DIR__ . '/../layout/coursenav.php';
$wsum = 0; foreach ($objectives as $o) { $wsum += (float)$o['weight']; } ?>

<div class="card">
  <div class="card-head">
    <h3>课程目标（CLO）</h3>
    <button class="btn ai sm" onclick="aiObjectives(<?= $course['id'] ?>)"><?= ico('sparkles') ?>AI 从大纲提取目标</button>
  </div>
  <p class="muted small">用可观测的行为动词描述“学完能做到什么”。布鲁姆层级决定了课堂上要设计什么活动、考什么样的题，系统会据此检查对齐。</p>
  <form method="post" action="/courses/<?= $course['id'] ?>/objectives">
    <?= csrf_field() ?>
    <table class="tbl edit" id="obj-table">
      <thead><tr><th width="80">编号</th><th>目标表述</th><th width="110">布鲁姆层级</th><th width="90">权重%</th><th width="120">覆盖</th><th width="50">删除</th></tr></thead>
      <tbody>
      <?php foreach ($objectives as $o): $id = $o['id']; ?>
        <tr>
          <td><input type="hidden" name="o_id[]" value="<?= $id ?>"><input name="o_code[]" value="<?= e($o['code']) ?>"></td>
          <td><textarea name="o_content[]" rows="2"><?= e($o['content']) ?></textarea></td>
          <td><select name="o_bloom[]"><?php foreach (bloom_levels() as $k => $v): ?><option value="<?= $k ?>" <?= (int)$o['bloom'] === $k ? 'selected' : '' ?>><?= $k ?> <?= $v ?></option><?php endforeach; ?></select></td>
          <td><input name="o_weight[]" type="number" step="0.01" value="<?= e($o['weight'] + 0) ?>" class="w-input"></td>
          <td class="small"><?= (int)($lessonCounts[$id] ?? 0) ?> 次课<br><?= (int)($qStats[$id]['n'] ?? 0) ?> 道题</td>
          <td class="center"><input type="checkbox" name="o_del[]" value="<?= $id ?>"></td>
        </tr>
      <?php endforeach; ?>
      </tbody>
      <tfoot><tr><td colspan="3" class="right">权重合计</td><td><b id="wsum" class="<?= abs($wsum - 100) > 0.01 ? 'bad' : 'good' ?>"><?= $wsum + 0 ?></b></td><td colspan="2"></td></tr></tfoot>
    </table>
    <template id="obj-row"><tr>
      <td><input type="hidden" name="o_id[]" value="0"><input name="o_code[]" placeholder="CO1"></td>
      <td><textarea name="o_content[]" rows="2" placeholder="能够……"></textarea><div class="evi"></div></td>
      <td><select name="o_bloom[]"><?php foreach (bloom_levels() as $k => $v): ?><option value="<?= $k ?>"><?= $k ?> <?= $v ?></option><?php endforeach; ?></select></td>
      <td><input name="o_weight[]" type="number" step="0.01" class="w-input"></td><td class="small muted">新增</td><td></td>
    </tr></template>
    <div class="actions"><button type="button" class="btn ghost sm" onclick="addRow('obj-table','obj-row')"><?= ico('plus') ?>添加目标</button><button class="btn primary">保存课程目标</button></div>
  </form>
</div>

<div class="card">
  <h3>毕业要求指标点</h3>
  <p class="muted small">来自专业人才培养方案。不需要专业认证的课程可以不填。</p>
  <form method="post" action="/courses/<?= $course['id'] ?>/gradreqs">
    <?= csrf_field() ?>
    <table class="tbl edit" id="g-table">
      <thead><tr><th width="80">编号</th><th>指标点内容</th><th width="50">删除</th></tr></thead>
      <tbody>
      <?php foreach ($gradReqs as $g): ?>
        <tr><td><input type="hidden" name="g_id[]" value="<?= $g['id'] ?>"><input name="g_code[]" value="<?= e($g['code']) ?>"></td>
        <td><textarea name="g_content[]" rows="1"><?= e($g['content']) ?></textarea></td>
        <td class="center"><input type="checkbox" name="g_del[]" value="<?= $g['id'] ?>"></td></tr>
      <?php endforeach; ?>
      </tbody>
    </table>
    <template id="g-row"><tr><td><input type="hidden" name="g_id[]" value="0"><input name="g_code[]" placeholder="1.2"></td><td><textarea name="g_content[]" rows="1"></textarea></td><td></td></tr></template>
    <div class="actions"><button type="button" class="btn ghost sm" onclick="addRow('g-table','g-row')"><?= ico('plus') ?>添加指标点</button><button class="btn primary">保存指标点</button></div>
  </form>
</div>

<?php if ($objectives && $gradReqs): ?>
<div class="card">
  <h3>课程目标对毕业要求的支撑矩阵</h3>
  <p class="muted small">H 强支撑，M 中等，L 弱支撑。认证材料中的“课程目标与毕业要求对应关系表”可以直接从这里抄录。</p>
  <form method="post" action="/courses/<?= $course['id'] ?>/matrix">
    <?= csrf_field() ?>
    <div class="scroll-x">
    <table class="tbl matrix">
      <thead><tr><th>课程目标</th><?php foreach ($gradReqs as $g): ?><th title="<?= e($g['content']) ?>"><?= e($g['code']) ?></th><?php endforeach; ?></tr></thead>
      <tbody>
      <?php foreach ($objectives as $o): ?>
        <tr><td><b><?= e($o['code']) ?></b> <span class="muted small"><?= e(mb_substr($o['content'], 0, 28)) ?>…</span></td>
        <?php foreach ($gradReqs as $g): $v = $matrix[$o['id']][$g['id']] ?? ''; ?>
          <td class="center"><select name="m[<?= $o['id'] ?>][<?= $g['id'] ?>]" class="lv lv-<?= $v ?>"><option value="">—</option><?php foreach (['H', 'M', 'L'] as $lv): ?><option <?= $v === $lv ? 'selected' : '' ?>><?= $lv ?></option><?php endforeach; ?></select></td>
        <?php endforeach; ?></tr>
      <?php endforeach; ?>
      </tbody>
    </table>
    </div>
    <div class="actions"><button class="btn primary">保存矩阵</button></div>
  </form>
</div>
<?php endif; ?>
