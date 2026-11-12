<?php $title = '题库'; $tab = 'q'; require __DIR__ . '/../layout/coursenav.php'; ?>

<div class="card">
  <h3>双向细目表（题目数：课程目标 × 认知层级）</h3>
  <p class="muted small">深色格表示目标本身的层级。<span class="bad">红色</span>表示该目标在本层级及以上没有任何题目，也就是说评价层级低于目标层级。</p>
  <div class="scroll-x">
  <table class="tbl grid">
    <thead><tr><th>目标</th><?php foreach (bloom_levels() as $k => $v): ?><th><?= $k ?> <?= $v ?></th><?php endforeach; ?><th>合计</th></tr></thead>
    <tbody>
    <?php foreach ($objectives as $o): $row = $grid[(int)$o['id']] ?? []; $hi = 0; foreach ($row as $b => $n) { if ($b >= (int)$o['bloom']) { $hi += $n; } } ?>
      <tr><td><b><?= e($o['code']) ?></b> <span class="muted small"><?= e(mb_substr($o['content'], 0, 20)) ?></span></td>
      <?php foreach (bloom_levels() as $k => $v): $n = $row[$k] ?? 0; ?>
        <td class="center <?= $k === (int)$o['bloom'] ? 'target' : '' ?> <?= $k === (int)$o['bloom'] && !$hi ? 'gap' : '' ?>"><a href="?objective=<?= $o['id'] ?>&bloom=<?= $k ?>"><?= $n ?: '·' ?></a></td>
      <?php endforeach; ?>
      <td class="center"><b><?= array_sum($row) ?></b></td></tr>
    <?php endforeach; ?>
    <?php if (!empty($grid[0])): ?><tr><td class="muted">未关联目标</td><?php foreach (bloom_levels() as $k => $v): ?><td class="center"><?= $grid[0][$k] ?? '·' ?></td><?php endforeach; ?><td class="center"><?= array_sum($grid[0]) ?></td></tr><?php endif; ?>
    </tbody>
  </table>
  </div>
</div>

<div class="grid2">
  <div class="card">
    <h3><?= ico('sparkles') ?> AI 按目标出题</h3>
    <div class="form" id="aiq-form">
      <label>课程目标<select id="aiq-obj" onchange="syncBloom(this)">
        <?php foreach ($objectives as $o): ?><option value="<?= $o['id'] ?>" data-bloom="<?= (int)$o['bloom'] ?>"><?= e($o['code']) ?> <?= e(mb_substr($o['content'], 0, 30)) ?></option><?php endforeach; ?>
      </select></label>
      <div class="row4">
        <label>层级<select id="aiq-bloom"><?php foreach (bloom_levels() as $k => $v): ?><option value="<?= $k ?>"><?= $k ?> <?= $v ?></option><?php endforeach; ?></select></label>
        <label>题型<select id="aiq-type"><?php foreach (qtypes() as $t): ?><option <?= $t === '简答' ? 'selected' : '' ?>><?= $t ?></option><?php endforeach; ?></select></label>
        <label>数量<input id="aiq-count" type="number" value="3" min="1" max="10"></label>
        <label>难度<select id="aiq-diff"><?php for ($i = 1; $i <= 5; $i++): ?><option <?= $i === 3 ? 'selected' : '' ?>><?= $i ?></option><?php endfor; ?></select></label>
      </div>
      <input id="aiq-extra" placeholder="可选补充要求，如“结合医疗场景”">
      <button class="btn ai" onclick="aiQuestions(<?= $course['id'] ?>)" <?= $objectives ? '' : 'disabled' ?>>生成题目</button>
    </div>
    <div id="aiq-out"></div>
  </div>

  <div class="card">
    <h3>手工添加</h3>
    <form method="post" action="/courses/<?= $course['id'] ?>/questions" class="form">
      <?= csrf_field() ?>
      <div class="row4">
        <label>目标<select name="objective_id"><option value="0">—</option><?php foreach ($objectives as $o): ?><option value="<?= $o['id'] ?>"><?= e($o['code']) ?></option><?php endforeach; ?></select></label>
        <label>层级<select name="bloom"><?php foreach (bloom_levels() as $k => $v): ?><option value="<?= $k ?>" <?= $k === 2 ? 'selected' : '' ?>><?= $v ?></option><?php endforeach; ?></select></label>
        <label>题型<select name="qtype"><?php foreach (qtypes() as $t): ?><option><?= $t ?></option><?php endforeach; ?></select></label>
        <label>分值<input name="score" type="number" step="0.5" value="10"></label>
      </div>
      <label>题干<textarea name="stem" rows="3" required></textarea></label>
      <label>选项（每行一个，非选择题留空）<textarea name="options" rows="2"></textarea></label>
      <div class="row2"><label>答案<textarea name="answer" rows="2"></textarea></label><label>解析 / 评分要点<textarea name="analysis" rows="2"></textarea></label></div>
      <button class="btn primary">加入题库</button>
    </form>
  </div>
</div>

<div class="card">
  <div class="card-head">
    <h3>题目列表（<?= count($questions) ?>）</h3>
    <form class="inline filters" method="get">
      <select name="objective"><option value="">全部目标</option><?php foreach ($objectives as $o): ?><option value="<?= $o['id'] ?>" <?= (int)input('objective') === (int)$o['id'] ? 'selected' : '' ?>><?= e($o['code']) ?></option><?php endforeach; ?></select>
      <select name="bloom"><option value="">全部层级</option><?php foreach (bloom_levels() as $k => $v): ?><option value="<?= $k ?>" <?= (int)input('bloom') === $k ? 'selected' : '' ?>><?= $v ?></option><?php endforeach; ?></select>
      <select name="qtype"><option value="">全部题型</option><?php foreach (qtypes() as $t): ?><option <?= input('qtype') === $t ? 'selected' : '' ?>><?= $t ?></option><?php endforeach; ?></select>
      <input name="kw" value="<?= e(input('kw')) ?>" placeholder="搜索题干">
      <button class="btn sm">筛选</button>
    </form>
  </div>
  <div class="qlist">
  <?php foreach ($questions as $q): ?>
    <div class="q">
      <div class="q-meta">
        <span class="tag sm"><?= e($q['ocode'] ?: '未关联') ?></span>
        <span class="tag sm b<?= (int)$q['bloom'] ?>"><?= e(bloom_name($q['bloom'])) ?></span>
        <span class="tag sm"><?= e($q['qtype']) ?></span>
        <span class="muted small"><?= e($q['score'] + 0) ?>分 · <?= e($q['source']) ?><?= $q['used'] ? ' · 已用于' . $q['used'] . '份试卷' : '' ?></span>
        <?php if ($q['source'] === 'AI'): ?><span class="pill <?= $q['evidence_ok'] ? 'ok' : 'bad' ?>" title="<?= e($q['evidence']) ?>"><?= $q['evidence_ok'] ? '依据已核验' : '依据未在大纲中找到' ?></span><?php endif; ?>
        <span class="grow"></span>
        <a href="/questions/<?= $q['id'] ?>/edit" class="small">编辑</a>
        <form method="post" action="/questions/<?= $q['id'] ?>/delete" class="inline" data-confirm="删除这道题？"><?= csrf_field() ?><button class="link small danger-text">删除</button></form>
      </div>
      <div class="q-stem"><?= nl($q['stem']) ?></div>
      <?php if (trim((string)$q['options']) !== ''): ?><div class="q-opts"><?= nl($q['options']) ?></div><?php endif; ?>
      <details><summary class="small">答案与解析</summary><div class="q-ans"><b>答案：</b><?= nl($q['answer']) ?><?php if ($q['analysis']): ?><br><b>解析：</b><?= nl($q['analysis']) ?><?php endif; ?></div></details>
    </div>
  <?php endforeach; ?>
  <?php if (!$questions): ?><p class="muted">没有符合条件的题目。</p><?php endif; ?>
  </div>
</div>
<script>
function syncBloom(sel){ document.getElementById('aiq-bloom').value = sel.selectedOptions[0].dataset.bloom; }
window.addEventListener('DOMContentLoaded', function(){ var s=document.getElementById('aiq-obj'); if(s && s.options.length) syncBloom(s); });
</script>
