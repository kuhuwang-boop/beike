<div class="page-head"><h1>我的账号</h1></div>
<div class="card narrow me-card">
  <div class="me-row"><span class="me-av"><?= e(mb_substr($user['name'], 0, 1)) ?></span><div><b><?= e($user['name']) ?></b><div class="muted small"><?= e($user['email']) ?></div></div></div>
  <?php $q = \App\Services\Users::quotaOf($user['id']); $used = \App\Services\Users::monthCalls($user['id']); ?>
  <p class="muted small" style="padding:0 20px">本月已使用 AI <?= $used ?> 次<?= $q ? '，额度 ' . $q . ' 次（每月 1 日恢复）' : '' ?></p>
  <div class="me-links">
    <button onclick="toggleTheme()"><span><?= ico('moon', 'th-moon') ?><?= ico('sun', 'th-sun') ?></span><span class="theme-label">夜间模式</span><em><?= ico('chevron-right') ?></em></button>
    <a href="/library"><span><?= ico('database') ?></span>我的资料库<em><?= ico('chevron-right') ?></em></a>
    <a href="/style"><span><?= ico('adjustments-horizontal') ?></span>我的备课风格与技能<em><?= ico('chevron-right') ?></em></a>
    <a href="/brand"><span><?= ico('school') ?></span>学校模板与校徽<em><?= ico('chevron-right') ?></em></a>
    <?php if (\App\Core\Auth::isAdmin()): ?><a href="/admin/users"><span><?= ico('users') ?></span>用户管理<em><?= ico('chevron-right') ?></em></a><a href="/admin"><span><?= ico('settings') ?></span>系统设置<em><?= ico('chevron-right') ?></em></a><?php endif; ?>
    <a href="/manual"><span><?= ico('book-2') ?></span>使用手册<em><?= ico('chevron-right') ?></em></a>
    <form method="post" action="/logout"><?= csrf_field() ?><button class="danger-text"><span><?= ico('logout') ?></span>退出登录<em><?= ico('chevron-right') ?></em></button></form>
  </div>
</div>
<form method="post" action="/account" class="card form narrow">
  <?= csrf_field() ?>
  <label>邮箱<input value="<?= e($user['email']) ?>" disabled></label>
  <label>姓名<input name="name" value="<?= e($user['name']) ?>"></label>
  <h3>修改密码（不改请留空）</h3>
  <label>原密码<input type="password" name="old_password"></label>
  <label>新密码（至少 8 位）<input type="password" name="new_password"></label>
  <button class="btn primary">保存</button>
</form>
