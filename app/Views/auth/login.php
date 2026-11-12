<form method="post" action="/login" class="form">
  <?= csrf_field() ?>
  <label>邮箱<input type="email" name="email" required autofocus></label>
  <label>密码<input type="password" name="password" required></label>
  <button class="btn primary block">登录</button>
</form>
<?php if ($allowReg): ?><p class="muted center">还没有账号？<a href="/register">注册</a></p><?php endif; ?>
<p class="muted center small"><a href="/about">了解备课工作台</a> · <a href="/manual">使用手册</a></p>
