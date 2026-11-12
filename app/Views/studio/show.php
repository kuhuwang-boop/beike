<div class="st-top">
  <a href="/" class="st-back" title="返回"><?= ico('chevron-left') ?></a>
  <div class="st-title">
    <input id="t-title" value="<?= e($lesson['title']) ?>" title="点击修改课题" onchange="Studio.rename()">
    <span class="muted small"><span class="st-cname"><?= e($course['name']) ?> ·</span>
      <select id="t-min" onchange="Studio.rename()" class="inline-sel"><?php foreach ([30, 40, 45, 50, 60, 80, 90, 100, 120] as $m): ?><option value="<?= $m ?>" <?= (int)$lesson['duration_min'] === $m ? 'selected' : '' ?>><?= $m ?> 分钟</option><?php endforeach; ?><?php if (!in_array((int)$lesson['duration_min'], [30, 40, 45, 50, 60, 80, 90, 100, 120], true)): ?><option selected value="<?= (int)$lesson['duration_min'] ?>"><?= (int)$lesson['duration_min'] ?> 分钟</option><?php endif; ?></select>
      · <select id="t-type" onchange="Studio.setType(this.value)" class="inline-sel" title="课型：AI 团队会按课型组织课件"><option value="">课型</option><?php foreach (\App\Services\Style::TYPES as $k => $t): ?><option value="<?= $k ?>" <?= ($state['lessonType'] ?? '') === $k ? 'selected' : '' ?> title="<?= e($t[1]) ?>"><?= e($t[0]) ?></option><?php endforeach; ?></select>
    </span>
  </div>
  <div class="m-switch">
    <button class="on" data-pane="chat" onclick="Studio.pane('chat')"><?= ico('message-circle') ?> 对话</button>
    <button data-pane="stage" onclick="Studio.pane('stage')"><?= ico('presentation') ?> 课件<i id="pane-dot"></i></button>
    <button data-pane="tasks" onclick="Studio.pane('tasks')"><?= ico('users-group') ?> 任务<i id="task-dot"></i></button>
  </div>
  <div class="st-actions">
    <button class="btn ghost sm sty-btn" id="b-style" onclick="Studio.pickStyle()" title="选择课件样式或学校模板"><?= ico('palette') ?><span id="b-style-n">样式</span></button>
    <button class="btn ghost sm" id="btn-panel" onclick="Studio.togglePanel()" title="显示 / 隐藏 AI 团队面板"><?= ico('users-group') ?>团队</button>
    <button class="btn ghost sm" onclick="Studio.undo()" id="btn-undo" title="撤销 AI 或你的上一次修改"><?= ico('arrow-back-up') ?>撤销</button>
    <a class="btn ghost sm" href="/lessons/<?= $lesson['id'] ?>/slides"><?= ico('pencil') ?>逐页编辑</a>
    <div class="dropdown">
      <button class="btn ghost sm" onclick="this.parentNode.classList.toggle('open')">更多<?= ico('chevron-down') ?></button>
      <div class="menu">
        <a href="#" class="m-only" onclick="Studio.pickStyle();return false"><?= ico('palette') ?>样式与学校模板<em class="menu-cur" id="m-style-n"></em></a>
        <a href="#" class="m-only" onclick="Studio.undo();return false"><?= ico('arrow-back-up') ?>撤销上一次修改</a>
        <a href="/lessons/<?= $lesson['id'] ?>/slides" class="m-only"><?= ico('pencil') ?>逐页编辑</a>
        <a href="#" onclick="Studio.theme('__upload');return false"><?= ico('school') ?>上传学校 PPT 模板</a>
        <a href="/style"><?= ico('adjustments-horizontal') ?>我的备课风格与技能</a>
        <a href="/library"><?= ico('database') ?>我的资料库</a>
        <a href="#" onclick="toggleTheme();return false"><?= ico('moon') ?><span class="theme-label">夜间模式</span></a>
        <a href="/lessons/<?= $lesson['id'] ?>/word"><?= ico('file-word') ?>下载教案（Word）</a>
        <a href="/lessons/<?= $lesson['id'] ?>/print" target="_blank"><?= ico('printer') ?>打印教案 / 存 PDF</a>
        <a href="/lessons/<?= $lesson['id'] ?>"><?= ico('clipboard-list') ?>在进阶模式中编辑教案</a>
        <a href="#" onclick="Studio.clearChat();return false"><?= ico('message-circle') ?>清空对话记录</a>
        <form method="post" action="/studio/<?= $lesson['id'] ?>/delete" data-confirm="删除这份课件及其资料和对话？不可恢复。"><?= csrf_field() ?><button><?= ico('trash') ?>删除这份课件</button></form>
      </div>
    </div>
    <button class="btn primary sm dl-btn" onclick="Studio.download()"><?= ico('download') ?><span>下载 PPT</span></button>
  </div>
</div>

<div class="st-main pane-chat" id="st-main">
  <section class="chat">
    <div class="team-bar" id="team-bar">
      <?php foreach ($team as $k => $m): ?><span class="tm" data-agent="<?= $k ?>" title="<?= e($m['name'] . ' · ' . $m['title']) ?>"><i style="background:<?= e($m['color']) ?>"><?= e($m['icon']) ?></i><em><?= e($m['name']) ?></em></span><?php endforeach; ?>
    </div>
    <div class="msgs" id="msgs"></div>
    <div class="composer">
      <div class="mats" id="mats"></div>
      <div class="chips" id="chips"></div>
      <div class="focus-tag" id="focus-tag" hidden></div>
      <div class="input-row">
        <button class="icon-btn" title="上传资料（Word / PPT / PDF / TXT）" onclick="document.getElementById('f-up').click()"><?= ico('paperclip') ?></button>
        <input type="file" id="f-up" multiple accept=".docx,.pptx,.pdf,.txt,.md" hidden>
        <textarea id="say" rows="1" placeholder="告诉 AI 团队你想怎么做，例如：第5页字太多，精简一下"></textarea>
        <button class="send" id="send" onclick="Studio.send()"><?= ico('send') ?><span>发送</span></button>
      </div>
    </div>
  </section>

  <section class="stage">
    <div class="stage-tabs">
      <button class="on" data-tab="deck">课件</button>
      <button data-tab="plan">教学设计</button>
      <button data-tab="check">体检与改进 <b id="check-n"></b></button>
    </div>
    <div class="tab-pane" id="tab-deck">
      <div class="big-wrap"><div class="slide-preview" id="big"></div>
        <button class="nav-arrow l" onclick="Studio.go(-1)" aria-label="上一页"><?= ico('chevron-left') ?></button><button class="nav-arrow r" onclick="Studio.go(1)" aria-label="下一页"><?= ico('chevron-right') ?></button>
      </div>
      <div class="slide-tools">
        <span id="pg" class="muted"></span>
        <button class="btn ghost sm" onclick="Studio.focusCur()"><?= ico('focus-2') ?>只改这一页</button>
        <button class="btn ghost sm" onclick="Studio.imgPick()" id="b-img"><?= ico('photo') ?>配图</button>
        <?php if (\App\Services\MiniMax::videoOn()): ?><button class="btn ghost sm" onclick="Studio.video()" id="b-video" title="用 AI（MiniMax 海螺 H3）生成一段 4–15 秒的教学短视频"><?= ico('movie') ?>视频</button><?php endif; ?>
        <input type="file" id="img-up" accept="image/*" hidden>
        <a class="btn ghost sm" id="edit-this" href="#"><?= ico('pencil') ?>手动编辑</a>
      </div>
      <div class="notes-box" id="notes"></div>
      <div class="strip" id="strip"></div>
    </div>
    <div class="tab-pane" id="tab-plan" hidden></div>
    <div class="tab-pane" id="tab-check" hidden></div>
  </section>

  <aside class="teampanel" id="teampanel">
    <div class="tp-head"><b>AI 课件团队</b><span class="muted small" id="tp-sum"></span><button class="tp-x" onclick="Studio.togglePanel()" title="收起面板"><?= ico('layout-sidebar-right-collapse') ?></button></div>
    <div class="tp-body">
      <div class="tp-sec">成员状态</div>
      <div class="tp-members" id="tp-members"></div>
      <div class="tp-sec">本轮任务 <span id="tp-stop"></span></div>
      <div id="tp-run"></div>
      <div class="tp-sec" id="tp-hist-h">历史任务</div>
      <div id="tp-hist"></div>
    </div>
  </aside>
</div>

<script>
window.STUDIO = <?= json_encode([
    'id' => (int)$lesson['id'], 'title' => $lesson['title'], 'course' => $course['name'],
    'team' => $team, 'msgs' => $msgs, 'state' => $state, 'aiReady' => $aiReady,
], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP) ?>;
</script>
<script src="/assets/pptxgen.bundle.js"></script>
<script src="/assets/vendor/jszip.min.js"></script>
<script src="/assets/vendor/pdf.min.js"></script>
<script src="/assets/extract.js?v=22"></script>
<script src="/assets/template.js?v=26"></script>
<script src="/assets/diagram.js?v=22"></script>
<script src="/assets/deckkit.js?v=26"></script>
<script src="/assets/studio.js?v=26"></script>
