/**
 * 插件的业务逻辑（AI 工具和工作台网页共用）：
 * 课次的“AI 须知”（风格、课型、教学方法）、资料库联动、配图、教学视频、PPT / Word 导出。
 */
import { readFile } from 'node:fs/promises'
import { Store } from './store.js'
import { Profile, TYPES, typeText } from './profile.js'
import { Library } from './library.js'
import { exportPptx, themes } from './export.js'
import { planDocx } from './docx.js'
import { normalize } from './core.js'
import * as media from './media.js'

export const VIDEO_KINDS = {
  intro: ['导入短片', '用一个生活或行业场景引出本节课的问题，制造悬念'],
  demo: ['原理演示', '把看不见的过程（微观、内部、动态）直观地演示出来'],
  scene: ['真实场景', '展示知识在真实工作 / 生活中的样子'],
  story: ['故事情境', '一个有人物、有冲突的小情境，引发讨论'],
}

export class Service {
  constructor(dataDir, logger) {
    this.store = new Store(dataDir)
    this.profile = new Profile(dataDir)
    this.library = new Library(dataDir)
    this.logger = logger
    const bump = () => { this.store.version++ }
    this.profile.onChange = bump
    this.library.onChange = bump
    this.timer = null
  }

  async init() {
    await this.store.init()
    await this.profile.load()
    await this.library.load()
  }

  /* ---------------- 课次 ---------------- */
  async validTheme(theme) {
    await this.profile.load()
    return !!themes()[theme] || this.profile.hasTemplate(theme)
  }

  async createLesson({ title, course, minutes, lessonType, audience, methods, attachLibrary = 'auto' }) {
    const p = await this.profile.load()
    const theme = (await this.validTheme(p.brand.prefs.default_theme)) ? p.brand.prefs.default_theme : 'blue'
    const type = TYPES[lessonType] ? lessonType : typeKey(lessonType)
    const ms = await this.profile.cleanMethods(methods?.length ? methods : p.autoMethods)
    const l = await this.store.create({ title, course, minutes, lessonType: type, theme, methods: ms, audience })
    // 资料库里相关的资料：默认自动带进这节课
    let attached = []
    const sug = await this.library.suggest(`${l.title} ${l.course}`, 5)
    if (attachLibrary === 'auto' && sug.length) attached = await this.attach(l, sug.slice(0, 3).map(x => x.id))
    return { l, suggested: sug, attached }
  }

  /** 把资料库条目复制成课次资料（相同内容不重复） */
  async attach(l, ids) {
    const names = []
    const have = new Set()
    for (const m of l.materials) { try { have.add((await readFile(this.store.path(l.id, 'materials', `${m.id}.txt`), 'utf8')).trim()) } catch { /* 忽略 */ } }
    for (const id of [].concat(ids || []).slice(0, 20)) {
      const it = await this.library.get(id)
      if (have.has(it.text.trim())) continue
      await this.store.addMaterial(l, it.name, it.text)
      have.add(it.text.trim())
      names.push(it.name)
    }
    return names
  }

  /** 新资料同时存进资料库（按课程分类） */
  async addMaterial(l, name, text, { toLibrary = true } = {}) {
    const mid = await this.store.addMaterial(l, name, text)
    if (toLibrary) { try { await this.library.add(name, text, l.course) } catch (e) { this.logger?.debug?.(`beike: 资料库 ${e.message}`) } }
    return mid
  }

  /** 给 AI 的本课须知：备课风格、课型、授课对象、教学方法 */
  async guidance(l) {
    const parts = []
    const st = await this.profile.styleText()
    if (st) parts.push(st)
    const tt = typeText(l.lessonType)
    if (tt) parts.push(tt)
    if (l.audience) parts.push(`【授课对象】${l.audience}（讲解深度、例子和练习难度都要与之匹配）`)
    const ms = await this.profile.methodsFor(l.methods)
    if (ms.length) {
      parts.push('【本节课采用的教学方法——必须在课件、讲稿和练习里落实，并能指出落实在哪几页】\n' + ms.map(m => `◆ ${m.name}${m.mine ? '（老师自己的技能，优先遵守）' : ''}：${m.instructions}`).join('\n'))
    }
    return parts.join('\n\n')
  }

  /* ---------------- 配图 ---------------- */
  async setImageFromUrl(l, index, url, credit) {
    const { buf, ext } = await media.downloadImage(url)
    return this.setImage(l, index, buf, ext, credit)
  }

  async setImage(l, index, buf, ext, credit) {
    const i = Number(index)
    if (!(i >= 1 && i <= l.slides.length)) throw new Error('页码无效')
    if (!['title', 'bullets', 'objectives', 'summary', 'section'].includes(l.slides[i - 1].layout)) throw new Error('封面、要点、学习目标、小结、章节过渡页才能配图')
    const file = await this.store.saveImage(l, buf, ext === 'jpeg' ? 'jpg' : ext)
    const slides = l.slides.map((s, k) => (k === i - 1 ? { ...s, image: { file, credit: String(credit || '').slice(0, 200) } } : s))
    await this.store.saveSlides(l, slides, `第${i}页配图`)
    return file
  }

  async removeImage(l, index) {
    const i = Number(index)
    if (!l.slides[i - 1]?.image) throw new Error('这一页没有配图')
    const slides = l.slides.map((s, k) => (k === i - 1 ? { ...s, image: null } : s))
    await this.store.saveSlides(l, slides, `去掉第${i}页配图`)
  }

  async aiImage(l, index, prompt) {
    const sec = await this.profile.secrets()
    const { buf, ext } = await media.aiImage(sec, prompt)
    return this.setImage(l, index, buf, ext, 'AI 生成（MiniMax H3-Image），仅作教学示意')
  }

  async searchImages(q, page) {
    return media.searchImages(await this.profile.secrets(), q, page)
  }

  /* ---------------- 教学视频（MiniMax H3） ---------------- */
  /** 在第 after 页后插入一页视频，提交生成任务 */
  async startVideo(l, { after, prompt, kind = 'intro', duration = 6, title, firstFramePage }) {
    const sec = await this.profile.secrets()
    prompt = String(prompt || '').trim()
    if (prompt.length < 8) throw new Error('请把画面描述写具体一些（至少一句话）')
    let firstFrame = null
    if (firstFramePage) {
      const s = l.slides[Number(firstFramePage) - 1]
      if (!s?.image) throw new Error(`第 ${firstFramePage} 页没有配图，不能作为第一帧`)
      const buf = await readFile(this.store.path(l.id, 'images', s.image.file))
      const ext = s.image.file.split('.').pop().replace('jpg', 'jpeg')
      firstFrame = `data:image/${ext};base64,${buf.toString('base64')}`
    }
    const full = prompt + '。画面写实、清晰，适合课堂投影；画面中不要出现任何文字、字幕、字母或水印。'
    const task = await media.createVideo(sec, { prompt: full, duration, ratio: '16:9', firstFrame })
    const pos = Math.max(0, Math.min(l.slides.length, Number(after ?? l.slides.length)))
    const slide = normalize([{
      layout: 'video', phase: l.slides[pos - 1]?.phase || 'B', title: String(title || VIDEO_KINDS[kind]?.[0] || '教学视频').slice(0, 80),
      notes: `【约1分钟】播放视频后提问：看到了什么？和本节课有什么关系？\n（视频由 AI 生成，仅作教学示意。画面描述：${prompt}）`,
      video: { status: 'running', task, prompt, kind, duration, startedAt: new Date().toISOString() },
    }])[0]
    const slides = l.slides.slice()
    slides.splice(pos, 0, slide)
    await this.store.saveSlides(l, slides, `第${pos + 1}页插入教学视频`)
    this.pollSoon()
    return { page: pos + 1, task }
  }

  /** 视频页重新生成 */
  async retryVideo(l, index) {
    const s = l.slides[Number(index) - 1]
    if (s?.layout !== 'video') throw new Error('这一页不是视频页')
    const sec = await this.profile.secrets()
    const task = await media.createVideo(sec, { prompt: s.video.prompt + '。画面写实、清晰，适合课堂投影；画面中不要出现任何文字、字幕、字母或水印。', duration: s.video.duration })
    const slides = l.slides.map((x, k) => (k === Number(index) - 1 ? { ...x, video: { ...x.video, status: 'running', task, file: undefined, error: undefined, startedAt: new Date().toISOString() } } : x))
    await this.store.saveSlides(l, slides, `第${index}页视频重新生成`)
    this.pollSoon()
    return task
  }

  pollSoon(ms = 15000) {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.pollVideos().catch(e => this.logger?.warn?.(`beike: 视频查询 ${e.message}`)), ms)
    this.timer.unref?.()
  }

  stop() { clearTimeout(this.timer); this.timer = null; this.stopped = true }

  /** 查询所有生成中的视频；完成的下载到本机 */
  async pollVideos() {
    if (this.stopped) return
    let pending = false
    const sec = await this.profile.secrets()
    for (const meta of await this.store.list()) {
      let l
      try { l = await this.store.get(meta.id) } catch { continue }
      const idx = l.slides.map((s, i) => (s.layout === 'video' && s.video?.status === 'running' && s.video.task ? i : -1)).filter(i => i >= 0)
      if (!idx.length) continue
      let changed = false
      for (const i of idx) {
        const v = l.slides[i].video
        const r = await media.queryVideo(sec, v.task)
        if (r.status === 'succeeded' && r.url) {
          try {
            const file = await this.store.saveVideo(l, await media.downloadVideo(r.url), v.task)
            l.slides[i] = { ...l.slides[i], video: { ...v, status: 'succeeded', file } }
          } catch (e) { l.slides[i] = { ...l.slides[i], video: { ...v, status: 'failed', error: e.message } } }
          changed = true
        } else if (['failed', 'cancelled'].includes(r.status)) {
          l.slides[i] = { ...l.slides[i], video: { ...v, status: 'failed', error: r.error || '视频生成失败' } }
          changed = true
        } else if (Date.now() - Date.parse(v.startedAt || 0) > 40 * 60 * 1000) {
          l.slides[i] = { ...l.slides[i], video: { ...v, status: 'failed', error: '等待超过 40 分钟，请重新生成' } }
          changed = true
        } else pending = true
      }
      if (changed) { l.slides = normalize(l.slides); await this.store.save(l) }
    }
    if (pending) this.pollSoon(20000)
  }

  /* ---------------- 导出 ---------------- */
  async pptx(l) {
    const kit = await this.profile.renderKit(f => this.profile.assetPath(f))
    return exportPptx(l, {
      image: f => this.store.path(l.id, 'images', f),
      video: f => this.store.path(l.id, 'videos', f),
      brand: kit.brand,
      templates: kit.templates,
    })
  }

  async docx(l) {
    const p = await this.profile.load()
    return planDocx(l, { methods: await this.profile.methodsFor(l.methods), school: p.brand.name })
  }
}

/** 课型：中文名或代号 → 代号 */
export function typeKey(v) {
  v = String(v || '').trim()
  if (TYPES[v]) return v
  for (const [k, t] of Object.entries(TYPES)) if (v && (t[0].includes(v) || v.includes(t[0].split(' ')[0]))) return k
  if (/实训|实验|理实/.test(v)) return 'lab'
  if (/研讨|讨论|案例/.test(v)) return 'seminar'
  if (/比赛|公开/.test(v)) return 'open'
  if (/习题|练习/.test(v)) return 'exercise'
  if (/复习/.test(v)) return 'review'
  return v ? 'new' : ''
}
