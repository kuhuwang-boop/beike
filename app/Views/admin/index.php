<div class="page-head"><h1>系统设置</h1></div>
<div class="grid2">
  <form method="post" action="/admin/settings" class="card form">
    <?= csrf_field() ?>
    <h3>AI 模型</h3>
    <label>AI 团队默认使用
      <select name="ai_provider"><?php foreach ($providers as $k => $p): ?><option value="<?= $k ?>" <?= $provider === $k ? 'selected' : '' ?>><?= e($p['name']) ?></option><?php endforeach; ?></select>
    </label>
    <label class="switch-row"><input type="checkbox" name="ai_failover" value="1" <?= setting('ai_failover', '1') === '1' ? 'checked' : '' ?>> 某个模型出错（连不上、超时、限流、欠费）时，自动改用另一家已配置的模型重试</label>
    <div class="prov">
      <b>DeepSeek</b>
      <label>API Key <small class="muted">当前：<?= $masks['deepseek'] ? e($masks['deepseek']) : '未设置' ?>（留空不修改，填 - 清除）</small><input name="deepseek_key" type="password" autocomplete="off" placeholder="sk-..."></label>
      <label>模型<select name="deepseek_model"><?php foreach ($providers['deepseek']['models'] as $k => $v): ?><option value="<?= $k ?>" <?= $models['deepseek'] === $k ? 'selected' : '' ?>><?= e($v) ?></option><?php endforeach; ?></select></label>
      <button type="button" class="btn ghost sm" onclick="aiPing('deepseek')">测试 DeepSeek</button> <span id="ping-deepseek" class="small"></span>
    </div>
    <div class="prov">
      <b>通义千问（阿里云百炼）</b>
      <label>API Key <small class="muted">当前：<?= $masks['qwen'] ? e($masks['qwen']) : '未设置' ?>（留空不修改，填 - 清除）</small><input name="qwen_key" type="password" autocomplete="off" placeholder="sk-..."></label>
      <label>模型<select name="qwen_model"><?php foreach ($providers['qwen']['models'] as $k => $v): ?><option value="<?= $k ?>" <?= $models['qwen'] === $k ? 'selected' : '' ?>><?= e($v) ?></option><?php endforeach; ?></select></label>
      <label>接入地域<select name="qwen_base"><option value="">中国大陆（北京）</option><option value="https://dashscope-intl.aliyuncs.com/compatible-mode/v1" <?= strpos($qwenBase, 'intl') !== false ? 'selected' : '' ?>>国际（新加坡）</option></select></label>
      <button type="button" class="btn ghost sm" onclick="aiPing('qwen')">测试千问</button> <span id="ping-qwen" class="small"></span>
    </div>
    <div class="prov">
      <b>MiniMax（海螺）</b> <small class="muted">一个 Key 同时用于文字模型、H3 视频和 H3-Image 配图</small>
      <label>API Key <small class="muted">当前：<?= $masks['minimax'] ? e($masks['minimax']) : '未设置' ?>（留空不修改，填 - 清除）</small><input name="minimax_key" type="password" autocomplete="off" placeholder="sk-api-..."></label>
      <label>文字模型<select name="minimax_model"><?php foreach ($providers['minimax']['models'] as $k => $v): ?><option value="<?= $k ?>" <?= $models['minimax'] === $k ? 'selected' : '' ?>><?= e($v) ?></option><?php endforeach; ?></select></label>
      <label>接入站点<select name="minimax_host"><?php foreach (\App\Services\MiniMax::HOSTS as $k => $v): ?><option value="<?= $k ?>" <?= $mm['host'] === $k ? 'selected' : '' ?>><?= e($v) ?></option><?php endforeach; ?></select>
        <small class="muted">在 platform.minimaxi.com 申请的 Key 选国内站，在 minimax.io 申请的选国际站</small></label>
      <button type="button" class="btn ghost sm" onclick="aiPing('minimax')">测试 MiniMax</button> <span id="ping-minimax" class="small"></span>
    </div>
    <label class="switch-row"><input type="checkbox" name="cross_review" value="1" <?= setting('cross_review', '1') === '1' ? 'checked' : '' ?>> 交叉复核：质量督导核查完后，再请另一家模型独立复查一遍（需配置两家以上模型，会多一次调用）</label>
    <label>「质量督导」使用的模型
      <select name="review_provider">
        <option value="same" <?= $review === 'same' ? 'selected' : '' ?>>自动（用与课件设计师不同的模型）</option>
        <option value="deepseek" <?= $review === 'deepseek' ? 'selected' : '' ?>>DeepSeek</option>
        <option value="qwen" <?= $review === 'qwen' ? 'selected' : '' ?>>通义千问</option>
        <option value="minimax" <?= $review === 'minimax' ? 'selected' : '' ?>>MiniMax</option>
      </select>
      <small class="muted">建议选与团队不同的模型：由另一个模型来核查内容，更容易发现错误。</small>
    </label>

    <h3>课件配图</h3>
    <label>图片来源
      <select name="img_source">
        <?php foreach (['auto' => '自动（先搜真实照片，搜不到再用 AI 生成）', 'pexels' => '只用 Pexels 图库', 'pixabay' => '只用 Pixabay 图库', 'openverse' => '只用 Openverse（免 Key）', 'minimax' => '只用 MiniMax H3-Image AI 生成', 'wanx' => '只用通义万相 AI 生成', 'off' => '关闭自动配图'] as $k => $v): ?>
        <option value="<?= $k ?>" <?= $imgSource === $k ? 'selected' : '' ?>><?= e($v) ?></option><?php endforeach; ?>
      </select>
    </label>
    <label>Pexels API Key <small class="muted">免费申请：pexels.com/api　当前：<?= $masks['pexels'] ? e($masks['pexels']) : '未设置' ?></small><input name="pexels_key" type="password" autocomplete="off"></label>
    <label>Pixabay API Key <small class="muted">免费申请：pixabay.com/api/docs　当前：<?= $masks['pixabay'] ? e($masks['pixabay']) : '未设置' ?></small><input name="pixabay_key" type="password" autocomplete="off"></label>
    <label>AI 生图模型（MiniMax）<select name="minimax_image_model"><?php foreach (\App\Services\MiniMax::IMAGE_MODELS as $k => $v): ?><option value="<?= $k ?>" <?= $mm['imageModel'] === $k ? 'selected' : '' ?>><?= e($v) ?></option><?php endforeach; ?></select></label>
    <p class="muted small">AI 生图优先用 MiniMax H3-Image，没填 MiniMax Key 时用通义万相（使用上面的千问 Key）。图片会下载保存到本服务器，课件中注明来源。</p>

    <h3>AI 教学视频（MiniMax H3）</h3>
    <label class="switch-row"><input type="checkbox" name="video_on" value="1" <?= $mm['videoOn'] ? 'checked' : '' ?>> 允许老师在课件工作室生成教学短视频</label>
    <div class="row2">
      <label>视频模型<select name="video_model"><?php foreach (\App\Services\MiniMax::VIDEO_MODELS as $k => $v): ?><option value="<?= $k ?>" <?= $mm['videoModel'] === $k ? 'selected' : '' ?>><?= e($v) ?></option><?php endforeach; ?></select></label>
      <label>清晰度<select name="video_resolution"><?php foreach (['480P' => '480P（最省）', '768P' => '768P（推荐）', '2K' => '2K（仅 MiniMax-H3）'] as $k => $v): ?><option value="<?= $k ?>" <?= $mm['resolution'] === $k ? 'selected' : '' ?>><?= e($v) ?></option><?php endforeach; ?></select></label>
    </div>
    <label>每位老师每月可生成视频 <small class="muted">条；0 = 不限，管理员不受限制。视频按秒计费，官方价约 0.08 美元/秒，10 秒一条约 0.8 美元</small>
      <input name="video_quota_default" type="number" min="0" value="<?= (int)$mm['quota'] ?>"></label>
    <p class="muted small">本月已生成 <?= (int)$mm['monthCount'] ?> 条，共 <?= (int)$mm['monthSeconds'] ?> 秒。成片会下载保存到本服务器（平台链接 7 天内过期），可插入课件并随 PPT 一起导出。</p>

    <div class="actions"><button class="btn primary">保存设置</button></div>
  </form>

  <div class="card">
    <h3>近 30 天 AI 调用</h3>
    <?php if (!$usage): ?><p class="muted">暂无调用记录。</p><?php else: ?>
    <table class="tbl small"><tr><th>功能</th><th>次数</th><th>成功</th><th>输入 tokens</th><th>输出 tokens</th><th>平均耗时</th></tr>
    <?php $names = ['agent_leader' => '组长', 'agent_designer' => '教学设计师', 'agent_slides' => '课件设计师', 'agent_quiz' => '出题老师', 'agent_reviewer' => '学科审核', 'agent_illustrator' => '配图师', 'objectives' => '提取目标', 'lesson' => '教案草稿', 'review' => '督导评课', 'questions' => '出题', 'improve' => '改进建议', 'slides' => 'PPT 课件', 'ping' => '连接测试', 'video' => '教学视频', 'image' => 'AI 配图', 'video_prompt' => '视频脚本']; foreach ($usage as $u): ?>
      <tr><?php $pa = explode(':', $u['action'], 2); $an = $pa[1] ?? $pa[0]; ?><td><?= e(($names[$an] ?? $an) . (isset($pa[1]) ? '（' . (['qwen' => '千问', 'minimax' => 'MiniMax'][$pa[0]] ?? 'DeepSeek') . '）' : '')) ?></td><td><?= (int)$u['n'] ?></td><td><?= (int)$u['okn'] ?></td><td><?= number_format($u['pt']) ?></td><td><?= number_format($u['ct']) ?></td><td><?= round($u['ms'] / 1000, 1) ?>s</td></tr>
    <?php endforeach; ?></table>
    <?php endif; ?>
  </div>
</div>

<form method="post" action="/admin/team" class="card form" id="team">
  <?= csrf_field() ?>
  <div class="card-head"><h3>AI 课件团队</h3><span class="muted small">停用的成员不会被组长安排任务；每位成员可以用不同的模型，“额外要求”会附加到该成员的工作指令中</span></div>
  <div class="team-cfg">
  <?php foreach ($team as $k => $m): ?>
    <div class="tc-row">
      <span class="tc-av" style="background:<?= e($m['color']) ?>"><?= e($m['icon']) ?></span>
      <div class="tc-main">
        <div class="tc-top">
          <input name="name_<?= $k ?>" value="<?= e($m['name']) ?>" class="tc-name">
          <?php if (!empty($m['fixed'])): ?><span class="tag sm">必选</span><?php else: ?>
          <label class="switch"><input type="checkbox" name="en_<?= $k ?>" value="1" <?= $m['enabled'] ? 'checked' : '' ?>><i></i><span>启用</span></label><?php endif; ?>
        </div>
        <div class="muted small"><?= e($m['desc']) ?></div>
        <label class="tc-model">使用模型 <select name="model_<?= $k ?>"><option value="auto">自动<?= $k === 'reviewer' ? '（用与课件设计师不同的模型核查）' : '（跟随默认）' ?></option><?php foreach ($providers as $pk => $pv): ?><option value="<?= $pk ?>" <?= $m['model'] === $pk ? 'selected' : '' ?>><?= e($pv['name']) ?><?= empty($keys[$pk]) ? '（未配置）' : '' ?></option><?php endforeach; ?></select></label>
        <textarea name="extra_<?= $k ?>" rows="1" placeholder="额外要求（可选），例如：案例优先用医疗行业；讲稿语气活泼一些"><?= e($m['extra']) ?></textarea>
      </div>
    </div>
  <?php endforeach; ?>
  </div>
  <div class="actions"><button class="btn primary">保存团队设置</button><button class="btn ghost" name="reset" value="1" data-confirm="恢复所有成员的默认名称、启用状态和要求？">恢复默认</button></div>
</form>

<div class="card" id="skills">
  <div class="card-head"><h3>教学技能库</h3><span class="muted small">老师在课件工作室里为每节课最多选 4 种方法，AI 团队会按方法里的“具体做法”落实到课件、讲稿和练习中</span></div>
  <?php $skillForm = function ($s, $roles, $action) { ob_start(); $ag = array_filter(explode(',', (string)($s['agents'] ?? ''))); ?>
    <form method="post" action="<?= $action ?>" class="form skill-form"><?= csrf_field() ?>
      <div class="grid2">
        <label>名称<input name="name" value="<?= e($s['name'] ?? '') ?>" maxlength="60" required></label>
        <label>分类<input name="category" value="<?= e($s['category'] ?? '') ?>" maxlength="40" placeholder="如：提问与讨论"></label>
      </div>
      <label>一句话说明<input name="summary" value="<?= e($s['summary'] ?? '') ?>" maxlength="500"></label>
      <label>具体做法（给 AI 团队的要求）<textarea name="instructions" rows="4" required><?= e($s['instructions'] ?? '') ?></textarea></label>
      <div class="sk-agents"><span class="muted small">由谁落实：</span><?php foreach ($roles as $rk => $r): if ($rk === 'leader') continue; ?>
        <label class="chk"><input type="checkbox" name="agents[]" value="<?= $rk ?>" <?= in_array($rk, $ag, true) ? 'checked' : '' ?>><?= e($r['name']) ?></label><?php endforeach; ?></div>
      <div class="grid2">
        <label>研究依据<input name="evidence" value="<?= e($s['evidence'] ?? '') ?>" maxlength="300"></label>
        <label>来源 / 许可<input name="source" value="<?= e($s['source'] ?? '') ?>" maxlength="200" placeholder="来源"><input name="license" value="<?= e($s['license'] ?? '') ?>" maxlength="100" placeholder="许可证" style="margin-top:6px"></label>
      </div>
      <input type="hidden" name="enabled" value="<?= isset($s['enabled']) ? (int)$s['enabled'] : 1 ?>">
      <?php if (isset($s['id'])): ?><input type="hidden" name="sort" value="<?= (int)$s['sort'] ?>"><?php endif; ?>
      <div class="actions"><button class="btn primary sm"><?= isset($s['id']) ? '保存修改' : '添加' ?></button></div>
    </form>
  <?php return ob_get_clean(); }; ?>
  <?php if (!$skills): ?><p class="muted">技能库为空。部署脚本会自动导入内置方法；也可以在下面添加。</p><?php endif; ?>
  <div class="skill-list">
  <?php $cat = null; foreach ($skills as $s): if ($s['category'] !== $cat): $cat = $s['category']; ?><div class="sk-cat"><?= e($cat) ?></div><?php endif; ?>
    <details class="sk-item <?= $s['enabled'] ? '' : 'off' ?>">
      <summary><b><?= e($s['name']) ?></b><span class="muted small"><?= e($s['summary']) ?></span><?php if (!$s['enabled']): ?><span class="tag sm">已停用</span><?php endif; ?></summary>
      <div class="sk-body">
        <?php if ($s['source']): ?><p class="muted small">来源：<?= e($s['source']) ?><?= $s['license'] && $s['license'] !== '—' ? ' · ' . e($s['license']) : '' ?></p><?php endif; ?>
        <?= $skillForm($s, $roles, '/admin/skills/' . $s['id']) ?>
        <div class="actions">
          <form method="post" action="/admin/skills/<?= $s['id'] ?>" class="inline"><?= csrf_field() ?><input type="hidden" name="toggle" value="1"><button class="btn ghost sm"><?= $s['enabled'] ? '停用' : '启用' ?></button></form>
          <form method="post" action="/admin/skills/<?= $s['id'] ?>/delete" class="inline" data-confirm="删除教学方法「<?= e($s['name']) ?>」？已选用它的课件将不再使用。"><?= csrf_field() ?><button class="btn ghost sm danger-text">删除</button></form>
        </div>
      </div>
    </details>
  <?php endforeach; ?>
  </div>
  <details class="sk-add"><summary class="btn ghost sm"><?= ico('plus') ?>自己添加一种方法</summary><?= $skillForm([], $roles, '/admin/skills') ?></details>
  <details class="sk-add"><summary class="btn ghost sm"><?= ico('brand-github') ?>从 GitHub 导入（AI 自动改写成中文）</summary>
    <form method="post" action="/admin/skills/import" class="form" onsubmit="busy(true,'AI 正在阅读并改写…')"><?= csrf_field() ?>
      <label>GitHub 上 SKILL.md 的链接<input name="url" placeholder="https://github.com/garethmanning/education-agent-skills/blob/main/skills/.../SKILL.md"></label>
      <label>或直接粘贴说明文本<textarea name="text" rows="4" placeholder="支持英文，AI 会改写成适合中国高校课堂的做法"></textarea></label>
      <p class="muted small">可参考：<a href="https://github.com/garethmanning/education-agent-skills" target="_blank" rel="noopener">garethmanning/education-agent-skills</a>（CC BY-SA 4.0，165 项循证教学技能）。导入后请核对内容并保留来源与许可。</p>
      <div class="actions"><button class="btn primary sm">导入</button></div>
    </form>
  </details>
</div>

<div class="card">
  <div class="card-head"><h3>用户</h3><a class="btn primary sm" href="/admin/users"><?= ico('users') ?> 进入用户管理</a></div>
  <div class="u-kv">
    <div><small>全部用户</small><b><?= $ucount['all'] ?></b></div>
    <div><small>待审核</small><b<?= $ucount['pending'] ? ' style="color:var(--warn)"' : '' ?>><?= $ucount['pending'] ?></b></div>
    <div><small>已停用</small><b><?= $ucount['disabled'] ?></b></div>
    <div><small>本月用过 AI</small><b><?= $ucount['active_month'] ?> 人</b></div>
  </div>
  <p class="muted small">添加和批量导入老师、审核注册、停用账号、重置密码、设置每月 AI 额度，都在「用户管理」里。</p>
</div>

<div class="card" id="log">
  <div class="card-head"><h3>运行环境与错误日志</h3>
    <form method="post" action="/admin/log/clear" class="inline"><?= csrf_field() ?><button class="btn ghost sm">清空日志</button></form></div>
  <div class="env-grid"><?php foreach ($env as $k => $v): ?><div><small class="muted"><?= e($k) ?></small><b><?= e($v) ?></b></div><?php endforeach; ?></div>
  <?php if (!$errlog): ?><p class="muted small">没有错误记录。</p><?php else: ?>
  <pre class="logbox"><?php foreach ($errlog as $l): ?><?= e($l) . "\n" ?><?php endforeach; ?></pre>
  <?php endif; ?>
</div>
