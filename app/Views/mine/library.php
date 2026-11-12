<div class="page-head">
  <div><h1>我的资料库</h1><p class="muted">把平时的讲义、旧课件、教案放在这里，上传一次，以后做任何课件都能直接选用。资料只属于你自己的账号。</p></div>
  <div class="head-actions"><label class="btn primary up-btn"><?= ico('upload') ?>上传资料<input type="file" id="lib-files" multiple accept=".docx,.pptx,.pdf,.txt,.md"></label></div>
</div>

<div class="card lib-bar">
  <form method="get" action="/library" class="lib-search"><input name="q" value="<?= e($q) ?>" placeholder="搜索资料名称、分类或内容"><button class="btn ghost"><?= ico('search') ?>搜索</button><?php if ($q !== ''): ?><a class="btn ghost" href="/library">清除</a><?php endif; ?></form>
  <label class="lib-folder">上传到分类<input id="lib-folder" list="lib-folders" placeholder="例如：数据结构（可留空）" maxlength="60"><datalist id="lib-folders"><?php foreach ($folders as $f): ?><option value="<?= e($f) ?>"><?php endforeach; ?></datalist></label>
</div>

<div class="drop lib-drop" id="lib-drop"><div class="drop-inner" onclick="document.getElementById('lib-files').click()"><i class="drop-ico"><?= ico('cloud-upload') ?></i><b>把资料拖到这里，或点击选择</b><span>支持 Word、PPT、PDF、TXT，可一次选多份。文件在浏览器里读成文字后保存，内容相同的不会重复。</span></div><div class="file-list" id="lib-progress"></div></div>

<?php if (!$items): ?>
  <div class="empty-soft"><?= $q !== '' ? '没有找到包含“' . e($q) . '”的资料。' : '资料库还是空的。上传几份你以前的课件或教案，AI 还能从中学习你的备课风格。' ?></div>
<?php else: ?>
<div class="card lib-list">
  <?php $cur = null; foreach ($items as $it): if ($it['folder'] !== $cur): $cur = $it['folder']; ?><div class="lib-cat"><?= ico('books') ?> <?= e($cur !== '' ? $cur : '未分类') ?></div><?php endif; ?>
  <div class="lib-row" data-id="<?= $it['id'] ?>" data-name="<?= e($it['filename']) ?>" data-folder="<?= e($it['folder']) ?>">
    <a href="#" class="lib-name" onclick="Lib.view(<?= $it['id'] ?>);return false"><?= ico('file-text') ?><span><?= e($it['filename']) ?></span></a>
    <span class="muted small nowrap"><?= number_format($it['chars']) ?> 字 · <?= e(substr($it['created_at'], 0, 10)) ?></span>
    <span class="lib-act">
      <button class="btn primary sm" onclick="Lib.make(this)" title="用这份资料新建一份课件"><?= ico('sparkles') ?>做课件</button>
      <button class="btn ghost sm" onclick="Lib.edit(this)"><?= ico('pencil') ?>改名 / 分类</button>
      <button class="btn ghost sm danger-text" onclick="Lib.del(this)"><?= ico('trash') ?>删除</button>
    </span>
  </div>
  <?php endforeach; ?>
</div>
<?php endif; ?>

<script src="/assets/vendor/jszip.min.js"></script>
<script src="/assets/vendor/pdf.min.js"></script>
<script src="/assets/extract.js?v=22"></script>
<script>
var Lib = (function () {
  var prog = document.getElementById('lib-progress');
  function upload(fileList) {
    var arr = Array.prototype.slice.call(fileList);
    if (!arr.length) return;
    var folder = document.getElementById('lib-folder').value.trim(), okN = 0, chain = Promise.resolve();
    prog.innerHTML = arr.map(function (f, i) { return '<div class="fchip" id="lp' + i + '"><span>' + esc(f.name) + '</span><small>等待中…</small></div>'; }).join('');
    arr.forEach(function (f, i) {
      chain = chain.then(function () {
        var el = document.getElementById('lp' + i), sm = el.querySelector('small');
        sm.textContent = '读取中…';
        return DocExtract.file(f).then(function (r) { return api('/library', { filename: f.name, content: r.text, folder: folder }, false); })
          .then(function () { okN++; sm.textContent = '已保存'; })
          .catch(function (e) { el.classList.add('bad'); sm.textContent = e.message; });
      });
    });
    chain.then(function () { if (okN) { toast('已保存 ' + okN + ' 份资料'); setTimeout(function () { location.reload(); }, okN === arr.length ? 600 : 2500); } });
  }
  document.getElementById('lib-files').addEventListener('change', function (e) { upload(e.target.files); e.target.value = ''; });
  var drop = document.getElementById('lib-drop');
  ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { upload(e.dataTransfer.files); });
  function row(btn) { return btn.closest('.lib-row'); }
  return {
    view: function (id) {
      fetch('/library/' + id, { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(function (r) { return r.json(); }).then(function (j) {
        uiModal({ title: j.filename, cls: 'wide', html: '<p class="ui-msg muted small">这是从文件里读到的文字，可以直接修改（比如删掉无关的页眉页脚）。</p><textarea class="lib-text" rows="16">' + esc(j.content) + '</textarea>',
          buttons: [{ text: '关闭', value: function () { return null; } }, { text: '保存修改', cls: 'primary', value: function (bg) { return bg.querySelector('.lib-text').value; } }] })
          .then(function (t) { if (t === null || t === j.content) return; api('/library/' + id, { content: t }, false).then(function () { toast('已保存'); location.reload(); }).catch(function (e) { toast(e.message, true); }); });
      });
    },
    edit: function (btn) {
      var r = row(btn);
      uiModal({ title: '改名 / 分类', html: '<label>名称<input class="ui-input le-n" value="' + esc(r.dataset.name) + '" maxlength="200"></label><label style="margin-top:8px;display:block">分类<input class="ui-input le-f" list="lib-folders" value="' + esc(r.dataset.folder) + '" maxlength="60" placeholder="可留空"></label>',
        buttons: [{ text: '取消', value: function () { return null; } }, { text: '保存', cls: 'primary', value: function (bg) { return { filename: bg.querySelector('.le-n').value, folder: bg.querySelector('.le-f').value }; } }] })
        .then(function (v) { if (!v) return; api('/library/' + r.dataset.id, v, false).then(function () { location.reload(); }).catch(function (e) { toast(e.message, true); }); });
    },
    del: function (btn) {
      var r = row(btn);
      uiConfirm('从资料库删除「' + r.dataset.name + '」？已经加入课件的副本不受影响。', { danger: true, ok: '删除' }).then(function (ok) {
        if (!ok) return;
        api('/library/' + r.dataset.id + '/delete', {}, false).then(function () { r.remove(); toast('已删除'); }).catch(function (e) { toast(e.message, true); });
      });
    },
    make: function (btn) {
      var r = row(btn), def = r.dataset.name.replace(/\.[a-z0-9]+$/i, '');
      uiPrompt('用这份资料做课件', '这节课的课题：', def, { ok: '开始制作' }).then(function (t) {
        if (!t || !t.trim()) return;
        api('/studio', { title: t.trim(), library: [+r.dataset.id] }, '正在创建课件…').then(function (j) { location.href = '/studio/' + j.id + '?auto=1'; }).catch(function (e) { toast(e.message, true); });
      });
    }
  };
})();
</script>
