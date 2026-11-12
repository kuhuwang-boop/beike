/*
 * 学校 PPT 模板解析：在浏览器里读取 .pptx，取出封面版式与内容版式的背景、母版装饰（校徽、色条）、
 * 标题与正文占位符的位置、主题色和字体。思路参考 pptx-compose-skill（pptx-unit，MIT）“按单位模板出稿”。
 * 依赖 JSZip。坐标统一换算为 16:9 页面（13.333 × 7.5 英寸）。
 */
(function () {
  var EMU = 914400;
  var IMG_OK = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif' };

  function xml(str) { return new DOMParser().parseFromString(str, 'application/xml'); }
  function kids(el, name) { var out = []; if (!el) return out; for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === name) out.push(c); return out; }
  function kid(el, name) { return kids(el, name)[0] || null; }
  function path(el, names) { names.split('/').forEach(function (n) { el = kid(el, n); }); return el; }
  function all(el, name) { return el ? Array.prototype.slice.call(el.getElementsByTagNameNS('*', name)) : []; }
  function attrR(el, name) { return el ? (el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', name) || el.getAttribute('r:' + name)) : null; }
  function dir(p) { return p.replace(/[^/]*$/, ''); }
  function resolve(base, target) {
    if (target.charAt(0) === '/') return target.slice(1);
    var parts = (dir(base) + target).split('/'), out = [];
    parts.forEach(function (x) { if (x === '..') out.pop(); else if (x !== '.' && x !== '') out.push(x); });
    return out.join('/');
  }

  function Reader(zip) { this.zip = zip; this.cache = {}; }
  Reader.prototype.doc = function (p) {
    var self = this;
    if (!this.cache[p]) {
      var f = this.zip.file(p);
      this.cache[p] = f ? f.async('string').then(xml) : Promise.resolve(null);
    }
    return this.cache[p];
  };
  Reader.prototype.rels = function (p) {
    var rp = dir(p) + '_rels/' + p.split('/').pop() + '.rels';
    return this.doc(rp).then(function (d) {
      var m = {};
      all(d, 'Relationship').forEach(function (r) { m[r.getAttribute('Id')] = { target: r.getAttribute('TargetMode') === 'External' ? null : resolve(p, r.getAttribute('Target')), type: r.getAttribute('Type') || '' }; });
      return m;
    });
  };
  function relOfType(rels, t) { for (var k in rels) if (rels[k].type.slice(-t.length) === t) return rels[k].target; return null; }

  /* ---------- 颜色 ---------- */
  function hexOf(el, scheme, clrMap) {
    if (!el) return null;
    var c = kid(el, 'srgbClr') || kid(el, 'schemeClr') || kid(el, 'sysClr') || kid(el, 'prstClr');
    if (!c) return null;
    var v = null;
    if (c.localName === 'srgbClr') v = c.getAttribute('val');
    else if (c.localName === 'sysClr') v = c.getAttribute('lastClr');
    else if (c.localName === 'prstClr') v = ({ black: '000000', white: 'FFFFFF' })[c.getAttribute('val')] || null;
    else {
      var n = c.getAttribute('val');
      n = (clrMap && clrMap[n]) || ({ bg1: 'lt1', tx1: 'dk1', bg2: 'lt2', tx2: 'dk2' })[n] || n;
      v = scheme[n] || null;
    }
    if (!v) return null;
    // 亮度修饰（lumMod / lumOff），模板里很常见
    var mod = kid(c, 'lumMod'), off = kid(c, 'lumOff');
    if (mod || off) {
      var rgb = [0, 2, 4].map(function (i) { return parseInt(v.substr(i, 2), 16); });
      var m = mod ? +mod.getAttribute('val') / 100000 : 1, o = off ? +off.getAttribute('val') / 100000 : 0;
      v = rgb.map(function (x) { var y = Math.max(0, Math.min(255, Math.round(x * m + 255 * o))); return (y < 16 ? '0' : '') + y.toString(16); }).join('');
    }
    return v.toUpperCase();
  }
  function lum(h) { if (!h) return 1; return (0.299 * parseInt(h.substr(0, 2), 16) + 0.587 * parseInt(h.substr(2, 2), 16) + 0.114 * parseInt(h.substr(4, 2), 16)) / 255; }
  function sat(h) { var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16), mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; }

  /* ---------- 形状与占位符 ---------- */
  function xfrmOf(spPr, k, T) {
    var x = path(spPr, 'xfrm') ;
    if (!x) return null;
    var off = kid(x, 'off'), ext = kid(x, 'ext');
    if (!off || !ext) return null;
    var p = T([+off.getAttribute('x'), +off.getAttribute('y')]), w = +ext.getAttribute('cx') * T.sx, h = +ext.getAttribute('cy') * T.sy;
    return { x: p[0] / EMU * k, y: p[1] / EMU * k, w: w / EMU * k, h: h / EMU * k };
  }
  function identity() { var f = function (p) { return p; }; f.sx = 1; f.sy = 1; return f; }
  function groupT(parent, grpSpPr) {
    var x = kid(grpSpPr, 'xfrm');
    if (!x) return parent;
    var off = kid(x, 'off'), ext = kid(x, 'ext'), co = kid(x, 'chOff'), ce = kid(x, 'chExt');
    if (!off || !ext || !co || !ce) return parent;
    var sx = (+ext.getAttribute('cx')) / Math.max(1, +ce.getAttribute('cx')), sy = (+ext.getAttribute('cy')) / Math.max(1, +ce.getAttribute('cy'));
    var f = function (p) { return parent([+off.getAttribute('x') + (p[0] - co.getAttribute('x')) * sx, +off.getAttribute('y') + (p[1] - co.getAttribute('y')) * sy]); };
    f.sx = parent.sx * sx; f.sy = parent.sy * sy;
    return f;
  }
  function phOf(sp) {
    var nv = kid(sp, 'nvSpPr') || kid(sp, 'nvPicPr');
    var ph = nv ? path(nv, 'nvPr/ph') : null;
    if (!ph) return null;
    return { type: ph.getAttribute('type') || 'body', idx: ph.getAttribute('idx') || '0' };
  }
  function hasText(sp) {
    return all(sp, 't').some(function (t) { return t.textContent.trim() !== ''; });
  }

  /* 收集一个部件（母版 / 版式）上的装饰与占位符 */
  function collect(R, part, k, scheme, clrMap) {
    return Promise.all([R.doc(part), R.rels(part)]).then(function (res) {
      var d = res[0], rels = res[1], out = { pics: [], rects: [], ph: {}, bg: null };
      if (!d) return out;
      var root = d.documentElement, cSld = kid(root, 'cSld');
      out.showMasterSp = root.getAttribute('showMasterSp') !== '0';
      // 背景
      var bg = kid(cSld, 'bg');
      if (bg) {
        var bgPr = kid(bg, 'bgPr'), bgRef = kid(bg, 'bgRef');
        if (bgPr) {
          var blip = path(bgPr, 'blipFill/blip');
          if (blip && rels[attrR(blip, 'embed')]) out.bg = { img: rels[attrR(blip, 'embed')].target };
          else if (kid(bgPr, 'solidFill')) out.bg = { color: hexOf(kid(bgPr, 'solidFill'), scheme, clrMap) };
          else if (kid(bgPr, 'gradFill')) { var gs = all(bgPr, 'gs')[0]; out.bg = { color: hexOf(gs, scheme, clrMap) }; }
        } else if (bgRef) out.bg = { color: hexOf(bgRef, scheme, clrMap) };
      }
      function walk(tree, T) {
        for (var c = tree.firstElementChild; c; c = c.nextElementSibling) {
          var n = c.localName;
          if (n === 'grpSp') { walk(c, groupT(T, kid(c, 'grpSpPr'))); continue; }
          if (n !== 'sp' && n !== 'pic') continue;
          var ph = phOf(c), spPr = kid(c, 'spPr'), box = xfrmOf(spPr, k, T);
          if (ph) { if (box) out.ph[ph.type + ':' + ph.idx] = { box: box, type: ph.type, idx: ph.idx, el: c }; continue; }
          if (!box || box.w < 0.02 || box.h < 0.02) continue;
          if (n === 'pic') {
            var b = path(c, 'blipFill/blip'), rel = b && rels[attrR(b, 'embed')];
            if (rel && rel.target) out.pics.push({ src: rel.target, x: box.x, y: box.y, w: box.w, h: box.h });
          } else if (!hasText(c)) {
            var geom = path(spPr, 'prstGeom'), g = geom ? geom.getAttribute('prst') : '';
            var fill = kid(spPr, 'solidFill');
            if ((g === 'rect' || g === 'roundRect') && fill) {
              var col = hexOf(fill, scheme, clrMap);
              if (col) out.rects.push({ x: box.x, y: box.y, w: box.w, h: box.h, fill: col, r: g === 'roundRect' ? Math.min(box.w, box.h) * 0.16 : 0 });
            }
            var bf = path(spPr, 'blipFill/blip'), brel = bf && rels[attrR(bf, 'embed')];
            if (brel && brel.target) out.pics.push({ src: brel.target, x: box.x, y: box.y, w: box.w, h: box.h });
          }
        }
      }
      walk(path(cSld, 'spTree'), identity());
      return out;
    });
  }

  function findPh(phs, types) {
    for (var i = 0; i < types.length; i++) for (var key in phs) if (phs[key].type === types[i]) return phs[key];
    return null;
  }
  function bodyPh(phs) {
    var best = null;
    for (var key in phs) {
      var p = phs[key];
      if (['body', 'obj', 'tbl', 'chart', 'pic'].indexOf(p.type) < 0 && !(p.type === 'body')) continue;
      if (!best || p.box.w * p.box.h > best.box.w * best.box.h) best = p;
    }
    return best;
  }
  function textStyle(phEl, masterDoc, styleName, scheme, clrMap) {
    var rpr = null;
    if (phEl) rpr = all(phEl, 'defRPr')[0] || all(phEl, 'rPr')[0] || null;
    var size = rpr && rpr.getAttribute('sz') ? +rpr.getAttribute('sz') / 100 : null;
    var color = rpr ? hexOf(kid(rpr, 'solidFill'), scheme, clrMap) : null;
    if (masterDoc && (!size || !color)) {
      var st = all(masterDoc, styleName)[0], lv = st ? (all(st, 'lvl1pPr')[0]) : null, dr = lv ? kid(lv, 'defRPr') : null;
      if (dr) {
        if (!size && dr.getAttribute('sz')) size = +dr.getAttribute('sz') / 100;
        if (!color) color = hexOf(kid(dr, 'solidFill'), scheme, clrMap);
      }
    }
    return { size: size, color: color };
  }

  /* ---------- 主流程 ---------- */
  function parse(file) {
    return JSZip.loadAsync(file).then(function (zip) {
      var R = new Reader(zip);
      if (!zip.file('ppt/presentation.xml')) throw new Error('这不是有效的 PPT 文件（.pptx）');
      return Promise.all([R.doc('ppt/presentation.xml'), R.rels('ppt/presentation.xml')]).then(function (res) {
        var pres = res[0], prels = res[1], sz = all(pres, 'sldSz')[0];
        var cx = sz ? +sz.getAttribute('cx') : 12192000, cy = sz ? +sz.getAttribute('cy') : 6858000;
        if (Math.abs(cx / cy - 16 / 9) > 0.03) throw new Error('目前只支持 16:9 宽屏模板（这份模板是 ' + (Math.abs(cx / cy - 4 / 3) < 0.03 ? '4:3' : '其他比例') + '）。可以在 PowerPoint 里点“设计 → 幻灯片大小 → 宽屏(16:9)”，另存后再上传。');
        var k = 13.333 / (cx / EMU);
        var slideIds = all(pres, 'sldId').map(function (s) { return prels[attrR(s, 'id')] && prels[attrR(s, 'id')].target; }).filter(Boolean);
        var masterId = all(pres, 'sldMasterId')[0], masterPath = masterId ? prels[attrR(masterId, 'id')].target : 'ppt/slideMasters/slideMaster1.xml';
        return Promise.all([R.doc(masterPath), R.rels(masterPath), Promise.all(slideIds.slice(0, 12).map(function (sp) { return R.rels(sp).then(function (r) { return relOfType(r, '/slideLayout'); }); }))]).then(function (res2) {
          var mdoc = res2[0], mrels = res2[1], slideLayouts = res2[2];
          var themePath = relOfType(mrels, '/theme');
          var layoutPaths = all(mdoc, 'sldLayoutId').map(function (l) { return mrels[attrR(l, 'id')] && mrels[attrR(l, 'id')].target; }).filter(Boolean);
          // 颜色映射
          var cm = all(mdoc, 'clrMap')[0], clrMap = {};
          if (cm) ['bg1', 'tx1', 'bg2', 'tx2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].forEach(function (n) { if (cm.getAttribute(n)) clrMap[n] = cm.getAttribute(n); });
          return Promise.all([R.doc(themePath), Promise.all(layoutPaths.map(function (lp) { return R.doc(lp).then(function (d) { return { path: lp, type: d ? d.documentElement.getAttribute('type') || '' : '', name: d ? (all(d, 'cSld')[0] || { getAttribute: function () { return ''; } }).getAttribute('name') || '' : '' }; }); }))]).then(function (res3) {
            var tdoc = res3[0], layouts = res3[1], scheme = {};
            var cs = all(tdoc, 'clrScheme')[0];
            if (cs) for (var c = cs.firstElementChild; c; c = c.nextElementSibling) { var v = kid(c, 'srgbClr') ? kid(c, 'srgbClr').getAttribute('val') : (kid(c, 'sysClr') ? kid(c, 'sysClr').getAttribute('lastClr') : null); if (v) scheme[c.localName] = v.toUpperCase(); }
            var minor = all(tdoc, 'minorFont')[0], major = all(tdoc, 'majorFont')[0];
            var font = (minor && kid(minor, 'ea') && kid(minor, 'ea').getAttribute('typeface')) || (major && kid(major, 'ea') && kid(major, 'ea').getAttribute('typeface')) || '';
            if (!font || /^\+/.test(font)) font = 'Microsoft YaHei';
            // 选封面版式与内容版式：优先用模板里实际用到的页面
            var byPath = {}; layouts.forEach(function (l) { byPath[l.path] = l; });
            var cover = slideLayouts[0] || null, content = null;
            for (var i = 1; i < slideLayouts.length; i++) if (slideLayouts[i] && slideLayouts[i] !== cover && byPath[slideLayouts[i]] && byPath[slideLayouts[i]].type !== 'title') { content = slideLayouts[i]; break; }
            if (!cover) { var t = layouts.filter(function (l) { return l.type === 'title'; })[0]; cover = t ? t.path : (layouts[0] && layouts[0].path); }
            if (!content) {
              var pref = ['obj', 'titleOnly', 'tx', 'twoObj'];
              for (var j = 0; j < pref.length && !content; j++) { var f = layouts.filter(function (l) { return l.type === pref[j]; })[0]; if (f) content = f.path; }
              if (!content) content = (layouts.filter(function (l) { return l.path !== cover; })[0] || layouts[0] || {}).path;
            }
            return Promise.all([collect(R, masterPath, k, scheme, clrMap), collect(R, cover, k, scheme, clrMap), collect(R, content, k, scheme, clrMap)]).then(function (parts) {
              return build(R, zip, parts[0], parts[1], parts[2], mdoc, scheme, clrMap, font, file.name);
            });
          });
        });
      });
    });
  }

  function build(R, zip, master, cov, con, mdoc, scheme, clrMap, font, filename) {
    function merge(layout, isCover) {
      var deco = layout.showMasterSp ? { pics: master.pics.slice(), rects: master.rects.slice() } : { pics: [], rects: [] };
      deco.pics = deco.pics.concat(layout.pics); deco.rects = deco.rects.concat(layout.rects);
      var bg = layout.bg || master.bg || { color: scheme.lt1 || 'FFFFFF' };
      // 铺满整页的图片视为背景
      deco.pics = deco.pics.filter(function (p) {
        if (p.w > 12.6 && p.h > 7.0 && p.x < 0.4 && p.y < 0.4) { bg = { img: p.src }; return false; }
        return true;
      });
      var phs = {}; for (var a in master.ph) phs[a] = master.ph[a]; for (var b in layout.ph) phs[b] = layout.ph[b];
      // 版式里的占位符若没写位置，继承母版同类型占位符
      var tp = isCover ? (findPh(layout.ph, ['ctrTitle', 'title']) || findPh(master.ph, ['title'])) : (findPh(layout.ph, ['title']) || findPh(master.ph, ['title']));
      var bp = isCover ? (findPh(layout.ph, ['subTitle']) || null) : (bodyPh(layout.ph) || bodyPh(master.ph));
      var title = tp ? tp.box : (isCover ? { x: 0.9, y: 2.6, w: 9, h: 1.4 } : { x: 0.6, y: 0.4, w: 12.1, h: 0.9 });
      var st = textStyle(tp && tp.el, mdoc, 'titleStyle', scheme, clrMap);
      var body = bp ? bp.box : (isCover ? { x: title.x, y: title.y + title.h + 0.1, w: title.w, h: 0.8 } : { x: title.x, y: title.y + title.h + 0.25, w: Math.max(title.w, 11), h: 7.5 - (title.y + title.h + 0.25) - 0.55 });
      if (!isCover) {
        // 正文区要在标题下方、且不压住页面边缘
        if (body.y < title.y + title.h) { var top = title.y + title.h + 0.15; body.h -= top - body.y; body.y = top; }
        body.x = Math.max(0.3, body.x); body.w = Math.min(13.333 - body.x - 0.3, body.w);
        body.h = Math.min(7.5 - body.y - 0.35, body.h);
        if (body.h < 3) body.h = Math.max(3, 7.5 - body.y - 0.45);
        // 正文框偏窄且右侧没有装饰时，拉宽到页面右边距，避免右边空出一大块
        if (body.w < 10.5) {
          var right = body.x + body.w, limit = 13.333 - Math.max(0.5, body.x);
          deco.pics.concat(deco.rects).forEach(function (o) { if (o.x >= right - 0.05 && o.y < body.y + body.h && o.y + o.h > body.y && o.w < 6) limit = Math.min(limit, o.x - 0.2); });
          if (limit > right + 0.5) body.w = limit - body.x;
        }
      }
      return { bg: bg, pics: deco.pics.slice(0, 12), rects: deco.rects.slice(0, 20), title: { x: title.x, y: title.y, w: title.w, h: title.h, size: Math.min(isCover ? 44 : 34, Math.max(20, st.size || (isCover ? 40 : 28))), color: st.color }, body: body };
    }
    var cover = merge(cov, true), content = merge(con, false);
    // 收集要上传的图片
    var files = {}, n = 0, skipped = 0;
    function take(src) {
      var ext = src.split('.').pop().toLowerCase();
      if (!IMG_OK[ext]) { skipped++; return null; }
      for (var key in files) if (files[key].src === src) return '@' + key;
      var key2 = 'i' + (n++);
      files[key2] = { src: src, ext: ext };
      return '@' + key2;
    }
    [cover, content].forEach(function (L) {
      if (L.bg.img) { var r = take(L.bg.img); if (r) L.bg.img = r; else { delete L.bg.img; L.bg.color = L.bg.color || scheme.lt1 || 'FFFFFF'; } }
      L.pics = L.pics.map(function (p) { var r = take(p.src); return r ? { src: r, x: p.x, y: p.y, w: p.w, h: p.h } : null; }).filter(Boolean);
    });
    var keys = Object.keys(files);
    return Promise.all(keys.map(function (key) { return zip.file(files[key].src).async('blob').then(function (b) { files[key].blob = new Blob([b], { type: IMG_OK[files[key].ext] }); }); })).then(function () {
      return Promise.all([sample(cover, files), sample(content, files)]).then(function (lums) {
        var accents = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(function (a) { return scheme[a]; }).filter(Boolean);
        var darkContent = lums[1].lum < 0.45, darkCover = lums[0].lum < 0.5;
        // 主色优先取模板实际画出来的颜色：内容页标题色 → 封面底色 → 装饰色块（按面积） → 主题强调色
        var bgL = lums[1].lum, ok = function (h, c) { return h && sat(h) > 0.28 && Math.abs(lum(h) - bgL) > (c || 0.28); };
        var rectCols = content.rects.concat(cover.rects).slice().sort(function (a, b) { return b.w * b.h - a.w * a.h; }).map(function (r) { return r.fill; });
        var cand = [content.title.color, lums[0].hex].concat(rectCols, accents);
        var primary = cand.filter(function (h) { return ok(h); })[0] || (darkContent ? 'FFFFFF' : (scheme.dk2 || '1E3A8A'));
        var far = function (a, b) { var d = 0; for (var i = 0; i < 6; i += 2) d += Math.abs(parseInt(a.substr(i, 2), 16) - parseInt(b.substr(i, 2), 16)); return d > 120; };
        var accent = rectCols.concat(accents).filter(function (h) { return ok(h, 0.18) && far(h, primary); })[0] || 'F97316';
        var text = darkContent ? 'F1F5F9' : (scheme.dk1 && lum(scheme.dk1) < 0.4 ? scheme.dk1 : '1F2937');
        var bgc = lums[1].hex;
        var coverText = cover.title.color && Math.abs(lum(cover.title.color) - lums[0].lum) > 0.35 ? cover.title.color : (darkCover ? 'FFFFFF' : primary);
        var data = {
          v: 1, font: font,
          colors: { primary: primary, accent: accent, text: text, bg: bgc, coverText: coverText, coverBg: lums[0].hex },
          cover: cover, content: content
        };
        var name = filename.replace(/\.(pptx|potx)$/i, '').slice(0, 40) || '学校模板';
        return { name: name, data: data, files: files, skipped: skipped };
      });
    });
  }

  /* 取背景（正文区/标题区）的平均颜色，用来判断深浅底、决定文字颜色 */
  function sample(L, files) {
    var box = L.body.w > 1 ? L.body : L.title;
    if (!L.bg.img) return Promise.resolve({ lum: lum(L.bg.color || 'FFFFFF'), hex: L.bg.color || 'FFFFFF' });
    var f = files[L.bg.img.slice(1)];
    return new Promise(function (res) {
      var url = URL.createObjectURL(f.blob), im = new Image();
      im.onload = function () {
        var cv = document.createElement('canvas'); cv.width = 64; cv.height = 36;
        var cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, 64, 36);
        var x0 = Math.floor(box.x / 13.333 * 64), y0 = Math.floor(box.y / 7.5 * 36), w = Math.max(1, Math.floor(box.w / 13.333 * 64)), h = Math.max(1, Math.floor(box.h / 7.5 * 36));
        var px = cx.getImageData(Math.min(63, x0), Math.min(35, y0), Math.min(w, 64 - x0), Math.min(h, 36 - y0)).data, s = [0, 0, 0], n = 0;
        for (var i = 0; i < px.length; i += 4) { s[0] += px[i]; s[1] += px[i + 1]; s[2] += px[i + 2]; n++; }
        URL.revokeObjectURL(url);
        var hex = s.map(function (v) { v = Math.round(v / n); return (v < 16 ? '0' : '') + v.toString(16); }).join('').toUpperCase();
        res({ lum: lum(hex), hex: hex });
      };
      im.onerror = function () { URL.revokeObjectURL(url); res({ lum: 1, hex: 'FFFFFF' }); };
      im.src = url;
    });
  }

  /* ---------- 界面：上传 / 预览确认 / 管理 ---------- */
  var SAMPLE = [
    { layout: 'title', title: '这节课的题目', subtitle: '课程名称 · 第几章' },
    { layout: 'bullets', title: '内容页标题', bullets: ['第一个要点', '第二个要点', '第三个要点'] },
    { layout: 'diagram', title: '结构图页', lead: '一句导语', diagram: { type: 'flow', hi: 1, items: [{ t: '第一步', d: '说明' }, { t: '第二步', d: '说明' }, { t: '第三步', d: '说明' }] } }
  ];
  function esc2(x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function csrf() { var m = document.querySelector('meta[name=csrf]'); return m ? m.content : ''; }
  var ACCEPT = '.pptx,.potx,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.presentationml.template';
  /* 先弹出页面内的选择窗口：由老师亲手点“选择文件”，浏览器（尤其 Safari、微信）才会放行文件选择框 */
  function upload(onSaved) {
    uiModal({
      title: '上传学校 PPT 模板',
      html: '<label class="tpl-drop"><input type="file" accept="' + ACCEPT + '"><span class="tpl-drop-i">' + ico('upload', 'xl') + '</span><b>点这里选择模板文件</b><small>支持 16:9 的 .pptx / .potx，也可以把文件拖到这里</small></label>' +
        '<p class="muted small" style="margin:10px 0 0">系统会读取模板的背景、校徽、色条、标题位置、主题色和字体，下一步先给你看效果。</p>',
      buttons: [{ text: '取消', value: function () { return null; } }],
      onOpen: function (bg, done) {
        var inp = bg.querySelector('.tpl-drop input'), lab = bg.querySelector('.tpl-drop');
        inp.addEventListener('change', function () { if (inp.files[0]) { done(null); handle(inp.files[0], onSaved); } });
        ['dragenter', 'dragover'].forEach(function (ev) { lab.addEventListener(ev, function (e) { e.preventDefault(); lab.classList.add('over'); }); });
        ['dragleave', 'drop'].forEach(function (ev) { lab.addEventListener(ev, function (e) { e.preventDefault(); lab.classList.remove('over'); }); });
        lab.addEventListener('drop', function (e) { var f = e.dataTransfer.files[0]; if (f) { done(null); handle(f, onSaved); } });
      }
    });
  }
  function handle(f, onSaved) {
    if (!/\.(pptx|potx)$/i.test(f.name)) { toast('请选择 .pptx 格式的 PPT 模板（.ppt 旧格式请先在 PowerPoint 里另存为 .pptx）', true); return; }
    (function () {
      if (f.size > 60 * 1024 * 1024) { toast('模板文件太大（超过 60MB）', true); return; }
      busy(true, '正在读取模板…');
      parse(f).then(function (r) {
        busy(false);
        // 预览用本地图片地址
        var urls = {}, d = JSON.stringify(r.data);
        Object.keys(r.files).forEach(function (k) { urls[k] = URL.createObjectURL(r.files[k].blob); d = d.split('"@' + k + '"').join(JSON.stringify(urls[k])); });
        var tmp = { id: 'preview', name: r.name, data: JSON.parse(d) };
        DeckKit.addTemplates([tmp]);
        var html = '<p class="ui-msg muted small">系统读取了模板里的背景、校徽、色条、标题位置和主题色。下面是套用后的效果，确认没问题再保存。' + (r.skipped ? '<br>有 ' + r.skipped + ' 张图片是 EMF / SVG 等格式，暂时无法使用，已略过。' : '') + '</p>' +
          '<div class="tpl-prev">' + SAMPLE.map(function (sl, i) { return '<div class="slide-preview">' + DeckKit.preview(sl, i, 'tpl:preview', '') + '</div>'; }).join('') + '</div>' +
          '<label class="tpl-name">模板名称<input class="ui-input" value="' + esc2(r.name) + '" maxlength="40"></label>';
        uiModal({ title: '套用学校模板', html: html, cls: 'wide', buttons: [
          { text: '取消', value: function () { return null; } },
          { text: '保存并使用', cls: 'primary', value: function (bg) { return bg.querySelector('.tpl-name input').value.trim() || r.name; } }
        ] }).then(function (name) {
          Object.keys(urls).forEach(function (k) { URL.revokeObjectURL(urls[k]); });
          if (!name) return;
          var fd = new FormData();
          fd.append('name', name); fd.append('data', JSON.stringify(r.data));
          Object.keys(r.files).forEach(function (k) { fd.append(k, r.files[k].blob, k + '.' + r.files[k].ext); });
          busy(true, '正在保存模板…');
          fetch('/templates', { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf(), Accept: 'application/json' } })
            .then(function (res) { return res.json().then(function (j) { if (!res.ok || j.error) throw new Error(j.error || '保存失败'); return j; }); })
            .then(function (j) { busy(false); toast('模板已保存'); onSaved && onSaved(j.template); })
            .catch(function (e) { busy(false); toast(e.message, true); });
        });
      }).catch(function (e) { busy(false); toast(e.message || '读取模板失败', true); });
    })();
  }
  function manage(list, onChange) {
    var html = list.length ? '<div class="tpl-list">' + list.map(function (t) {
      return '<div class="tpl-row" data-id="' + t.id + '"><div class="slide-preview mini">' + DeckKit.preview(SAMPLE[1], 1, 'tpl:' + t.id, '') + '</div><div class="tpl-meta"><b>' + esc2(t.name) + '</b></div>' +
        '<button type="button" class="btn ghost sm" data-act="rename">' + ico('pencil') + '改名</button><button type="button" class="btn ghost sm danger-text" data-act="del">' + ico('trash') + '删除</button></div>';
    }).join('') + '</div>' : '<p class="muted">还没有上传过学校模板。</p>';
    uiModal({ title: '我的学校模板', html: html, cls: 'wide', buttons: [{ text: '上传新模板', icon: 'upload', value: function () { return 'up'; } }, { text: '关闭', cls: 'primary', value: function () { return null; } }],
      onOpen: function (bg, done) {
        bg.querySelectorAll('.tpl-row button').forEach(function (b) {
          b.addEventListener('click', function () {
            var id = +b.closest('.tpl-row').dataset.id, t = list.filter(function (x) { return x.id === id; })[0];
            if (b.dataset.act === 'rename') {
              done(null);
              uiPrompt('模板改名', '', t.name, { ok: '保存' }).then(function (n) {
                if (!n || !n.trim()) return;
                api('/templates/' + id + '/rename', { name: n.trim() }, false).then(function () { t.name = n.trim(); toast('已改名'); onChange && onChange(); }).catch(function (e) { toast(e.message, true); });
              });
            } else {
              done(null);
              uiConfirm('删除模板「' + t.name + '」？用到它的课件会改回“学院蓝”配色。', { danger: true, ok: '删除' }).then(function (ok) {
                if (!ok) return;
                api('/templates/' + id + '/delete', {}, false).then(function () { toast('已删除'); onChange && onChange(); }).catch(function (e) { toast(e.message, true); });
              });
            }
          });
        });
      }
    }).then(function (v) { if (v === 'up') upload(function () { onChange && onChange(); }); });
  }
  /* 把内置配色和模板填进下拉框 */
  function fillSelect(sel, list, value) {
    if (!sel) return;
    var h = themeGroups().map(function (g) { return '<optgroup label="内置配色 · ' + g[0] + '">' + g[1].map(function (k) { return '<option value="' + k + '">' + DeckKit.THEMES[k].name + '</option>'; }).join('') + '</optgroup>'; }).join('');
    if (list.length) h += '<optgroup label="学校模板">' + list.map(function (t) { return '<option value="tpl:' + t.id + '">' + esc2(t.name) + '</option>'; }).join('') + '</optgroup>';
    h += '<optgroup label="——"><option value="__upload">＋ 上传学校模板…</option>' + (list.length ? '<option value="__manage">管理我的模板…</option>' : '') + '</optgroup>';
    sel.innerHTML = h;
    sel.value = value;
    if (sel.value !== value) sel.value = 'blue';
  }

  /* 内置配色按分组：[['经典', ['blue', ...]], ...] */
  function themeGroups() {
    var b = DeckKit.THEMES, out = [], idx = {};
    Object.keys(b).forEach(function (k) { var g = b[k].g || '其他'; if (!(g in idx)) { idx[g] = out.length; out.push([g, []]); } out[idx[g]][1].push(k); });
    return out;
  }
  /* 样式选择窗口：内置配色 + 学校模板（带缩略图）+ 上传 */
  function themeName(v, list) {
    if (/^tpl:/.test(v)) { var t = list.filter(function (x) { return 'tpl:' + x.id === v; })[0]; return t ? t.name : '学院蓝'; }
    return (DeckKit.THEMES[v] || DeckKit.THEMES.blue).name;
  }
  function pick(current, list, onPick, course) {
    var card = function (val, name, tag) {
      var tt = DeckKit.THEMES[val], sw = tt ? '<i class="sty-sw">' + [tt.cover, tt.primary, tt.accent, tt.soft, tt.bg].map(function (x) { return '<i style="background:#' + x + '"></i>'; }).join('') + '</i>' : '';
      return '<button type="button" class="sty' + (val === current ? ' on' : '') + '" data-v="' + esc2(val) + '"><div class="slide-preview">' + DeckKit.preview(SAMPLE[0], 0, val, course || '') + '</div><span><b>' + esc2(name) + '</b>' + sw + (tag ? '<em>' + tag + '</em>' : '') + '</span></button>';
    };
    var b = DeckKit.THEMES;
    var html = '<div class="sty-h"><b>学校模板</b><a href="/brand" class="small">学校模板与校徽设置 ›</a></div><div class="sty-grid">' +
      list.map(function (t) { return card('tpl:' + t.id, t.name, '学校模板'); }).join('') +
      '<button type="button" class="sty sty-up" data-v="__upload"><span class="sty-up-i">' + ico('upload', 'xl') + '</span><b>上传学校模板</b><small>.pptx · 16:9</small></button></div>' +
      '<div class="sty-h"><b>内置配色</b><span class="muted small">' + Object.keys(b).length + ' 套</span></div><div class="sty-tabs">' +
      themeGroups().map(function (g, i) { return '<button type="button" class="sty-tab" data-g="' + i + '">' + g[0] + '</button>'; }).join('') + '</div>' +
      themeGroups().map(function (g, i) { return '<div class="sty-grid sty-gp" data-g="' + i + '">' + g[1].map(function (k) { return card(k, b[k].name); }).join('') + '</div>'; }).join('');
    uiModal({ title: '课件样式', html: html, cls: 'wide sty-modal', buttons: [{ text: '关闭', value: function () { return null; } }],
      onOpen: function (bg, done) {
        bg.querySelectorAll('.sty').forEach(function (btn) { btn.addEventListener('click', function () { done(btn.dataset.v); }); });
        var tabs = bg.querySelectorAll('.sty-tab'), gps = bg.querySelectorAll('.sty-gp');
        function show(i) { tabs.forEach(function (t) { t.classList.toggle('on', t.dataset.g == i); }); gps.forEach(function (g) { g.hidden = g.dataset.g != i; }); }
        tabs.forEach(function (t) { t.addEventListener('click', function () { show(t.dataset.g); }); });
        var cur = bg.querySelector('.sty-gp .sty.on');
        show(cur ? cur.closest('.sty-gp').dataset.g : 0);
      }
    }).then(function (v) {
      if (!v) return;
      if (v === '__upload') upload(function (tpl) { onPick('tpl:' + tpl.id, tpl); });
      else onPick(v);
    });
  }

  window.TplKit = { parse: parse, upload: upload, manage: manage, fillSelect: fillSelect, pick: pick, themeName: themeName };
})();
