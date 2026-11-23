/**
 * Word 教案（.docx）：教学基本信息、教学方法、学情分析、目标、重难点、误区、教学过程、
 * 思政、板书、作业、反思，以及逐页课件内容与讲稿。用 jszip 直接写 WordprocessingML，不依赖其他库。
 */
import JSZip from 'jszip'
import { LAYOUT_NAMES, PHASES } from './core.js'
import { TYPES } from './profile.js'

const x = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
const run = (t, o = {}) => `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}${o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`
const para = (t, o = {}) => {
  const lines = String(t ?? '').split(/\r?\n/)
  return `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.center ? '<w:jc w:val="center"/>' : ''}${o.ind ? '<w:ind w:left="420"/>' : ''}</w:pPr>${lines.map((l, i) => (i ? '<w:r><w:br/></w:r>' : '') + run(l, o)).join('')}</w:p>`
}
const h1 = t => para(t, { style: 'Title', center: true })
const h2 = t => para(t, { style: 'Heading1' })
const h3 = t => para(t, { style: 'Heading2' })

function table(rows) {
  const cell = (t, b) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${para(t, { b })}</w:tc>`
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(k => `<w:${k} w:val="single" w:sz="4" w:color="999999"/>`).join('')}</w:tblBorders></w:tblPr>${rows.map((r, i) => `<w:tr>${r.map((c, j) => cell(c, i === 0 || j === 0)).join('')}</w:tr>`).join('')}</w:tbl>${para('')}`
}

function slideText(s) {
  const out = []
  if (s.subtitle) out.push(s.subtitle)
  if (s.lead) out.push(s.lead)
  for (const b of s.bullets || []) out.push('· ' + b)
  if (s.layout === 'two') {
    out.push(`【${s.left_title || '左'}】` + (s.left || []).join('；'))
    out.push(`【${s.right_title || '右'}】` + (s.right || []).join('；'))
  }
  if (s.diagram) for (const it of s.diagram.items) out.push(`· ${it.t}${it.d ? '：' + it.d : ''}${it.sub ? '（' + it.sub.join('、') + '）' : ''}`)
  if (s.layout === 'quiz') { out.push('问题：' + (s.question || '')); for (const o of s.options || []) out.push('  ' + o); if (s.answer) out.push('答案：' + s.answer) }
  if (s.layout === 'video' && s.video) out.push('（教学视频）' + (s.video.prompt || ''))
  return out.join('\n')
}

/**
 * @param {object} l 课次
 * @param {{ methods?: object[], school?: string }} [o]
 * @returns {Promise<Buffer>}
 */
export async function planDocx(l, o = {}) {
  const P = l.plan || {}
  let b = h1(`《${l.title}》教案`)
  b += para(`${o.school ? o.school + ' · ' : ''}${l.course}`, { center: true, color: '666666' })
  b += table([
    ['项目', '内容'],
    ['课程', l.course], ['课题', l.title], ['课时', `${l.minutes} 分钟`],
    ['课型', TYPES[l.lessonType]?.[0] || '新授课'],
    ...(l.audience ? [['授课对象', l.audience]] : []),
    ...(o.methods?.length ? [['教学方法', o.methods.map(m => m.name).join('、')]] : []),
  ])
  const sec = [
    ['analysis', '一、学情分析'], ['objectives', '二、教学目标'], ['key', '三、教学重点'], ['difficult', '四、教学难点'],
    ['misconceptions', '五、学生可能的误区及对策'], ['process', '六、教学过程'], ['ideology', '七、课程思政'],
    ['board', '八、板书设计'], ['homework', '九、作业与课后任务'], ['reflection', '十、课后反思'],
  ]
  for (const [k, t] of sec) {
    b += h2(t)
    b += para(P[k] || (k === 'reflection' ? '（课后填写）' : '（未填写）'), { color: P[k] ? undefined : '999999' })
  }
  if (o.methods?.length) {
    b += h2('附：本节课采用的教学方法')
    for (const m of o.methods) { b += h3(m.name); b += para(m.instructions || m.summary || '') }
  }
  if (l.slides?.length) {
    b += h2('附：课件内容与讲稿')
    l.slides.forEach((s, i) => {
      b += h3(`第 ${i + 1} 页 · ${s.title || LAYOUT_NAMES[s.layout] || ''}${s.phase && PHASES[s.phase] ? `（${PHASES[s.phase].split(' ')[0]}）` : ''}`)
      const t = slideText(s)
      if (t) b += para(t, { ind: true })
      if (s.notes) b += para('讲稿：' + s.notes, { ind: true, color: '555555' })
    })
  }
  return pack(b)
}

/** 通用：把若干段落写成 docx（标题 + 正文） */
export async function pack(body) {
  const z = new JSZip()
  z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
  z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
  z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
  const font = '<w:rFonts w:ascii="Microsoft YaHei" w:eastAsia="Microsoft YaHei" w:hAnsi="Microsoft YaHei"/>'
  z.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr>${font}<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="320" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="120" w:after="120"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/><w:szCs w:val="36"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="1F4E79"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="40"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style>` +
    `<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style></w:styles>`)
  z.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1300" w:bottom="1440" w:left="1300" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`)
  return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}
