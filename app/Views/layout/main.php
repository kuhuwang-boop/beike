<?php
use App\Core\Auth;
use App\Core\DB;
$me = Auth::user();
$path = '/' . trim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
$f = flash();
?><!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="csrf" content="<?= e(csrf_token()) ?>">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/assets/brand/logo-small.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#3f7f73" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1b2022" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-title" content="备课工作台">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<title><?= isset($title) ? e($title) . ' · ' : '' ?>备课工作台</title>
<link rel="stylesheet" href="/assets/app.css?v=26">
<link rel="stylesheet" href="/assets/studio.css?v=26">
<script src="/assets/app.js?v=26"></script>
</head>
<body>
<div class="shell">
  <aside class="side" id="side">
    <a class="brand" href="/"><span class="mark"><img src="/assets/brand/logo.svg" alt=""></span><span>备课工作台</span></a>
    <nav>
      <a href="/" class="<?= $path === '/' ? 'on' : '' ?>"><i class="ni"><?= ico('presentation') ?></i>课件工作室</a>
      <a href="/courses" class="<?= ($path === '/courses' || strpos($path, '/courses/') === 0 || strpos($path, '/lessons/') === 0 || strpos($path, '/papers/') === 0 || strpos($path, '/questions/') === 0) ? 'on' : '' ?>"><i class="ni"><?= ico('books') ?></i>课程与教案<small class="adv">进阶</small></a>
      <div class="nav-h">我的</div>
      <a href="/library" class="<?= $path === '/library' ? 'on' : '' ?>"><i class="ni"><?= ico('database') ?></i>我的资料库</a>
      <a href="/style" class="<?= $path === '/style' ? 'on' : '' ?>"><i class="ni"><?= ico('adjustments-horizontal') ?></i>我的备课风格</a>
      <a href="/brand" class="<?= $path === '/brand' ? 'on' : '' ?>"><i class="ni"><?= ico('school') ?></i>学校模板与校徽</a>
      <div class="nav-h">其他</div>
      <a href="/manual"><i class="ni"><?= ico('book-2') ?></i>使用手册</a>
      <?php if (Auth::isAdmin()): $pend = (int)\App\Core\DB::val("SELECT COUNT(*) FROM users WHERE status='pending'"); ?><a href="/admin/users" class="<?= strpos($path, '/admin/users') === 0 ? 'on' : '' ?>"><i class="ni"><?= ico('users') ?></i>用户管理<?= $pend ? '<small class="adv" style="background:var(--warn-bg);color:var(--warn)">' . $pend . '</small>' : '' ?></a><a href="/admin" class="<?= $path === '/admin' ? 'on' : '' ?>"><i class="ni"><?= ico('settings') ?></i>系统设置</a><?php endif; ?>
      <a href="/account" class="<?= $path === '/account' ? 'on' : '' ?>"><i class="ni"><?= ico('user-circle') ?></i>我的账号</a>
    </nav>
    <button class="theme-btn" onclick="toggleTheme()"><i><?= ico('moon', 'th-moon') ?><?= ico('sun', 'th-sun') ?></i><span class="theme-label">夜间模式</span></button>
    <form method="post" action="/logout" class="logout"><?= csrf_field() ?><span><?= e($me['name'] ?? '') ?></span><button class="link" title="退出登录"><?= ico('logout') ?> 退出</button></form>
  </aside>
  <main class="main">
    <div class="m-bar"><a class="brand" href="/"><span class="mark"><img src="/assets/brand/logo.svg" alt=""></span><span>备课工作台</span></a><button class="m-theme" onclick="toggleTheme()" aria-label="切换夜间模式"><?= ico('moon', 'th-moon') ?><?= ico('sun', 'th-sun') ?></button></div>
    <?php if ($f): ?><div class="flash <?= e($f['type']) ?>"><?= e($f['msg']) ?></div><?php endif; ?>
    <?= $content ?>
  </main>
</div>
<nav class="m-tabbar">
  <a href="/" class="<?= $path === '/' ? 'on' : '' ?>"><i><?= ico('presentation') ?></i>课件</a>
  <a href="/courses" class="<?= ($path === '/courses' || preg_match('#^/(courses|lessons|papers|questions)/#', $path)) ? 'on' : '' ?>"><i><?= ico('books') ?></i>课程</a>
  <a href="/manual"><i><?= ico('book-2') ?></i>手册</a>
  <a href="/account" class="<?= ($path === '/account' || strpos($path, '/admin') === 0) ? 'on' : '' ?>"><i><?= ico('user-circle') ?></i>我的</a>
</nav>
<div class="nav-mask" onclick="document.body.classList.remove('nav-open')"></div>
<div id="busy" class="busy" hidden><div class="busy-box"><div class="spin"></div><div id="busy-msg">AI 正在思考…</div><small>通常需要 20–90 秒</small></div></div>
</body>
</html>
