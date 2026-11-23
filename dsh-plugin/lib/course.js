/**
 * 课程与教案（逆向设计 / OBE）：
 *   毕业要求指标点 → 课程目标（布鲁姆层级、权重）→ 每次课的 BOPPPS 环节 → 课堂检测 / 题库
 *   → 组卷 → 逐题成绩 → 难度、区分度、信度、目标达成度 → 改进下一轮
 * 每门课一个文件：<数据目录>/courses/<id>.json。所有检查和统计都是固定规则，不调用 AI，结果可复核。
 */
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { pack } from './docx.js'

export const BLOOM = { 1: '记忆', 2: '理解', 3: '应用', 4: '分析', 5: '评价', 6: '创造' }
export const PHASE = { B: ['导入 Bridge-in', '引起兴趣、建立与旧知/现实的联系'], O: ['目标 Objective', '向学生说明本节学完能做到什么'], P1: ['前测 Pre-assessment', '摸清学生已有基础'], P2: ['参与式学习 Participatory', '讲授 + 学生主动参与的活动'], P3: ['后测 Post-assessment', '检验目标是否达成'], S: ['总结 Summary', '归纳要点、布置任务'] }
export const QTYPES = ['单选', '多选', '判断', '填空', '简答', '计算', '论述', '案例分析', '设计']
const PH = Object.keys(PHASE)
const CID = /^c[a-z0-9]{6,24}$/
const uid = p => p + Date.now().toString(36) + randomBytes(3).toString('hex')
const cut = (v, n) => String(v ?? '').trim().slice(0, n)
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d)
const phaseName = p => PHASE[p]?.[0].split(' ')[0] || p

/** 引文核验：去掉空白和标点后，引文是否逐字出现在原文里 */
export function normText(s) { return String(s ?? '').replace(/[\s　，。；：、“”‘’（）《》【】,.;:"'()!?！？\-—]/g, '').toLowerCase() }
export function evidenceIn(quote, source) { const q = normText(quote); return q.length >= 4 && normText(source).includes(q) }

export class Courses {
  constructor(dir) {
    this.dir = join(dir, 'courses')
    this.onChange = () => {}
  }

  file(id) { if (!CID.test(String(id))) throw new Error(`课程编号无效：${id}`); return join(this.dir, `${id}.json`) }

  async list() {
    let names = []
    try { names = await readdir(this.dir) } catch { return [] }
    const out = []
    for (const n of names) {
      if (!n.endsWith('.json')) continue
      try {
        const c = JSON.parse(await readFile(join(this.dir, n), 'utf8'))
        out.push({ id: c.id, name: c.name, code: c.code, semester: c.semester, sessions: c.sessions.length, objectives: c.objectives.length, questions: c.questions.length, papers: c.papers.length, updatedAt: c.updatedAt })
      } catch { /* 跳过损坏文件 */ }
    }
    return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  }

  async get(id) {
    let raw
    try { raw = await readFile(this.file(id), 'utf8') } catch { throw new Error(`没有找到课程 ${id}，可以先用 beike_course action=list 查看`) }
    const c = JSON.parse(raw)
    for (const k of ['gradReqs', 'objectives', 'sessions', 'questions', 'papers']) c[k] ||= []
    return c
  }

  async save(c) {
    c.updatedAt = new Date().toISOString()
    await mkdir(this.dir, { recursive: true })
    const f = this.file(c.id), tmp = `${f}.${randomBytes(4).toString('hex')}.tmp`
    await writeFile(tmp, JSON.stringify(c, null, 1))
    await rename(tmp, f)
    this.onChange()
    return c
  }

  async remove(id) { await rm(this.file(id), { force: true }); this.onChange() }

  /* ---------------- 课程 ---------------- */
  setInfo(c, b) {
    if (b.name !== undefined) c.name = cut(b.name, 100) || c.name || '未命名课程'
    for (const [k, n] of [['code', 40], ['semester', 40], ['audience', 120]]) if (b[k] !== undefined) c[k] = cut(b[k], n)
    if (b.credits !== undefined) c.credits = Math.max(0, Math.min(30, num(b.credits)))
    if (b.hours !== undefined) c.hours = Math.max(0, Math.min(500, Math.round(num(b.hours))))
    if (b.lessonMinutes !== undefined) c.lessonMinutes = Math.max(10, Math.min(300, Math.round(num(b.lessonMinutes, 90))))
    if (b.syllabus !== undefined) c.syllabus = String(b.syllabus || '').slice(0, 200000)
    if (b.threshold !== undefined) c.threshold = Math.max(0.3, Math.min(1, num(b.threshold, 0.7)))
    return c
  }

  async create(b) {
    const c = this.setInfo({ id: uid('c'), name: '', code: '', semester: '', credits: 0, hours: 0, lessonMinutes: 90, audience: '', syllabus: '', threshold: 0.7, gradReqs: [], objectives: [], sessions: [], questions: [], papers: [], improvement: '', createdAt: new Date().toISOString() }, b)
    if (!c.name) throw new Error('请填写课程名称')
    return this.save(c)
  }

  /* ---------------- 目标、指标点、矩阵 ---------------- */
  /** 整体保存课程目标；带 evidence 的逐字核对大纲 */
  setObjectives(c, list) {
    const old = new Map(c.objectives.map(o => [o.id, o]))
    c.objectives = (list || []).slice(0, 20).map((o, i) => {
      const prev = (o.id && old.get(o.id)) || [...old.values()].find(x => x.code === cut(o.code, 20)) || {}
      const r = {
        id: prev.id || uid('o'), code: cut(o.code, 20) || `CO${i + 1}`, content: cut(o.content, 1000), bloom: Math.max(1, Math.min(6, Math.round(num(o.bloom, 2)))),
        weight: Math.max(0, Math.min(100, num(o.weight))), reqs: o.reqs && typeof o.reqs === 'object' ? o.reqs : (prev.reqs || {}),
      }
      const ev = o.evidence !== undefined ? cut(o.evidence, 300) : prev.evidence
      if (ev) { r.evidence = ev; r.evidenceOk = evidenceIn(ev, c.syllabus) }
      return r
    }).filter(o => o.content)
    const ids = new Set(c.objectives.map(o => o.id))
    for (const s of c.sessions) {
      s.objectiveIds = s.objectiveIds.filter(x => ids.has(x))
      for (const g of s.segments) if (g.objectiveId && !ids.has(g.objectiveId)) g.objectiveId = ''
    }
    for (const q of c.questions) if (q.objectiveId && !ids.has(q.objectiveId)) q.objectiveId = ''
    this.cleanMatrix(c)
    return c.objectives
  }

  setGradReqs(c, list) {
    const old = new Map(c.gradReqs.map(g => [g.id, g]))
    c.gradReqs = (list || []).slice(0, 40).map(g => ({ id: (g.id && old.has(g.id)) ? g.id : uid('g'), code: cut(g.code, 20), content: cut(g.content, 500) })).filter(g => g.code || g.content)
    this.cleanMatrix(c)
    return c.gradReqs
  }

  /** matrix: { objectiveId: { gradReqId: 'H'|'M'|'L' } } */
  setMatrix(c, m) {
    for (const o of c.objectives) {
      const row = (m || {})[o.id]
      if (row && typeof row === 'object') o.reqs = Object.fromEntries(Object.entries(row).filter(([, v]) => ['H', 'M', 'L'].includes(v)))
    }
    this.cleanMatrix(c)
  }

  cleanMatrix(c) {
    const g = new Set(c.gradReqs.map(x => x.id))
    for (const o of c.objectives) o.reqs = Object.fromEntries(Object.entries(o.reqs || {}).filter(([k, v]) => g.has(k) && ['H', 'M', 'L'].includes(v)))
  }

  /* ---------------- 课次（每次课的教案） ---------------- */
  blankSession(c, seq, title, date = '') {
    return { id: uid('s'), seq, title: title || `第${seq}讲（待定）`, date, minutes: c.lessonMinutes || 90, objectiveIds: [], segments: [], key: '', difficult: '', misconceptions: '', ideology: '', resources: '', homework: '', reflection: '', status: 'draft', lessonId: '', evidence: [] }
  }

  addSession(c, b = {}) {
    const seq = Math.max(0, ...c.sessions.map(s => s.seq)) + 1
    const s = this.blankSession(c, seq, cut(b.title, 200), cut(b.date, 10))
    c.sessions.push(s)
    if (Object.keys(b).length) this.setSession(c, s, b)
    return s
  }

  session(c, sid) {
    const s = c.sessions.find(x => x.id === sid) || c.sessions.find(x => String(x.seq) === String(sid))
    if (!s) throw new Error(`课程里没有课次 ${sid}`)
    return s
  }

  /** 保存课次；segments 里可用 objective_code / objectiveId；evidence 为大纲引文，逐字核对 */
  setSession(c, s, b) {
    const byCode = new Map(c.objectives.map(o => [o.code, o.id])), ids = new Set(c.objectives.map(o => o.id))
    const oid = v => (ids.has(v) ? v : byCode.get(cut(v, 20)) || '')
    if (b.title !== undefined) s.title = cut(b.title, 200) || s.title
    if (b.date !== undefined) s.date = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : ''
    if (b.minutes !== undefined) s.minutes = Math.max(10, Math.min(300, Math.round(num(b.minutes, s.minutes))))
    if (b.status !== undefined && ['draft', 'ready', 'taught'].includes(b.status)) s.status = b.status
    for (const k of ['key', 'difficult', 'misconceptions', 'ideology', 'resources', 'homework', 'reflection']) {
      const v = b[k] ?? b[{ key: 'key_points', difficult: 'difficult_points' }[k]]
      if (v !== undefined) s[k] = Array.isArray(v) ? v.join('\n') : String(v ?? '').slice(0, 6000)
    }
    const objs = b.objectiveIds ?? b.objectives ?? b.objective_codes
    if (objs !== undefined) s.objectiveIds = [...new Set([].concat(objs || []).map(oid).filter(Boolean))]
    if (b.segments !== undefined) {
      s.segments = (Array.isArray(b.segments) ? b.segments : []).slice(0, 20).map(g => ({
        phase: PH.includes(String(g.phase).toUpperCase()) ? String(g.phase).toUpperCase() : 'P2',
        minutes: Math.max(0, Math.min(300, Math.round(num(g.minutes)))),
        teacher: cut(g.teacher ?? g.teacher_act, 2000), student: cut(g.student ?? g.student_act, 2000),
        objectiveId: oid(g.objectiveId ?? g.objective_code ?? ''), assess: cut(g.assess ?? g.assess_method, 200),
      }))
    }
    if (b.evidence !== undefined) s.evidence = [].concat(b.evidence || []).slice(0, 6).map(q => ({ quote: cut(typeof q === 'string' ? q : q.quote, 300), ok: evidenceIn(typeof q === 'string' ? q : q.quote, c.syllabus) })).filter(x => x.quote)
    return s
  }

  /** 按开课日期和每周上课星期生成教学进度（已有课次按顺序填日期，不够的新建） */
  schedule(c, { start, weekdays, count = 16, skip = '' }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) throw new Error('请填写开课日期（YYYY-MM-DD）')
    const days = [].concat(weekdays || []).map(Number).filter(d => d >= 1 && d <= 7)
    if (!days.length) throw new Error('请至少选择一个上课星期')
    const skips = new Set(String(skip).split(/[\s,，]+/).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)))
    const n = Math.max(1, Math.min(80, Math.round(num(count, 16))))
    const dates = []
    const d = new Date(start + 'T00:00:00Z')
    for (let g = 0; dates.length < n && g < 1000; g++) {
      const ds = d.toISOString().slice(0, 10), wd = d.getUTCDay() || 7
      if (days.includes(wd) && !skips.has(ds)) dates.push(ds)
      d.setUTCDate(d.getUTCDate() + 1)
    }
    const list = c.sessions.slice().sort((a, b) => a.seq - b.seq)
    dates.forEach((ds, i) => { if (list[i]) list[i].date = ds; else this.addSession(c, { date: ds }) })
    return dates.length
  }

  /** 复制到新学期：目标、矩阵、课次（含环节和上一轮反思）、题库；不带成绩 */
  async cloneCourse(c, semester) {
    const n = JSON.parse(JSON.stringify(c))
    n.id = uid('c'); n.semester = cut(semester, 40) || (c.semester + '(新)'); n.papers = []; n.improvement = ''; n.createdAt = new Date().toISOString()
    for (const s of n.sessions) {
      s.id = uid('s'); s.date = ''; s.status = 'draft'; s.lessonId = ''
      s.reflection = s.reflection?.trim() ? `【上一轮反思 ${c.semester || ''}】\n${s.reflection}` : ''
    }
    return this.save(n)
  }

  /* ---------------- 题库 ---------------- */
  /** 新增或修改题目；evidence 对照大纲和目标表述核对 */
  saveQuestion(c, q) {
    const ids = new Set(c.objectives.map(o => o.id)), byCode = new Map(c.objectives.map(o => [o.code, o.id]))
    let x = q.id && c.questions.find(i => i.id === q.id)
    if (!x) { if (c.questions.length >= 2000) throw new Error('题库最多 2000 题'); x = { id: uid('q'), createdAt: new Date().toISOString() }; c.questions.push(x) }
    const objectiveId = ids.has(q.objectiveId) ? q.objectiveId : (byCode.get(cut(q.objective_code ?? q.objectiveId, 20)) || '')
    const o = c.objectives.find(i => i.id === objectiveId)
    const opts = Array.isArray(q.options) ? q.options : String(q.options || '').split(/\r?\n/)
    Object.assign(x, {
      objectiveId, bloom: Math.max(1, Math.min(6, Math.round(num(q.bloom, o?.bloom || 2)))), qtype: QTYPES.includes(q.qtype) ? q.qtype : (opts.filter(Boolean).length ? '单选' : '简答'),
      stem: cut(q.stem, 4000), options: opts.map(v => cut(v, 300)).filter(Boolean).slice(0, 8), answer: cut(q.answer, 4000), analysis: cut(q.analysis, 4000),
      difficulty: Math.max(1, Math.min(5, Math.round(num(q.difficulty, 3)))), score: Math.max(0.5, Math.min(100, num(q.score, 10))), source: cut(q.source, 20) || x.source || '手工',
    })
    const ev = q.evidence !== undefined ? cut(q.evidence, 300) : x.evidence
    if (ev) { x.evidence = ev; x.evidenceOk = evidenceIn(ev, (c.syllabus || '') + '\n' + c.objectives.map(i => i.content).join('\n')) } else { delete x.evidence; delete x.evidenceOk }
    if (!x.stem) { c.questions = c.questions.filter(i => i !== x); throw new Error('题干不能为空') }
    return x
  }

  /** 双向细目表：目标 × 布鲁姆层级 的题目数 */
  blueprint(c) {
    return c.objectives.map(o => ({ id: o.id, code: o.code, bloom: o.bloom, cells: [1, 2, 3, 4, 5, 6].map(b => c.questions.filter(q => q.objectiveId === o.id && q.bloom === b).length) }))
  }

  /* ---------------- 试卷 ---------------- */
  createPaper(c, { title, total = 100, questionIds }) {
    let picked
    if (Array.isArray(questionIds) && questionIds.length) picked = questionIds.map(id => c.questions.find(q => q.id === id)).filter(Boolean)
    else picked = this.autoAssemble(c, Math.max(10, num(total, 100)))
    if (!picked.length) throw new Error('题库里还没有可用的题目（自动组卷按课程目标权重选题，题目需要关联目标）')
    const p = { id: uid('p'), title: cut(title, 200) || '期末考试', createdAt: new Date().toISOString(), items: picked.map(q => ({ id: uid('i'), questionId: q.id, score: q.score })), scores: {} }
    c.papers.unshift(p)
    return p
  }

  /** 按目标权重自动组卷：优先层级不低于目标、用得少的题 */
  autoAssemble(c, total) {
    const used = new Map()
    for (const p of c.papers) for (const it of p.items) used.set(it.questionId, (used.get(it.questionId) || 0) + 1)
    const picked = []
    for (const o of c.objectives) {
      const target = total * o.weight / 100
      if (target <= 0) continue
      const cands = c.questions.filter(q => q.objectiveId === o.id).map(q => ({ q, k: [q.bloom >= o.bloom ? 0 : 1, used.get(q.id) || 0, Math.random()] }))
        .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2]).map(x => x.q)
      let sum = 0
      for (const q of cands) {
        if (sum >= target - 0.01) break
        if (sum + q.score > target * 1.25 && sum > 0) continue
        picked.push(q); sum += q.score
      }
    }
    const order = Object.fromEntries(QTYPES.map((t, i) => [t, i]))
    return picked.sort((a, b) => (order[a.qtype] ?? 99) - (order[b.qtype] ?? 99))
  }

  paper(c, pid) { const p = c.papers.find(x => x.id === pid); if (!p) throw new Error('没有这份试卷'); return p }

  /** 试卷题目明细（按卷面顺序） */
  paperItems(c, p) {
    return p.items.map((it, i) => {
      const q = c.questions.find(x => x.id === it.questionId) || { stem: '（题目已删除）', qtype: '简答', options: [], answer: '', analysis: '', bloom: 2, objectiveId: '' }
      return { ...it, no: i + 1, full: it.score, q }
    })
  }

  setPaper(c, p, { title, items }) {
    if (title !== undefined) p.title = cut(title, 200) || p.title
    if (Array.isArray(items)) {
      const keep = new Map(p.items.map(i => [i.id, i]))
      p.items = items.map(x => {
        const old = keep.get(x.id)
        return old ? { ...old, score: Math.max(0.5, num(x.score, old.score)) } : (c.questions.some(q => q.id === x.questionId) ? { id: uid('i'), questionId: x.questionId, score: Math.max(0.5, num(x.score, 10)) } : null)
      }).filter(Boolean)
      const ids = new Set(p.items.map(i => i.id))
      for (const s of Object.values(p.scores)) for (const k of Object.keys(s)) if (!ids.has(k)) delete s[k]
    }
  }

  /** 成绩模板 CSV（Excel 可直接打开） */
  scoreTemplate(c, p) {
    const items = this.paperItems(c, p)
    return '﻿' + ['学号', ...items.map(i => `第${i.no}题(${i.full}分)`)].join(',') + '\n2024001' + ','.repeat(items.length) + '\n'
  }

  /** 导入逐题成绩（CSV：学号, 第1题, 第2题…）；Excel 中文版存的 GBK 也能读 */
  importScores(c, p, buf) {
    let raw = new TextDecoder('utf-8', { fatal: false }).decode(buf).replace(/^﻿/, '')
    if (raw.includes('�')) { try { raw = new TextDecoder('gb18030').decode(buf) } catch { /* 无 GBK 解码时按 UTF-8 */ } }
    const lines = raw.trim().split(/\r\n|\r|\n/)
    lines.shift()
    const items = this.paperItems(c, p), errors = [], scores = {}
    lines.forEach((line, ln) => {
      if (!line.trim()) return
      const cells = parseCsvLine(line)
      const stu = (cells[0] || '').trim()
      if (!stu) return
      const row = {}
      let any = false
      items.forEach((it, i) => {
        let v = (cells[i + 1] || '').trim()
        if (v === '') v = '0'; else any = true
        if (!/^-?\d+(\.\d+)?$/.test(v)) { errors.push(`第${ln + 2}行 第${i + 1}题 不是数字`); return }
        if (Number(v) > it.full + 0.001 || Number(v) < 0) { errors.push(`第${ln + 2}行（${stu}）第${i + 1}题 得分 ${v} 超出 0–${it.full}`); return }
        row[it.id] = Number(v)
      })
      if (any) scores[stu] = row
    })
    if (errors.length) throw new Error('导入失败，请修正后重试：' + errors.slice(0, 8).join('；') + (errors.length > 8 ? ` 等 ${errors.length} 处` : ''))
    if (!Object.keys(scores).length) throw new Error('文件中没有有效成绩')
    p.scores = scores
    return Object.keys(scores).length
  }

  /* ---------------- 统计 ---------------- */
  /** 试题分析：难度 P、区分度 D（高低分组各 27%）、Cronbach α、分数段 */
  analyze(c, p) {
    const items = this.paperItems(c, p)
    const stus = Object.keys(p.scores || {})
    const n = stus.length
    if (!items.length || !n) return { items, n: 0 }
    const totals = Object.fromEntries(stus.map(s => [s, items.reduce((a, it) => a + (p.scores[s][it.id] || 0), 0)]))
    const ranked = stus.slice().sort((a, b) => totals[b] - totals[a])
    const g = Math.max(1, Math.round(n * 0.27))
    const high = ranked.slice(0, g), low = ranked.slice(-g)
    const full = items.reduce((a, it) => a + it.full, 0)
    const avgOf = (grp, id) => grp.reduce((a, s) => a + (p.scores[s][id] || 0), 0) / Math.max(1, grp.length)
    let sumVar = 0
    const out = items.map(it => {
      const vals = stus.map(s => p.scores[s][it.id] || 0)
      const f = Math.max(0.0001, it.full), mean = vals.reduce((a, b) => a + b, 0) / n
      const P = mean / f, D = n >= 4 ? (avgOf(high, it.id) - avgOf(low, it.id)) / f : null
      const v = variance(vals); sumVar += v
      const flags = []
      if (P < 0.3) flags.push('偏难'); else if (P > 0.9) flags.push('偏易')
      if (D !== null) { if (D < 0) flags.push('负区分（检查答案或题意）'); else if (D < 0.2) flags.push('区分度差') }
      return { id: it.id, no: it.no, full: it.full, qtype: it.q.qtype, stem: it.q.stem, objectiveId: it.q.objectiveId, bloom: it.q.bloom, mean, P, D, flags }
    })
    const k = items.length, varT = variance(Object.values(totals))
    const alpha = k > 1 && varT > 0 ? (k / (k - 1)) * (1 - sumVar / varT) : null
    const bands = { '<60': 0, '60-69': 0, '70-79': 0, '80-89': 0, '≥90': 0 }
    for (const t of Object.values(totals)) {
      const pct = full > 0 ? t / full * 100 : 0
      bands[pct < 60 ? '<60' : pct < 70 ? '60-69' : pct < 80 ? '70-79' : pct < 90 ? '80-89' : '≥90']++
    }
    return { items: out, n, full, mean: Object.values(totals).reduce((a, b) => a + b, 0) / n, sd: Math.sqrt(varT), alpha, bands }
  }

  /** 课程目标达成度：合并所有已导入成绩的试卷 */
  attainment(c) {
    const agg = {}, per = {}
    for (const p of c.papers) {
      const a = this.analyze(c, p)
      if (!a.n) continue
      for (const it of a.items) {
        if (!it.objectiveId) continue
        agg[it.objectiveId] ||= { meanSum: 0, fullSum: 0, items: 0 }
        agg[it.objectiveId].meanSum += it.mean; agg[it.objectiveId].fullSum += it.full; agg[it.objectiveId].items++
        for (const [stu, row] of Object.entries(p.scores)) {
          per[it.objectiveId] ||= {}
          const x = per[it.objectiveId][stu] ||= [0, 0]
          x[0] += row[it.id] || 0; x[1] += it.full
        }
      }
    }
    return c.objectives.map(o => {
      const x = agg[o.id]
      if (!x) return { id: o.id, code: o.code, content: o.content, weight: o.weight, attain: null }
      const gs = Object.values(per[o.id] || {})
      return { id: o.id, code: o.code, content: o.content, weight: o.weight, attain: x.fullSum ? x.meanSum / x.fullSum : null, items: x.items, students: gs.length, below: gs.filter(g => g[1] > 0 && g[0] / g[1] < c.threshold).length }
    })
  }

  /* ---------------- 对齐检查（固定规则） ---------------- */
  qStats(c) {
    const s = {}
    for (const q of c.questions) { if (!q.objectiveId) continue; s[q.objectiveId] ||= { n: 0, maxBloom: 0 }; s[q.objectiveId].n++; s[q.objectiveId].maxBloom = Math.max(s[q.objectiveId].maxBloom, q.bloom) }
    return s
  }

  checkSession(c, s) {
    const out = [], byId = new Map(c.objectives.map(o => [o.id, o])), qs = this.qStats(c)
    const sum = s.segments.reduce((a, g) => a + g.minutes, 0)
    const active = s.segments.filter(g => g.student.trim()).reduce((a, g) => a + g.minutes, 0)
    if (!s.segments.length) out.push(['error', '还没有任何教学环节。'])
    else if (sum !== s.minutes) out.push(['error', `环节时长合计 ${sum} 分钟，与课时 ${s.minutes} 分钟不符（${sum > s.minutes ? '超出' : '还差'} ${Math.abs(sum - s.minutes)} 分钟）。`])
    if (!s.objectiveIds.length) out.push(['error', '本课次没有关联任何课程目标——逆向设计的第一步是先确定目标。'])
    for (const oid of s.objectiveIds) {
      const o = byId.get(oid); if (!o) continue
      const segs = s.segments.filter(g => g.objectiveId === oid)
      if (!segs.some(g => g.phase === 'P3' || g.assess.trim())) out.push(['warn', `目标 ${o.code} 在课堂上没有任何评价方式（后测或任一环节的“检测方式”），无法知道是否达成。`])
      if (o.bloom >= 3 && !segs.some(g => g.student.trim())) out.push(['warn', `目标 ${o.code} 属于「${BLOOM[o.bloom]}」层级，但没有对应的学生练习活动——听讲只能到“理解”层级。`])
      if (!qs[oid]) out.push(['info', `目标 ${o.code} 在题库中还没有题目，期末将无法评价达成度。`])
    }
    if (s.segments.length) {
      const miss = PH.filter(p => !s.segments.some(g => g.phase === p)).map(phaseName)
      if (miss.length) out.push([miss.includes(phaseName('P3')) ? 'warn' : 'info', `缺少环节：${miss.join('、')}。`])
    }
    if (sum > 0 && active / sum < 0.3) out.push(['warn', `学生有明确活动的时间只占 ${Math.round(active / sum * 100)}%（建议 ≥30%）。`])
    for (const g of s.segments) if (g.minutes > 20 && !g.student.trim()) out.push(['warn', `「${phaseName(g.phase)}」连续讲授 ${g.minutes} 分钟且没有学生活动，超过一般注意力持续时长（约 15–20 分钟），建议插入提问或小练习。`])
    if (!s.misconceptions.trim()) out.push(['info', '没有写“预判学生误区”——提前写下学生最可能错在哪，是区分新手和资深教师的关键。'])
    if (!s.ideology.trim()) out.push(['info', '没有写课程思政融入点。'])
    if (s.status === 'taught' && !s.reflection.trim()) out.push(['info', '本课已上完，记得写教学反思，复制到新学期时会一起带过去。'])
    for (const e of s.evidence || []) if (!e.ok) out.push(['warn', `大纲引文“${e.quote.slice(0, 30)}”在大纲原文中没有找到，请核对。`])
    return out
  }

  checkCourse(c) {
    const out = []
    if (!c.objectives.length) return [['error', '还没有课程目标。可在「目标与矩阵」里手工填写，或让 AI 从大纲中提取。']]
    const w = c.objectives.reduce((a, o) => a + o.weight, 0)
    if (Math.abs(w - 100) > 0.01) out.push(['error', `课程目标权重合计为 ${+w.toFixed(2)}%，应为 100%。`])
    const qs = this.qStats(c)
    for (const o of c.objectives) {
      if (c.gradReqs.length && !Object.keys(o.reqs || {}).length) out.push(['warn', `目标 ${o.code} 没有支撑任何毕业要求指标点。`])
      if (!c.sessions.some(s => s.objectiveIds.includes(o.id))) out.push(['warn', `目标 ${o.code} 没有被任何课次覆盖。`])
      if (!qs[o.id]) out.push(['warn', `目标 ${o.code} 题库中没有题目。`])
      else if (qs[o.id].maxBloom < o.bloom) out.push(['warn', `目标 ${o.code} 要求「${BLOOM[o.bloom]}」，但题库中最高只到「${BLOOM[qs[o.id].maxBloom]}」——评价层级低于目标层级。`])
      if (o.evidence && !o.evidenceOk) out.push(['warn', `目标 ${o.code} 的大纲依据在大纲原文中没有找到，请核对。`])
    }
    for (const g of c.gradReqs) if (!c.objectives.some(o => o.reqs?.[g.id])) out.push(['warn', `毕业要求指标点 ${g.code} 没有课程目标支撑。`])
    if (c.hours > 0 && c.sessions.length) {
      const planned = c.sessions.reduce((a, s) => a + s.minutes, 0), need = c.hours * 45
      if (planned !== need) out.push(['info', `已排课次合计 ${planned} 分钟，课程 ${c.hours} 学时 ≈ ${need} 分钟。`])
    }
    const bad = c.questions.filter(q => q.evidence && !q.evidenceOk).length
    if (bad) out.push(['info', `有 ${bad} 道题的命题依据在大纲和目标表述中没有找到原文，请核对。`])
    return out
  }

  /* ---------------- Word 输出 ---------------- */
  sessionBody(c, s, P) {
    const objs = s.objectiveIds.map(id => c.objectives.find(o => o.id === id)).filter(Boolean)
    let b = P.h1(`${c.name} · 第 ${s.seq} 次课 · ${s.title}`)
    b += P.table([['项目', '内容'], ['日期', s.date || '—'], ['课时', `${s.minutes} 分钟`], ['课程目标', objs.map(o => `${o.code}（${BLOOM[o.bloom]}）${o.content}`).join('\n') || '—']])
    for (const [k, t] of [['key', '教学重点'], ['difficult', '教学难点'], ['misconceptions', '学生可能的误区'], ['ideology', '课程思政'], ['resources', '教学资源']]) if (s[k]) { b += P.h2(t); b += P.para(s[k]) }
    if (s.segments.length) {
      b += P.h2('教学过程（BOPPPS）')
      b += P.table([['环节', '时长', '教师活动', '学生活动', '目标 / 检测'], ...s.segments.map(g => [phaseName(g.phase), `${g.minutes} 分钟`, g.teacher, g.student, [c.objectives.find(o => o.id === g.objectiveId)?.code, g.assess].filter(Boolean).join(' / ')])])
    }
    for (const [k, t] of [['homework', '作业'], ['reflection', '教学反思']]) if (s[k]) { b += P.h2(t); b += P.para(s[k]) }
    return b
  }

  async sessionDocx(c, sids) {
    const P = await docxParts()
    const list = (sids ? sids.map(id => this.session(c, id)) : c.sessions.slice().sort((a, b) => a.seq - b.seq))
    return pack(list.map((s, i) => (i ? P.pageBreak : '') + this.sessionBody(c, s, P)).join(''))
  }

  async paperDocx(c, p, withKey) {
    const P = await docxParts()
    const items = this.paperItems(c, p), total = items.reduce((a, i) => a + i.full, 0)
    const cn = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
    let b = P.h1(`${c.name} ${p.title}${withKey ? '（参考答案）' : ''}`) + P.para(`（满分 ${total} 分）　　班级：________　学号：________　姓名：________`, { center: true })
    let last = null, sec = 0
    for (const it of items) {
      if (it.q.qtype !== last) { last = it.q.qtype; b += P.h2(`${cn[sec++] || sec}、${last}题`) }
      b += P.para(`${it.no}.（${it.full}分）${it.q.stem}`)
      if (it.q.options?.length) b += P.para(it.q.options.join('\n'), { ind: true })
      if (withKey) b += P.para(`【答案】${it.q.answer || '—'}${it.q.analysis ? `\n【解析】${it.q.analysis}` : ''}`, { color: 'C00000', ind: true })
      else if (!['单选', '多选', '判断', '填空'].includes(it.q.qtype)) b += P.para('\n\n\n\n')
    }
    return pack(b)
  }
}

/** 共用的 docx 片段（与 docx.js 的样式一致） */
async function docxParts() {
  const x = s => String(s ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
  const run = (t, o = {}) => `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}</w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r>`
  const para = (t, o = {}) => `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.center ? '<w:jc w:val="center"/>' : ''}${o.ind ? '<w:ind w:left="420"/>' : ''}</w:pPr>${String(t ?? '').split(/\r?\n/).map((l, i) => (i ? '<w:r><w:br/></w:r>' : '') + run(l, o)).join('')}</w:p>`
  const table = rows => `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(k => `<w:${k} w:val="single" w:sz="4" w:color="999999"/>`).join('')}</w:tblBorders></w:tblPr>${rows.map((r, i) => `<w:tr>${r.map((cl, j) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr>${para(cl, { b: i === 0 || (r.length === 2 && j === 0) })}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>${para('')}`
  return { para, table, h1: t => para(t, { style: 'Title', center: true }), h2: t => para(t, { style: 'Heading1' }), pageBreak: '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' }
}

function variance(v) { const n = v.length; if (!n) return 0; const m = v.reduce((a, b) => a + b, 0) / n; return v.reduce((a, b) => a + (b - m) ** 2, 0) / n }

function parseCsvLine(line) {
  const out = []; let cur = '', q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += ch }
    else if (ch === '"') q = true
    else if (ch === ',' || ch === '\t') { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}
