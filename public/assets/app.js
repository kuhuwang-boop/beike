/* 护眼主题：浅色 / 夜间，记住选择 */
(function () {
  var t = null;
  try { t = localStorage.getItem('beike-theme'); } catch (e) {}
  if (!t) t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
})();
function toggleTheme() {
  var t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('beike-theme', t); } catch (e) {}
  document.querySelectorAll('.theme-label').forEach(function (el) { el.textContent = t === 'dark' ? '浅色模式' : '夜间模式'; });
}
document.addEventListener('DOMContentLoaded', function () {
  var t = document.documentElement.getAttribute('data-theme');
  document.querySelectorAll('.theme-label').forEach(function (el) { el.textContent = t === 'dark' ? '浅色模式' : '夜间模式'; });
});
/* 备课工作台 前端脚本（无第三方依赖） */
var CSRF = (document.querySelector('meta[name=csrf]') || {}).content || '';

function ico(name, cls) { return '<svg class="ico' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="/assets/icons.svg?v=26#i-' + name + '"></use></svg>'; }
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

function busy(on, msg) {
  var b = document.getElementById('busy');
  if (!b) return;
  b.hidden = !on;
  if (msg) document.getElementById('busy-msg').textContent = msg;
}

function api(url, data, msg) {
  if (msg !== false) busy(true, msg || 'AI 正在思考…');
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-Token': CSRF },
    body: JSON.stringify(data || {}),
    credentials: 'same-origin'
  }).then(function (r) {
    return r.text().then(function (t) {
      var j;
      try { j = JSON.parse(t); } catch (e) { throw new Error(r.status === 504 ? 'AI 响应超时，请稍后重试' : '服务器返回异常（' + r.status + '）'); }
      if (!r.ok || j.error) throw new Error(j.error || ('请求失败 ' + r.status));
      return j;
    });
  }).finally(function () { if (msg !== false) busy(false); });
}

function evidenceHtml(list) {
  if (!list || !list.length) return '<div class="muted small">AI 没有给出大纲依据，请自行核对内容。</div>';
  return '<div class="evidence"><b>大纲依据核对：</b>' + list.map(function (e) {
    return '<div><span class="pill ' + (e.ok ? 'ok' : 'bad') + '">' + (e.ok ? '已核验' : '未在大纲中找到') + '</span> ' + esc(e.quote) + '</div>';
  }).join('') + '</div>';
}

/* ---------- 通用行编辑 ---------- */
function addRow(tableId, tplId) {
  var tpl = document.getElementById(tplId);
  var tb = document.querySelector('#' + tableId + ' tbody');
  tb.appendChild(tpl.content.cloneNode(true));
  return tb.lastElementChild;
}

function watchDirty(formId) {
  var f = document.getElementById(formId);
  if (!f) return;
  var dirty = false;
  f.addEventListener('input', function () { dirty = true; var d = document.getElementById('dirty'); if (d) d.textContent = '有未保存的修改'; });
  f.addEventListener('submit', function () { dirty = false; });
  window.addEventListener('beforeunload', function (e) { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  window.markDirty = function () { dirty = true; var d = document.getElementById('dirty'); if (d) d.textContent = 'AI 草稿已填入，尚未保存'; };
}

/* ---------- 课程目标 ---------- */
function updateWeightSum() {
  var s = 0;
  document.querySelectorAll('#obj-table .w-input').forEach(function (i) {
    var row = i.closest('tr'); var del = row.querySelector('input[name="o_del[]"]');
    if (!del || !del.checked) s += parseFloat(i.value) || 0;
  });
  var el = document.getElementById('wsum');
  if (el) { el.textContent = Math.round(s * 100) / 100; el.className = Math.abs(s - 100) > 0.01 ? 'bad' : 'good'; }
}
document.addEventListener('input', function (e) { if (e.target.classList && e.target.classList.contains('w-input')) updateWeightSum(); });
document.addEventListener('change', function (e) {
  if (e.target.name === 'o_del[]') updateWeightSum();
  if (e.target.classList && e.target.classList.contains('lv')) e.target.className = 'lv lv-' + e.target.value;
});

function aiObjectives(courseId) {
  api('/ai/objectives/' + courseId, {}, 'AI 正在阅读大纲、提取课程目标…').then(function (j) {
    if (!j.objectives.length) { toast('AI 没有提取到目标', true); return; }
    var existing = document.querySelectorAll('#obj-table tbody tr').length;
    return (existing ? uiConfirm('AI 提取了 ' + j.objectives.length + ' 条目标，将作为新行添加到表格末尾（不会覆盖已有目标）。') : Promise.resolve(true)).then(function (ok) {
    if (!ok) return;
    j.objectives.forEach(function (o) {
      var tr = addRow('obj-table', 'obj-row');
      tr.querySelector('[name="o_code[]"]').value = o.code || '';
      tr.querySelector('[name="o_content[]"]').value = o.content || '';
      tr.querySelector('[name="o_bloom[]"]').value = o.bloom;
      tr.querySelector('[name="o_weight[]"]').value = o.weight;
      tr.querySelector('.evi').innerHTML = '<span class="pill ' + (o.evidence_ok ? 'ok' : 'bad') + '">' + (o.evidence_ok ? '依据已核验' : '依据未在大纲中找到') + '</span> <span class="small muted">' + esc(o.evidence || '') + '</span>' + (o.grad_req ? ' <span class="small">→ 指标点 ' + esc(o.grad_req) + '</span>' : '');
    });
    updateWeightSum();
    toast('已填入表格，请修改后点“保存课程目标”');
    });
  }).catch(function (e) { toast(e.message, true); });
}

/* ---------- 教案 BOPPPS 环节 ---------- */
function sumMinutes() {
  var el = document.getElementById('time-sum');
  if (!el) return;
  var s = 0;
  document.querySelectorAll('#seg-table .mins').forEach(function (i) { s += parseInt(i.value, 10) || 0; });
  var d = parseInt((document.getElementById('f-duration') || {}).value, 10) || 0;
  el.textContent = '环节合计 ' + s + ' / ' + d + ' 分钟' + (s === d ? ' ✓' : (s > d ? '（超出 ' + (s - d) + '）' : '（还差 ' + (d - s) + '）'));
  el.className = 'time-sum ' + (s === d ? 'ok' : 'bad');
}
function addSeg(data) {
  var tr = addRow('seg-table', 'seg-tpl');
  if (data) {
    tr.querySelector('[name="seg_phase[]"]').value = data.phase;
    tr.querySelector('[name="seg_minutes[]"]').value = data.minutes;
    tr.querySelector('[name="seg_teacher[]"]').value = data.teacher_act || '';
    tr.querySelector('[name="seg_student[]"]').value = data.student_act || '';
    tr.querySelector('[name="seg_obj[]"]').value = data.objective_id || 0;
    tr.querySelector('[name="seg_assess[]"]').value = data.assess_method || '';
  }
  sumMinutes();
  return tr;
}
function moveSeg(btn, dir) {
  var tr = btn.closest('tr');
  if (dir < 0 && tr.previousElementSibling) tr.parentNode.insertBefore(tr, tr.previousElementSibling);
  if (dir > 0 && tr.nextElementSibling) tr.parentNode.insertBefore(tr.nextElementSibling, tr);
}
function boppsSkeleton() {
  var d = parseInt(document.getElementById('f-duration').value, 10) || 90;
  var plan = [['B', .06], ['O', .03], ['P1', .08], ['P2', .62], ['P3', .13], ['S', .08]];
  var used = 0;
  plan.forEach(function (p, i) {
    var m = i === plan.length - 1 ? d - used : Math.max(1, Math.round(d * p[1]));
    used += m;
    addSeg({ phase: p[0], minutes: m });
  });
}

function aiLesson(lessonId) {
  var objs = Array.prototype.map.call(document.querySelectorAll('input[name="objectives[]"]:checked'), function (c) { return c.value; });
  if (!objs.length) { toast('请先勾选本次课要达成的课程目标', true); return; }
  var hasContent = document.querySelectorAll('#seg-table tbody tr').length > 0;
  (hasContent ? uiConfirm('AI 草稿将替换当前的教学环节和重点难点等内容。保存之前都可以撤销：刷新页面即可。') : Promise.resolve(true)).then(function (ok) {
  if (!ok) return;
  api('/ai/lesson/' + lessonId, {
    objective_ids: objs,
    title: document.getElementById('f-title').value,
    duration: document.getElementById('f-duration').value,
    extra: document.getElementById('ai-extra').value
  }, 'AI 正在按逆向设计起草教案…').then(function (j) {
    Object.keys(j.fields).forEach(function (k) {
      var el = document.querySelector('#lesson-form [name="' + k + '"]');
      if (el && j.fields[k]) el.value = j.fields[k];
    });
    document.querySelector('#seg-table tbody').innerHTML = '';
    j.segments.forEach(function (s) { addSeg(s); });
    document.getElementById('ai-evidence').innerHTML = evidenceHtml(j.evidence) +
      (j.minutes_sum !== j.duration ? '<div class="flash err">注意：AI 给出的环节时长合计 ' + j.minutes_sum + ' 分钟，与课时 ' + j.duration + ' 分钟不符，请调整。</div>' : '');
    if (window.markDirty) window.markDirty();
    toast('草稿已填入，请修改后保存');
  }).catch(function (e) { toast(e.message, true); });
  });
}

function aiReview(lessonId) {
  var out = document.getElementById('review-out');
  api('/ai/review/' + lessonId, {}, 'AI 督导正在评课（基于已保存的教案）…').then(function (j) {
    var h = '<div class="ai-result"><p>' + (j.score ? '<span class="score-badge">' + esc(j.score) + '</span>' : '') + esc(j.overall || '') + '</p>';
    if (j.strengths && j.strengths.length) h += '<h4>优点</h4><ul>' + j.strengths.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>';
    if (j.issues && j.issues.length) h += '<h4>问题与修改建议</h4><ul>' + j.issues.map(function (s) { return '<li><b>' + esc(s.where || '') + '</b>：' + esc(s.problem || '') + '<br><span class="good">→ ' + esc(s.suggestion || '') + '</span></li>'; }).join('') + '</ul>';
    out.innerHTML = h + '<p class="muted small">AI 评课仅供参考，请结合左侧的程序检查和你自己的判断。</p></div>';
  }).catch(function (e) { toast(e.message, true); });
}

/* ---------- 题库 ---------- */
var AIQ = [];
function aiQuestions(courseId) {
  var out = document.getElementById('aiq-out');
  api('/ai/questions/' + courseId, {
    objective_id: document.getElementById('aiq-obj').value,
    bloom: document.getElementById('aiq-bloom').value,
    qtype: document.getElementById('aiq-type').value,
    count: document.getElementById('aiq-count').value,
    difficulty: document.getElementById('aiq-diff').value,
    extra: document.getElementById('aiq-extra').value
  }, 'AI 正在按目标和层级命题…').then(function (j) {
    AIQ = j.questions;
    out.innerHTML = AIQ.map(function (q, i) {
      var opts = Array.isArray(q.options) ? q.options.join('\n') : (q.options || '');
      return '<div class="aiq-item"><label><input type="checkbox" class="aiq-pick" data-i="' + i + '" checked> 第' + (i + 1) + '题 · ' + esc(q.score || 10) + '分 ' +
        '<span class="pill ' + (q.evidence_ok ? 'ok' : 'bad') + '" title="' + esc(q.evidence || '') + '">' + (q.evidence_ok ? '依据已核验' : '依据未在大纲中找到') + '</span></label>' +
        '<div class="q-stem">' + nl2br(q.stem) + '</div>' + (opts ? '<div class="q-opts">' + nl2br(opts) + '</div>' : '') +
        '<div class="q-ans"><b>答案：</b>' + nl2br(q.answer) + (q.analysis ? '<br><b>解析：</b>' + nl2br(q.analysis) : '') + '</div></div>';
    }).join('') + '<div class="actions"><button class="btn primary" onclick="saveAiQuestions(' + courseId + ')">将勾选的题目加入题库</button><span class="muted small">请逐题核对答案是否正确。</span></div>';
  }).catch(function (e) { toast(e.message, true); });
}
function saveAiQuestions(courseId) {
  var picked = Array.prototype.filter.call(document.querySelectorAll('.aiq-pick'), function (c) { return c.checked; }).map(function (c) { return AIQ[+c.dataset.i]; });
  if (!picked.length) { toast('没有勾选题目', true); return; }
  api('/courses/' + courseId + '/questions/batch', { questions: picked }, false).then(function (j) {
    toast('已加入 ' + j.saved + ' 道题');
    setTimeout(function () { location.reload(); }, 700);
  }).catch(function (e) { toast(e.message, true); });
}

/* ---------- 分析 ---------- */
function aiImprove(courseId) {
  var out = document.getElementById('improve-out');
  api('/ai/improve/' + courseId, {}, 'AI 正在分析达成度与试题数据…').then(function (j) {
    var h = '<div class="ai-result"><p>' + esc(j.summary || '') + '</p>';
    if (j.test_issues && j.test_issues.length) h += '<h4>试题本身的问题</h4><ul>' + j.test_issues.map(function (x) { return '<li><b>' + esc(x.item) + '</b>：' + esc(x.problem) + '<br><span class="good">→ ' + esc(x.fix) + '</span></li>'; }).join('') + '</ul>';
    if (j.teaching_actions && j.teaching_actions.length) h += '<h4>教学改进</h4><ul>' + j.teaching_actions.map(function (x) { return '<li><b>' + esc(x.objective) + '</b>（' + esc(x.lessons) + '）：' + esc(x.action) + '</li>'; }).join('') + '</ul>';
    out.innerHTML = h + '<p class="muted small">可以把相关建议复制到对应课次的“教学反思”中，下学期复制课程时会一起带过去。</p></div>';
  }).catch(function (e) { toast(e.message, true); });
}

function aiPing(p) {
  var o = document.getElementById('ping-' + p);
  o.textContent = '测试中…';
  api('/ai/ping', { provider: p }, false).then(function (j) { o.innerHTML = '<span class="good">✓ 连接正常（' + esc(j.model) + '）</span>'; })
    .catch(function (e) { o.innerHTML = '<span class="bad">' + esc(e.message) + '</span>'; });
}

/* ---------- 页面内对话框（替代浏览器自带的 alert / confirm / prompt） ---------- */
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
    var f = bg.querySelector('input,textarea'); if (f) setTimeout(function () { f.focus(); if (f.select) f.select(); }, 30);
  });
}
function uiConfirm(msg, opts) {
  opts = opts || {};
  return uiModal({ title: opts.title || '请确认', html: '<p class="ui-msg">' + nl2br(msg) + '</p>', cancelValue: false, enterIndex: 1,
    buttons: [{ text: '取消', value: function () { return false; } }, { text: opts.ok || '确定', cls: opts.danger ? 'danger' : 'primary', value: function () { return true; } }] });
}
function uiPrompt(title, label, value, opts) {
  opts = opts || {};
  return uiModal({ title: title, html: (label ? '<p class="ui-msg">' + esc(label) + '</p>' : '') + '<input class="ui-input" value="' + esc(value || '') + '" placeholder="' + esc(opts.placeholder || '') + '">', enterIndex: 1,
    buttons: [{ text: '取消', value: function () { return null; } }, { text: opts.ok || '确定', cls: 'primary', value: function (bg) { return bg.querySelector('.ui-input').value; } }] });
}
// 表单删除等危险操作：<form data-confirm="……"> 提交前统一用页面内对话框确认
document.addEventListener('submit', function (e) {
  var f = e.target;
  if (!f.dataset || !f.dataset.confirm || f.dataset.confirmed) return;
  e.preventDefault();
  var sub = e.submitter;
  uiConfirm(f.dataset.confirm, { danger: true, ok: f.dataset.ok || '确定' }).then(function (ok) {
    if (!ok) return;
    f.dataset.confirmed = '1';
    if (sub && sub.name) { var h = document.createElement('input'); h.type = 'hidden'; h.name = sub.name; h.value = sub.value; f.appendChild(h); }
    f.submit();
  });
}, true);
// 按钮上的 data-confirm（例如“恢复默认”）
document.addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('button[data-confirm],a[data-confirm]');
  if (!b || b.dataset.confirmed) return;
  e.preventDefault(); e.stopPropagation();
  uiConfirm(b.dataset.confirm, { danger: true }).then(function (ok) {
    if (!ok) return;
    b.dataset.confirmed = '1';
    if (b.tagName === 'A') { location.href = b.href; return; }
    var f = b.form; if (!f) return;
    if (b.name) { var h = document.createElement('input'); h.type = 'hidden'; h.name = b.name; h.value = b.value; f.appendChild(h); }
    f.dataset.confirmed = '1'; f.submit();
  });
}, true);
