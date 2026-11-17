<!doctype html>
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
<title><?= isset($title) ? e($title) . ' · ' : '' ?>课件工作室</title>
<link rel="stylesheet" href="/assets/app.css?v=27">
<link rel="stylesheet" href="/assets/studio.css?v=27">
<script src="/assets/app.js?v=27"></script>
</head>
<body class="studio-body">
<?= $content ?>
<div id="busy" class="busy" hidden><div class="busy-box"><div class="spin"></div><div id="busy-msg">处理中…</div></div></div>
</body>
</html>
