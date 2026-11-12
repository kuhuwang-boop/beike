<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="备课工作台：上传平时的备课资料，由 AI 课件团队梳理教学思路、制作课件、设计课堂互动并核查内容，面向高校教师。">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/assets/brand/logo-small.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#3f7f73" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1b2022" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-title" content="备课工作台">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<title><?= e($title ?? '备课工作台') ?></title>
<link rel="stylesheet" href="/assets/app.css?v=26">
<link rel="stylesheet" href="/assets/site.css?v=22">
<script src="/assets/app.js?v=26"></script>
</head>
<body class="site-body">
<header class="site-nav">
  <div class="sn-in">
    <a class="brand" href="/about"><span class="mark"><img src="/assets/brand/logo.svg" alt=""></span><span>备课工作台</span></a>
    <nav class="sn-links">
      <a href="/about" class="<?= $page === 'about' ? 'on' : '' ?>">介绍</a>
      <a href="/manual" class="<?= $page === 'manual' ? 'on' : '' ?>">使用手册</a>
    </nav>
    <button class="sn-theme" onclick="toggleTheme()" aria-label="切换夜间模式"><?= ico('moon', 'th-moon') ?><?= ico('sun', 'th-sun') ?></button>
    <a class="btn primary sm sn-cta" href="<?= $logged ? '/' : '/login' ?>"><?= $logged ? '进入工作台' : '登录' ?></a>
  </div>
</header>
<main class="site-main"><?= $content ?></main>
<footer class="site-foot">
  <div class="sf-in">
    <div><a class="brand" href="/about"><span class="mark"><img src="/assets/brand/logo.svg" alt=""></span><span>备课工作台</span></a><p class="muted small">为高校教师设计的 AI 备课工具。AI 生成的内容请由授课教师审定后使用。</p></div>
    <div class="sf-links"><a href="/about">产品介绍</a><a href="/manual">使用手册</a><a href="/manual#faq">常见问题</a><a href="<?= $logged ? '/' : '/login' ?>"><?= $logged ? '进入工作台' : '登录' ?></a></div>
  </div>
  <p class="sf-credit muted small">结构图版式与多页规则改编自 <a href="https://github.com/5ang7iangai/pptx-compose-skill" target="_blank" rel="noopener">5ang7iangai/pptx-compose-skill</a>（MIT）；部分教学方法改编自 <a href="https://github.com/garethmanning/education-agent-skills" target="_blank" rel="noopener">garethmanning/education-agent-skills</a>（CC BY-SA 4.0）；课件导出使用 PptxGenJS，文档解析使用 pdf.js 与 JSZip。</p>
</footer>
</body>
</html>
