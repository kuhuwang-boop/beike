/*
 * 结构图引擎：一份结构图数据 → 同一套几何形状 → 网页预览（SVG + 文字层）与 PPTX 原生可编辑形状。
 * 版式目录、选型表与多页防单调规则改编自 5ang7iangai/pptx-compose-skill（pptx-unit，MIT License）。
 * 坐标单位：英寸（16:9 页面 13.333 × 7.5）。
 */
(function () {
  var TYPES = {
    flow: { name: '流程', when: '有先后的步骤、环节', min: 3, max: 6 },
    cycle: { name: '闭环', when: '几步做完又回到起点', min: 3, max: 6 },
    timeline: { name: '时间轴', when: '按时间排的里程碑、发展历程', min: 3, max: 6 },
    compare: { name: '左右对照', when: '两种做法、两个概念、改前改后', min: 2, max: 2 },
    matrix: { name: '并列卡片', when: '三五个并列要点，没有先后', min: 2, max: 6 },
    pillars: { name: '支柱', when: '几根支柱共同撑起一个结论', min: 2, max: 4 },
    kpi: { name: '大数字', when: '三四个关键数据', min: 2, max: 4 },
    pyramid: { name: '金字塔', when: '上少下多的层级、需求层次', min: 3, max: 5 },
    funnel: { name: '漏斗', when: '逐级筛选、收窄', min: 3, max: 5 },
    tree: { name: '分类树', when: '一个总概念拆成几类，类下有条目', min: 2, max: 4 },
    hub: { name: '中心辐射', when: '一个核心关联多个方面', min: 3, max: 6 },
    layers: { name: '分层结构', when: '自上而下的层次，每层有若干模块', min: 2, max: 5 },
    pipeline: { name: '三栏对照', when: '类型 → 内容 → 用途，每行一组', min: 2, max: 5 }
  };
  var STYLES = { rounded: '圆角卡片', square: '直角线框', flat: '扁平极简' };
  var FONT = 'Microsoft YaHei';

  /* ---------- 颜色 ---------- */
  function rgb(h) { h = String(h || '000000').replace('#', ''); return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)]; }
  function hex(a) { return a.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join('').toUpperCase(); }
  function mix(a, b, k) { var x = rgb(a), y = rgb(b); return hex([0, 1, 2].map(function (i) { return x[i] * (1 - k) + y[i] * k; })); }
  function lum(h) { var c = rgb(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; }
  function onColor(h) { return lum(h) > 0.6 ? '1F2937' : 'FFFFFF'; }

  /* ---------- 文字估算：按中文字宽 1em、西文约 0.55em 估算行数，放不下就逐级缩小字号 ---------- */
  function textWidth(s, pt) {
    var w = 0;
    for (var i = 0; i < s.length; i++) w += s.charCodeAt(i) > 255 ? 1 : 0.56;
    return w * pt / 72;
  }
  function fit(s, w, h, pt, min) {
    s = String(s || '');
    min = min || 9;
    for (var size = pt; size >= min; size -= 0.5) {
      var lines = 0;
      s.split('\n').forEach(function (part) { lines += Math.max(1, Math.ceil(textWidth(part, size) / Math.max(0.2, w - size / 72 * 0.6))); });
      if (lines * size * 1.42 / 72 <= h) return size;
    }
    return min;
  }

  /* ---------- 基本形状 ---------- */
  function Canvas(t, style) {
    this.s = [];
    this.t = t;
    this.style = STYLES[style] ? style : 'rounded';
  }
  Canvas.prototype.box = function (x, y, w, h, o) { this.s.push({ k: 'box', x: x, y: y, w: w, h: h, r: o.r || 0, fill: o.fill || null, line: o.line || null, lw: o.lw || 0.75 }); };
  Canvas.prototype.ell = function (x, y, w, h, o) { this.s.push({ k: 'ell', x: x, y: y, w: w, h: h, fill: o.fill || null, line: o.line || null, lw: o.lw || 0.75 }); };
  Canvas.prototype.line = function (x1, y1, x2, y2, o) { this.s.push({ k: 'line', x1: x1, y1: y1, x2: x2, y2: y2, color: o.color, lw: o.lw || 1.5, arrow: !!o.arrow, dash: !!o.dash }); };
  Canvas.prototype.poly = function (pts, o) { this.s.push({ k: 'poly', pts: pts, fill: o.fill || null, line: o.line || null, lw: o.lw || 0.75 }); };
  Canvas.prototype.text = function (str, x, y, w, h, o) {
    if (!String(str || '').trim()) return;
    var size = o.fit === false ? o.size : fit(str, w, h, o.size, o.min || 9);
    this.s.push({ k: 'text', t: String(str), x: x, y: y, w: w, h: h, size: size, color: o.color, bold: !!o.bold, align: o.align || 'center', valign: o.valign || 'middle' });
  };
  /* 卡片：按风格画底和边；hi=重点块（主色实底） */
  Canvas.prototype.card = function (x, y, w, h, hi, accent) {
    var t = this.t, col = accent || t.primary;
    if (this.style === 'square') {
      this.box(x, y, w, h, { fill: hi ? col : t.bg, line: hi ? col : mix(col, t.bg, 0.6), lw: 0.75 });
      if (!hi) this.box(x, y, 0.07, h, { fill: col });
    } else if (this.style === 'flat') {
      this.box(x, y, w, h, { r: 0.06, fill: hi ? mix(col, t.bg, 0.88) : t.bg, line: mix(t.text, t.bg, 0.82), lw: 0.5 });
      if (hi) this.box(x, y, w, 0.06, { fill: col });
    } else {
      this.box(x, y, w, h, { r: 0.14, fill: hi ? col : t.soft, line: hi ? col : t.soft });
    }
    var solid = hi && this.style !== 'flat';
    return { title: solid ? onColor(col) : (this.style === 'flat' && hi ? col : t.primary === col ? t.primary : col), body: solid ? onColor(col) : t.text };
  };

  function it(d, i) { var a = d.items || []; return a[i] || {}; }
  function items(d) { return (d.items || []).filter(function (x) { return x && (x.t || x.d); }); }
  // 箭头从矩形 A 的边缘指向矩形 B 的边缘
  function exitPt(cx, cy, hw, hh, dx, dy) {
    var sx = dx ? hw / Math.abs(dx) : Infinity, sy = dy ? hh / Math.abs(dy) : Infinity, k = Math.min(sx, sy);
    return [cx + dx * k, cy + dy * k];
  }

  /* ---------- 各版式几何 ---------- */
  var L = {};

  L.flow = function (c, d, B) {
    var a = items(d), n = a.length, t = c.t, g = 0.42;
    var w = (B.w - g * (n - 1)) / n, h = Math.min(B.h, 3.1, Math.max(2.6, w * 1.3)), y = B.y + (B.h - h) / 2;
    a.forEach(function (x, i) {
      var X = B.x + i * (w + g), hi = d.hi === i;
      var tc = c.card(X, y, w, h, hi);
      var nb = 0.46;
      c.ell(X + 0.18, y + 0.2, nb, nb, { fill: hi ? onColor(t.primary) : t.primary });
      c.text(String(i + 1), X + 0.18, y + 0.2, nb, nb, { size: 14, bold: true, color: hi ? t.primary : onColor(t.primary), fit: false });
      c.text(x.t, X + 0.16, y + 0.78, w - 0.32, 0.72, { size: 18, bold: true, color: tc.title, align: 'left', valign: 'top' });
      c.text(x.d, X + 0.16, y + 1.5, w - 0.32, h - 1.65, { size: 14.5, color: tc.body, align: 'left', valign: 'top' });
      if (i < n - 1) c.line(X + w + 0.06, y + h / 2, X + w + g - 0.06, y + h / 2, { color: t.accent, lw: 2, arrow: true });
    });
  };

  L.cycle = function (c, d, B) {
    var a = items(d), n = a.length, t = c.t;
    var cx = B.x + B.w / 2, cy = B.y + B.h / 2;
    var cw = Math.min(3.1, B.w / (n > 4 ? 3.5 : 3.0)), ch = Math.min(1.4, B.h / 3.3);
    var rx = (B.w - cw) / 2 - 0.1, ry = (B.h - ch) / 2 - 0.05;
    if (n === 4) { rx = Math.min(rx, B.w * 0.3); }
    var P = a.map(function (x, i) { var ang = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + rx * Math.cos(ang), cy + ry * Math.sin(ang)]; });
    var cr = Math.min(B.h * 0.24, 1.15);
    c.ell(cx - cr, cy - cr * 0.62, cr * 2, cr * 1.24, { fill: mix(t.primary, t.bg, 0.9), line: mix(t.primary, t.bg, 0.6), lw: 1 });
    c.text(d.center || '循环', cx - cr + 0.15, cy - cr * 0.5, cr * 2 - 0.3, cr, { size: 19, bold: true, color: t.primary });
    P.forEach(function (p, i) {
      var q = P[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1];
      var s = exitPt(p[0], p[1], cw / 2 + 0.08, ch / 2 + 0.08, dx, dy), e = exitPt(q[0], q[1], cw / 2 + 0.1, ch / 2 + 0.1, -dx, -dy);
      c.line(s[0], s[1], e[0], e[1], { color: t.accent, lw: 2, arrow: true });
    });
    a.forEach(function (x, i) {
      var X = P[i][0] - cw / 2, Y = P[i][1] - ch / 2, hi = d.hi === i;
      var tc = c.card(X, Y, cw, ch, hi);
      c.text((i + 1) + ' ' + (x.t || ''), X + 0.16, Y + 0.08, cw - 0.32, 0.5, { size: 17, bold: true, color: tc.title, align: 'left' });
      c.text(x.d, X + 0.16, Y + 0.56, cw - 0.32, ch - 0.64, { size: 13.5, color: tc.body, align: 'left', valign: 'top' });
    });
  };

  L.timeline = function (c, d, B) {
    var a = items(d), n = a.length, t = c.t;
    var cardH = Math.min(2.0, B.h * 0.45), ly = B.y + (B.h - (1.0 + 0.42 + cardH)) / 2 + 1.0, step = B.w / n;
    c.line(B.x, ly, B.x + B.w, ly, { color: mix(t.primary, t.bg, 0.45), lw: 3, arrow: true });
    a.forEach(function (x, i) {
      var cx = B.x + step * (i + 0.5), hi = d.hi === i, r = 0.17;
      c.ell(cx - r, ly - r, r * 2, r * 2, { fill: hi ? t.accent : t.primary, line: t.bg, lw: 2 });
      c.text(x.t, cx - step / 2 + 0.05, ly - 1.0, step - 0.1, 0.7, { size: 20, bold: true, color: hi ? t.accent : t.primary, valign: 'bottom' });
      var cy = ly + 0.42, w = step - 0.22;
      c.line(cx, ly + r, cx, cy, { color: mix(t.primary, t.bg, 0.5), lw: 1 });
      var tc = c.card(cx - w / 2, cy, w, cardH, d.hi === i);
      c.text(x.d, cx - w / 2 + 0.16, cy + 0.14, w - 0.32, cardH - 0.28, { size: 14.5, color: tc.body, align: 'left', valign: 'top' });
    });
  };

  L.compare = function (c, d, B) {
    var t = c.t, g = 0.9, w = (B.w - g) / 2;
    [0, 1].forEach(function (i) {
      var x = it(d, i), X = B.x + i * (w + g), col = i ? t.accent : t.primary;
      c.box(X, B.y, w, B.h, { r: c.style === 'square' ? 0 : 0.14, fill: c.style === 'flat' ? t.bg : mix(col, t.bg, 0.9), line: c.style === 'rounded' ? mix(col, t.bg, 0.9) : mix(col, t.bg, 0.55) });
      c.box(X, B.y, w, 0.78, { r: c.style === 'square' ? 0 : 0.14, fill: col });
      if (c.style !== 'square') c.box(X, B.y + 0.5, w, 0.28, { fill: col });
      c.text(x.t, X + 0.2, B.y + 0.05, w - 0.4, 0.68, { size: 20, bold: true, color: onColor(col) });
      var sub = (x.sub && x.sub.length ? x.sub : (x.d ? [x.d] : [])).slice(0, 5), y = B.y + 1.0, rowH = Math.min(0.95, (B.h - 1.15) / Math.max(1, sub.length));
      sub.forEach(function (s, k) {
        c.ell(X + 0.3, y + k * rowH + rowH / 2 - 0.06, 0.12, 0.12, { fill: col });
        c.text(s, X + 0.55, y + k * rowH, w - 0.8, rowH, { size: 16, color: t.text, align: 'left' });
      });
    });
    var r = 0.42, cx = B.x + B.w / 2, cy = B.y + B.h / 2;
    c.ell(cx - r, cy - r, r * 2, r * 2, { fill: t.bg, line: mix(t.text, t.bg, 0.6), lw: 1 });
    c.text(d.center || 'VS', cx - r, cy - r, r * 2, r * 2, { size: 13, bold: true, color: t.text, fit: false });
  };

  L.matrix = function (c, d, B) {
    var a = items(d), n = a.length, t = c.t, g = 0.3;
    var rows = n > 4 ? 2 : 1, per = Math.ceil(n / rows);
    var w = (B.w - g * (per - 1)) / per, h = (B.h - g * (rows - 1)) / rows;
    if (rows === 1) h = Math.min(B.h, 3.0, Math.max(2.4, w * 1.05));
    var y0 = B.y + (B.h - (rows * h + (rows - 1) * g)) / 2;
    a.forEach(function (x, i) {
      var r = Math.floor(i / per), k = i % per, inRow = r === rows - 1 ? n - per * (rows - 1) : per;
      var off = (B.w - (inRow * w + (inRow - 1) * g)) / 2;
      var X = B.x + off + k * (w + g), Y = y0 + r * (h + g), hi = d.hi === i;
      var tc = c.card(X, Y, w, h, hi);
      if (!hi && c.style === 'rounded') c.box(X + 0.22, Y + 0.24, 0.5, 0.08, { r: 0.04, fill: t.accent });
      c.text(x.t, X + 0.2, Y + 0.4, w - 0.4, Math.min(0.8, h * 0.3), { size: 19, bold: true, color: tc.title, align: 'left' });
      c.text(x.d, X + 0.2, Y + 0.4 + Math.min(0.8, h * 0.3) + 0.05, w - 0.4, h - Math.min(0.8, h * 0.3) - 0.6, { size: 14.5, color: tc.body, align: 'left', valign: 'top' });
    });
  };

  L.pillars = function (c, d, B) {
    var a = items(d), n = a.length, t = c.t, topH = 0.85, g = 0.35, baseH = d.note ? 0.55 : 0.16;
    c.box(B.x, B.y, B.w, topH, { r: c.style === 'square' ? 0 : 0.12, fill: t.primary });
    c.text(d.center || '', B.x + 0.3, B.y, B.w - 0.6, topH, { size: 21, bold: true, color: onColor(t.primary) });
    var ph = Math.min(2.9, B.h - topH - 0.25 - baseH - 0.2), py = B.y + topH + 0.25 + (B.h - topH - 0.25 - baseH - 0.2 - ph) / 2;
    var pw = Math.min(3.2, (B.w - 0.6 - g * (n - 1)) / n), x0 = B.x + (B.w - (n * pw + (n - 1) * g)) / 2;
    a.forEach(function (x, i) {
      var X = x0 + i * (pw + g), tc = c.card(X, py, pw, ph, d.hi === i);
      c.text(x.t, X + 0.18, py + 0.22, pw - 0.36, 0.7, { size: 19, bold: true, color: tc.title });
      c.text(x.d, X + 0.18, py + 1.0, pw - 0.36, ph - 1.15, { size: 14.5, color: tc.body, valign: 'top' });
    });
    c.box(B.x + 0.15, B.y + B.h - baseH, B.w - 0.3, baseH, { r: c.style === 'square' ? 0 : 0.08, fill: mix(t.primary, t.bg, 0.8) });
    if (d.note) c.text(d.note, B.x + 0.4, B.y + B.h - baseH, B.w - 0.8, baseH, { size: 14, color: t.text });
  };

  L.kpi = function (c, d, B) {
    var a = items(d), n = a.length, t = c.t, w = B.w / n, noteH = d.note ? 0.7 : 0, h = B.h - noteH;
    a.forEach(function (x, i) {
      var X = B.x + i * w, hi = d.hi === i;
      if (i) c.line(X, B.y + h * 0.18, X, B.y + h * 0.82, { color: mix(t.text, t.bg, 0.8), lw: 1 });
      c.text(x.t, X + 0.15, B.y + h * 0.12, w - 0.3, h * 0.42, { size: 52, bold: true, color: hi ? t.accent : t.primary, min: 22 });
      c.text(x.d, X + 0.3, B.y + h * 0.56, w - 0.6, h * 0.34, { size: 16, color: t.text, valign: 'top' });
    });
    if (d.note) {
      c.box(B.x, B.y + B.h - noteH + 0.1, B.w, noteH - 0.1, { r: c.style === 'square' ? 0 : 0.1, fill: t.soft });
      c.text(d.note, B.x + 0.3, B.y + B.h - noteH + 0.1, B.w - 0.6, noteH - 0.1, { size: 14, color: t.text });
    }
  };

  function stack(c, d, B, upward) {
    var a = items(d), n = a.length, t = c.t, g = 0.08;
    var pw = Math.min(B.w * 0.52, B.h * 1.45), px = B.x + 0.1, lh = (B.h - g * (n - 1)) / n;
    var minW = pw * 0.2, cx = px + pw / 2;
    a.forEach(function (x, i) {
      var k0 = i / n, k1 = (i + 1) / n;
      // 金字塔：上窄下宽；漏斗：上宽下窄
      var w0 = upward ? minW + (pw - minW) * k0 : pw - (pw - minW) * k0;
      var w1 = upward ? minW + (pw - minW) * k1 : pw - (pw - minW) * k1;
      if (upward && i === 0) w0 = 0.001;
      var y0 = B.y + i * (lh + g), y1 = y0 + lh;
      var col = mix(t.primary, t.bg, Math.min(0.62, i * (0.55 / Math.max(1, n - 1))));
      if (d.hi === i) col = t.accent;
      c.poly([[cx - w0 / 2, y0], [cx + w0 / 2, y0], [cx + w1 / 2, y1], [cx - w1 / 2, y1]], { fill: col });
      var tw = Math.max(w0, w1) * 0.72;
      c.text(x.t, cx - tw / 2, y0 + (upward && i === 0 ? lh * 0.35 : 0), tw, upward && i === 0 ? lh * 0.65 : lh, { size: 17, bold: true, color: onColor(col), min: 9 });
      var rx = px + pw + 0.5, ey = y0 + lh / 2;
      c.line(cx + (w0 + w1) / 4 + 0.08, ey, rx - 0.1, ey, { color: mix(t.text, t.bg, 0.6), lw: 1, dash: true });
      c.text(x.d, rx, y0, B.x + B.w - rx, lh, { size: 15, color: t.text, align: 'left' });
    });
  }
  L.pyramid = function (c, d, B) { stack(c, d, B, true); };
  L.funnel = function (c, d, B) { stack(c, d, B, false); };

  L.tree = function (c, d, B) {
    var a = items(d), n = a.length, t = c.t;
    var rw = Math.min(3.4, B.w * 0.28), rh = 0.72, rx = B.x + (B.w - rw) / 2;
    c.box(rx, B.y, rw, rh, { r: c.style === 'square' ? 0 : 0.12, fill: t.primary });
    c.text(d.center || '', rx + 0.1, B.y, rw - 0.2, rh, { size: 20, bold: true, color: onColor(t.primary) });
    var g = 0.3, cw = (B.w - g * (n - 1)) / n, busY = B.y + rh + 0.32, ch = 0.66, cy = busY + 0.32;
    c.line(B.x + B.w / 2, B.y + rh, B.x + B.w / 2, busY, { color: t.primary, lw: 1.75 });
    c.line(B.x + cw / 2, busY, B.x + B.w - cw / 2, busY, { color: t.primary, lw: 1.75 });
    a.forEach(function (x, i) {
      var X = B.x + i * (cw + g), mx = X + cw / 2, hi = d.hi === i;
      c.line(mx, busY, mx, cy, { color: t.primary, lw: 1.75 });
      c.box(X, cy, cw, ch, { r: c.style === 'square' ? 0 : 0.1, fill: hi ? t.accent : mix(t.primary, t.bg, 0.25) });
      c.text(x.t, X + 0.1, cy, cw - 0.2, ch, { size: 17, bold: true, color: onColor(hi ? t.accent : mix(t.primary, t.bg, 0.25)) });
      var sub = (x.sub && x.sub.length ? x.sub : (x.d ? [x.d] : [])).slice(0, 5);
      var sy = cy + ch + 0.16, sh = Math.min(0.62, (B.y + B.h - sy - 0.1 * sub.length) / Math.max(1, sub.length));
      sub.forEach(function (s, k) {
        var Y = sy + k * (sh + 0.1);
        c.card(X + 0.12, Y, cw - 0.24, sh, false);
        c.text(s, X + 0.28, Y, cw - 0.5, sh, { size: 14.5, color: t.text, align: 'left' });
      });
    });
  };

  L.hub = function (c, d, B) {
    var a = items(d), n = a.length, t = c.t;
    var D = Math.min(B.h * 0.62, B.w * 0.24), cx = B.x + B.w / 2, cy = B.y + B.h / 2;
    var left = a.slice(0, Math.ceil(n / 2)), right = a.slice(Math.ceil(n / 2));
    if (n <= 3) { left = []; right = a; cx = B.x + D / 2 + 0.6; }
    var colW = n <= 3 ? B.x + B.w - (cx + D / 2 + 0.7) : (B.w - D) / 2 - 0.75;
    c.ell(cx - D / 2 - 0.12, cy - D / 2 - 0.12, D + 0.24, D + 0.24, { fill: mix(t.primary, t.bg, 0.85) });
    c.ell(cx - D / 2, cy - D / 2, D, D, { fill: t.primary });
    c.text(d.center || '', cx - D * 0.4, cy - D * 0.3, D * 0.8, D * 0.6, { size: 22, bold: true, color: onColor(t.primary) });
    function side(arr, isLeft) {
      var m = arr.length; if (!m) return;
      var g = 0.22, h = Math.min(1.3, (B.h - g * (m - 1)) / m), y0 = cy - (m * h + (m - 1) * g) / 2;
      var X = isLeft ? B.x : (n <= 3 ? cx + D / 2 + 0.7 : B.x + B.w - colW);
      arr.forEach(function (x, k) {
        var idx = a.indexOf(x), Y = y0 + k * (h + g), hi = d.hi === idx;
        var ex = isLeft ? X + colW : X, ey = Y + h / 2;
        var ang = Math.atan2(ey - cy, ex - cx), sx = cx + (D / 2 + 0.14) * Math.cos(ang), sy = cy + (D / 2 + 0.14) * Math.sin(ang);
        c.line(sx, sy, ex + (isLeft ? 0.06 : -0.06), ey, { color: mix(t.primary, t.bg, 0.4), lw: 1.5 });
        var tc = c.card(X, Y, colW, h, hi);
        c.text(x.t, X + 0.2, Y + 0.06, colW - 0.4, Math.min(0.55, h * 0.45), { size: 17, bold: true, color: tc.title, align: 'left' });
        c.text(x.d, X + 0.2, Y + Math.min(0.5, h * 0.45) + 0.04, colW - 0.4, h - Math.min(0.5, h * 0.45) - 0.1, { size: 13.5, color: tc.body, align: 'left', valign: 'top' });
      });
    }
    side(left, true); side(right, false);
  };

  L.layers = function (c, d, B) {
    var a = items(d), n = a.length, t = c.t, g = 0.14, lh = (B.h - g * (n - 1)) / n, lw = Math.min(2.2, B.w * 0.18);
    a.forEach(function (x, i) {
      var Y = B.y + i * (lh + g), col = d.hi === i ? t.accent : mix(t.primary, t.bg, i * (0.45 / Math.max(1, n - 1)));
      var r = c.style === 'square' ? 0 : 0.1;
      c.box(B.x, Y, B.w, lh, { r: r, fill: mix(col, t.bg, 0.86) });
      c.box(B.x, Y, lw, lh, { r: r, fill: col });
      c.text(x.t, B.x + 0.1, Y, lw - 0.2, lh, { size: 17, bold: true, color: onColor(col) });
      var sub = (x.sub && x.sub.length ? x.sub : (x.d ? [x.d] : [])).slice(0, 6), m = Math.max(1, sub.length);
      var mg = 0.16, mx = B.x + lw + 0.2, mw = (B.x + B.w - 0.2 - mx - mg * (m - 1)) / m;
      sub.forEach(function (s, k) {
        var X = mx + k * (mw + mg);
        c.box(X, Y + 0.12, mw, lh - 0.24, { r: c.style === 'square' ? 0 : 0.08, fill: t.bg, line: mix(col, t.bg, 0.55), lw: 0.75 });
        c.text(s, X + 0.08, Y + 0.12, mw - 0.16, lh - 0.24, { size: 15, color: t.text });
      });
    });
  };

  L.pipeline = function (c, d, B) {
    var a = items(d), n = a.length, t = c.t, cols = (d.cols && d.cols.length === 3 ? d.cols : ['类型', '内容', '用途']);
    var ws = [0.22, 0.46, 0.27], g = (B.w * 0.05) / 2, hh = 0.5, X = [B.x];
    X.push(X[0] + B.w * ws[0] + g); X.push(X[1] + B.w * ws[1] + g);
    cols.forEach(function (name, k) {
      c.text(name, X[k], B.y, B.w * ws[k], hh, { size: 16, bold: true, color: k === 1 ? t.primary : t.accent });
      c.line(X[k] + 0.1, B.y + hh, X[k] + B.w * ws[k] - 0.1, B.y + hh, { color: k === 1 ? t.primary : t.accent, lw: 2 });
    });
    var rg = 0.16, rh = (B.h - hh - 0.2 - rg * (n - 1)) / n;
    a.forEach(function (x, i) {
      var Y = B.y + hh + 0.2 + i * (rh + rg), hi = d.hi === i;
      [x.t, x.d, x.u].forEach(function (v, k) {
        var w = B.w * ws[k];
        var tc = k === 0 ? c.card(X[k], Y, w, rh, true) : c.card(X[k], Y, w, rh, false, k === 2 ? t.accent : t.primary);
        c.text(v, X[k] + 0.16, Y, w - 0.32, rh, { size: k === 0 ? 16 : 14.5, bold: k === 0, color: k === 0 ? tc.title : t.text, align: k === 0 ? 'center' : 'left' });
        if (k < 2) c.line(X[k] + w + 0.03, Y + rh / 2, X[k + 1] - 0.03, Y + rh / 2, { color: hi ? t.accent : mix(t.text, t.bg, 0.55), lw: 1.5, arrow: true });
      });
    });
  };

  function build(d, B, t) {
    var c = new Canvas(t, d.style);
    var fn = L[d.type] || L.matrix;
    if (!items(d).length && d.type !== 'compare') {
      c.text('（结构图还没有内容）', B.x, B.y, B.w, B.h, { size: 14, color: mix(t.text, t.bg, 0.5) });
      return c.s;
    }
    fn(c, d, B);
    return c.s;
  }

  /* ---------- 输出 1：网页预览 ---------- */
  function toHtml(shapes, W, H) {
    var svg = '', html = '';
    var pctX = function (v) { return (v / W * 100).toFixed(3) + '%'; }, pctY = function (v) { return (v / H * 100).toFixed(3) + '%'; };
    var esc = function (s) { return String(s).replace(/[&<>"']/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]; }); };
    var col = function (h) { return h ? '#' + h : 'none'; };
    var sw = function (pt) { return (pt / 72).toFixed(4); };
    shapes.forEach(function (s) {
      if (s.k === 'box') svg += '<rect x="' + s.x + '" y="' + s.y + '" width="' + s.w + '" height="' + s.h + '" rx="' + Math.min(s.r, s.w / 2, s.h / 2) + '" fill="' + col(s.fill) + '" stroke="' + col(s.line) + '" stroke-width="' + (s.line ? sw(s.lw) : 0) + '"/>';
      else if (s.k === 'ell') svg += '<ellipse cx="' + (s.x + s.w / 2) + '" cy="' + (s.y + s.h / 2) + '" rx="' + s.w / 2 + '" ry="' + s.h / 2 + '" fill="' + col(s.fill) + '" stroke="' + col(s.line) + '" stroke-width="' + (s.line ? sw(s.lw) : 0) + '"/>';
      else if (s.k === 'poly') svg += '<polygon points="' + s.pts.map(function (p) { return p[0].toFixed(3) + ',' + p[1].toFixed(3); }).join(' ') + '" fill="' + col(s.fill) + '" stroke="' + col(s.line) + '" stroke-width="' + (s.line ? sw(s.lw) : 0) + '"/>';
      else if (s.k === 'line') {
        var len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1, ah = Math.min(0.16, len * 0.4), ux = (s.x2 - s.x1) / len, uy = (s.y2 - s.y1) / len;
        var ex = s.arrow ? s.x2 - ux * ah * 0.8 : s.x2, ey = s.arrow ? s.y2 - uy * ah * 0.8 : s.y2;
        svg += '<line x1="' + s.x1 + '" y1="' + s.y1 + '" x2="' + ex + '" y2="' + ey + '" stroke="' + col(s.color) + '" stroke-width="' + sw(s.lw) + '"' + (s.dash ? ' stroke-dasharray="0.05 0.05"' : '') + ' stroke-linecap="round"/>';
        if (s.arrow) {
          var bx = s.x2 - ux * ah, by = s.y2 - uy * ah, px = -uy * ah * 0.55, py = ux * ah * 0.55;
          svg += '<polygon points="' + s.x2 + ',' + s.y2 + ' ' + (bx + px) + ',' + (by + py) + ' ' + (bx - px) + ',' + (by - py) + '" fill="' + col(s.color) + '"/>';
        }
      } else if (s.k === 'text') {
        var ai = s.align === 'left' ? 'flex-start' : s.align === 'right' ? 'flex-end' : 'center';
        var ji = s.valign === 'top' ? 'flex-start' : s.valign === 'bottom' ? 'flex-end' : 'center';
        html += '<div class="dg-t" style="left:' + pctX(s.x) + ';top:' + pctY(s.y) + ';width:' + pctX(s.w) + ';height:' + pctY(s.h) + ';justify-content:' + ji + ';align-items:' + ai + ';text-align:' + s.align + ';color:#' + s.color + ';font-size:' + (s.size / (W * 72) * 100).toFixed(3) + 'cqw;' + (s.bold ? 'font-weight:700;' : '') + '"><span>' + esc(s.t).replace(/\n/g, '<br>') + '</span></div>';
      }
    });
    return '<svg class="dg-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' + svg + '</svg>' + html;
  }

  /* ---------- 输出 2：PPTX 原生形状（可直接在 PowerPoint / WPS 里编辑） ---------- */
  function toPptx(sl, p, shapes, font) {
    var FACE = font || FONT;
    shapes.forEach(function (s) {
      var line = function (c, w) { return c ? { color: c, width: w } : { type: 'none' }; };
      if (s.k === 'box') {
        sl.addShape(s.r > 0.001 ? p.ShapeType.roundRect : p.ShapeType.rect, { x: s.x, y: s.y, w: s.w, h: s.h, fill: s.fill ? { color: s.fill } : { type: 'none' }, line: line(s.line, s.lw), rectRadius: s.r > 0.001 ? Math.min(s.r / Math.min(s.w, s.h), 0.5) : undefined });
      } else if (s.k === 'ell') {
        sl.addShape(p.ShapeType.ellipse, { x: s.x, y: s.y, w: s.w, h: s.h, fill: s.fill ? { color: s.fill } : { type: 'none' }, line: line(s.line, s.lw) });
      } else if (s.k === 'poly') {
        var xs = s.pts.map(function (q) { return q[0]; }), ys = s.pts.map(function (q) { return q[1]; });
        var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys), w = Math.max.apply(null, xs) - x0, h = Math.max.apply(null, ys) - y0;
        var pts = s.pts.map(function (q, i) { var o = { x: q[0] - x0, y: q[1] - y0 }; if (!i) o.moveTo = true; return o; });
        pts.push({ close: true });
        sl.addShape(p.ShapeType.custGeom, { x: x0, y: y0, w: Math.max(w, 0.01), h: Math.max(h, 0.01), points: pts, fill: s.fill ? { color: s.fill } : { type: 'none' }, line: line(s.line, s.lw) });
      } else if (s.k === 'line') {
        var lx = Math.min(s.x1, s.x2), ly = Math.min(s.y1, s.y2);
        sl.addShape(p.ShapeType.line, { x: lx, y: ly, w: Math.max(Math.abs(s.x2 - s.x1), 0.001), h: Math.max(Math.abs(s.y2 - s.y1), 0.001), flipH: s.x2 < s.x1, flipV: s.y2 < s.y1,
          line: { color: s.color, width: s.lw, dashType: s.dash ? 'dash' : 'solid', endArrowType: s.arrow ? 'triangle' : undefined } });
      } else if (s.k === 'text') {
        sl.addText(s.t, { x: s.x, y: s.y, w: s.w, h: s.h, fontFace: FACE, fontSize: s.size, color: s.color, bold: s.bold, align: s.align, valign: s.valign, margin: 0, lineSpacingMultiple: 1.1, fit: 'none' });
      }
    });
  }

  /* ---------- 多页规则检查（与服务端体检一致，供编辑器即时提示） ---------- */
  function check(slides) {
    var out = [], seq = [];
    slides.forEach(function (s, i) { if (s.layout === 'diagram' && s.diagram) seq.push([i, s.diagram.type]); });
    for (var k = 1; k < seq.length; k++) if (seq[k][0] === seq[k - 1][0] + 1 && seq[k][1] === seq[k - 1][1]) out.push('第 ' + (seq[k - 1][0] + 1) + '、' + (seq[k][0] + 1) + ' 页连续使用了同一种结构图（' + (TYPES[seq[k][1]] || {}).name + '）');
    return out;
  }

  window.DiagramKit = { TYPES: TYPES, STYLES: STYLES, build: build, toHtml: toHtml, toPptx: toPptx, check: check, mix: mix, fit: fit, lum: lum };
})();
