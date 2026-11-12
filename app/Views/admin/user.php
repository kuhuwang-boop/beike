<?php
use App\Services\Users;
$id = (int)$u['id'];
$self = $id === $meId;
$names = ['agent_leader' => '组长', 'agent_designer' => '教学设计', 'agent_slides' => '课件设计', 'agent_quiz' => '出题', 'agent_reviewer' => '学科审核', 'agent_illustrator' => '配图', 'agent_diagram' => '结构图', 'objectives' => '提取目标', 'lesson' => '教案草稿', 'review' => '督导评课', 'questions' => '出题', 'improve' => '改进建议', 'slides' => 'PPT 课件', 'style_learn' => '学习风格', 'skill_draft' => '写技能', 'ping' => '连接测试'];
$act = function ($a) use ($names) {
    $k = strpos($a, ':') !== false ? substr($a, strpos($a, ':') + 1) : $a;
    return $names[$k] ?? $k;
};
?>
<div class="page-head">
  <div><div class="crumb"><a href="/admin">系统设置</a> / <a href="/admin/users">用户管理</a> / <?= e($u['name']) ?></div>
    <div class="u-head"><span class="me-av"><?= e(mb_substr($u['name'], 0, 1)) ?></span><div><h1 style="margin:0"><?= e($u['name']) ?></h1>
      <span class="muted small"><?= e($u['email']) ?></span>
      <span class="pill <?= $u['status'] === 'active' ? 'ok' : ($u['status'] === 'disabled' ? 'bad' : 'warn') ?>"><?= Users::STATUS[$u['status']] ?></span>
      <?= $u['role'] === 'admin' ? '<span class="pill">管理员</span>' : '' ?></div></div></div>
  <div class="head-actions">
    <?php if ($u['status'] === 'pending'): ?>
      <form method="post" action="/admin/users/<?= $id ?>/status" class="inline"><?= csrf_field() ?><button class="btn primary sm" name="status" value="active"><?= ico('check') ?> 通过审核</button></form>
    <?php elseif ($u['status'] === 'disabled'): ?>
      <form method="post" action="/admin/users/<?= $id ?>/status" class="inline"><?= csrf_field() ?><button class="btn primary sm" name="status" value="active">启用账号</button></form>
    <?php elseif (!$self): ?>
      <form method="post" action="/admin/users/<?= $id ?>/status" class="inline" data-confirm="停用「<?= e($u['name']) ?>」？对方将无法登录，课件和资料都会保留。"><?= csrf_field() ?><button class="btn ghost sm" name="status" value="disabled"><?= ico('lock') ?> 停用账号</button></form>
    <?php endif; ?>
    <form method="post" action="/admin/users/<?= $id ?>/reset" class="inline" data-confirm="为「<?= e($u['name']) ?>」生成一个新密码？旧密码会立即失效。"><?= csrf_field() ?><button class="btn ghost sm"><?= ico('key') ?> 重置密码</button></form>
  </div>
</div>

<?php if ($created): ?>
<div class="card created-box">
  <h3><?= ico('key') ?> 新密码</h3>
  <p>账号 <b><?= e($created[0]['email']) ?></b>　密码 <code><?= e($created[0]['password']) ?></code></p>
  <p class="muted small">只显示这一次，请转告本人。对方登录后系统会提示改成自己的密码。</p>
</div>
<?php endif; ?>

<div class="u-kv">
  <div><small>学校</small><b><?= e($school['name'] ?: ($u['note'] ?: '未填写')) ?></b></div>
  <div><small>本月 AI 调用</small><b><?= $calls ?></b> <span class="muted small">/ <?= $quota ?: '不限' ?></span></div>
  <div><small>课程 · 课件</small><b><?= count($courses) ?> · <?= array_sum(array_column($courses, 'decks')) ?></b></div>
  <div><small>资料库 · 我的技能 · 模板</small><b><?= $stats['lib'] ?> · <?= $stats['skills'] ?> · <?= $stats['tpl'] ?></b></div>
  <div><small>最近登录</small><b><?= e($u['last_login_at'] ? substr($u['last_login_at'], 0, 16) : '从未登录') ?></b> <span class="muted small"><?= (int)$u['login_count'] ?> 次</span></div>
  <div><small>注册时间</small><b><?= e(substr($u['created_at'], 0, 10)) ?></b><?= $u['must_change'] ? ' <span class="muted small">未改初始密码</span>' : '' ?></div>
</div>

<div class="grid2" style="margin-top:16px">
  <form method="post" action="/admin/users/<?= $id ?>" class="card form">
    <?= csrf_field() ?>
    <h3>基本信息</h3>
    <label>姓名<input name="name" value="<?= e($u['name']) ?>" maxlength="50"></label>
    <label>邮箱（登录账号）<input name="email" type="email" value="<?= e($u['email']) ?>"></label>
    <label>角色<select name="role" <?= $self ? 'disabled' : '' ?>><option value="teacher">教师</option><option value="admin" <?= $u['role'] === 'admin' ? 'selected' : '' ?>>管理员</option></select>
      <?php if ($self): ?><input type="hidden" name="role" value="admin"><small class="muted">不能取消自己的管理员身份</small><?php endif; ?></label>
    <label>备注 <small class="muted">学校、院系、联系方式等，只有管理员能看到</small><input name="note" value="<?= e($u['note']) ?>" maxlength="200"></label>
    <label>每月 AI 调用上限 <small class="muted">留空 = 跟随系统默认（<?= $quotaDefault ?: '不限' ?>）；0 = 不限<?= $u['role'] === 'admin' ? '；管理员不受限制' : '' ?></small>
      <input name="ai_quota" type="number" min="0" value="<?= $u['ai_quota'] === null ? '' : (int)$u['ai_quota'] ?>" placeholder="跟随默认"></label>
    <div class="actions"><button class="btn primary">保存</button></div>
  </form>

  <div class="card">
    <h3>近 6 个月 AI 用量</h3>
    <?php if (!$months): ?><p class="muted">还没有使用过 AI。</p><?php else: $mx = max(array_column($months, 'n')) ?: 1; ?>
    <?php foreach ($months as $m): ?>
      <div class="bar-row" style="grid-template-columns:64px 1fr 110px"><span><?= e($m['m']) ?></span><div class="bar"><i style="width:<?= round($m['n'] * 100 / $mx) ?>%"></i></div><span class="small muted"><?= (int)$m['okn'] ?> 次 · <?= number_format($m['tk'] / 1000, 1) ?>k tokens</span></div>
    <?php endforeach; endif; ?>
    <?php if ($recent): ?>
    <h3 style="margin-top:16px">最近调用</h3>
    <table class="tbl small"><tr><th>时间</th><th>功能</th><th>结果</th><th>tokens</th></tr>
      <?php foreach ($recent as $r): ?><tr><td class="nowrap"><?= e(substr($r['created_at'], 5, 11)) ?></td><td><?= e($act($r['action'])) ?></td><td><?= $r['ok'] ? '<span class="ok-dot">成功</span>' : '<span class="err-dot">失败</span>' ?></td><td><?= (int)$r['tk'] ?></td></tr><?php endforeach; ?>
    </table>
    <?php endif; ?>
  </div>
</div>

<div class="card">
  <h3>课程（<?= count($courses) ?>）</h3>
  <?php if (!$courses): ?><p class="muted">还没有创建课程。</p><?php else: ?>
  <div class="scroll-x"><table class="tbl small"><tr><th>课程</th><th>学期</th><th>课次</th><th>已做课件</th><th>创建时间</th></tr>
    <?php foreach ($courses as $c): ?><tr><td><?= e($c['name']) ?></td><td><?= e($c['semester']) ?></td><td><?= (int)$c['lessons'] ?></td><td><?= (int)$c['decks'] ?></td><td><?= e(substr($c['created_at'], 0, 10)) ?></td></tr><?php endforeach; ?>
  </table></div>
  <p class="muted small">为保护老师的隐私，这里只显示统计，不显示课件和资料的具体内容。</p>
  <?php endif; ?>
</div>

<?php if (!$self): ?>
<div class="card danger-zone">
  <h3>危险操作</h3>
  <p class="muted small">只是暂时不让对方使用，请用「停用账号」，数据会保留。删除会永久清除该老师的全部课程、课件、资料库、技能和模板，无法恢复。</p>
  <form method="post" action="/admin/users/<?= $id ?>/delete" class="inline" data-confirm="永久删除「<?= e($u['name']) ?>」及其全部课程、课件和资料？此操作无法恢复。"><?= csrf_field() ?><button class="btn ghost sm danger-text"><?= ico('trash') ?> 删除账号</button></form>
</div>
<?php endif; ?>
