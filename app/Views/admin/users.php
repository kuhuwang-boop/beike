<?php
use App\Services\Users;
$back = 'admin/users' . ($qs ? '?' . $qs : '');
$link = function ($over) use ($q, $role, $status) {
    $p = array_filter(array_merge(['q' => $q, 'role' => $role, 'status' => $status], $over), 'strlen');
    return '/admin/users' . ($p ? '?' . http_build_query($p) : '');
};
$ago = function ($t) {
    if (!$t) {
        return '从未登录';
    }
    $d = time() - strtotime($t);
    if ($d < 3600) {
        return max(1, (int)($d / 60)) . ' 分钟前';
    }
    if ($d < 86400) {
        return (int)($d / 3600) . ' 小时前';
    }
    if ($d < 86400 * 30) {
        return (int)($d / 86400) . ' 天前';
    }
    return substr($t, 0, 10);
};
?>
<div class="page-head">
  <div><div class="crumb"><a href="/admin">系统设置</a> / 用户管理</div><h1>用户管理</h1></div>
  <div class="head-actions">
    <a class="btn ghost sm" href="/admin/users/export"><?= ico('file-spreadsheet') ?> 导出名单</a>
    <button class="btn ghost sm" type="button" onclick="document.getElementById('dlg-batch').hidden=false"><?= ico('users') ?> 批量添加</button>
    <button class="btn primary sm" type="button" onclick="document.getElementById('dlg-add').hidden=false"><?= ico('plus') ?> 添加用户</button>
  </div>
</div>

<?php if ($created): ?>
<div class="card created-box">
  <div class="card-head"><h3><?= ico('key') ?> <?= !empty($created[0]['reset']) ? '新密码' : '新账号的初始密码' ?></h3>
    <button class="btn ghost sm" type="button" onclick="copyCreated()"><?= ico('copy') ?> 复制全部</button></div>
  <p class="muted small">密码只显示这一次，请复制后转告本人。对方首次登录时系统会提示改成自己的密码。</p>
  <div class="scroll-x"><table class="tbl small" id="created-tbl"><tr><th>姓名</th><th>邮箱（登录账号）</th><th>密码</th></tr>
  <?php foreach ($created as $c): ?><tr><td><?= e($c['name']) ?></td><td><?= e($c['email']) ?></td><td><code><?= e($c['password']) ?></code></td></tr><?php endforeach; ?>
  </table></div>
  <textarea id="created-text" hidden><?php foreach ($created as $c): ?><?= e($c['name'] . '　账号：' . $c['email'] . '　密码：' . $c['password'] . "\n") ?><?php endforeach; ?>登录地址：https://<?= e($_SERVER['HTTP_HOST'] ?? '') ?>/login</textarea>
</div>
<?php endif; ?>

<div class="stats">
  <a class="stat" href="<?= $link(['status' => '', 'role' => '']) ?>"><b><?= $counts['all'] ?></b><span>全部用户</span></a>
  <a class="stat" href="<?= $link(['status' => 'pending']) ?>"><b<?= $counts['pending'] ? ' style="color:var(--warn)"' : '' ?>><?= $counts['pending'] ?></b><span>待审核</span></a>
  <a class="stat" href="<?= $link(['status' => 'disabled']) ?>"><b><?= $counts['disabled'] ?></b><span>已停用</span></a>
  <div class="stat"><b><?= $counts['active_month'] ?></b><span>本月使用过 AI 的人</span></div>
  <div class="stat"><b><?= $counts['calls_month'] ?></b><span>本月 AI 调用次数</span></div>
</div>

<div class="card">
  <form class="filters u-filters" method="get" action="/admin/users">
    <input name="q" value="<?= e($q) ?>" placeholder="搜索姓名、邮箱、备注">
    <select name="status" onchange="this.form.submit()"><option value="">全部状态</option><?php foreach (Users::STATUS as $k => $v): ?><option value="<?= $k ?>" <?= $status === $k ? 'selected' : '' ?>><?= $v ?></option><?php endforeach; ?></select>
    <select name="role" onchange="this.form.submit()"><option value="">全部角色</option><option value="teacher" <?= $role === 'teacher' ? 'selected' : '' ?>>教师</option><option value="admin" <?= $role === 'admin' ? 'selected' : '' ?>>管理员</option></select>
    <button class="btn ghost sm"><?= ico('search') ?> 查找</button>
    <?php if ($q !== '' || $role !== '' || $status !== ''): ?><a class="link small" href="/admin/users">清除筛选</a><?php endif; ?>
    <span class="muted small" style="margin-left:auto">共 <?= $total ?> 人</span>
  </form>

  <form method="post" action="/admin/users/bulk" id="bulk-form"><?= csrf_field() ?><input type="hidden" name="back" value="<?= e($back) ?>">
  <div class="bulk-bar" id="bulk-bar" hidden>
    <span>已选 <b id="bulk-n">0</b> 人</span>
    <button class="btn ghost sm" name="act" value="approve">通过审核</button>
    <button class="btn ghost sm" name="act" value="enable">启用</button>
    <button class="btn ghost sm" name="act" value="disable" data-confirm="停用选中的账号？停用后对方无法登录，数据保留。">停用</button>
    <span class="bulk-q"><input name="quota" type="number" min="0" placeholder="每月次数" style="width:96px"><button class="btn ghost sm" name="act" value="quota">设置额度</button></span>
  </div>
  <?php if (!$rows): ?><p class="empty muted">没有符合条件的用户。</p><?php else: ?>
  <div class="scroll-x"><table class="tbl u-tbl">
    <tr><th style="width:28px"><input type="checkbox" id="chk-all" aria-label="全选"></th><th>用户</th><th>状态</th><th>学校 / 备注</th><th class="num">课程 · 课件 · 资料</th><th>本月 AI</th><th>最近登录</th><th></th></tr>
    <?php foreach ($rows as $u): $used = (int)$u['calls']; $qt = (int)$u['quota']; $pct = $qt ? min(100, round($used * 100 / $qt)) : 0; ?>
    <tr class="<?= $u['status'] !== 'active' ? 'u-' . $u['status'] : '' ?>">
      <td><?php if ((int)$u['id'] !== $meId): ?><input type="checkbox" name="ids[]" value="<?= $u['id'] ?>" class="chk"><?php endif; ?></td>
      <td><a class="u-name" href="/admin/users/<?= $u['id'] ?>"><span class="me-av sm"><?= e(mb_substr($u['name'], 0, 1)) ?></span><span><b><?= e($u['name']) ?></b><?= $u['role'] === 'admin' ? ' <span class="pill">管理员</span>' : '' ?><?= (int)$u['id'] === $meId ? ' <span class="pill">我</span>' : '' ?><br><small class="muted"><?= e($u['email']) ?></small></span></a></td>
      <td><span class="pill <?= $u['status'] === 'active' ? 'ok' : ($u['status'] === 'disabled' ? 'bad' : 'warn') ?>"><?= Users::STATUS[$u['status']] ?></span><?= $u['must_change'] ? '<br><small class="muted">未改初始密码</small>' : '' ?></td>
      <td class="small"><?= e($u['school'] ?: '') ?><?= $u['school'] && $u['note'] ? '<br>' : '' ?><span class="muted"><?= e($u['note']) ?></span><?= !$u['school'] && !$u['note'] ? '<span class="muted">—</span>' : '' ?></td>
      <td class="num small"><?= (int)$u['courses'] ?> · <?= (int)$u['decks'] ?> · <?= (int)$u['lib'] ?></td>
      <td class="small nowrap"><?= $used ?><span class="muted"> / <?= $qt ?: '不限' ?></span><?php if ($qt): ?><div class="u-bar"><i style="width:<?= $pct ?>%;<?= $pct >= 90 ? 'background:var(--err)' : '' ?>"></i></div><?php endif; ?></td>
      <td class="small muted nowrap" title="共登录 <?= (int)$u['login_count'] ?> 次"><?= $ago($u['last_login_at']) ?></td>
      <td class="right nowrap">
        <?php if ($u['status'] === 'pending'): ?>
          <button class="btn primary sm" form="st-<?= $u['id'] ?>" name="status" value="active">通过</button>
        <?php elseif ($u['status'] === 'disabled'): ?>
          <button class="link small" form="st-<?= $u['id'] ?>" name="status" value="active">启用</button>
        <?php elseif ((int)$u['id'] !== $meId): ?>
          <button class="link small danger-text" form="st-<?= $u['id'] ?>" name="status" value="disabled" data-confirm="停用「<?= e($u['name']) ?>」？对方将无法登录，课件和资料都会保留，随时可以再启用。">停用</button>
        <?php endif; ?>
        <a class="link small" href="/admin/users/<?= $u['id'] ?>">详情</a>
      </td>
    </tr>
    <?php endforeach; ?>
  </table></div>
  <?php endif; ?>
  </form>
  <?php foreach ($rows as $u): ?><form id="st-<?= $u['id'] ?>" method="post" action="/admin/users/<?= $u['id'] ?>/status" hidden><?= csrf_field() ?><input type="hidden" name="back" value="<?= e($back) ?>"></form><?php endforeach; ?>
  <?php if ($pages > 1): ?><div class="pager">
    <?php for ($i = 1; $i <= $pages; $i++): ?><a class="<?= $i === $page ? 'on' : '' ?>" href="<?= $link(['page' => $i > 1 ? (string)$i : '']) ?>"><?= $i ?></a><?php endfor; ?>
  </div><?php endif; ?>
</div>

<form method="post" action="/admin/users/register" class="card form" id="reg">
  <?= csrf_field() ?>
  <h3>注册与 AI 额度</h3>
  <div class="grid2">
    <div>
      <label class="switch"><input type="checkbox" name="allow_register" value="1" <?= $allowReg === '1' ? 'checked' : '' ?>><i></i> 允许老师自行注册</label>
      <p class="muted small">关闭时只能由管理员在这里添加账号。</p>
      <label class="switch"><input type="checkbox" name="register_review" value="1" <?= $review === '1' ? 'checked' : '' ?>><i></i> 注册后需要管理员审核</label>
      <p class="muted small">开启后，新注册的老师显示为「待审核」，通过后才能登录。</p>
      <label>邀请码 <small class="muted">（留空表示不需要）</small><input name="invite_code" value="<?= e($invite) ?>" maxlength="40"></label>
    </div>
    <div>
      <label>每位老师每月 AI 调用上限（次） <small class="muted">0 = 不限</small>
        <input name="ai_quota_default" type="number" min="0" value="<?= $quotaDefault ?>"></label>
      <p class="muted small">用于控制 API 费用。生成一份完整课件大约需要 8–12 次调用，一次修改通常 1–3 次。单个老师可在详情页单独设置；管理员不受限制。</p>
    </div>
  </div>
  <div class="actions"><button class="btn primary">保存</button></div>
</form>

<div class="modal-bg" id="dlg-add" hidden onclick="if(event.target===this)this.hidden=true">
  <form method="post" action="/admin/users" class="modal form">
    <?= csrf_field() ?><input type="hidden" name="back" value="<?= e($back) ?>">
    <h3>添加用户</h3>
    <label>姓名<input name="name" required maxlength="50"></label>
    <label>邮箱（登录账号）<input name="email" type="email" required></label>
    <label>学校 / 院系 / 备注 <small class="muted">选填</small><input name="note" maxlength="200" placeholder="例如：XX大学 护理学院"></label>
    <label>初始密码 <small class="muted">留空自动生成</small><input name="password" minlength="8" autocomplete="new-password"></label>
    <label>角色<select name="role"><option value="teacher">教师</option><option value="admin">管理员</option></select></label>
    <div class="actions"><button type="button" class="btn ghost" onclick="this.closest('.modal-bg').hidden=true">取消</button><button class="btn primary">创建</button></div>
  </form>
</div>

<div class="modal-bg" id="dlg-batch" hidden onclick="if(event.target===this)this.hidden=true">
  <form method="post" action="/admin/users/batch" class="modal form">
    <?= csrf_field() ?>
    <h3>批量添加老师</h3>
    <p class="muted small">从 Excel 复制或直接输入，每行一位：<b>姓名,邮箱</b>，可在后面加学校或院系。逗号、空格、Tab 分隔都可以。系统会为每人生成初始密码。</p>
    <textarea name="lines" rows="9" required placeholder="张三,zhangsan@xx.edu.cn,护理学院&#10;李四 lisi@xx.edu.cn&#10;王五	wangwu@xx.edu.cn	医学院"></textarea>
    <div class="actions"><button type="button" class="btn ghost" onclick="this.closest('.modal-bg').hidden=true">取消</button><button class="btn primary">添加</button></div>
  </form>
</div>

<script>
(function () {
  var all = document.getElementById('chk-all'), bar = document.getElementById('bulk-bar'), n = document.getElementById('bulk-n');
  function sync() {
    var c = document.querySelectorAll('.chk:checked').length;
    n.textContent = c; bar.hidden = c === 0;
  }
  if (all) all.addEventListener('change', function () { document.querySelectorAll('.chk').forEach(function (x) { x.checked = all.checked; }); sync(); });
  document.querySelectorAll('.chk').forEach(function (x) { x.addEventListener('change', sync); });
})();
function copyCreated() {
  var t = document.getElementById('created-text').value;
  (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('已复制，可以直接发给老师'); }, function () {
    var a = document.getElementById('created-text'); a.hidden = false; a.select(); document.execCommand('copy'); a.hidden = true; toast('已复制');
  });
}
</script>
