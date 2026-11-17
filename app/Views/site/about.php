<?php
$demo = [
    ['layout' => 'title', 'title' => '二叉树的遍历', 'subtitle' => '数据结构 · 第 5 章'],
    ['layout' => 'objectives', 'title' => '这节课结束时，你能够', 'bullets' => ['说出先序、中序、后序遍历的访问顺序', '手工写出任意一棵二叉树的三种遍历序列', '用递归实现三种遍历，并分析时间复杂度']],
    ['layout' => 'quiz', 'title' => '课前小测', 'question' => '对一棵二叉搜索树做哪种遍历，得到的结点序列一定是有序的？', 'options' => ['A. 先序遍历', 'B. 中序遍历', 'C. 后序遍历', 'D. 层次遍历']],
    ['layout' => 'two', 'title' => '递归与非递归，怎么选', 'left_title' => '递归实现', 'left' => ['代码短，和定义一一对应', '树很深时可能栈溢出'], 'right_title' => '非递归（显式栈）', 'right' => ['控制更灵活，可随时暂停', '容易写错，要画栈的变化']],
    ['layout' => 'bullets', 'title' => '案例：操作系统如何统计目录大小', 'bullets' => ['目录是一棵树，文件是叶子结点', '先算完所有子目录，再加到父目录上', '这正是后序遍历：左、右，最后根']],
    ['layout' => 'summary', 'title' => '小结', 'bullets' => ['三种遍历只差在“根”什么时候访问', '中序遍历二叉搜索树得到有序序列', '课后：用栈改写中序遍历（习题 5.3）']],
];
$flow = [['designer', '梳理学习目标和课堂流程'], ['slides', '按教学设计制作 12 页课件'], ['quiz', '加入课前小测和课堂检测'], ['illustrator', '为 4 页配上真实照片'], ['reviewer', '对照原资料核查内容']];
?>
<section class="ab-hero">
  <div class="ab-hero-text">
    <span class="eyebrow">为高校教师设计的 AI 备课工具</span>
    <h1>把平时的备课资料，<br>变成<em>一节好课</em></h1>
    <p class="lead">上传你的 Word、PPT 或 PDF，说一句想要什么。11 位分工明确的 AI 成员会梳理教学思路、制作课件、画结构图、设计课堂互动、写好讲稿，并对照你的资料逐条核查。</p>
    <div class="ab-cta">
      <a class="btn primary lg" href="<?= $logged ? '/' : '/login' ?>"><?= $logged ? '进入工作台' : '登录开始使用' ?> →</a>
      <a class="btn ghost lg" href="/manual">看使用手册</a>
    </div>
    <ul class="ab-proof">
      <li><b>约 5 分钟</b>得到第一版完整课件</li>
      <li><b>一句话</b>修改任意一页，随时撤销</li>
      <li><b>.pptx</b>下载后可在 PowerPoint / WPS 继续编辑</li>
    </ul>
  </div>
  <div class="ab-demo" aria-label="课件工作室示意">
    <div class="demo-win">
      <div class="demo-bar"><i></i><i></i><i></i><span>课件工作室 · 二叉树的遍历</span></div>
      <div class="demo-body">
        <div class="demo-stage"><div class="slide-preview" id="demo-slide"></div><div class="demo-dots" id="demo-dots"></div>
<div class="demo-chat"><span class="you">第 5 页换成一个操作系统里的真实例子</span><span class="ai"><i style="background:<?= e($team['case']['color']) ?>"><?= e($team['case']['icon']) ?></i>已改好第 5 页：用“统计目录大小”说明后序遍历，讲稿里补了提问话术。</span></div></div>
        <div class="demo-tasks">
          <div class="dt-h">AI 团队 · 本轮任务</div>
          <?php foreach ($flow as $i => $f): $m = $team[$f[0]]; ?>
          <div class="dt" data-i="<?= $i ?>"><span class="av" style="background:<?= e($m['color']) ?>"><?= e($m['icon']) ?></span><span class="dt-t"><b><?= e($m['name']) ?></b><small><?= e($f[1]) ?></small></span><span class="dt-s"></span></div>
          <?php endforeach; ?>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="ab-sec">
  <div class="sec-title"><span class="eyebrow">为什么做这个工具</span><h2>备课最费时间的，往往不是“想清楚讲什么”</h2></div>
  <div class="pain">
    <div class="pain-card"><h3>资料散，整理慢</h3><p class="was">讲义、旧课件、教材笔记分散在好几个文件里，每次都要重新拼。</p><p class="now">直接上传原始资料，团队先读完再动手，你的例题、数据和案例都会保留。</p></div>
    <div class="pain-card"><h3>做 PPT 占掉大半时间</h3><p class="was">排版、精简文字、找配图、写讲稿，一节课做下来要好几个小时。</p><p class="now">一页一个观点，细节放进讲稿；配图自动找真实照片；导出就是可编辑的 .pptx。</p></div>
    <div class="pain-card"><h3>担心 AI 胡编</h3><p class="was">通用聊天工具会编造数据和文献，还要逐句核对，反而更累。</p><p class="now">以你的资料为准，补充内容会标明；质量督导对照原文核查，课件体检用固定规则，不依赖 AI。</p></div>
  </div>
</section>

<section class="ab-sec">
  <div class="sec-title"><span class="eyebrow">三步上手</span><h2>不用学，打开就会</h2></div>
  <ol class="steps3">
    <li><span class="n">1</span><h3>写课题，放资料</h3><p>在首页写下这节课讲什么，把 Word / PPT / PDF 拖进来。没有资料也可以直接开始。</p></li>
    <li><span class="n">2</span><h3>AI 团队分工制作</h3><p>组长安排成员依次工作，右侧面板能看到谁在做什么、做到哪一步，可以随时停下。</p></li>
    <li><span class="n">3</span><h3>说一句就改，满意就下载</h3><p>“第 5 页字太多”“加一个行业案例”——直接在对话里说。下载 PPT 和 Word 教案。</p></li>
  </ol>
</section>

<section class="ab-sec">
  <div class="sec-title"><span class="eyebrow">因人而异</span><h2>越用越像你自己做的课</h2><p class="muted">每位老师的学生、讲法和要求都不一样。工作台记住你的习惯，AI 团队每次都按你的方式来。这些都只属于你自己的账号。</p></div>
  <div class="pain">
    <div class="pain-card"><h3><?= ico('database') ?> 我的资料库</h3><p class="now-plain">讲义、旧课件、教案上传一次，所有课件都能反复用。输入课题自动推荐相关资料，没加资料时 AI 也会按课题去资料库里找。</p></div>
    <div class="pain-card"><h3><?= ico('adjustments-horizontal') ?> 我的备课风格</h3><p class="now-plain">学生情况、语言风格、每页信息量、每节课必有的环节、不要做的事……填一次就行；也可以让 AI 读你的旧课件，总结出你的风格。</p></div>
    <div class="pain-card"><h3><?= ico('bulb') ?> 我的技能与课型</h3><p class="now-plain">把最看重的备课习惯写成自己的技能，新课件自动带上；新授课、复习课、习题课、实训课、研讨课、公开课各有各的结构。</p></div>
  </div>
</section>

<section class="ab-sec">
  <div class="sec-title"><span class="eyebrow">AI 课件团队</span><h2>11 位成员，像一个真正的备课组</h2><p class="muted">日常修改只派最相关的一两位；说“精品模式”或“公开课”，全员按顺序打磨。管理员可以给每位成员改名、停用或补充要求。</p></div>
  <div class="team-grid">
    <?php foreach ($team as $k => $m): ?>
    <div class="tg"><span class="av lg" style="background:<?= e($m['color']) ?>"><?= e($m['icon']) ?></span><div><b><?= e($m['name']) ?></b><small><?= e($m['title']) ?></small><p><?= e($m['desc']) ?></p></div></div>
    <?php endforeach; ?>
  </div>
</section>

<section class="ab-sec">
  <div class="sec-title"><span class="eyebrow">主要功能</span><h2>围绕“一节课”做深，而不是堆功能</h2></div>
  <div class="feat-grid">
    <div class="ft"><i><?= ico('message-circle') ?></i><h3>对话式修改</h3><p>用平常说话的方式提要求。选中某页点“只改这一页”，修改只针对那一页。</p></div>
    <div class="ft"><i><?= ico('arrow-back-up') ?></i><h3>每一步都能撤销</h3><p>AI 和你自己的每次修改都会保存版本，改坏了点一下就回到上一版。</p></div>
    <div class="ft"><i><?= ico('bulb') ?></i><h3>教学方法库</h3><p><?= $skillCount ?: 22 ?> 种有研究依据的方法：检索练习、样例渐退、铰链题、对分课堂、BOPPPS……选好后团队会落实到课件和讲稿。</p></div>
    <div class="ft"><i><?= ico('photo') ?></i><h3>真实配图</h3><p>从 Pexels、Pixabay、Openverse 等可商用图库搜真实照片；搜不到时用通义万相生成写实示意图，也可以上传自己的图。</p></div>
    <div class="ft"><i><?= ico('stethoscope') ?></i><h3>课件体检</h3><p>按固定规则检查页数与课时、每页文字量、互动环节和空白页，并列出相比原资料做了哪些调整。</p></div>
    <div class="ft"><i><?= ico('notes') ?></i><h3>讲稿、板书与教案</h3><p>每页都有授课讲稿和时间提示；教学设计、板书、作业一并生成，可下载 Word 教案或打印成 PDF。</p></div>
    <div class="ft"><i><?= ico('device-mobile') ?></i><h3>手机上也能用</h3><p>在路上想到一个点子，用手机打开就能改；对话、课件、任务三个面板一键切换。</p></div>
    <div class="ft"><i><?= ico('school') ?></i><h3>套用学校模板</h3><p>上传一次学校的 PPT 模板，背景、校徽、配色和标题位置自动套用到每一份课件。</p></div>
    <div class="ft"><i><?= ico('route') ?></i><h3>可编辑的结构图</h3><p>流程、闭环、时间轴、对照、金字塔、分类树等 13 种版式，导出后每个方块和箭头都能在 PowerPoint 里直接改。</p></div>
    <div class="ft"><i><?= ico('arrows-exchange') ?></i><h3>两种大模型</h3><p>支持 DeepSeek 和通义千问，可以让另一个模型担任质量督导，交叉核查。</p></div>
  </div>
</section>

<section class="ab-sec ab-trust">
  <div class="sec-title"><span class="eyebrow">结果靠得住吗</span><h2>不只靠 AI 自己说“没问题”</h2></div>
  <div class="trust">
    <div><h3>你的资料是依据</h3><p>团队必须以上传资料为准，不得编造数据、文献和人物言论；资料之外补充的内容要明确标注。</p></div>
    <div><h3>规则检查可复核</h3><p>课件体检、教案环节时长、目标与题目的对应关系都由程序按固定规则计算，同样的输入永远得到同样的结果。</p></div>
    <div><h3>大纲引文逐字核对</h3><p>在进阶模式里，AI 引用教学大纲的每一句话都会被逐字比对，找不到原文的会标红提醒。</p></div>
    <div><h3>跨模型督导</h3><p>可以让 DeepSeek 做课件、通义千问来审，减少同一个模型“自己检查自己”的盲区。</p></div>
    <div><h3>考试数据说话</h3><p>导入逐题成绩后自动计算难度、区分度、信度和课程目标达成度，用学生的实际表现检验教学设计。</p></div>
    <div><h3>最终由你审定</h3><p>所有内容都可以逐页手动编辑，下载后的 PPT 和 Word 完全可改。AI 是助手，课仍然是你的。</p></div>
  </div>
</section>

<section class="ab-sec">
  <div class="sec-title"><span class="eyebrow">进阶：课程与教案</span><h2>需要做课程认证时，完整的闭环也在</h2><p class="muted">按逆向设计（OBE）组织，适合专业认证、课程评估和教学竞赛。</p></div>
  <div class="chain-row">
    <?php foreach (['毕业要求指标点', '课程目标', 'BOPPPS 教案', '题库与组卷', '逐题成绩', '目标达成度', '持续改进'] as $i => $c): ?><span class="ch"><?= e($c) ?></span><?php if ($i < 6): ?><i>→</i><?php endif; ?><?php endforeach; ?>
  </div>
</section>

<section class="ab-final">
  <h2>下一节课，从一份旧讲义开始</h2>
  <p>打开工作台，写下课题，把资料拖进去。</p>
  <div class="ab-cta center"><a class="btn primary lg" href="<?= $logged ? '/' : '/login' ?>"><?= $logged ? '进入工作台' : '登录开始使用' ?> →</a><a class="btn ghost lg" href="/manual">使用手册</a></div>
</section>

<script src="/assets/diagram.js?v=22"></script>
<script src="/assets/deckkit.js?v=27"></script>
<script>
(function () {
  var deck = <?= json_encode($demo, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG) ?>;
  var themes = ['blue', 'blue', 'blue', 'blue', 'blue', 'blue'];
  var box = document.getElementById('demo-slide'), dots = document.getElementById('demo-dots'), i = 0, timer;
  dots.innerHTML = deck.map(function (_, k) { return '<button aria-label="第' + (k + 1) + '页" data-k="' + k + '"></button>'; }).join('');
  function show(k) {
    i = (k + deck.length) % deck.length;
    box.innerHTML = DeckKit.preview(deck[i], i, themes[i], '数据结构');
    dots.querySelectorAll('button').forEach(function (b, n) { b.classList.toggle('on', n === i); });
  }
  dots.addEventListener('click', function (e) { if (e.target.dataset.k) { show(+e.target.dataset.k); clearInterval(timer); } });
  show(0);
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduce) timer = setInterval(function () { show(i + 1); }, 3200);
  // 任务面板：逐个完成
  var rows = document.querySelectorAll('.dt'), step = 0;
  function tick() {
    rows.forEach(function (r, n) { r.className = 'dt ' + (n < step ? 'done' : n === step ? 'run' : ''); r.querySelector('.dt-s').textContent = n < step ? '完成' : n === step ? '进行中' : '等待'; });
    step = step >= rows.length ? 0 : step + 1;
  }
  tick(); if (!reduce) setInterval(tick, 1600); else { step = rows.length; tick(); }
})();
</script>
