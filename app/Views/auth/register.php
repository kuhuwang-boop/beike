<form method="post" action="/register" class="form">
  <?= csrf_field() ?>
  <label>姓名<input name="name" required></label>
  <label>学校 / 院系 <small class="muted">方便管理员审核</small><input name="school" maxlength="100" placeholder="例如：XX大学 护理学院"></label>
  <label>邮箱<input type="email" name="email" required></label>
  <label>密码（至少 8 位）<input type="password" name="password" minlength="8" required></label>
  <?php if (setting('invite_code', '') !== ''): ?><label>邀请码<input name="invite" required></label><?php endif; ?>
  <?php if (setting('register_review', '0') === '1'): ?><p class="muted small">注册后需要管理员审核，通过后即可登录。</p><?php endif; ?>
  <button class="btn primary block">注册</button>
</form>
<p class="muted center"><a href="/login">返回登录</a></p>
