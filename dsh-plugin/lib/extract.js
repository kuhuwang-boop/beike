/** 从老师的资料里提取纯文本：Word(.docx)、PowerPoint(.pptx)、纯文本类文件 */
import JSZip from 'jszip'

const MAX = 400000

function xmlText(xml, paraTag) {
  return xml
    .replace(new RegExp(`</${paraTag}>`, 'g'), '\n')
    .replace(/<a:br\/>|<w:br\/>|<w:tab\/>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function docx(buf) {
  const zip = await JSZip.loadAsync(buf)
  const f = zip.file('word/document.xml')
  if (!f) throw new Error('不是有效的 Word 文件')
  return xmlText(await f.async('string'), 'w:p')
}

async function pptx(buf) {
  const zip = await JSZip.loadAsync(buf)
  const num = p => Number(p.match(/(\d+)\.xml$/)?.[1] || 0)
  const slides = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a, b) => num(a) - num(b))
  if (!slides.length) throw new Error('不是有效的 PowerPoint 文件')
  const out = []
  for (const p of slides) {
    const n = num(p)
    let t = `【第${n}页】\n` + xmlText(await zip.file(p).async('string'), 'a:p')
    const note = zip.file(`ppt/notesSlides/notesSlide${n}.xml`)
    if (note) {
      const nt = xmlText(await note.async('string'), 'a:p').replace(/^\d+$/m, '').trim()
      if (nt) t += `\n（备注）${nt}`
    }
    out.push(t)
  }
  return out.join('\n\n')
}

/**
 * @param {string} name 文件名（用于判断类型）
 * @param {Buffer} buf 文件内容
 * @returns {Promise<string>} 纯文本
 */
export async function extractText(name, buf) {
  const ext = String(name).toLowerCase().split('.').pop()
  let t
  if (ext === 'docx') t = await docx(buf)
  else if (ext === 'pptx') t = await pptx(buf)
  else if (['txt', 'md', 'markdown', 'csv', 'json', 'html', 'htm', 'tex', 'rtf'].includes(ext)) {
    t = buf.toString('utf8')
    if (ext === 'html' || ext === 'htm') t = t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ')
  } else if (ext === 'doc' || ext === 'ppt') {
    throw new Error(`旧版 .${ext} 格式无法直接读取，请另存为 .${ext}x 后再添加`)
  } else if (ext === 'pdf') {
    throw new Error('PDF 请先转成文字：可以让 AI 用 office_convert 把 PDF 转为 docx 或文本，再把文本交给 beike_add_material 的 text 参数')
  } else {
    throw new Error(`暂不支持 .${ext} 文件，支持 docx、pptx、txt、md`)
  }
  t = t.replace(/\u0000/g, '').trim()
  if (!t) throw new Error('这个文件里没有读到文字（可能是扫描件或图片）')
  return t.slice(0, MAX)
}
