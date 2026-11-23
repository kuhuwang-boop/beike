/**
 * 老师个人设置（因人而异）：备课风格、我的技能、常用指令、学校名称与标志、学校 PPT 模板、
 * 以及配图 / 视频服务的 API Key。全部保存在 <数据目录>/profile.json 和 <数据目录>/secrets.json。
 * 标志和模板的图片保存在 <数据目录>/assets/。
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
export const METHODS = require('./methods.json')

/** 课型：名称、一句说明、给 AI 的要求 */
export const TYPES = {
  new: ['新授课', '讲新知识：导入、讲解、练习、小结', ''],
  review: ['复习课', '梳理知识体系，抓易错点和典型题', '这是一节复习课：不要按新授课逐点重讲。先用结构图（分类树/分层结构等）梳理本单元知识体系，再集中处理易错点和典型题（每类给一道代表题和解题思路），安排一次限时检测，最后给出复习清单。'],
  exercise: ['习题课', '讲题为主：方法归纳、变式训练', '这是一节习题课：以题目为主线，按“题型 → 一道样例的完整思路 → 变式练习 → 方法小结”组织；每类题先让学生试做再讲解，讲稿里写出常见错误做法及纠正；课件上一页一题，答案和详细步骤放在讲稿备注。'],
  lab: ['实验 / 实训课', '任务驱动：任务书、操作步骤、安全与评分', '这是一节实验/实训课（理实一体）：按“任务导入 → 任务书（目标、器材/环境、成果要求）→ 关键操作步骤演示（用流程结构图）→ 安全与规范注意事项 → 学生分组实操 → 检查与评分标准 → 总结与工单/报告要求”组织；讲授压缩在 1/3 课时以内，学生动手不少于一半课时；评分标准用三栏对照呈现。'],
  seminar: ['研讨课', '围绕问题讨论，学生为主', '这是一节研讨课：围绕 2–3 个有争议或开放性的核心问题组织；课前给阅读材料和思考题，课上按“问题呈现 → 小组讨论（写明分组、时间、产出）→ 汇报与互评 → 教师点评提升”进行；课件页数宜少，重点呈现问题、讨论规则和总结框架。'],
  open: ['公开课 / 教学比赛', '精品打磨，环节完整、亮点突出', '这是一节公开课/教学比赛用课：教学环节完整（导入、目标、前测、参与式学习、后测、总结），时间分配精确到分钟，至少一处有记忆点的教学创新（情境、活动或信息化手段），课程思政自然融入，讲稿逐页写全并标注时间。'],
}
export const TONES = { '': '不限', rigorous: '严谨规范', friendly: '亲切口语', lively: '生动幽默' }
export const DENSITY = { '': '不限', lean: '精简：每页不超过 4 条、每条 18 字内', normal: '适中：每页 4–5 条', rich: '详细：要点写完整，方便学生课后复习' }
export const MUST = { case: '案例导入', interact: '课堂互动 / 提问', ideology: '课程思政', practice: '随堂练习', task: '实训任务', summary: '小结与作业' }
export const MAX_METHODS = 6

const EMPTY_STYLE = { tone: '', density: '', students: '', cases: '', must: [], avoid: '', notes: '' }
const EMPTY_BRAND = { name: '', logo: null, icon: null, prefs: { cover_logo: 1, corner_icon: 1, footer_name: 1, on_template: 0, default_theme: 'blue' } }
const cut = (v, n) => String(v ?? '').trim().slice(0, n)

export class Profile {
  constructor(dir) {
    this.dir = dir
    this.file = join(dir, 'profile.json')
    this.secretFile = join(dir, 'secrets.json')
    this.assetsDir = join(dir, 'assets')
    this.data = null
    this.onChange = () => {}
  }

  async load() {
    if (this.data) return this.data
    let d = {}
    try { d = JSON.parse(await readFile(this.file, 'utf8')) } catch { /* 第一次使用 */ }
    d.style = { ...EMPTY_STYLE, ...(d.style || {}) }
    d.skills ||= []
    d.cmds ||= []
    d.autoMethods ||= []
    d.brand = { ...EMPTY_BRAND, ...(d.brand || {}), prefs: { ...EMPTY_BRAND.prefs, ...(d.brand?.prefs || {}) } }
    d.templates ||= []
    this.data = d
    return d
  }

  async save() {
    await mkdir(this.dir, { recursive: true })
    const tmp = `${this.file}.${randomBytes(4).toString('hex')}.tmp`
    await writeFile(tmp, JSON.stringify(this.data, null, 2))
    await rename(tmp, this.file)
    this.onChange()
  }

  /* ---------- 备课风格 ---------- */
  async setStyle(inp) {
    const d = await this.load()
    const s = { ...d.style }
    for (const k of ['tone', 'density']) if (inp[k] !== undefined) s[k] = (k === 'tone' ? TONES : DENSITY)[inp[k]] !== undefined ? String(inp[k]) : ''
    for (const [k, n] of [['students', 200], ['cases', 200], ['avoid', 300], ['notes', 800]]) if (inp[k] !== undefined) s[k] = cut(inp[k], n)
    if (inp.must !== undefined) s.must = [].concat(inp.must || []).filter(k => MUST[k])
    d.style = s
    await this.save()
    return s
  }

  /** 把备课风格写成给 AI 的要求；没填返回空串 */
  async styleText() {
    const p = (await this.load()).style
    const l = []
    if (p.students) l.push(`我的学生：${p.students}（讲解深度、例子和练习难度都要与之匹配）`)
    if (p.tone) l.push('语言风格：' + TONES[p.tone] + { rigorous: '，术语准确、表述规范', friendly: '，像和学生聊天一样，少用书面套话', lively: '，可以用类比、小故事和适度的幽默' }[p.tone])
    if (p.density) l.push('每页信息量：' + DENSITY[p.density])
    if (p.must.length) l.push('每节课必须有：' + p.must.map(k => MUST[k]).join('、'))
    if (p.cases) l.push(`案例偏好：${p.cases}`)
    if (p.avoid) l.push(`不要这样做：${p.avoid}`)
    if (p.notes) l.push(`其他习惯：${p.notes}`)
    return l.length ? '【这位老师的备课风格——所有产出都要符合】\n- ' + l.join('\n- ') : ''
  }

  /* ---------- 教学方法库 + 我的技能 ---------- */
  async methods() {
    const d = await this.load()
    return [
      ...d.skills.map(s => ({ key: s.id, name: s.name, category: '我的技能', summary: s.summary || '', instructions: s.instructions, mine: true })),
      ...METHODS,
    ]
  }

  async methodsFor(keys) {
    const all = await this.methods()
    return [].concat(keys || []).map(k => all.find(m => m.key === k)).filter(Boolean)
  }

  async cleanMethods(keys) {
    const all = await this.methods()
    return [...new Set([].concat(keys || []).map(String))].filter(k => all.some(m => m.key === k)).slice(0, MAX_METHODS)
  }

  async saveSkill(inp) {
    const d = await this.load()
    const name = cut(inp.name, 30), instructions = cut(inp.instructions, 1500)
    if (!name || !instructions) throw new Error('技能需要名称和具体要求')
    let s = inp.id && d.skills.find(x => x.id === inp.id)
    if (!s) {
      if (d.skills.length >= 40) throw new Error('最多保存 40 条技能')
      s = { id: 'u' + Date.now().toString(36) + randomBytes(2).toString('hex') }
      d.skills.unshift(s)
    }
    Object.assign(s, { name, instructions, summary: cut(inp.summary, 80) })
    if (inp.auto !== undefined) d.autoMethods = inp.auto ? [...new Set([...d.autoMethods, s.id])].slice(0, MAX_METHODS) : d.autoMethods.filter(k => k !== s.id)
    await this.save()
    return s
  }

  async removeSkill(id) {
    const d = await this.load()
    d.skills = d.skills.filter(s => s.id !== id)
    d.autoMethods = d.autoMethods.filter(k => k !== id)
    await this.save()
  }

  async setAuto(keys) {
    const d = await this.load()
    d.autoMethods = await this.cleanMethods(keys)
    await this.save()
    return d.autoMethods
  }

  /* ---------- 常用指令 ---------- */
  async setCmds(list) {
    const d = await this.load()
    d.cmds = [...new Set([].concat(list || []).map(c => cut(c, 120)).filter(Boolean))].slice(0, 12)
    await this.save()
    return d.cmds
  }

  /* ---------- 学校名称、Logo、校徽 ---------- */
  async setBrand(inp) {
    const d = await this.load()
    const b = d.brand
    if (inp.name !== undefined) b.name = cut(inp.name, 40)
    for (const k of ['logo', 'icon']) if (inp[k] === null) { await this.dropAsset(b[k]?.file); b[k] = null }
    if (inp.prefs) {
      for (const k of ['cover_logo', 'corner_icon', 'footer_name', 'on_template']) if (inp.prefs[k] !== undefined) b.prefs[k] = inp.prefs[k] ? 1 : 0
      if (inp.prefs.default_theme !== undefined) b.prefs.default_theme = /^(tpl:)?[a-z0-9]{2,24}$/.test(inp.prefs.default_theme) ? inp.prefs.default_theme : 'blue'
    }
    await this.save()
    return b
  }

  async setBrandImage(kind, buf) {
    if (!['logo', 'icon'].includes(kind)) throw new Error('图片类型无效')
    const meta = await this.storeAsset(buf, 5 * 1024 * 1024)
    const d = await this.load()
    await this.dropAsset(d.brand[kind]?.file)
    d.brand[kind] = meta
    await this.save()
    return meta
  }

  /* ---------- 学校 PPT 模板（版面数据由网页解析，图片存到 assets） ---------- */
  async addTemplate(name, data, images) {
    const d = await this.load()
    if (d.templates.length >= 20) throw new Error('最多保存 20 个模板，请先删除不用的')
    if (!data || typeof data !== 'object' || !data.content) throw new Error('模板数据无效，请重新上传')
    const map = {}
    for (const [k, buf] of Object.entries(images || {}).slice(0, 24)) {
      if (!/^i\d{1,2}$/.test(k)) continue
      try { map[k] = (await this.storeAsset(buf, 8 * 1024 * 1024)).file } catch { /* 不支持的图片跳过 */ }
    }
    // 把 "@i3" 这样的占位换成文件名；没保存成功的图片去掉
    const fix = (v) => {
      if (Array.isArray(v)) return v.map(fix).filter(x => x !== undefined)
      if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) { const y = fix(x); if (y !== undefined) o[k] = y } return o }
      if (typeof v === 'string' && /^@i\d{1,2}$/.test(v)) return map[v.slice(1)] ? `@asset:${map[v.slice(1)]}` : undefined
      return v
    }
    const clean = fix(data)
    const t = { id: Date.now().toString(36) + randomBytes(2).toString('hex'), name: cut(name, 40) || '学校模板', data: clean }
    d.templates.unshift(t)
    await this.save()
    return t
  }

  async renameTemplate(id, name) {
    const d = await this.load()
    const t = d.templates.find(x => x.id === id)
    if (!t) throw new Error('模板不存在')
    t.name = cut(name, 40) || t.name
    await this.save()
  }

  async removeTemplate(id) {
    const d = await this.load()
    const t = d.templates.find(x => x.id === id)
    if (!t) throw new Error('模板不存在')
    d.templates = d.templates.filter(x => x.id !== id)
    if (d.brand.prefs.default_theme === 'tpl:' + id) d.brand.prefs.default_theme = 'blue'
    const files = JSON.stringify(t.data).match(/@asset:[\w.]+/g) || []
    const still = JSON.stringify(d)
    for (const f of files) if (!still.includes(f)) await this.dropAsset(f.slice(7))
    await this.save()
  }

  hasTemplate(theme) { return /^tpl:/.test(theme) && !!this.data?.templates.some(t => 'tpl:' + t.id === theme) }

  /** 给网页 / 导出用：模板与标志里的图片换成地址（网页）或本机路径（导出） */
  async renderKit(resolve) {
    const d = await this.load()
    const sub = (v) => JSON.parse(JSON.stringify(v).replace(/"@asset:([\w.]+)"/g, (_m, f) => JSON.stringify(resolve(f))))
    const b = d.brand
    const brand = (b.name || b.logo || b.icon) ? {
      name: b.name,
      logo: b.logo ? { src: resolve(b.logo.file), w: b.logo.w, h: b.logo.h } : null,
      icon: b.icon ? { src: resolve(b.icon.file), w: b.icon.w, h: b.icon.h } : null,
      prefs: b.prefs,
    } : null
    return { brand, templates: d.templates.map(t => ({ id: t.id, name: t.name, data: sub(t.data) })), defaultTheme: b.prefs.default_theme }
  }

  /* ---------- 图片文件 ---------- */
  assetPath(file) {
    if (!/^[a-f0-9]{20}\.(png|jpg|gif|webp)$/.test(String(file))) throw new Error('文件名无效')
    return join(this.assetsDir, file)
  }

  async storeAsset(buf, max) {
    if (!buf?.length || buf.length > max) throw new Error('图片太大')
    const info = imageInfo(buf)
    if (!info) throw new Error('只支持 PNG、JPG、GIF、WebP 图片')
    await mkdir(this.assetsDir, { recursive: true })
    const file = createHash('sha1').update(buf).digest('hex').slice(0, 20) + '.' + info.ext
    await writeFile(join(this.assetsDir, file), buf)
    return { file, w: info.w, h: info.h }
  }

  async dropAsset(file) {
    if (!file) return
    try { await rm(this.assetPath(file), { force: true }) } catch { /* 忽略 */ }
  }

  /* ---------- API Key（只保存在本机，不回传给网页） ---------- */
  async secrets() {
    try { return JSON.parse(await readFile(this.secretFile, 'utf8')) } catch { return {} }
  }

  async setSecrets(inp) {
    const s = await this.secrets()
    for (const k of ['minimax_key', 'pexels_key', 'pixabay_key']) {
      if (inp[k] === undefined) continue
      const v = String(inp[k] || '').trim()
      if (v) s[k] = v.slice(0, 400); else delete s[k]
    }
    if (inp.minimax_host !== undefined) s.minimax_host = inp.minimax_host === 'https://api.minimax.io' ? inp.minimax_host : 'https://api.minimax.cn'
    if (inp.video_model !== undefined) s.video_model = ['MiniMax-H3', 'MiniMax-H3-Highspeed', 'MiniMax-H3-Lite', 'MiniMax-H3-Max'].includes(inp.video_model) ? inp.video_model : 'MiniMax-H3'
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.secretFile, JSON.stringify(s, null, 2), { mode: 0o600 })
    return s
  }

  /** 给网页看的状态：只说有没有，不给 Key 本身 */
  async secretStatus() {
    const s = await this.secrets()
    const mask = v => (v ? v.slice(0, 6) + '…' + v.slice(-4) : '')
    return {
      minimax: !!s.minimax_key, minimax_mask: mask(s.minimax_key), minimax_host: s.minimax_host || 'https://api.minimax.cn', video_model: s.video_model || 'MiniMax-H3',
      pexels: !!s.pexels_key, pexels_mask: mask(s.pexels_key), pixabay: !!s.pixabay_key, pixabay_mask: mask(s.pixabay_key),
    }
  }
}

/** 读图片格式和尺寸（PNG / JPG / GIF / WebP） */
export function imageInfo(b) {
  if (b.length < 24) return null
  if (b[0] === 0x89 && b[1] === 0x50) return { ext: 'png', w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
  if (b.slice(0, 3).toString('latin1') === 'GIF') return { ext: 'gif', w: b.readUInt16LE(6), h: b.readUInt16LE(8) }
  if (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') {
    const c = b.slice(12, 16).toString('latin1')
    if (c === 'VP8X') return { ext: 'webp', w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) }
    if (c === 'VP8L') { const n = b.readUInt32LE(21); return { ext: 'webp', w: 1 + (n & 0x3fff), h: 1 + ((n >> 14) & 0x3fff) } }
    return { ext: 'webp', w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue }
      const m = b[i + 1]
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { ext: 'jpg', w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) }
      i += 2 + b.readUInt16BE(i + 2)
    }
    return { ext: 'jpg', w: 0, h: 0 }
  }
  return null
}

export function typeText(t) {
  return TYPES[t] && TYPES[t][2] ? `【课型：${TYPES[t][0]}】${TYPES[t][2]}` : ''
}
