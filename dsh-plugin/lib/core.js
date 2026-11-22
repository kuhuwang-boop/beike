/**
 * 课件数据的核心规则（与网页版备课工作台一致）：
 * 版式白名单与清洗、按页修改（patch）、按讲稿估算课时、课件体检、出处核对。
 * 全部是纯函数，不依赖 DSH，方便单独测试。
 */

export const LAYOUTS = ['title', 'objectives', 'bullets', 'two', 'diagram', 'quiz', 'section', 'summary']
export const LAYOUT_NAMES = { title: '封面', objectives: '学习目标', bullets: '要点', two: '左右对比', diagram: '结构图', quiz: '课堂提问', section: '章节过渡', summary: '小结' }
export const PHASES = { B: '导入 Bridge-in', O: '目标 Objective', P1: '前测 Pre-assessment', P2: '参与式学习 Participatory', P3: '后测 Post-assessment', S: '总结 Summary' }

/** 结构图版式：名称、适用场景、条目数范围 */
export const DIAGRAMS = {
  flow: ['流程', '有先后的步骤、环节', 3, 6],
  cycle: ['闭环', '几步做完又回到起点', 3, 6],
  timeline: ['时间轴', '按时间排的里程碑、发展历程', 3, 6],
  compare: ['左右对照', '两种做法、两个概念、改前改后', 2, 2],
  matrix: ['并列卡片', '三五个并列要点，没有先后', 2, 6],
  pillars: ['支柱', '几根支柱共同撑起一个结论', 2, 4],
  kpi: ['大数字', '三四个关键数据', 2, 4],
  pyramid: ['金字塔', '上少下多的层级、需求层次', 3, 5],
  funnel: ['漏斗', '逐级筛选、收窄', 3, 5],
  tree: ['分类树', '一个总概念拆成几类，类下有条目', 2, 4],
  hub: ['中心辐射', '一个核心关联多个方面', 3, 6],
  layers: ['分层结构', '自上而下的层次，每层有若干模块', 2, 5],
  pipeline: ['三栏对照', '类型 → 内容 → 用途，每行一组', 2, 5],
}

const str = (v, n) => String(Array.isArray(v) ? v.join('，') : (v ?? '')).trim().slice(0, n)
const arr = (v) => {
  if (typeof v === 'string') v = v.split(/\r?\n/)
  if (!Array.isArray(v)) return []
  return v.map(x => String(Array.isArray(x) ? x.join('：') : (x ?? '')).trim()).filter(Boolean)
}

export function cleanDiagram(d) {
  if (!d || typeof d !== 'object' || !DIAGRAMS[d.type]) return null
  const [, , min, max] = DIAGRAMS[d.type]
  const items = []
  for (let x of (Array.isArray(d.items) ? d.items : []).slice(0, max)) {
    if (typeof x !== 'object' || x === null) x = { t: String(x) }
    const it = { t: str(x.t ?? x.title, 20), d: str(x.d ?? x.desc, 80) }
    const sub = (Array.isArray(x.sub) ? x.sub : []).slice(0, 6).map(v => str(v, 24)).filter(Boolean)
    if (sub.length) it.sub = sub
    if (d.type === 'pipeline') it.u = str(x.u, 40)
    if (!it.t || (!it.d && !sub.length)) continue
    items.push(it)
  }
  if (items.length < min) return null
  const out = { type: d.type, style: ['rounded', 'square', 'flat'].includes(d.style) ? d.style : 'rounded', items }
  if (str(d.center, 16)) out.center = str(d.center, 16)
  if (str(d.note, 60)) out.note = str(d.note, 60)
  if (d.type === 'pipeline' && Array.isArray(d.cols) && d.cols.length === 3) out.cols = d.cols.map(v => str(v, 8))
  if (Number.isInteger(d.hi) && d.hi >= 0 && d.hi < items.length) out.hi = d.hi
  return out
}

/** 图片只接受本插件资料目录里的文件名（由网页上传或工具保存），避免引用任意路径 */
export function cleanImage(img) {
  if (!img || typeof img !== 'object') return null
  const file = String(img.file || '')
  if (!/^[\w.-]{1,80}\.(jpg|jpeg|png|webp|gif)$/i.test(file)) return null
  return { file, credit: str(img.credit, 200) }
}

/** 清洗 AI 或老师提交的课件：版式白名单、字段长度、结构图条目数 */
export function normalize(input) {
  const out = []
  for (const s of Array.isArray(input) ? input : []) {
    if (!s || typeof s !== 'object') continue
    let layout = LAYOUTS.includes(s.layout) ? s.layout : 'bullets'
    const diagram = layout === 'diagram' ? cleanDiagram(s.diagram) : null
    if (layout === 'diagram' && !diagram) layout = 'bullets' // 结构图数据不完整时退回要点页
    const phase = String(s.phase || '').toUpperCase()
    out.push({
      layout,
      phase: PHASES[phase] ? phase : '',
      title: str(s.title, 80),
      subtitle: str(s.subtitle, 120),
      bullets: arr(s.bullets),
      left_title: str(s.left_title, 40),
      left: arr(s.left),
      right_title: str(s.right_title, 40),
      right: arr(s.right),
      question: str(s.question, 300),
      options: arr(s.options),
      answer: str(s.answer, 300),
      notes: String(s.notes ?? '').trim().slice(0, 3000),
      image: cleanImage(s.image),
      lead: layout === 'diagram' ? str(s.lead, 60) : '',
      diagram,
    })
  }
  return out.slice(0, 60)
}

/** 以原页码为基准应用修改：update / insert / delete（页码从 1 开始） */
export function applyOps(slides, ops) {
  const n = slides.length
  const upd = {}, del = {}, ins = {}
  for (const op of Array.isArray(ops) ? ops : []) {
    if (!op || typeof op !== 'object') continue
    if (op.op === 'update' && op.slide) {
      const i = Number(op.index)
      if (i >= 1 && i <= n) {
        const base = upd[i] || slides[i - 1]
        upd[i] = normalize([{ ...base, ...op.slide }])[0]
        if (!('image' in op.slide)) upd[i].image = base.image ?? null
      }
    } else if (op.op === 'delete') {
      del[Number(op.index)] = true
    } else if (op.op === 'insert' && op.slide) {
      const a = Math.max(0, Math.min(n, Number(op.after ?? n) || 0))
      const s = normalize([op.slide])
      if (s.length) (ins[a] ||= []).push(s[0])
    }
  }
  const out = [...(ins[0] || [])]
  for (let i = 1; i <= n; i++) {
    if (!del[i]) out.push(upd[i] || slides[i - 1])
    out.push(...(ins[i] || []))
  }
  return out.slice(0, 60)
}

/** 估算每页要讲多久（分钟）：讲稿写了“【约N分钟】”就用它，否则按讲稿字数和页面类型估算 */
export function pace(slides) {
  return slides.map((s) => {
    const notes = String(s.notes || '')
    const m = notes.match(/【约\s*(\d+(?:\.\d+)?)\s*(?:[-–~～至到]\s*(\d+(?:\.\d+)?))?\s*分钟/)
    if (m) return Math.round((m[2] ? (Number(m[1]) + Number(m[2])) / 2 : Number(m[1])) * 10) / 10
    const chars = notes.replace(/\s+|（图片来源：[^）]*）/g, '').length
    const base = { title: 1, section: 0.5, objectives: 1.5, summary: 2, quiz: 3, two: 3, diagram: 3, bullets: 2.5 }[s.layout] ?? 2.5
    let min = Math.max(base, chars / 200 * 1.4)
    if (s.layout === 'quiz') min = Math.max(min, 3)
    return Math.round(Math.min(min, 15) * 10) / 10
  })
}

/** 课件体检：固定规则，不依赖 AI。返回 [[级别, 提示], ...]，级别 ok | info | warn */
export function health(slides, minutes) {
  const out = []
  const n = slides.length
  if (!n) return out
  const p = pace(slides)
  const total = p.reduce((a, b) => a + b, 0)
  if (minutes > 0 && total > minutes * 1.12) {
    const long = p.map((v, i) => [v, i + 1]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(x => x[1]).sort((a, b) => a - b)
    out.push(['warn', `按讲稿估算约 ${Math.round(total)} 分钟，超出课时 ${minutes} 分钟约 ${Math.round(total - minutes)} 分钟，可能讲不完。最耗时的是第 ${long.join('、')} 页，可以精简或移到课后。`])
  } else if (minutes > 0 && total < minutes * 0.7) {
    out.push(['warn', `按讲稿估算约 ${Math.round(total)} 分钟，比课时 ${minutes} 分钟少不少，可以增加例题、讨论或练习。`])
  } else if (minutes > 0) {
    out.push(['ok', `按讲稿估算约 ${Math.round(total)} 分钟，与课时 ${minutes} 分钟基本吻合。`])
  }
  let quiz = 0, img = 0, noNotes = 0
  const layouts = {}
  slides.forEach((s, i) => {
    layouts[s.layout] = true
    if (s.layout === 'quiz') quiz++
    if (s.image) img++
    if (!s.notes.trim() && s.layout !== 'title') noNotes++
    const b = [...s.bullets, ...s.left, ...s.right]
    const long = b.filter(x => x.length > 32).length
    if (s.bullets.length > 6 || long >= 2) out.push(['warn', `第${i + 1}页文字偏多，学生不容易抓重点，可以精简并把细节放进讲稿。`])
    if (['bullets', 'two', 'objectives', 'summary'].includes(s.layout) && !b.length) out.push(['warn', `第${i + 1}页没有内容。`])
  })
  const dg = slides.map((s, i) => [i, s.diagram?.type, s.diagram?.style || 'rounded']).filter(x => slides[x[0]].layout === 'diagram' && x[1])
  for (let k = 1; k < dg.length; k++) {
    if (dg[k][0] === dg[k - 1][0] + 1 && dg[k][1] === dg[k - 1][1]) {
      out.push(['warn', `第${dg[k - 1][0] + 1}、${dg[k][0] + 1}页连续使用了同一种结构图（${DIAGRAMS[dg[k][1]][0]}），换一种版式会更清楚。`])
    }
  }
  if (dg.length >= 4) {
    const types = {}
    dg.forEach(x => { types[x[1]] = (types[x[1]] || 0) + 1 })
    if (Object.keys(types).length < 3) out.push(['warn', `有 ${dg.length} 张结构图，但只用了 ${Object.keys(types).length} 种版式，显得单调；建议至少用 3 种。`])
  }
  if (!quiz) out.push(['warn', '整套课件没有课堂提问或测验页，学生参与偏少。'])
  if (!layouts.objectives) out.push(['info', '没有“学习目标”页，开课时告诉学生本节学完能做什么，有助于聚焦。'])
  if (!layouts.summary) out.push(['info', '没有“小结”页。'])
  if (noNotes > n / 2) out.push(['info', `有 ${noNotes} 页没有讲稿备注，讲稿会帮你讲得更顺。`])
  if (!out.some(x => x[0] !== 'ok')) out.push(['ok', '页数、文字量、互动、讲稿和结构图都比较合理。'])
  return out
}

/* ---------------- 出处核对：逐条对照老师的资料（不调用 AI） ---------------- */

const SRC = 0.68
const PART = 0.38
const norm = s => String(s ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{Script=Han}\p{L}\p{N}%.]+/gu, '')
function grams(n) {
  const c = [...n], g = new Set()
  for (let i = 0; i < c.length - 1; i++) g.add(c[i] + c[i + 1])
  return g
}
/** 可能讲错的数据：两位以上数字、小数、百分比、年份 */
export function numbers(s) {
  const m = String(s ?? '').normalize('NFKC').match(/\d+(?:\.\d+)?%?/g) || []
  return [...new Set(m.filter(x => x.replace('%', '').length >= 2 || x.includes('.') || x.endsWith('%')))]
}

/**
 * @param {Array} slides 已清洗的课件
 * @param {string} source 老师资料全文
 * @returns {{has:boolean, items:Array, sum:object}}
 */
export function grounding(slides, source) {
  const res = { has: String(source || '').trim() !== '', items: [], sum: { all: 0, src: 0, part: 0, ai: 0, nums: 0 } }
  if (!res.has || !slides.length) return res
  const sents = String(source).split(/(?<=[。！？；!?;])|\r?\n/).map(x => x.trim()).filter(x => x.length >= 4)
  const idx = new Map()
  sents.forEach((sn, k) => { for (const g of grams(norm(sn))) { if (!idx.has(g)) idx.set(g, []); idx.get(g).push(k) } })
  const srcNorm = norm(source)
  const tooCommon = Math.max(400, Math.floor(sents.length * 0.08))
  slides.forEach((s, p) => {
    // 封面、章节页、学习目标是老师自己的安排，不是事实性内容，不判断出处
    if (['title', 'section', 'objectives'].includes(s.layout)) return
    const cands = []
    // 课堂提问的题目和干扰项本来就是编出来的，不判断出处
    for (const [f, fn] of [['bullets', '要点'], ['left', '左栏'], ['right', '右栏']]) for (const b of s[f] || []) cands.push([fn, b])
    for (const it of s.diagram?.items || []) cands.push(['结构图', [it.t, it.d].filter(Boolean).join('：')])
    for (const [fn, text] of cands) {
      const g = grams(norm(text))
      if (g.size < 4) continue
      const hits = new Map()
      let cover = 0
      for (const bg of g) {
        const post = idx.get(bg)
        if (!post) continue
        cover++
        if (post.length > tooCommon) continue
        for (const k of post) hits.set(k, (hits.get(k) || 0) + 1)
      }
      let best = -1, score = 0
      for (const [k, h] of [...hits].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
        if (h / g.size > score) { score = h / g.size; best = k }
      }
      score = Math.max(score, 0.85 * cover / g.size - 0.15)
      const st = score >= SRC ? 'src' : score >= PART ? 'part' : 'ai'
      const miss = numbers(text).filter(x => !srcNorm.includes(norm(x)))
      res.sum.all++
      res.sum[st]++
      if (miss.length) res.sum.nums++
      if (st !== 'src' || miss.length) {
        res.items.push({ page: p + 1, field: fn, text: text.slice(0, 120), status: st, score: Math.round(score * 100) / 100, quote: best >= 0 && score >= 0.3 ? sents[best].slice(0, 90) : '', nums: miss })
      }
    }
    // 讲稿只查数字：老师会照着讲出来
    const miss = numbers(String(s.notes || '').replace(/【[^】]*】/g, '')).filter(x => !srcNorm.includes(norm(x)))
    if (miss.length) {
      res.sum.nums++
      res.items.push({ page: p + 1, field: '讲稿', text: '讲稿中的数字', status: 'num', score: 0, quote: '', nums: miss.slice(0, 6) })
    }
  })
  const w = x => (x.nums.length ? 0 : 10) + { ai: 0, num: 1, part: 2, src: 3 }[x.status]
  res.items.sort((a, b) => w(a) - w(b) || a.page - b.page)
  res.items = res.items.slice(0, 80)
  return res
}

/** 给 AI 看的课件摘要（每页一行 + 要点），用于“先读再改” */
export function deckText(slides, notesLen = 80) {
  if (!slides.length) return '（还没有课件）'
  return slides.map((s, i) => {
    let t = `第${i + 1}页 [${s.layout}${s.phase ? '/' + s.phase : ''}] ${s.title}${s.subtitle ? ' — ' + s.subtitle : ''}`
    for (const k of ['bullets', 'left', 'right', 'options']) if (s[k]?.length) t += `\n   ${k}: ${s[k].join(' | ')}`
    if (s.question) t += `\n   question: ${s.question}  answer: ${s.answer}`
    if (s.diagram) t += `\n   diagram(${s.diagram.type}): ${s.diagram.items.map(x => x.t + (x.d ? '：' + x.d : '')).join(' | ')}`
    if (notesLen && s.notes) t += `\n   notes: ${s.notes.slice(0, notesLen)}${s.notes.length > notesLen ? '…' : ''}`
    return t
  }).join('\n')
}
