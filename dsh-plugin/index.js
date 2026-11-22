/**
 * dsh-beike —— 备课工作台 DeepSeek Harness 插件
 *
 * 给 AI 一套备课工具（beike_*）和一份备课技能，课件保存在老师自己的电脑上；
 * 再提供一个备课工作台网页：预览、逐页编辑、36 套配色、课件体检与出处核对、
 * 资料管理、教学设计、浏览器上课（演讲者视图）和下载 PPT。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { Store } from './lib/store.js'
import { normalize, applyOps, pace, health, grounding, deckText, LAYOUTS, PHASES } from './lib/core.js'
import { extractText } from './lib/extract.js'
import { exportPptx, themes } from './lib/export.js'
import { createHandler } from './lib/web.js'

export const name = 'beike'
export const inject = ['tools']

export const Config = Schema.object({
  dataDir: Schema.string().description('课件和资料的保存位置，默认在用户主目录下的「备课工作台」文件夹。'),
  webPath: Schema.string().default('/beike').description('在 DSH 网页界面中的访问路径。'),
  localPort: Schema.number().default(38127).description('本机网页端口（桌面版 DeepSeek Harness 的侧边栏和命令行模式使用）。改了这里，侧边栏会找不到工作台，一般不用改。'),
})

const SKILL_FILE = fileURLToPath(new URL('./skills/beike/SKILL.md', import.meta.url))
const text = (value) => [{ type: 'text', text: value }]
const out = { schema: { type: 'string' }, render: (_a, v) => text(v) }
const LESSON_ID = { type: 'string', required: true, description: '课次编号（beike_list 或 beike_create_lesson 返回的 id）' }

export function apply(ctx, config) {
  const dataDir = config.dataDir || join(homedir(), '备课工作台')
  const base = ('/' + String(config.webPath || '/beike').replace(/^\/+|\/+$/g, '')) || '/beike'
  const store = new Store(dataDir)
  const ready = store.init()
  let wd = null          // 会话工作目录服务（有则用它解析相对路径）
  let reject = null      // DSH 网页的访问控制
  let webOrigin = null   // DSH 网页地址（挂载成功后有值）
  let local = null       // 本机网页（桌面版侧边栏 / 命令行模式使用）

  ctx.inject(['workingDirectory'], (c) => { c.effect(() => { wd = c.workingDirectory; return () => { wd = null } }, 'beike: working directory') })
  ctx.inject(['connection'], (c) => {
    c.effect(() => {
      const conn = c.connection
      reject = req => (typeof conn?.requestRejection === 'function' ? conn.requestRejection(req) : undefined)
      return () => { reject = null }
    }, 'beike: connection guard')
  })
  // 网页界面：在 DSH Web 宿主上挂到 /beike
  ctx.inject(['webServer'], (c) => {
    const handler = createHandler({ store, base, reject: req => reject?.(req), logger: ctx.logger })
    c.effect(() => {
      const dispose = c.webServer.register({ kind: 'prefix', path: base, handler: async (req, res) => { await ready; return handler(req, res) } })
      try { webOrigin = c.webServer.getOrigin() } catch { webOrigin = null }
      return () => { dispose(); webOrigin = null }
    }, `beike: ${base} route`)
  })
  // 技能：备课方法（逆向设计 + BOPPPS + 课件 / 结构图 / 讲稿 / 核对规则）
  ctx.inject(['skills'], (c) => {
    c.effect(() => {
      const raw = readFileSync(SKILL_FILE, 'utf8')
      const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw)
      const description = (m?.[1].match(/description:\s*(.+)/)?.[1] || '高校备课').trim()
      return c.skills.register({ name: 'beike', description, content: raw.slice(m ? m[0].length : 0).trim(), source: 'bundled', path: SKILL_FILE })
    }, 'beike: skill')
  })
  // 本机网页：桌面版的界面从本地文件加载，侧边栏通过 http://127.0.0.1:端口/beike/ 嵌入工作台
  let disposed = false
  const localUrl = () => (local ? `http://127.0.0.1:${local.port}${base}/` : null)
  async function startLocal() {
    const handler = createHandler({ store, base, localPort: () => local?.port, logger: ctx.logger })
    const listen = port => new Promise((ok, fail) => {
      const server = createServer((req, res) => { ready.then(() => handler(req, res)) })
      server.once('error', fail)
      server.listen(port, '127.0.0.1', () => ok(server))
    })
    let server, err
    // 插件重载时旧服务可能还没完全关闭，稍等重试几次
    for (let i = 0; i < 6 && !server; i++) {
      try { server = await listen(config.localPort ?? 38127) } catch (e) { err = e; await new Promise(r => setTimeout(r, 400)) }
    }
    if (!server) { const e = err;
      ctx.logger.warn(`beike: 本机端口 ${config.localPort ?? 38127} 被占用（${e?.code || e}），改用随机端口；桌面版侧边栏将无法嵌入，可用 beike_open 给出的链接打开`)
      server = await listen(0)
    }
    if (disposed) { server.close(); return }
    local = { server, port: server.address().port }
    ctx.logger.info(`beike: 备课工作台本机网页 ${localUrl()}`)
  }
  const localReady = startLocal().catch(e => ctx.logger.warn(`beike: 本机网页启动失败：${e?.message || e}`))
  ctx.effect(() => () => { disposed = true; local?.server.close(); local?.server.closeAllConnections?.(); local = null }, 'beike: local server')

  async function cwdOf(exec) {
    try { if (wd && exec?.agent) return await wd.ensure(exec.agent, exec.signal) } catch { /* 用进程目录 */ }
    return process.cwd()
  }
  async function lesson(id) { await ready; return store.get(String(id || '').trim()) }
  /** 可用的网页地址：本机地址（任何模式都能用）+ DSH 网页地址（网页版才有） */
  async function openUrls() {
    await localReady
    const urls = []
    if (localUrl()) urls.push(localUrl())
    if (webOrigin) urls.push(webOrigin.replace(/\/$/, '') + base + '/')
    return [...new Set(urls)]
  }
  const summary = (l) => {
    const p = pace(l.slides)
    return `课次 ${l.id}《${l.title}》· ${l.course} · ${l.minutes} 分钟 · ${l.slides.length} 页（按讲稿估算约 ${Math.round(p.reduce((a, b) => a + b, 0))} 分钟）· 资料 ${l.materials.length} 份`
  }

  /* ---------------- 工具 ---------------- */

  ctx.tools.register(defineTool({
    name: 'beike_list',
    description: '列出备课工作台里已有的课次（按最近修改排序），返回课次编号、课题、课程、页数。开始备课前先调用，避免重复新建。',
    parameters: { query: { type: 'string', description: '按课题或课程名筛选（可选）' } },
    output: out,
    async execute(args) {
      await ready
      const q = String(args.query || '').trim().toLowerCase()
      const list = (await store.list()).filter(l => !q || `${l.title} ${l.course}`.toLowerCase().includes(q))
      if (!list.length) return q ? `没有找到包含“${args.query}”的课次。` : '备课工作台里还没有课次，可以用 beike_create_lesson 新建。'
      return list.slice(0, 50).map(l => `- ${l.id}｜《${l.title}》｜${l.course}｜${l.minutes} 分钟｜${l.pages} 页｜资料 ${l.materials} 份｜${String(l.updatedAt).slice(0, 16).replace('T', ' ')}`).join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_create_lesson',
    description: '在备课工作台新建一个课次（一节课），返回课次编号。之后添加资料、保存课件都用这个编号。',
    parameters: {
      title: { type: 'string', required: true, description: '课题，例如“冒泡排序”' },
      course: { type: 'string', required: true, description: '课程名称，例如“数据结构”' },
      minutes: { type: 'integer', description: '课时（分钟），默认 45' },
      lesson_type: { type: 'string', description: '课型（可选）：新授课 / 复习课 / 习题课 / 实验课 / 案例研讨' },
    },
    output: out,
    async execute(args) {
      await ready
      const l = await store.create({ title: args.title, course: args.course, minutes: args.minutes, lessonType: args.lesson_type })
      return `已新建课次 ${l.id}《${l.title}》（${l.course}，${l.minutes} 分钟）。下一步：用 beike_add_material 添加老师的资料。`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_add_material',
    description: '把老师的备课资料加入课次：给出文件路径（支持 .docx .pptx .txt .md，可用相对当前工作区的路径），或直接给出 text 文字。PDF 请先转成文字再用 text 添加。',
    parameters: {
      lesson_id: LESSON_ID,
      path: { type: 'string', description: '资料文件路径' },
      text: { type: 'string', description: '直接提供的资料文字（与 path 二选一）' },
      name: { type: 'string', description: '资料名称（用 text 时建议填写）' },
    },
    output: out,
    async execute(args, exec) {
      const l = await lesson(args.lesson_id)
      let t, label
      if (args.path) {
        const file = isAbsolute(args.path) ? args.path : resolve(await cwdOf(exec), args.path)
        t = await extractText(file, await readFile(file))
        label = args.name || basename(file)
      } else if (args.text) {
        t = String(args.text).trim()
        label = args.name || '对话中提供的资料'
      } else throw new Error('请提供 path 或 text')
      await store.addMaterial(l, label, t)
      return `已添加资料「${label}」，共 ${t.length} 字。课次现有资料 ${l.materials.length} 份。请用 beike_read_materials 通读资料后再做教学设计。`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_read_materials',
    description: '读取课次资料原文（所有资料拼接，分段读取）。资料较长时用 offset 继续读，直到读完。',
    parameters: {
      lesson_id: LESSON_ID,
      offset: { type: 'integer', description: '从第几个字开始，默认 0' },
      limit: { type: 'integer', description: '本次最多读多少字，默认 15000，最大 40000' },
    },
    output: out,
    async execute(args) {
      const l = await lesson(args.lesson_id)
      const all = await store.materialsText(l)
      if (!all.trim()) return '这个课次还没有资料。可以请老师提供讲义、教材或旧课件，用 beike_add_material 添加；没有资料时按课题和学科常识设计，并在讲稿中标明哪些内容需要老师核实。'
      const off = Math.max(0, args.offset || 0), lim = Math.min(40000, Math.max(1000, args.limit || 15000))
      const chunk = all.slice(off, off + lim)
      const end = off + chunk.length
      return `【资料 第 ${off + 1}–${end} 字 / 共 ${all.length} 字】\n${chunk}` + (end < all.length ? `\n\n（还有 ${all.length - end} 字未读，下一次用 offset=${end} 继续）` : '\n\n（资料已读完）')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_get_lesson',
    description: '查看课次的当前状态：基本信息、教学设计、每页课件内容（含页码、版式、阶段、讲稿摘要）和每页建议时长。修改课件前先调用，确认页码。',
    parameters: { lesson_id: LESSON_ID, full_notes: { type: 'boolean', description: '是否返回完整讲稿（默认只返回前 80 字）' } },
    output: out,
    async execute(args) {
      const l = await lesson(args.lesson_id)
      const p = pace(l.slides)
      const plan = Object.entries(l.plan || {}).filter(([, v]) => String(v).trim()).map(([k, v]) => `【${k}】${v}`).join('\n')
      return `${summary(l)}\n配色：${l.theme}\n\n【教学设计】\n${plan || '（还没有）'}\n\n【课件】\n${deckText(l.slides, args.full_notes ? 3000 : 80)}` +
        (l.slides.length ? `\n\n【每页建议时长（分钟）】${p.map((v, i) => `${i + 1}:${v}`).join('  ')}` : '')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_save_slides',
    description: '保存课件。mode="replace" 时 slides 给出完整的一套课件（从零制作或大改）；mode="patch" 时 ops 给出逐页修改：{"op":"update","index":3,"slide":{只写要改的字段}}、{"op":"insert","after":3,"slide":{...}}、{"op":"delete","index":5}，页码从 1 开始、指修改前的页码。版式：title objectives bullets two diagram quiz section summary；每页可写 phase（B O P1 P2 P3 S）和 notes 讲稿。详细规则见 beike 技能。每次保存都会留下可撤销的旧版本。',
    parameters: {
      lesson_id: LESSON_ID,
      mode: { type: 'string', required: true, enum: ['replace', 'patch'], description: 'replace 整套替换；patch 逐页修改' },
      slides: { type: 'json', description: 'mode=replace 时的完整 slide 数组' },
      ops: { type: 'json', description: 'mode=patch 时的修改操作数组' },
      note: { type: 'string', description: '这次修改的简短说明（会显示在撤销记录里）' },
    },
    output: out,
    async execute(args) {
      const l = await lesson(args.lesson_id)
      let slides
      if (args.mode === 'replace') {
        if (!Array.isArray(args.slides) || !args.slides.length) throw new Error('mode=replace 时 slides 必须是非空数组')
        slides = normalize(args.slides)
        // 老师手动上传的配图：标题相同的页保留
        for (const s of slides) { if (!s.image) { const o = l.slides.find(x => x.image && x.title === s.title); if (o) s.image = o.image } }
      } else {
        if (!Array.isArray(args.ops) || !args.ops.length) throw new Error('mode=patch 时 ops 必须是非空数组')
        slides = applyOps(l.slides, args.ops)
      }
      const dropped = (args.mode === 'replace' ? args.slides : args.ops.map(o => o.slide).filter(Boolean))
        .filter(s => s && s.layout === 'diagram').length - slides.filter(s => s.layout === 'diagram').length
      await store.saveSlides(l, slides, args.note || (args.mode === 'replace' ? 'AI 制作整套课件' : 'AI 修改课件'))
      const warns = health(slides, l.minutes).filter(h => h[0] === 'warn').map(h => '- ' + h[1])
      return `已保存，共 ${slides.length} 页。${summary(l)}` +
        (args.mode === 'replace' && dropped > 0 ? `\n注意：有 ${dropped} 页结构图数据不完整（版式不在列表里或条目太少），已按要点页保存。` : '') +
        (warns.length ? `\n体检提示：\n${warns.join('\n')}` : '\n体检未发现明显问题。') +
        '\n完成后运行 beike_check 做出处核对。'
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_save_plan',
    description: '保存教学设计（逆向设计 + BOPPPS）。只传需要更新的字段，其余保持不变。',
    parameters: {
      lesson_id: LESSON_ID,
      objectives: { type: 'string', description: '学习目标：2–4 条可观测目标' },
      key: { type: 'string', description: '教学重点' },
      difficult: { type: 'string', description: '教学难点' },
      misconceptions: { type: 'string', description: '学生常见误区及对策' },
      process: { type: 'string', description: '教学过程：BOPPPS 各环节的时长、教师活动、学生活动、检测方式' },
      homework: { type: 'string', description: '作业与课后任务' },
      board: { type: 'string', description: '板书设计' },
    },
    output: out,
    async execute(args) {
      const l = await lesson(args.lesson_id)
      const keys = ['objectives', 'key', 'difficult', 'misconceptions', 'process', 'homework', 'board']
      const changed = keys.filter(k => typeof args[k] === 'string')
      for (const k of changed) l.plan[k] = args[k].slice(0, 6000)
      await store.save(l)
      return changed.length ? `已保存教学设计：${changed.join('、')}。` : '没有需要保存的字段。'
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_set_lesson',
    description: '修改课次信息：课题、课程、课时、配色（36 套内置配色，如 blue 学院蓝、green 松石绿、red 中国红、navy 藏青、science 科技青、medical 医学蓝绿、mint 薄荷、mono 极简黑白、dark 深色）。',
    parameters: {
      lesson_id: LESSON_ID,
      title: { type: 'string' }, course: { type: 'string' }, minutes: { type: 'integer' },
      theme: { type: 'string', description: '配色代号；不确定时先传 "list" 查看全部配色' },
    },
    output: out,
    async execute(args) {
      const l = await lesson(args.lesson_id)
      const all = themes()
      if (args.theme === 'list') return Object.entries(all).map(([k, v]) => `${k} ${v.name}（${v.group}）`).join('\n')
      if (args.theme && !all[args.theme]) throw new Error(`没有配色“${args.theme}”，传 theme="list" 查看可选配色`)
      if (args.title) l.title = String(args.title).slice(0, 80)
      if (args.course) l.course = String(args.course).slice(0, 60)
      if (args.minutes) l.minutes = Math.max(10, Math.min(300, args.minutes))
      if (args.theme) l.theme = args.theme
      await store.save(l)
      return `已更新。${summary(l)}，配色：${all[l.theme]?.name || l.theme}`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_check',
    description: '课件体检与出处核对（不调用 AI）：①按讲稿估算课时、文字量、互动、讲稿、结构图版式等规则检查；②逐条对照老师资料，列出资料里找不到出处的要点（AI 补充）和资料里没有的数字、年份、百分比，并给出资料中最接近的原文。做完课件后必须运行，并按结果修正。',
    parameters: { lesson_id: LESSON_ID },
    output: out,
    async execute(args) {
      const l = await lesson(args.lesson_id)
      if (!l.slides.length) return '这个课次还没有课件。'
      const h = health(l.slides, l.minutes)
      const g = grounding(l.slides, await store.materialsText(l))
      let t = `${summary(l)}\n\n【课件体检】\n${h.map(x => `${x[0] === 'warn' ? '⚠' : x[0] === 'ok' ? '✓' : '·'} ${x[1]}`).join('\n')}\n\n【出处核对】\n`
      if (!g.has) t += '这个课次没有资料可对照。请在讲稿中标明需要老师核实的事实和数据。'
      else {
        const u = g.sum
        t += `共核对 ${u.all} 条：有出处 ${u.src}，部分有出处 ${u.part}，AI 补充 ${u.ai}，资料里没有的数字 ${u.nums} 处。\n`
        const rows = g.items.filter(x => x.status === 'ai' || x.status === 'num' || x.nums.length)
        if (!rows.length) t += '没有需要处理的内容。'
        else {
          t += rows.slice(0, 30).map(x => `- 第${x.page}页 ${x.field}：「${x.text}」` + (x.nums.length ? `（资料里没有：${x.nums.join('、')}）` : '（AI 补充）') + (x.quote ? `；资料最接近的原文：「${x.quote}」` : '')).join('\n')
          t += '\n\n处理原则：与资料矛盾的改成资料的说法；资料没有、又不能确定的数字或断言，删掉或改成定性描述，并在讲稿注明“需核实”；举例、类比、过渡语可以保留。用 beike_save_slides 的 patch 模式修改。'
        }
      }
      return t
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_export_pptx',
    description: '把课件导出为 PowerPoint（.pptx，16:9，文字可编辑，结构图为原生形状，讲稿和答案在备注里）。默认保存到当前工作区，也可以指定路径。',
    parameters: { lesson_id: LESSON_ID, path: { type: 'string', description: '保存路径（可选，.pptx 结尾；相对路径基于当前工作区）' } },
    output: out,
    async execute(args, exec) {
      const l = await lesson(args.lesson_id)
      if (!l.slides.length) throw new Error('这个课次还没有课件')
      const buf = await exportPptx(l, f => store.path(l.id, 'images', f))
      const fname = `${l.course}-${l.title}`.replace(/[\\/:*?"<>|]/g, '_') + '.pptx'
      let file = args.path ? (isAbsolute(args.path) ? args.path : resolve(await cwdOf(exec), args.path)) : join(await cwdOf(exec), fname)
      if (!/\.pptx$/i.test(file)) file += '.pptx'
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, buf)
      return `已导出：${file}（${l.slides.length} 页，${Math.round(buf.length / 1024)} KB）`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_open',
    description: '返回备课工作台网页地址：老师可在网页里预览课件、逐页修改、换配色、看体检与出处核对、管理资料、点「上课」直接放映（带演讲者视图）、下载 PPT。做完课件后把链接告诉老师。',
    parameters: { lesson_id: { type: 'string', description: '要直接打开的课次（可选）' } },
    output: out,
    async execute(args) {
      await ready
      const urls = await openUrls()
      if (!urls.length) return `备课工作台网页没有启动成功，请查看 DeepSeek Harness 日志。课件和资料保存在：${store.dir}`
      let t = `备课工作台：${urls[0]}` + (urls[1] ? `\n（在 DeepSeek Harness 网页版里也可用：${urls[1]}）` : '')
      t += '\n也可以直接点 DeepSeek Harness 左侧边栏的「备课工作台」，或在右侧边栏新建标签选「备课工作台」。'
      if (args.lesson_id) {
        const l = await lesson(args.lesson_id)
        t += `\n上课放映：${urls[0]}present/${l.id}`
        t += `\n（打开工作台后在左侧选《${l.title}》）`
      }
      return t + `\n课件和资料保存在：${store.dir}`
    },
  }))

  ctx.logger.info(`beike: 备课工作台已加载，数据目录 ${dataDir}`)
}

/** 供测试与其他工具使用 */
export { LAYOUTS, PHASES }
