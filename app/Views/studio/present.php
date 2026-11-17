<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<link rel="icon" href="/favicon.ico" sizes="any">
<title><?= e($P['title']) ?> · 上课</title>
<link rel="stylesheet" href="/assets/app.css?v=27">
<link rel="stylesheet" href="/assets/present.css?v=27">
<script src="/assets/app.js?v=27"></script>
</head>
<body class="pr-body">
<!-- 放映视图（投影屏幕） -->
<div class="pr-screen" id="screen">
  <div class="pr-stage"><div class="slide-preview pr-slide" id="cur"></div><div class="pr-ans" id="ans" hidden></div></div>
  <div class="pr-black" id="black" hidden></div>
  <div class="pr-bar" id="bar">
    <a class="pr-b" href="/studio/<?= (int)$P['id'] ?>" title="回到课件工作室"><?= ico('chevron-left') ?></a>
    <button class="pr-b" onclick="Pr.go(-1)" title="上一页（←）"><?= ico('arrow-left') ?></button>
    <span class="pr-pg" id="pg"></span>
    <button class="pr-b" onclick="Pr.go(1)" title="下一页（→ 或空格）"><?= ico('arrow-right') ?></button>
    <button class="pr-b" id="b-ans" onclick="Pr.answer()" title="显示答案（A）" hidden><?= ico('bulb') ?></button>
    <button class="pr-b" onclick="Pr.mode('presenter')" title="演讲者视图（P）：讲稿、计时、下一页"><?= ico('notes') ?></button>
    <button class="pr-b" onclick="Pr.full()" title="全屏（F）"><?= ico('maximize') ?></button>
    <button class="pr-b" onclick="Pr.help()" title="快捷键（?）">?</button>
  </div>
</div>

<!-- 演讲者视图（老师自己的电脑） -->
<div class="pr-pres" id="pres" hidden>
  <header class="pp-top">
    <a class="btn ghost sm" href="/studio/<?= (int)$P['id'] ?>"><?= ico('chevron-left') ?>工作室</a>
    <b class="pp-title"><?= e($P['title']) ?></b>
    <div class="pp-clock"><span id="t-el">00:00</span><small>已用时 / 课时 <?= (int)$P['minutes'] ?> 分钟</small></div>
    <div class="pp-pace" id="pace"></div>
    <div class="pp-act">
      <button class="btn ghost sm" onclick="Pr.timer()" id="b-timer"><?= ico('player-pause') ?>暂停计时</button>
      <button class="btn ghost sm" onclick="Pr.resetTimer()">重新计时</button>
      <button class="btn primary sm" onclick="Pr.screen()"><?= ico('device-desktop') ?>打开投影窗口</button>
      <button class="btn ghost sm" onclick="Pr.mode('screen')">只放映</button>
    </div>
  </header>
  <div class="pp-main">
    <section class="pp-cur">
      <div class="slide-preview" id="p-cur"></div>
      <div class="pp-nav">
        <button class="btn sm" onclick="Pr.go(-1)"><?= ico('arrow-left') ?>上一页</button>
        <span id="p-pg"></span>
        <button class="btn primary sm" onclick="Pr.go(1)">下一页<?= ico('arrow-right') ?></button>
        <button class="btn ghost sm" onclick="Pr.black()" title="B">黑屏</button>
        <button class="btn ghost sm" id="p-ans-b" onclick="Pr.answer()" hidden>在屏幕上显示答案</button>
      </div>
    </section>
    <aside class="pp-side">
      <div class="pp-next"><small>下一页</small><div class="slide-preview" id="p-next"></div></div>
      <div class="pp-notes"><div class="pp-nh"><b>讲稿</b><span class="muted small" id="p-min"></span><span class="pp-fs"><button onclick="Pr.font(-1)">A-</button><button onclick="Pr.font(1)">A+</button></span></div><div id="p-notes"></div></div>
    </aside>
  </div>
  <div class="pp-strip" id="p-strip"></div>
</div>

<script>window.PRESENT = <?= json_encode($P, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?>;</script>
<script src="/assets/template.js?v=27"></script>
<script src="/assets/diagram.js?v=22"></script>
<script src="/assets/deckkit.js?v=27"></script>
<script src="/assets/present.js?v=27"></script>
</body>
</html>
