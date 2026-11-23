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
  // 视频封面需要真浏览器截图；在 Node 里让 <video> 立即报错，跳过封面（PPT 里仍可播放）
  box.document = {
    createElement: () => {
      const el = { getContext: () => null, removeAttribute() {} }
      Object.defineProperty(el, 'src', { set() { setTimeout(() => el.onerror && el.onerror(), 0) }, get() { return '' } })
      return el
    },
  }
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
 * @param {object} o
 * @param {(file:string)=>string} o.image 配图文件名 → 本机绝对路径
 * @param {(file:string)=>string} [o.video] 视频文件名 → 本机绝对路径
 * @param {object} [o.brand] 学校名称与标志（图片地址已是本机路径）
 * @param {object[]} [o.templates] 学校模板（图片地址已是本机路径）
 * @returns {Promise<Buffer>}
 */
export async function exportPptx(lesson, o) {
  if (typeof o === 'function') o = { image: o }
  const k = loadKit()
  const slides = lesson.slides.map(s => ({
    ...s,
    image: s.image ? { ...s.image, src: o.image(s.image.file) } : null,
    ...(s.video ? { video: { ...s.video, src: s.video.file && o.video ? o.video(s.video.file) : '' } } : {}),
  }))
  k.captured = null
  if (o.templates?.length) k.DeckKit.addTemplates(JSON.parse(JSON.stringify(o.templates)))
  k.DeckKit.setBrand(o.brand || null)
  const theme = /^tpl:/.test(lesson.theme) && !(o.templates || []).some(t => 'tpl:' + t.id === lesson.theme) ? 'blue' : (lesson.theme || 'blue')
  await k.DeckKit.exportPptx(slides, theme, lesson.course || '', lesson.title || '课件')
  k.DeckKit.setBrand(null)
  if (!k.captured) throw new Error('PPT 导出失败')
  return k.captured
}
