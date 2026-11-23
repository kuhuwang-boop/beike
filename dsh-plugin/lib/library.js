/**
 * 我的资料库：跨课次的讲义、旧课件、教案（已提取的文字），按课程（文件夹）分类。
 *   <数据目录>/library/index.json   条目列表
 *   <数据目录>/library/<id>.txt     资料全文
 * 内容完全相同的不重复保存；新建课次时按课题推荐相关资料（固定规则打分，不调用 AI）。
 */
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'

const MAX_ITEMS = 1000
const ID = /^l[a-z0-9]{6,24}$/
const cut = (v, n) => String(v ?? '').trim().slice(0, n)

/** 把课题拆成检索词：中文取相邻两字，英文数字取整词 */
export function terms(title) {
  const t = new Set()
  for (const w of String(title).match(/[A-Za-z0-9+#]{2,}/g) || []) t.add(w.toLowerCase())
  for (const seg of String(title).match(/\p{Script=Han}+/gu) || []) for (let i = 0; i < seg.length - 1; i++) t.add(seg.slice(i, i + 2))
  for (const k of [...t]) if (k.length <= 2 && /[的与和及]/.test(k)) t.delete(k)
  return [...t]
}

export class Library {
  constructor(dir) {
    this.dir = join(dir, 'library')
    this.index = join(this.dir, 'index.json')
    this.items = null
    this.onChange = () => {}
  }

  async load() {
    if (this.items) return this.items
    try { this.items = JSON.parse(await readFile(this.index, 'utf8')) } catch { this.items = [] }
    return this.items
  }

  async flush() {
    await mkdir(this.dir, { recursive: true })
    const tmp = `${this.index}.${randomBytes(4).toString('hex')}.tmp`
    await writeFile(tmp, JSON.stringify(this.items, null, 1))
    await rename(tmp, this.index)
    this.onChange()
  }

  file(id) {
    if (!ID.test(String(id))) throw new Error(`资料库编号无效：${id}`)
    return join(this.dir, `${id}.txt`)
  }

  /** 存入资料库；返回 { id, dup } */
  async add(name, text, folder = '') {
    text = String(text || '').trim().slice(0, 300000)
    if (!text) throw new Error('资料里没有文字')
    const items = await this.load()
    const hash = createHash('sha1').update(text).digest('hex')
    const have = items.find(x => x.hash === hash)
    if (have) {
      if (folder && !have.folder) { have.folder = cut(folder, 60); await this.flush() }
      return { id: have.id, dup: true }
    }
    if (items.length >= MAX_ITEMS) throw new Error(`资料库最多 ${MAX_ITEMS} 份，请先删除不用的`)
    const id = 'l' + Date.now().toString(36) + randomBytes(2).toString('hex')
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.file(id), text)
    items.unshift({ id, name: cut(name, 200) || '资料', folder: cut(folder, 60), chars: text.length, hash, addedAt: new Date().toISOString() })
    await this.flush()
    return { id, dup: false }
  }

  async list(q = '') {
    const items = await this.load()
    q = String(q || '').trim().toLowerCase()
    if (!q) return items.map(strip)
    const out = []
    for (const x of items) {
      if ((x.name + ' ' + x.folder).toLowerCase().includes(q)) { out.push(strip(x)); continue }
      try { if ((await readFile(this.file(x.id), 'utf8')).toLowerCase().includes(q)) out.push(strip(x)) } catch { /* 文件丢失 */ }
    }
    return out
  }

  async get(id) {
    const x = (await this.load()).find(i => i.id === id)
    if (!x) throw new Error(`资料库里没有 ${id}`)
    return { ...strip(x), text: await readFile(this.file(id), 'utf8') }
  }

  async update(id, { name, folder, text }) {
    const x = (await this.load()).find(i => i.id === id)
    if (!x) throw new Error(`资料库里没有 ${id}`)
    if (name !== undefined) x.name = cut(name, 200) || x.name
    if (folder !== undefined) x.folder = cut(folder, 60)
    if (text !== undefined) {
      const t = String(text).trim().slice(0, 300000)
      if (!t) throw new Error('资料不能为空')
      await writeFile(this.file(id), t)
      x.chars = t.length
      x.hash = createHash('sha1').update(t).digest('hex')
    }
    await this.flush()
    return strip(x)
  }

  async remove(id) {
    const items = await this.load()
    this.items = items.filter(i => i.id !== id)
    await rm(this.file(id), { force: true })
    await this.flush()
  }

  /** 按课题推荐可能相关的资料 */
  async suggest(title, limit = 5) {
    const ws = terms(title)
    if (!ws.length) return []
    const need = ws.length <= 2 ? ws.length : Math.ceil(ws.length * 0.6)
    const out = []
    for (const x of (await this.load()).slice(0, 400)) {
      let head = ''
      try { head = (await readFile(this.file(x.id), 'utf8')).slice(0, 8000).toLowerCase() } catch { continue }
      const name = (x.name + ' ' + x.folder).toLowerCase()
      let score = 0, hit = 0
      for (const w of ws) {
        const inName = name.includes(w)
        const c = head.split(w).length - 1
        if (inName || c) hit++
        score += (inName ? 4 : 0) + Math.min(3, c)
      }
      if (hit >= need) out.push({ ...strip(x), score: score + hit * 2 })
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  folders() {
    return [...new Set((this.items || []).map(x => x.folder).filter(Boolean))]
  }
}

const strip = ({ hash, ...x }) => x
