<?php $f = flash(); ?><!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/assets/brand/logo-small.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#3f7f73" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1b2022" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-title" content="备课工作台">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<title>备课工作台</title>
<link rel="stylesheet" href="/assets/app.css?v=26">
<script src="/assets/app.js?v=26"></script>
</head>
<body class="auth-body">
<div class="auth-card">
  <div class="brand big"><span class="mark"><img src="/assets/brand/logo.svg" alt=""></span><span>备课工作台</span></div>
  <p class="muted">上传资料，AI 课件团队帮你做好一节课</p>
  <?php if ($f): ?><div class="flash <?= e($f['type']) ?>"><?= e($f['msg']) ?></div><?php endif; ?>
  <?= $content ?>
</div>
</body>
</html>
