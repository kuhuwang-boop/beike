/* 在浏览器里提取 Word / PPT / PDF / 文本 的文字（不上传原文件，速度快、服务器无需额外组件） */
(function () {
  var MAX = 20 * 1024 * 1024;

  function xmlText(xml, paraTag, textTag) {
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    var out = [];
    var ps = doc.getElementsByTagName(paraTag);
    for (var i = 0; i < ps.length; i++) {
      var ts = ps[i].getElementsByTagName(textTag), line = '';
      for (var k = 0; k < ts.length; k++) line += ts[k].textContent;
      if (line.trim()) out.push(line.trim());
    }
    return out;
  }

  function docx(buf) {
    return JSZip.loadAsync(buf).then(function (z) {
      var f = z.file('word/document.xml');
      if (!f) throw new Error('不是有效的 .docx 文件');
      return f.async('string').then(function (x) { return xmlText(x, 'w:p', 'w:t').join('\n'); });
    });
  }

  function pptx(buf) {
    return JSZip.loadAsync(buf).then(function (z) {
      var slides = [], notes = {};
      z.forEach(function (path, f) {
        var m = path.match(/^ppt\/slides\/slide(\d+)\.xml$/);
        if (m) slides.push({ n: +m[1], f: f });
        var nm = path.match(/^ppt\/notesSlides\/notesSlide(\d+)\.xml$/);
        if (nm) notes[+nm[1]] = f;
      });
      if (!slides.length) throw new Error('不是有效的 .pptx 文件');
      slides.sort(function (a, b) { return a.n - b.n; });
      return Promise.all(slides.map(function (s) {
        return Promise.all([s.f.async('string'), notes[s.n] ? notes[s.n].async('string') : Promise.resolve('')]).then(function (r) {
          var body = xmlText(r[0], 'a:p', 'a:t').join('\n');
          var note = r[1] ? xmlText(r[1], 'a:p', 'a:t').filter(function (l) { return !/^\d+$/.test(l); }).join(' ') : '';
          return '【原第' + s.n + '页】\n' + body + (note ? '\n（备注：' + note + '）' : '');
        });
      })).then(function (arr) { return arr.join('\n\n'); });
    });
  }

  function pdf(buf) {
    if (!window.pdfjsLib) throw new Error('PDF 组件未加载');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/vendor/pdf.worker.min.js';
    return pdfjsLib.getDocument({ data: buf, cMapUrl: '/assets/vendor/cmaps/', cMapPacked: true }).promise.then(function (doc) {
      var ps = [];
      for (var i = 1; i <= doc.numPages; i++) {
        ps.push(doc.getPage(i).then(function (pg) {
          return pg.getTextContent().then(function (tc) {
            var t = '', lastY = null;
            tc.items.forEach(function (it) {
              var y = it.transform ? it.transform[5] : null;
              if (lastY !== null && y !== null && Math.abs(y - lastY) > 3) t += '\n';
              t += it.str; lastY = y;
            });
            return '【第' + pg.pageNumber + '页】\n' + t.trim();
          });
        }));
      }
      return Promise.all(ps).then(function (a) { return a.join('\n\n'); });
    });
  }

  function readBuf(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(new Error('读取文件失败')); };
      r.readAsArrayBuffer(file);
    });
  }

  function textOf(buf) {
    var u8 = new Uint8Array(buf);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) {
      try { return new TextDecoder('gb18030').decode(u8); } catch (e2) { return new TextDecoder().decode(u8); }
    }
  }

  window.DocExtract = {
    accept: '.docx,.pptx,.pdf,.txt,.md',
    file: function (file) {
      var name = file.name, ext = (name.split('.').pop() || '').toLowerCase();
      if (file.size > MAX) return Promise.reject(new Error('「' + name + '」超过 20MB'));
      if (ext === 'doc' || ext === 'ppt') return Promise.reject(new Error('「' + name + '」是旧版格式，请用 Office/WPS 另存为 .' + ext + 'x 后再上传'));
      return readBuf(file).then(function (buf) {
        if (ext === 'docx') return docx(buf);
        if (ext === 'pptx') return pptx(buf);
        if (ext === 'pdf') return pdf(buf);
        if (ext === 'txt' || ext === 'md') return textOf(buf);
        throw new Error('暂不支持「' + name + '」的格式，支持 Word(.docx)、PPT(.pptx)、PDF、TXT');
      }).then(function (text) {
        text = String(text || '').replace(/\n{3,}/g, '\n\n').trim();
        if (!text.replace(/【(原)?第\d+页】/g, '').trim()) throw new Error('「' + name + '」里没有读到文字（可能是扫描件或纯图片）');
        return { name: name, text: text };
      });
    }
  };
})();
