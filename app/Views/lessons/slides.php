<?php $title = '课件 · ' . $lesson['title']; ?>
<div class="page-head">
  <div>
    <div class="crumb"><a href="/courses/<?= $course['id'] ?>"><?= e($course['name']) ?></a> / <a href="/studio/<?= $lesson['id'] ?>">课件工作室</a> / 逐页编辑</div>
    <h1><?= e($lesson['title']) ?> · 课件</h1>
  </div>
  <div class="head-actions">
    <button class="btn ghost sty-btn" onclick="Deck.pickStyle()" title="选择课件样式或学校模板"><?= ico('palette') ?><span id="theme-n">样式</span></button>
    <a class="btn ghost" href="/studio/<?= $lesson['id'] ?>"><?= ico('chevron-left') ?>回工作室</a>
    <button class="btn ghost" onclick="Deck.save()"><?= ico('check') ?>保存</button>
    <button class="btn primary" onclick="Deck.exportPptx()"><?= ico('download') ?>导出 PPTX</button>
  </div>
</div>

<?php if (!$segCount): ?>
<div class="flash err">本课次的教案还没有教学环节。课件应以教案为依据——<a href="/lessons/<?= $lesson['id'] ?>">先去完成教案</a>。</div>
<?php endif; ?>

<div class="card gen-bar">
  <div class="gen-left">
    <label class="inline-label">页数约 <input type="number" id="pages" value="15" min="6" max="40" class="w-input"></label>
    <input id="slides-extra" placeholder="可选补充要求，如“多放案例”“每个概念配一个生活化类比”" class="grow">
  </div>
  <div class="gen-right">
    <button class="btn ai" onclick="Deck.aiGenerate(<?= $lesson['id'] ?>)"><?= ico('sparkles') ?>AI 依据教案生成课件</button>
    <button class="btn ghost" onclick="Deck.fromLesson(<?= $lesson['id'] ?>)">按教案结构生成骨架（不用 AI）</button>
  </div>
</div>

<div class="deck">
  <div class="deck-list card" id="deck-list"></div>
  <div class="deck-main">
    <div class="preview-wrap"><div class="slide-preview" id="preview"></div></div>
    <div class="card form" id="editor"></div>
  </div>
</div>

<script>
window.DECK_INIT = <?= json_encode(['lessonId' => (int)$lesson['id'], 'slides' => $slides, 'theme' => $theme, 'course' => $course['name'], 'title' => $lesson['title'], 'templates' => $templates, 'brand' => $brand, 'phases' => ['B' => '导入', 'O' => '目标', 'P1' => '课前小测', 'P2' => '讲授与活动', 'P3' => '课堂检测', 'S' => '总结']], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?>;
</script>
<script src="/assets/pptxgen.bundle.js"></script>
<script src="/assets/vendor/jszip.min.js"></script>
<script src="/assets/template.js?v=26"></script>
<script src="/assets/diagram.js?v=22"></script>
<script src="/assets/deckkit.js?v=26"></script>
<script src="/assets/slides.js?v=26"></script>
