/* 备课工作台（DSH 插件版）前端公共函数：主题、图标、对话框、提示、接口调用 */
var EMBED = (function () { try { return new URLSearchParams(location.search).get('embed') || ''; } catch (e) { return ''; } })();
(function () {
  var t = null;
  // 嵌在 DeepSeek Harness 侧边栏里时，跟随 DSH 的主题
  try { var q = new URLSearchParams(location.search).get('theme'); if (q === 'dark' || q === 'light') t = q; } catch (e) {}
  if (EMBED) document.documentElement.classList.add('bk-embed', 'bk-embed-' + EMBED);
  try { if (!t) t = localStorage.getItem('beike-theme'); } catch (e) {}
  if (!t) t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
})();
function toggleTheme() {
  var t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('beike-theme', t); } catch (e) {}
}

var BASE = window.BEIKE_BASE || '/beike';
function ico(name, cls) { return '<svg class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="' + BASE + '/assets/vendor/icons.svg#i-' + name + '"></use></svg>'; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function nl2br(s) { return esc(s).replace(/\n/g, '<br>'); }
function toast(msg, err) {
  var t = document.createElement('div');
  t.className = 'toast' + (err ? ' err' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(function () { t.remove(); }, err ? 6000 : 2600);
}

function uiModal(opt) {
  return new Promise(function (resolve) {
    var bg = document.createElement('div');
    bg.className = 'modal-bg ui-modal';
    bg.innerHTML = '<div class="modal ' + (opt.cls || '') + '" role="dialog" aria-modal="true">' +
      (opt.title ? '<h3>' + esc(opt.title) + '</h3>' : '') + '<div class="ui-body">' + (opt.html || '') + '</div>' +
      '<div class="actions right ui-actions">' + (opt.buttons || []).map(function (b, i) {
        return '<button type="button" class="btn ' + (b.cls || 'ghost') + '" data-i="' + i + '">' + (b.icon ? ico(b.icon) : '') + esc(b.text) + '</button>';
      }).join('') + '</div></div>';
    document.body.appendChild(bg);
    var done = function (v) { bg.classList.add('closing'); setTimeout(function () { bg.remove(); }, 120); document.removeEventListener('keydown', onKey); resolve(v); };
    var onKey = function (e) {
      if (e.key === 'Escape') done(opt.cancelValue === undefined ? null : opt.cancelValue);
      if (e.key === 'Enter' && opt.enterIndex !== undefined && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); done(opt.buttons[opt.enterIndex].value(bg)); }
    };
    document.addEventListener('keydown', onKey);
    bg.addEventListener('click', function (e) { if (e.target === bg) done(opt.cancelValue === undefined ? null : opt.cancelValue); });
    bg.querySelectorAll('.ui-actions button').forEach(function (btn) {
      btn.addEventListener('click', function () { var b = opt.buttons[+btn.dataset.i]; done(b.value ? b.value(bg) : null); });
    });
    if (opt.onOpen) opt.onOpen(bg, done);
    var f = bg.querySelector('input:not([type=file]),textarea'); if (f && !opt.noFocus) f.focus();
  });
}
function uiConfirm(msg, opts) {
  opts = opts || {};
  return uiModal({ title: opts.title || '请确认', html: '<p class="ui-msg">' + nl2br(msg) + '</p>', cancelValue: false, enterIndex: 1,
    buttons: [{ text: '取消', value: function () { return false; } }, { text: opts.ok || '确定', cls: opts.danger ? 'danger' : 'primary', value: function () { return true; } }] });
}

/** 调用插件接口：带自定义请求头，防止其他网站伪造请求 */
function api(path, opt) {
  opt = opt || {};
  var h = { 'X-Beike': '1', Accept: 'application/json' };
  var body = opt.body;
  if (body !== undefined && !(body instanceof Blob) && !(body instanceof ArrayBuffer) && typeof body !== 'string') { body = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
  return fetch(BASE + '/api' + path, { method: opt.method || (body !== undefined ? 'POST' : 'GET'), headers: h, body: body, credentials: 'same-origin' }).then(function (r) {
    return r.json().catch(function () { return { error: '服务器返回异常（' + r.status + '）' }; }).then(function (j) {
      if (!r.ok || j.error) throw new Error(j.error || ('请求失败 ' + r.status));
      return j;
    });
  });
}
