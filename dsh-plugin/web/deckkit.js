/* 课件渲染与导出（工作室和编辑器共用） */
(function () {
  var THEMES = {
    blue: { name: '学院蓝', g: '经典', bg: 'FFFFFF', primary: '1E3A8A', accent: 'F97316', text: '1F2937', soft: 'EEF2FF', cover: '1E3A8A', coverText: 'FFFFFF' },
    green: { name: '松石绿', g: '经典', bg: 'FFFFFF', primary: '0F766E', accent: 'D97706', text: '1F2937', soft: 'E6F6F3', cover: '0F766E', coverText: 'FFFFFF' },
    red: { name: '中国红', g: '经典', bg: 'FFFDF9', primary: '9E2A1C', accent: 'C8962E', text: '2A1F1C', soft: 'FBEDE8', cover: '9E2A1C', coverText: 'FFF7EC' },
    ink: { name: '水墨灰', g: '经典', bg: 'F7F6F2', primary: '2F3640', accent: '8C2F1E', text: '2F3640', soft: 'ECEAE3', cover: '2F3640', coverText: 'F7F6F2' },
    navy: { name: '藏青', g: '经典', bg: 'FFFFFF', primary: '1F2F4F', accent: 'B08A1E', text: '1E2430', soft: 'EEF1F6', cover: '1F2F4F', coverText: 'FFFFFF' },
    burgundy: { name: '酒红', g: '经典', bg: 'FFFDFB', primary: '7A1F2B', accent: 'B8873B', text: '2B1E20', soft: 'F6ECEC', cover: '7A1F2B', coverText: 'FFF8F0' },
    science: { name: '科技青', g: '学科', bg: 'FFFFFF', primary: '0E7490', accent: 'D97706', text: '1F2937', soft: 'E6F4F8', cover: '0E7490', coverText: 'FFFFFF' },
    medical: { name: '医学蓝绿', g: '学科', bg: 'FFFFFF', primary: '0D7C86', accent: 'E05D5D', text: '1E293B', soft: 'E7F5F5', cover: '0D7C86', coverText: 'FFFFFF' },
    law: { name: '法学棕', g: '学科', bg: 'FBF8F3', primary: '5B3A29', accent: 'B08D57', text: '2E241D', soft: 'F1EAE0', cover: '5B3A29', coverText: 'FFF8EE' },
    finance: { name: '金融金', g: '学科', bg: 'FFFFFF', primary: '14324F', accent: 'B08A3A', text: '1F2937', soft: 'F3EFE4', cover: '14324F', coverText: 'FFFFFF' },
    engineering: { name: '工程橙', g: '学科', bg: 'FFFFFF', primary: '334155', accent: 'EA580C', text: '1F2937', soft: 'F1F5F9', cover: '334155', coverText: 'FFFFFF' },
    agri: { name: '农林绿', g: '学科', bg: 'FBFCF7', primary: '3F6212', accent: 'CA8A04', text: '26301C', soft: 'EEF3E2', cover: '3F6212', coverText: 'FFFFFF' },
    daiqing: { name: '黛青', g: '中国色', bg: 'F7F8F6', primary: '2E4A55', accent: 'B5893A', text: '263238', soft: 'E8EEEE', cover: '2E4A55', coverText: 'F5F3EA' },
    zhusha: { name: '朱砂', g: '中国色', bg: 'FFFCF7', primary: 'B23A2B', accent: '3B6E5F', text: '2A1E1A', soft: 'F9ECE6', cover: 'B23A2B', coverText: 'FFF6EA' },
    tianqing: { name: '天青', g: '中国色', bg: 'F8FBFA', primary: '3E6E73', accent: 'C08A4A', text: '23312F', soft: 'E6F0EE', cover: '3E6E73', coverText: 'FFFFFF' },
    tenghuang: { name: '藤黄', g: '中国色', bg: 'FFFDF6', primary: '8A5A00', accent: '2F5D8A', text: '2B2416', soft: 'FBF2DC', cover: '8A5A00', coverText: 'FFFDF4' },
    dianlan: { name: '靛蓝', g: '中国色', bg: 'FAFAF8', primary: '22437A', accent: 'B8860B', text: '1F2633', soft: 'E9EDF5', cover: '22437A', coverText: 'FFFFFF' },
    mojin: { name: '墨金', g: '中国色', bg: 'F7F4EC', primary: '1C1C1C', accent: 'B08D3C', text: '222222', soft: 'ECE6D6', cover: '1C1C1C', coverText: 'E9D9A8' },
    mint: { name: '薄荷', g: '清新', bg: 'FFFFFF', primary: '2F7D6D', accent: 'E0703F', text: '233330', soft: 'E7F4F0', cover: '2F7D6D', coverText: 'FFFFFF' },
    coral: { name: '珊瑚', g: '清新', bg: 'FFFBFA', primary: 'B8473A', accent: '2B7A78', text: '2D2221', soft: 'FCEDE9', cover: 'B8473A', coverText: 'FFFFFF' },
    lavender: { name: '薰衣草', g: '清新', bg: 'FCFBFF', primary: '5B4B9A', accent: 'C98A1C', text: '2A2638', soft: 'EFECF8', cover: '5B4B9A', coverText: 'FFFFFF' },
    sky: { name: '晴空', g: '清新', bg: 'FFFFFF', primary: '2563EB', accent: 'D97706', text: '1E293B', soft: 'EAF1FE', cover: '2563EB', coverText: 'FFFFFF' },
    sand: { name: '沙丘', g: '清新', bg: 'FAF6EF', primary: '8B5E34', accent: '3E7C74', text: '2F261D', soft: 'F1E7D8', cover: '8B5E34', coverText: 'FFF9F0' },
    sakura: { name: '樱粉', g: '清新', bg: 'FFFAFB', primary: 'B03A62', accent: '4A7C8C', text: '2E2228', soft: 'FBEAF0', cover: 'B03A62', coverText: 'FFFFFF' },
    mono: { name: '极简黑白', g: '现代', bg: 'FFFFFF', primary: '111111', accent: 'E11D48', text: '1A1A1A', soft: 'F2F2F2', cover: '111111', coverText: 'FFFFFF' },
    slate: { name: '石板灰', g: '现代', bg: 'F8FAFC', primary: '334155', accent: '0EA5E9', text: '1E293B', soft: 'E8EDF3', cover: '1E293B', coverText: 'F8FAFC' },
    violet: { name: '科技紫', g: '现代', bg: 'FFFFFF', primary: '6D28D9', accent: 'D97706', text: '1F2937', soft: 'F1EAFE', cover: '4C1D95', coverText: 'FFFFFF' },
    emerald: { name: '翡翠', g: '现代', bg: 'FFFFFF', primary: '047857', accent: 'E11D48', text: '1F2937', soft: 'E6F5EF', cover: '064E3B', coverText: 'FFFFFF' },
    orange: { name: '活力橙', g: '现代', bg: 'FFFFFF', primary: 'C2410C', accent: '1D4ED8', text: '1F2937', soft: 'FFF0E6', cover: 'C2410C', coverText: 'FFFFFF' },
    magazine: { name: '杂志', g: '现代', bg: 'FFFDF8', primary: '1E1E1E', accent: 'D9480F', text: '1E1E1E', soft: 'F4EEE4', cover: 'C2410C', coverText: 'FFFFFF' },
    dark: { name: '深色', g: '深色', bg: '18212C', primary: '93C5FD', accent: 'F2A65A', text: 'E6EDF5', soft: '233140', cover: '0F1620', coverText: 'FFFFFF' },
    night: { name: '夜空蓝', g: '深色', bg: '0F172A', primary: '7DD3FC', accent: 'FBBF24', text: 'E2E8F0', soft: '1E293B', cover: '0B2447', coverText: 'FFFFFF' },
    forest: { name: '墨绿', g: '深色', bg: '12211C', primary: '6EE7B7', accent: 'F4B860', text: 'E3EFE9', soft: '1C3029', cover: '0F3B2C', coverText: 'F2FFF9' },
    wine: { name: '暗红', g: '深色', bg: '1E1416', primary: 'F28B82', accent: 'E9C46A', text: 'F1E6E6', soft: '2D1F22', cover: '4A1A22', coverText: 'FFF3F0' },
    graphite: { name: '石墨', g: '深色', bg: '1C1C1E', primary: 'E5E5EA', accent: '0A84FF', text: 'EDEDF0', soft: '2C2C2E', cover: '2C2C2E', coverText: 'FFFFFF' },
    purple: { name: '暗夜紫', g: '深色', bg: '17132A', primary: 'C4B5FD', accent: 'F9A8D4', text: 'ECE9F8', soft: '241E3E', cover: '33265E', coverText: 'FFFFFF' }
  };
  var LAYOUTS = { title: '封面', objectives: '学习目标', bullets: '要点', two: '左右对比', diagram: '结构图', quiz: '课堂提问', section: '章节过渡', summary: '小结', video: '教学视频' };
  var SW = 13.333, SH = 7.5;
  function dgBox(s) { var y = s.lead ? 2.05 : 1.75; return { x: 0.9, y: y, w: SW - 1.8, h: 6.8 - y }; }
  /* ---------- 教学视频页 ---------- */
  var VB = { x: 2.2, y: 1.5, w: 8.93, h: 5.02 };
  function fitBox(B) { var w = B.w, h = w * 9 / 16; if (h > B.h) { h = B.h; w = h * 16 / 9; } return { x: B.x + (B.w - w) / 2, y: B.y + (B.h - h) / 2, w: w, h: h }; }
  function boxPct(b) { return 'left:' + (b.x / SW * 100) + '%;top:' + (b.y / SH * 100) + '%;width:' + (b.w / SW * 100) + '%;height:' + (b.h / SH * 100) + '%;'; }
  function vidHtml(s, t, b, live) {
    var v = s.video || {}, st = v.status || 'queued';
    if (v.src) {
      return live ? '<video class="sp-vid" style="' + boxPct(b) + '" src="' + e(v.src) + '" controls playsinline preload="metadata"></video>'
        : '<div class="sp-vid" style="' + boxPct(b) + '"><video src="' + e(v.src) + '#t=0.5" muted playsinline preload="metadata"></video><i class="sp-play"></i></div>';
    }
    var msg = st === 'failed' ? '视频生成失败' + (v.error ? '：' + e(v.error) : '') : '视频生成中…一般需要 1–5 分钟，可以先做别的';
    return '<div class="sp-vid wait' + (st === 'failed' ? ' bad' : '') + '" style="' + boxPct(b) + 'background:' + c(t.soft) + ';color:' + c(t.text) + '"><span>' + msg + '</span></div>';
  }
  var POSTERS = {};
  /* 导出前给每段视频截一张封面（PPT 里视频未播放时显示） */
  function prepVideos(slides) {
    var srcs = [];
    slides.forEach(function (s) { if (s.layout === 'video' && s.video && s.video.src && !POSTERS[s.video.src] && srcs.indexOf(s.video.src) < 0) srcs.push(s.video.src); });
    return Promise.all(srcs.map(function (src) {
      return new Promise(function (ok) {
        var v = document.createElement('video'), done = false;
        var fin = function (d) { if (done) return; done = true; if (d) POSTERS[src] = d; v.removeAttribute('src'); ok(); };
        setTimeout(function () { fin(null); }, 10000);
        v.muted = true; v.preload = 'auto'; v.playsInline = true;
        v.onloadeddata = function () { try { v.currentTime = Math.min(0.6, (v.duration || 1) / 2); } catch (x) { fin(null); } };
        v.onseeked = function () {
          try { var cv = document.createElement('canvas'); cv.width = 1280; cv.height = Math.round(1280 * (v.videoHeight || 720) / (v.videoWidth || 1280)); cv.getContext('2d').drawImage(v, 0, 0, cv.width, cv.height); fin(cv.toDataURL('image/jpeg', 0.85)); } catch (x) { fin(null); }
        };
        v.onerror = function () { fin(null); };
        v.src = absUrl(src);
      });
    }));
  }
  function vidPptx(sl, p, s, t, b, F) {
    var v = s.video || {};
    if (v.src) {
      var o = { type: 'video', path: absUrl(v.src), x: b.x, y: b.y, w: b.w, h: b.h };
      if (POSTERS[v.src]) o.cover = POSTERS[v.src];
      sl.addMedia(o);
    } else {
      sl.addShape(p.ShapeType.roundRect, { x: b.x, y: b.y, w: b.w, h: b.h, fill: { color: t.soft }, line: { color: t.soft }, rectRadius: 0.12 });
      sl.addText(v.status === 'failed' ? '视频生成失败，请在课件工作室重新生成' : '视频还在生成中，完成后重新导出即可带上视频', { x: b.x, y: b.y, w: b.w, h: b.h, align: 'center', valign: 'middle', fontSize: 16, color: t.text, fontFace: F || FONT });
    }
  }
  var PHASES = { B: '导入', O: '目标', P1: '课前小测', P2: '讲授与活动', P3: '课堂检测', S: '总结' };
  var FONT = 'Microsoft YaHei';

  function e(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function lines(a) { return (a || []).filter(function (x) { return String(x).trim() !== ''; }); }
  function c(h) { return '#' + h; }
  /* ---------- 学校模板 ---------- */
  var TPL = {};
  function mixc(a, b, k) { var x = [0, 2, 4].map(function (i) { return parseInt(a.substr(i, 2), 16); }), y = [0, 2, 4].map(function (i) { return parseInt(b.substr(i, 2), 16); }); return x.map(function (v, i) { v = Math.round(v * (1 - k) + y[i] * k); return (v < 16 ? '0' : '') + v.toString(16); }).join('').toUpperCase(); }
  function lumc(h) { return (0.299 * parseInt(h.substr(0, 2), 16) + 0.587 * parseInt(h.substr(2, 2), 16) + 0.114 * parseInt(h.substr(4, 2), 16)) / 255; }
  function addTemplates(list) { (list || []).forEach(function (x) { if (x && x.data && x.data.content) { TPL['tpl:' + x.id] = x; delete x._t; } }); }
  function tplTheme(T) {
    if (T._t) return T._t;
    var d = T.data, c = d.colors, tc = d.content.title.color;
    var titleColor = tc && Math.abs(lumc(tc) - lumc(c.bg)) > 0.35 ? tc : c.primary;
    T._t = { name: T.name, bg: c.bg, primary: c.primary, accent: c.accent, text: c.text, soft: mixc(c.primary, c.bg, 0.88), cover: c.coverBg, coverText: c.coverText, titleColor: titleColor, tpl: d };
    return T._t;
  }
  function th(name) { return TPL[name] ? tplTheme(TPL[name]) : (THEMES[name] || THEMES.blue); }
  /* ---------- 学校标志（Logo / 校徽 / 校名） ---------- */
  var BRAND = null;
  function setBrand(b) { BRAND = b && (b.logo || b.icon || b.name) ? b : null; }
  function brandOn(t) { if (!BRAND) return null; var p = BRAND.prefs || {}; if (t.tpl && !+p.on_template) return null; return p; }
  function logoSize(img, maxH, maxW) { var r = img.w && img.h ? img.w / img.h : 3, h = maxH, w = h * r; if (w > maxW) { w = maxW; h = w / r; } return { w: w, h: h }; }
  function iconSize(img, box) { var r = img.w && img.h ? img.w / img.h : 1; return r >= 1 ? { w: box, h: box / r } : { w: box * r, h: box }; }
  function courseText(course, t) { var p = brandOn(t); return p && +p.footer_name && BRAND.name ? BRAND.name + (course ? ' · ' + course : '') : course; }
  function brandHtml(s, t) {
    var p = brandOn(t), h = '', tpl = !!t.tpl;
    if (!p) return '';
    if (s.layout === 'title' && +p.cover_logo && BRAND.logo) {
      var L = logoSize(BRAND.logo, 0.62, 3.6), x = tpl ? 0.45 : 0.9, y = tpl ? 0.4 : 0.55;
      h += '<div class="bk-logo" style="left:' + pct(x - 0.12, SW) + ';top:' + pct(y - 0.1, SH) + ';width:' + pct(L.w + 0.24, SW) + ';height:' + pct(L.h + 0.2, SH) + '"><img alt="" src="' + e(BRAND.logo.src) + '"></div>';
    }
    if (s.layout !== 'title' && +p.corner_icon && BRAND.icon) {
      var I = iconSize(BRAND.icon, 0.6), ix = SW - (tpl ? 0.35 : 0.9) - I.w, iy = tpl ? 0.3 : 0.55;
      h += '<img class="bk-icon" alt="" src="' + e(BRAND.icon.src) + '" style="left:' + pct(ix, SW) + ';top:' + pct(iy, SH) + ';width:' + pct(I.w, SW) + ';height:' + pct(I.h, SH) + '">';
    }
    return h;
  }
  function brandPptx(sl, s, t) {
    var p = brandOn(t), tpl = !!t.tpl;
    if (!p) return;
    if (s.layout === 'title' && +p.cover_logo && BRAND.logo) {
      var L = logoSize(BRAND.logo, 0.62, 3.6), x = tpl ? 0.45 : 0.9, y = tpl ? 0.4 : 0.55;
      sl.addShape('roundRect', { x: x - 0.12, y: y - 0.1, w: L.w + 0.24, h: L.h + 0.2, fill: { color: 'FFFFFF' }, line: { type: 'none' }, rectRadius: 0.1 });
      sl.addImage(Object.assign({ x: x, y: y, w: L.w, h: L.h }, imgSrc(BRAND.logo.src)));
    }
    if (s.layout !== 'title' && +p.corner_icon && BRAND.icon) {
      var I = iconSize(BRAND.icon, 0.6);
      sl.addImage(Object.assign({ x: SW - (tpl ? 0.35 : 0.9) - I.w, y: tpl ? 0.3 : 0.55, w: I.w, h: I.h }, imgSrc(BRAND.icon.src)));
    }
  }
  function hasIcon(s, t) { var p = brandOn(t); return !!(p && +p.corner_icon && BRAND.icon && s.layout !== 'title'); }
  function fitPt(str, b, pt, min) { return window.DiagramKit ? DiagramKit.fit(str, b.w, b.h, pt, min || 14) : pt; }
  function pct(v, all) { return (v / all * 100).toFixed(3) + '%'; }
  function boxCss(b) { return 'left:' + pct(b.x, SW) + ';top:' + pct(b.y, SH) + ';width:' + pct(b.w, SW) + ';height:' + pct(b.h, SH) + ';'; }
  function cq(pt) { return (pt / (SW * 72) * 100).toFixed(3) + 'cqw'; }
  function tplRegion(s, t) {
    var B = t.tpl.content.body;
    if (s.layout === 'diagram') { var top = s.lead ? 0.62 : 0.05; return { lead: { x: B.x, y: B.y, w: B.w, h: 0.55 }, dg: { x: B.x + 0.05, y: B.y + top, w: B.w - 0.1, h: B.h - top } }; }
    return { body: B };
  }
  function decoHtml(L, bgColor) {
    var h = '<div class="tp-deco" style="background:#' + bgColor + '">';
    if (L.bg.img) h += '<div class="tp-bg" style="background-image:url(\'' + e(L.bg.img) + '\')"></div>';
    L.rects.forEach(function (r) { h += '<div class="tp-r" style="' + boxCss(r) + 'background:#' + r.fill + ';border-radius:' + (r.r ? cq(r.r * 72) : '0') + '"></div>'; });
    L.pics.forEach(function (p) { h += '<img class="tp-p" alt="" src="' + e(p.src) + '" style="' + boxCss(p) + '">'; });
    return h + '</div>';
  }
  function previewTpl(s, idx, t) {
    var d = t.tpl, cover = s.layout === 'title', L = cover ? d.cover : d.content;
    var h = '<div class="sp tpl" style="background:#' + (L.bg.color || t.bg) + '">' + decoHtml(L, L.bg.color || t.bg);
    var tt = function (str, b, pt, color, extra) { return '<div class="tp-t" style="' + boxCss(b) + 'font-size:' + cq(fitPt(str, b, pt)) + ';color:#' + color + ';' + (extra || '') + '">' + e(str) + '</div>'; };
    if (cover) {
      h += tt(s.title, d.cover.title, d.cover.title.size, t.coverText, 'font-weight:700');
      if (s.subtitle) h += tt(s.subtitle, d.cover.body, 18, t.coverText, 'opacity:.85');
      return h + '</div>';
    }
    var B = d.content.body;
    if (s.layout === 'section') {
      var mid = { x: B.x, y: B.y + B.h * 0.3, w: B.w, h: B.h * 0.25 };
      h += tt(s.title, mid, 36, t.titleColor, 'font-weight:700');
      if (s.subtitle) h += tt(s.subtitle, { x: B.x, y: mid.y + mid.h + 0.1, w: B.w, h: 0.7 }, 18, t.text, 'opacity:.8');
      return h + '<div class="tp-n" style="color:#' + t.text + '">' + (idx + 1) + '</div></div>';
    }
    h += tt(s.title, d.content.title, d.content.title.size, t.titleColor, 'font-weight:700');
    if (s.layout === 'video') return h + vidHtml(s, t, fitBox(B), LIVE) + '<div class="tp-n" style="color:#' + t.text + '">' + (idx + 1) + '</div></div>';
    var R = tplRegion(s, t);
    if (s.layout === 'diagram' && window.DiagramKit) {
      if (s.lead) h += tt(s.lead, R.lead, 15, t.text, 'opacity:.85');
      h += '<div class="dg">' + DiagramKit.toHtml(DiagramKit.build(s.diagram || {}, R.dg, t), SW, SH) + '</div>';
    } else {
      var img = s.image && s.image.src && ['bullets', 'objectives', 'summary'].indexOf(s.layout) >= 0 ? s.image : null;
      var bb = img ? { x: B.x, y: B.y, w: B.w * 0.6, h: B.h } : B;
      var ul = function (arr) { return '<ul style="color:#' + t.text + '">' + lines(arr).map(function (x) { return '<li>' + e(x) + '</li>'; }).join('') + '</ul>'; };
      var inner;
      if (s.layout === 'two') inner = '<div class="cols"><div class="col" style="background:#' + t.soft + '"><h3 style="color:#' + t.primary + '">' + e(s.left_title) + '</h3>' + ul(s.left) + '</div><div class="col" style="background:#' + t.soft + '"><h3 style="color:#' + t.accent + '">' + e(s.right_title) + '</h3>' + ul(s.right) + '</div></div>';
      else if (s.layout === 'quiz') inner = '<div class="q" style="color:#' + t.text + '">' + e(s.question) + '</div>' + lines(s.options).map(function (o) { return '<div class="opt" style="background:#' + t.soft + ';color:#' + t.text + '">' + e(o) + '</div>'; }).join('');
      else inner = ul(s.bullets);
      h += '<div class="tp-body" style="' + boxCss(bb) + '">' + inner + '</div>';
      if (img) h += '<div class="sp-img tp-img" style="' + boxCss({ x: B.x + B.w * 0.63, y: B.y, w: B.w * 0.37, h: B.h }) + 'background-image:url(\'' + e(img.src) + '\')"></div>';
    }
    return h + '<div class="tp-n" style="color:#' + t.text + '">' + (idx + 1) + '</div></div>';
  }

  var LIVE = false;
  function preview(s, idx, themeName, course, opts) {
    LIVE = !!(opts && opts.live);
    var t = th(themeName), html = t.tpl ? previewTpl(s, idx, t) : previewBase(s, idx, t, courseText(course, t));
    var ov = brandHtml(s, t);
    if (!ov) return html;
    if (hasIcon(s, t)) html = html.replace('class="sp', 'class="sp has-ic');
    return html.replace(/<\/div>$/, ov + '</div>');
  }
  function previewBase(s, idx, t, course) {
    var foot = '<div class="foot" style="color:' + c(t.text) + '"><span>' + e(course) + '</span><span>' + (idx + 1) + '</span></div>';
    var ul = function (arr) { return '<ul style="color:' + c(t.text) + '">' + lines(arr).map(function (b) { return '<li>' + e(b) + '</li>'; }).join('') + '</ul>'; };
    var h2 = '<h2 style="color:' + c(t.primary) + '">' + e(s.title) + '</h2>';
    var bar = '<div class="bar-top" style="background:' + c(t.primary) + '"></div>';
    var img = s.image && s.image.src && ['title', 'bullets', 'objectives', 'summary', 'section'].indexOf(s.layout) >= 0 ? s.image : null;
    if (s.layout === 'title' && img) {
      return '<div class="sp has-img" style="background:' + c(t.cover) + ';color:' + c(t.coverText) + '"><div class="cover" style="max-width:50%"><div style="width:8cqw;height:.8cqw;background:' + c(t.accent) + ';margin-bottom:3cqw;border-radius:1cqw"></div><h1>' + e(s.title) + '</h1><p>' + e(s.subtitle) + '</p></div><div class="sp-img full" style="background-image:url(\'' + e(img.src) + '\')"></div></div>';
    }
    if (s.layout === 'title') {
      return '<div class="sp" style="background:' + c(t.cover) + ';color:' + c(t.coverText) + '"><div class="cover"><div style="width:8cqw;height:.8cqw;background:' + c(t.accent) + ';margin-bottom:3cqw;border-radius:1cqw"></div><h1>' + e(s.title) + '</h1><p>' + e(s.subtitle) + '</p></div></div>';
    }
    if (s.layout === 'section' && img) {
      return '<div class="sp section has-img" style="background:' + c(t.soft) + '"><div class="sp-left"><div style="width:6cqw;height:.7cqw;background:' + c(t.accent) + ';margin-bottom:2cqw;border-radius:1cqw"></div><h2 style="color:' + c(t.primary) + '">' + e(s.title) + '</h2><p style="font-size:2.2cqw;color:' + c(t.text) + ';opacity:.75">' + e(s.subtitle) + '</p></div><div class="sp-img side" style="background-image:url(\'' + e(img.src) + '\')"></div>' + foot + '</div>';
    }
    if (s.layout === 'section') {
      return '<div class="sp section" style="background:' + c(t.soft) + '"><div style="width:6cqw;height:.7cqw;background:' + c(t.accent) + ';margin-bottom:2cqw;border-radius:1cqw"></div><h2 style="color:' + c(t.primary) + '">' + e(s.title) + '</h2><p style="font-size:2.2cqw;color:' + c(t.text) + ';opacity:.75">' + e(s.subtitle) + '</p>' + foot + '</div>';
    }
    if (s.layout === 'video') {
      return '<div class="sp" style="background:' + c(t.bg) + '">' + bar + h2 + (s.subtitle ? '' : '') + vidHtml(s, t, VB, LIVE) + foot + '</div>';
    }
    if (s.layout === 'diagram' && window.DiagramKit) {
      var dg = DiagramKit.toHtml(DiagramKit.build(s.diagram || {}, dgBox(s), t), SW, SH);
      return '<div class="sp" style="background:' + c(t.bg) + '">' + bar + h2 + (s.lead ? '<div class="dg-lead" style="color:' + c(t.text) + '">' + e(s.lead) + '</div>' : '') + '<div class="dg">' + dg + '</div>' + foot + '</div>';
    }
    var body;
    if (s.layout === 'two') {
      body = '<div class="cols"><div class="col" style="background:' + c(t.soft) + '"><h3 style="color:' + c(t.primary) + '">' + e(s.left_title) + '</h3>' + ul(s.left) + '</div>' +
        '<div class="col" style="background:' + c(t.soft) + '"><h3 style="color:' + c(t.accent) + '">' + e(s.right_title) + '</h3>' + ul(s.right) + '</div></div>';
    } else if (s.layout === 'quiz') {
      body = '<div class="q" style="color:' + c(t.text) + '">' + e(s.question) + '</div>' + lines(s.options).map(function (o) {
        return '<div class="opt" style="background:' + c(t.soft) + ';color:' + c(t.text) + '">' + e(o) + '</div>';
      }).join('');
    } else {
      body = ul(s.bullets);
    }
    if (img) {
      return '<div class="sp has-img" style="background:' + c(t.bg) + '">' + bar + '<div class="sp-left">' + h2 + body + '</div><div class="sp-img side" style="background-image:url(\'' + e(img.src) + '\')"></div>' + foot + '</div>';
    }
    return '<div class="sp" style="background:' + c(t.bg) + '">' + bar + h2 + body + foot + '</div>';
  }

  function exportPptx(slides, themeName, course, title) {
    if (!slides.length) return Promise.reject(new Error('没有可导出的幻灯片'));
    if (typeof PptxGenJS === 'undefined') return Promise.reject(new Error('导出组件加载失败，请刷新页面'));
    return prepVideos(slides).then(function () { return exportPptx0(slides, themeName, course, title); });
  }
  function exportPptx0(slides, themeName, course, title) {
    var t = th(themeName);
    var p = new PptxGenJS();
    p.layout = 'LAYOUT_WIDE';
    p.title = title;
    var W = 13.33, H = 7.5, X = 0.9, CW = W - 1.8;
    if (t.tpl) return exportTpl(p, slides, t, course, title);
    var foot = courseText(course, t);
    slides.forEach(function (s, i) {
      var sl = p.addSlide();
      var icW = hasIcon(s, t) ? 0.85 : 0;
      var notes = (s.notes || '') + (s.layout === 'quiz' && s.answer ? '\n\n【答案】' + s.answer : '');
      if (notes.trim()) sl.addNotes(notes.trim());
      var txt = function (str, o) { o.fontFace = FONT; sl.addText(str, o); };
      var bulletsOf = function (arr, size) {
        return lines(arr).map(function (b) { return { text: b, options: { bullet: { code: '25CF' }, fontSize: size, color: t.text, paraSpaceAfter: 10, breakLine: true } }; });
      };
      var img = s.image && s.image.src && ['title', 'bullets', 'objectives', 'summary', 'section'].indexOf(s.layout) >= 0 ? location.origin + s.image.src : null;
      var imgBox = function (x, y, w, h) { sl.addImage({ path: img, x: x, y: y, w: w, h: h, sizing: { type: 'cover', w: w, h: h } }); };
      if (s.layout === 'title' && img) {
        sl.background = { color: t.cover };
        imgBox(W * 0.54, 0, W * 0.46, H);
        sl.addShape(p.ShapeType.roundRect, { x: X, y: 2.5, w: 1.1, h: 0.12, fill: { color: t.accent }, line: { color: t.accent }, rectRadius: 0.06 });
        txt(s.title || '', { x: X, y: 2.75, w: W * 0.54 - X - 0.3, h: 1.6, fontSize: 36, bold: true, color: t.coverText, valign: 'top' });
        txt(s.subtitle || '', { x: X, y: 4.4, w: W * 0.54 - X - 0.3, h: 0.6, fontSize: 16, color: t.coverText, transparency: 20 });
        brandPptx(sl, s, t);
        return;
      }
      if (s.layout === 'title') {
        sl.background = { color: t.cover };
        sl.addShape(p.ShapeType.roundRect, { x: X, y: 2.5, w: 1.1, h: 0.12, fill: { color: t.accent }, line: { color: t.accent }, rectRadius: 0.06 });
        txt(s.title || '', { x: X, y: 2.75, w: CW, h: 1.3, fontSize: 40, bold: true, color: t.coverText, valign: 'top' });
        txt(s.subtitle || '', { x: X, y: 4.1, w: CW, h: 0.6, fontSize: 18, color: t.coverText, transparency: 20 });
        brandPptx(sl, s, t);
        return;
      }
      if (s.layout === 'section') {
        sl.background = { color: t.soft };
        sl.addShape(p.ShapeType.roundRect, { x: X, y: 2.9, w: 0.9, h: 0.1, fill: { color: t.accent }, line: { color: t.accent }, rectRadius: 0.05 });
        var sw = img ? CW * 0.55 : CW;
        txt(s.title || '', { x: X, y: 3.05, w: sw, h: 1.0, fontSize: 36, bold: true, color: t.primary });
        txt(s.subtitle || '', { x: X, y: 4.05, w: sw, h: 0.6, fontSize: 18, color: t.text });
        if (img) imgBox(X + CW * 0.6, 1.2, CW * 0.4, 5.1);
      } else {
        sl.background = { color: t.bg };
        sl.addShape(p.ShapeType.rect, { x: 0, y: 0, w: W, h: 0.16, fill: { color: t.primary }, line: { color: t.primary } });
        txt(s.title || '', { x: X, y: 0.45, w: (img && s.layout !== 'section' ? CW * 0.6 : CW) - icW, h: 0.9, fontSize: 28, bold: true, color: t.primary, valign: 'middle' });
        if (s.layout === 'video') {
          vidPptx(sl, p, s, t, VB);
        } else if (s.layout === 'diagram' && window.DiagramKit) {
          if (s.lead) txt(s.lead, { x: X, y: 1.38, w: CW, h: 0.55, fontSize: 15, color: t.text, valign: 'middle' });
          DiagramKit.toPptx(sl, p, DiagramKit.build(s.diagram || {}, dgBox(s), t));
        } else if (s.layout === 'two') {
          var colW = (CW - 0.4) / 2;
          [[s.left_title, s.left, t.primary, X], [s.right_title, s.right, t.accent, X + colW + 0.4]].forEach(function (col) {
            sl.addShape(p.ShapeType.roundRect, { x: col[3], y: 1.55, w: colW, h: 5.0, fill: { color: t.soft }, line: { color: t.soft }, rectRadius: 0.12 });
            txt(col[0] || '', { x: col[3] + 0.3, y: 1.7, w: colW - 0.6, h: 0.6, fontSize: 20, bold: true, color: col[2] });
            var b = bulletsOf(col[1], 17);
            if (b.length) sl.addText(b, { x: col[3] + 0.3, y: 2.35, w: colW - 0.6, h: 4.0, valign: 'top', fontFace: FONT });
          });
        } else if (s.layout === 'quiz') {
          txt(s.question || '', { x: X, y: 1.5, w: CW, h: 1.3, fontSize: 22, color: t.text, valign: 'top' });
          lines(s.options).slice(0, 6).forEach(function (o, k) {
            sl.addShape(p.ShapeType.roundRect, { x: X, y: 2.95 + k * 0.72, w: CW, h: 0.6, fill: { color: t.soft }, line: { color: t.soft }, rectRadius: 0.1 });
            txt(o, { x: X + 0.25, y: 2.95 + k * 0.72, w: CW - 0.5, h: 0.6, fontSize: 18, color: t.text, valign: 'middle' });
          });
        } else {
          var b = bulletsOf(s.bullets, img ? 20 : 22);
          if (b.length) sl.addText(b, { x: X, y: 1.55, w: img ? CW * 0.58 : CW, h: 5.2, valign: 'top', fontFace: FONT, lineSpacingMultiple: 1.15 });
          if (img) imgBox(X + CW * 0.62, 1.55, CW * 0.38, 4.9);
        }
      }
      brandPptx(sl, s, t);
      txt(foot, { x: X, y: H - 0.5, w: 6, h: 0.3, fontSize: 10, color: t.text, transparency: 45 });
      txt(String(i + 1), { x: W - X - 1, y: H - 0.5, w: 1, h: 0.3, fontSize: 10, color: t.text, transparency: 45, align: 'right' });
    });
    var name = (course + '-' + title).replace(/[\\\/:*?"<>|]/g, '_');
    return p.writeFile({ fileName: name + '.pptx' }).then(function () { return name + '.pptx'; });
  }

  function absUrl(u) { return /^(https?|blob|data):/.test(u) ? u : location.origin + u; }
  function imgSrc(u) { return /^data:/.test(u) ? { data: u } : { path: absUrl(u) }; }
  function exportTpl(p, slides, t, course, title) {
    var d = t.tpl, F = d.font || FONT;
    [['TPL_COVER', d.cover], ['TPL_BODY', d.content]].forEach(function (m) {
      var L = m[1], objs = [];
      L.rects.forEach(function (r) { objs.push({ rect: { x: r.x, y: r.y, w: r.w, h: r.h, fill: { color: r.fill }, line: { type: 'none' } } }); });
      L.pics.forEach(function (pc) { objs.push({ image: Object.assign({ x: pc.x, y: pc.y, w: pc.w, h: pc.h }, imgSrc(pc.src)) }); });
      p.defineSlideMaster({ title: m[0], background: L.bg.img ? imgSrc(L.bg.img) : { color: L.bg.color || t.bg }, objects: objs });
    });
    slides.forEach(function (s, i) {
      var cover = s.layout === 'title', sl = p.addSlide({ masterName: cover ? 'TPL_COVER' : 'TPL_BODY' });
      var notes = (s.notes || '') + (s.layout === 'quiz' && s.answer ? '\n\n【答案】' + s.answer : '');
      if (notes.trim()) sl.addNotes(notes.trim());
      var txt = function (str, b, o) { o.fontFace = F; o.x = b.x; o.y = b.y; o.w = b.w; o.h = b.h; o.margin = o.margin == null ? 0.05 : o.margin; sl.addText(str, o); };
      var bulletsOf = function (arr, size, color) { return lines(arr).map(function (x) { return { text: x, options: { bullet: { code: '25CF' }, fontSize: size, color: color || t.text, paraSpaceAfter: 10, breakLine: true } }; }); };
      if (cover) {
        txt(s.title || '', d.cover.title, { fontSize: fitPt(s.title || '', d.cover.title, d.cover.title.size), bold: true, color: t.coverText, valign: 'middle' });
        if (s.subtitle) txt(s.subtitle, d.cover.body, { fontSize: fitPt(s.subtitle, d.cover.body, 18), color: t.coverText, valign: 'top' });
        brandPptx(sl, s, t);
        return;
      }
      var B = d.content.body;
      if (s.layout === 'section') {
        var mid = { x: B.x, y: B.y + B.h * 0.3, w: B.w, h: B.h * 0.25 };
        txt(s.title || '', mid, { fontSize: fitPt(s.title || '', mid, 36), bold: true, color: t.titleColor, valign: 'middle' });
        if (s.subtitle) txt(s.subtitle, { x: B.x, y: mid.y + mid.h + 0.1, w: B.w, h: 0.7 }, { fontSize: 18, color: t.text });
      } else {
        txt(s.title || '', d.content.title, { fontSize: fitPt(s.title || '', d.content.title, d.content.title.size), bold: true, color: t.titleColor, valign: 'middle' });
        var R = tplRegion(s, t);
        if (s.layout === 'video') {
          vidPptx(sl, p, s, t, fitBox(B), F);
        } else if (s.layout === 'diagram' && window.DiagramKit) {
          if (s.lead) txt(s.lead, R.lead, { fontSize: 15, color: t.text, valign: 'middle' });
          DiagramKit.toPptx(sl, p, DiagramKit.build(s.diagram || {}, R.dg, t), F);
        } else if (s.layout === 'two') {
          var gw = 0.35, cw = (B.w - gw) / 2;
          [[s.left_title, s.left, t.primary, B.x], [s.right_title, s.right, t.accent, B.x + cw + gw]].forEach(function (c) {
            sl.addShape(p.ShapeType.roundRect, { x: c[3], y: B.y, w: cw, h: B.h, fill: { color: t.soft }, line: { type: 'none' }, rectRadius: 0.06 });
            txt(c[0] || '', { x: c[3] + 0.25, y: B.y + 0.15, w: cw - 0.5, h: 0.6 }, { fontSize: 20, bold: true, color: c[2] });
            var bl = bulletsOf(c[1], 17); if (bl.length) sl.addText(bl, { x: c[3] + 0.25, y: B.y + 0.8, w: cw - 0.5, h: B.h - 0.95, valign: 'top', fontFace: F });
          });
        } else if (s.layout === 'quiz') {
          txt(s.question || '', { x: B.x, y: B.y, w: B.w, h: Math.min(1.3, B.h * 0.28) }, { fontSize: 22, color: t.text, valign: 'top' });
          var oy = B.y + Math.min(1.3, B.h * 0.28) + 0.15, oh = Math.min(0.62, (B.y + B.h - oy) / Math.max(1, lines(s.options).length) - 0.1);
          lines(s.options).slice(0, 6).forEach(function (o, k) {
            sl.addShape(p.ShapeType.roundRect, { x: B.x, y: oy + k * (oh + 0.1), w: B.w, h: oh, fill: { color: t.soft }, line: { type: 'none' }, rectRadius: 0.08 });
            txt(o, { x: B.x + 0.25, y: oy + k * (oh + 0.1), w: B.w - 0.5, h: oh }, { fontSize: 18, color: t.text, valign: 'middle' });
          });
        } else {
          var img = s.image && s.image.src && ['bullets', 'objectives', 'summary'].indexOf(s.layout) >= 0 ? absUrl(s.image.src) : null;
          var bl2 = bulletsOf(s.bullets, img ? 20 : 22);
          if (bl2.length) sl.addText(bl2, { x: B.x, y: B.y, w: img ? B.w * 0.6 : B.w, h: B.h, valign: 'top', fontFace: F, lineSpacingMultiple: 1.15 });
          if (img) sl.addImage({ path: img, x: B.x + B.w * 0.63, y: B.y, w: B.w * 0.37, h: B.h, sizing: { type: 'cover', w: B.w * 0.37, h: B.h } });
        }
      }
      brandPptx(sl, s, t);
      txt(String(i + 1), { x: SW - 1.3, y: SH - 0.42, w: 0.9, h: 0.3 }, { fontSize: 10, color: t.text, transparency: 40, align: 'right' });
    });
    var name = (course + '-' + title).replace(/[\\\/:*?"<>|]/g, '_');
    return p.writeFile({ fileName: name + '.pptx' }).then(function () { return name + '.pptx'; });
  }

  window.DeckKit = { THEMES: THEMES, LAYOUTS: LAYOUTS, PHASES: PHASES, preview: preview, exportPptx: exportPptx, lines: lines, addTemplates: addTemplates, theme: th, setBrand: setBrand };
})();
