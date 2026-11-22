/**
 * 本地存储：每节课一个文件夹，老师可以直接备份、拷贝。
 *   <dataDir>/lessons/<id>/lesson.json   课次信息、教学设计、课件
 *   <dataDir>/lessons/<id>/materials/    资料原文（已提取为纯文本）
 *   <dataDir>/lessons/<id>/images/       课件图片
 *   <dataDir>/exports/                   导出的 PPT
 */
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { normalize } from './core.js'

const ID = /^[a-z0-9]{6,24}$/

export class Store {
  constructor(dir) {
    this.dir = dir
    this.lessonsDir = join(dir, 'lessons')
    this.exportsDir = join(dir, 'exports')
    this.version = 0 // 每次写入加一，网页据此刷新
  }

  async init() {
    await mkdir(this.lessonsDir, { recursive: true })
    await mkdir(this.exportsDir, { recursive: true })
  }

  path(id, ...rest) {
    if (!ID.test(String(id))) throw new Error(`课次编号无效：${id}`)
    return join(this.lessonsDir, id, ...rest)
  }

  async atomic(file, data) {
    const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`
    await writeFile(tmp, data)
    await rename(tmp, file)
    this.version++
  }

  async list() {
    let names = []
    try { names = await readdir(this.lessonsDir) } catch { return [] }
    const out = []
    for (const id of names) {
      if (!ID.test(id)) continue
      try {
        const l = JSON.parse(await readFile(this.path(id, 'lesson.json'), 'utf8'))
        out.push({ id, title: l.title, course: l.course, minutes: l.minutes, pages: (l.slides || []).length, materials: (l.materials || []).length, theme: l.theme, first: (l.slides || [])[0] || null, updatedAt: l.updatedAt })
      } catch { /* 损坏或写入中的文件跳过 */ }
    }
    return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  }

  async get(id) {
    let raw
    try { raw = await readFile(this.path(id, 'lesson.json'), 'utf8') } catch { throw new Error(`没有找到课次 ${id}，可以先用 beike_list 查看已有课次`) }
    const l = JSON.parse(raw)
    l.slides = normalize(l.slides || [])
    l.materials ||= []
    l.plan ||= {}
    return l
  }

  async save(l) {
    l.updatedAt = new Date().toISOString()
    await this.atomic(this.path(l.id, 'lesson.json'), JSON.stringify(l, null, 2))
    return l
  }

  async create({ title, course, minutes, lessonType }) {
    const id = Date.now().toString(36) + randomBytes(3).toString('hex')
    await mkdir(this.path(id, 'materials'), { recursive: true })
    await mkdir(this.path(id, 'images'), { recursive: true })
    const l = {
      id, title: String(title || '未命名课次').slice(0, 80), course: String(course || '我的课程').slice(0, 60),
      minutes: Math.max(10, Math.min(300, Number(minutes) || 45)), lessonType: String(lessonType || ''),
      theme: 'blue', slides: [], materials: [], plan: {}, history: [], createdAt: new Date().toISOString(),
    }
    return this.save(l)
  }

  async remove(id) {
    await rm(this.path(id), { recursive: true, force: true })
    this.version++
  }

  /** 保存课件，并留一个可撤销的旧版本（最多 20 个） */
  async saveSlides(l, slides, note) {
    l.history ||= []
    if (l.slides?.length) l.history.push({ at: new Date().toISOString(), note: String(note || '修改课件').slice(0, 80), slides: l.slides })
    l.history = l.history.slice(-20)
    l.slides = slides
    return this.save(l)
  }

  async undo(l) {
    const v = (l.history || []).pop()
    if (!v) throw new Error('没有可以撤销的版本')
    l.slides = normalize(v.slides)
    await this.save(l)
    return v.note
  }

  async addMaterial(l, name, text) {
    const mid = 'm' + Date.now().toString(36) + randomBytes(2).toString('hex')
    await mkdir(this.path(l.id, 'materials'), { recursive: true })
    await writeFile(this.path(l.id, 'materials', `${mid}.txt`), text)
    l.materials.push({ id: mid, name: String(name).slice(0, 120), chars: text.length, addedAt: new Date().toISOString() })
    await this.save(l)
    return mid
  }

  async removeMaterial(l, mid) {
    l.materials = l.materials.filter(m => m.id !== mid)
    await rm(this.path(l.id, 'materials', `${mid}.txt`), { force: true })
    await this.save(l)
  }

  /** 资料全文（按添加顺序拼接），用于出处核对和 AI 阅读 */
  async materialsText(l) {
    let t = ''
    for (const m of l.materials) {
      try { t += `\n===== 资料：${m.name} =====\n` + await readFile(this.path(l.id, 'materials', `${m.id}.txt`), 'utf8') + '\n' } catch { /* 已删除 */ }
    }
    return t
  }

  async saveImage(l, buf, ext) {
    const file = randomBytes(8).toString('hex') + '.' + ext
    await mkdir(this.path(l.id, 'images'), { recursive: true })
    await writeFile(this.path(l.id, 'images', file), buf)
    return file
  }

  async exists(file) {
    try { await stat(file); return true } catch { return false }
  }
}
