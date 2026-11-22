/**
 * 在 Node 里导出 .pptx：直接运行网页版同一套渲染代码（deckkit.js + diagram.js），
 * 因此导出的 PPT 与网页预览完全一致：文字可编辑、结构图是原生形状、讲稿在备注里。
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const PptxGenJS = require('pptxgenjs')
const webDir = fileURLToPath(new URL('../web/', import.meta.url))
let kit = null

/** 加载一次渲染内核（vm 沙箱里提供最少的浏览器全局变量） */
function loadKit() {
  if (kit) return kit
  const box = { console, setTimeout, clearTimeout, Promise, location: { origin: '' }, captured: null }
  box.window = box
  box.document = { createElement: () => ({ getContext: () => null }) }
  // 拦截 writeFile：不写到当前目录，而是交回 Buffer 由调用方决定保存位置
  box.PptxGenJS = class extends PptxGenJS {
    writeFile(opt) {
      return this.write({ outputType: 'nodebuffer' }).then((buf) => { box.captured = buf; return opt && opt.fileName })
    }
  }
  vm.createContext(box)
  for (const f of ['diagram.js', 'deckkit.js']) {
    vm.runInContext(readFileSync(webDir + f, 'utf8'), box, { filename: f })
  }
  kit = box
  return kit
}

/** 可用的内置配色：{ key: 名称 } */
export function themes() {
  const k = loadKit()
  const out = {}
  for (const [key, t] of Object.entries(k.DeckKit.THEMES)) out[key] = { name: t.name, group: t.g || '' }
  return out
}

/**
 * @param {object} lesson 课次（slides 已清洗）
 * @param {(file:string)=>string} imagePath 图片文件名 → 本机绝对路径
 * @returns {Promise<Buffer>}
 */
export async function exportPptx(lesson, imagePath) {
  const k = loadKit()
  const slides = lesson.slides.map(s => ({ ...s, image: s.image ? { ...s.image, src: imagePath(s.image.file) } : null }))
  k.captured = null
  k.DeckKit.setBrand(null)
  await k.DeckKit.exportPptx(slides, lesson.theme || 'blue', lesson.course || '', lesson.title || '课件')
  if (!k.captured) throw new Error('PPT 导出失败')
  return k.captured
}
