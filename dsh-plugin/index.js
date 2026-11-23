/**
 * dsh-beike —— 备课工作台 DeepSeek Harness 插件
 *
 * 给 AI 一套备课工具（beike_*）和一份备课技能，课件保存在老师自己的电脑上；
 * 再提供一个备课工作台网页：预览、逐页编辑、36 套配色与学校模板、课件体检与出处核对、
 * 资料与资料库、备课风格与教学方法、配图与 AI 教学视频、教学设计与 Word 教案、
 * 浏览器上课（演讲者视图）和下载 PPT。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { Service, typeKey, VIDEO_KINDS } from './lib/service.js'
import { TYPES, TONES, DENSITY, MUST } from './lib/profile.js'
import { PLAN_KEYS, PLAN_NAMES } from './lib/web.js'
import { normalize, applyOps, pace, health, grounding, deckText, LAYOUTS, PHASES } from './lib/core.js'
import { extractText } from './lib/extract.js'
import { themes } from './lib/export.js'
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
  const svc = new Service(dataDir, ctx.logger)
  const { store, profile, library } = svc
  const ready = svc.init().then(() => svc.pollVideos()).catch(e => ctx.logger.warn(`beike: 初始化 ${e?.message || e}`))
  ctx.effect(() => () => svc.stop(), 'beike: video poller')
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
    const handler = createHandler({ svc, base, reject: req => reject?.(req), logger: ctx.logger })
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
    const handler = createHandler({ svc, base, localPort: () => local?.port, logger: ctx.logger })
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
      return list.slice(0, 50).map(l => `- ${l.id}｜《${l.title}》｜${l.course}｜${l.minutes} 分钟｜${TYPES[l.lessonType]?.[0] || '新授课'}｜${l.pages} 页｜资料 ${l.materials} 份｜${String(l.updatedAt).slice(0, 16).replace('T', ' ')}`).join('\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_create_lesson',
    description: '在备课工作台新建一个课次（一节课），返回课次编号和这节课的备课须知（老师的备课风格、课型要求、教学方法）。会自动从老师的资料库里带入相关资料。之后添加资料、保存课件都用这个编号。',
    parameters: {
      title: { type: 'string', required: true, description: '课题，例如“冒泡排序”' },
      course: { type: 'string', required: true, description: '课程名称，例如“数据结构”' },
      minutes: { type: 'integer', description: '课时（分钟），默认 45' },
      lesson_type: { type: 'string', description: '课型：新授课 / 复习课 / 习题课 / 实验实训课 / 研讨课 / 公开课（默认新授课）' },
      audience: { type: 'string', description: '授课对象，例如“计算机专业大二，基础一般”（可选）' },
      methods: { type: 'array', items: { type: 'string' }, description: '采用的教学方法代号（可选，1–4 个，用 beike_profile action=methods 查看）；不填则用老师设定的默认方法' },
      attach_library: { type: 'boolean', description: '是否自动带入资料库里最相关的资料，默认 true' },
    },
    output: out,
    async execute(args) {
      await ready
      const { l, suggested, attached } = await svc.createLesson({
        title: args.title, course: args.course, minutes: args.minutes, lessonType: typeKey(args.lesson_type), audience: args.audience,
        methods: args.methods, attachLibrary: args.attach_library === false ? 'none' : 'auto',
      })
      let t = `已新建课次 ${l.id}《${l.title}》（${l.course}，${l.minutes} 分钟，${TYPES[l.lessonType]?.[0] || '新授课'}）。`
      if (attached.length) t += `\n已从老师的资料库自动带入：${attached.map(n => `「${n}」`).join('、')}。`
      const more = suggested.filter(x => !attached.includes(x.name))
      if (more.length) t += `\n资料库里可能还相关：${more.map(x => `${x.id}「${x.name}」`).join('、')}（需要时用 beike_library action=attach 加入）。`
      const g = await svc.guidance(l)
      if (g) t += `\n\n${g}`
      return t + '\n\n下一步：用 beike_add_material 添加老师提供的资料，再用 beike_read_materials 通读。'
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_add_material',
    description: '把老师的备课资料加入课次：给出文件路径（支持 .docx .pptx .txt .md，可用相对当前工作区的路径），或直接给出 text 文字。PDF 请先转成文字再用 text 添加。资料会同时存进老师的资料库（按课程分类），以后的课可以复用。',
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
      await svc.addMaterial(l, label, t)
      return `已添加资料「${label}」，共 ${t.length} 字（也已存进资料库）。课次现有资料 ${l.materials.length} 份。请用 beike_read_materials 通读资料后再做教学设计。`
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
      if (!all.trim()) {
        const sug = await library.suggest(`${l.title} ${l.course}`, 5)
        return '这个课次还没有资料。' + (sug.length ? `老师的资料库里可能相关：${sug.map(x => `${x.id}「${x.name}」`).join('、')}，可以用 beike_library action=attach 加入。` : '') +
          '也可以请老师提供讲义、教材或旧课件，用 beike_add_material 添加；没有资料时按课题和学科常识设计，并在讲稿中标明哪些内容需要老师核实。'
      }
      const off = Math.max(0, args.offset || 0), lim = Math.min(40000, Math.max(1000, args.limit || 15000))
      const chunk = all.slice(off, off + lim)
      const end = off + chunk.length
      return `【资料 第 ${off + 1}–${end} 字 / 共 ${all.length} 字】\n${chunk}` + (end < all.length ? `\n\n（还有 ${all.length - end} 字未读，下一次用 offset=${end} 继续）` : '\n\n（资料已读完）')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_get_lesson',
    description: '查看课次的当前状态：基本信息、备课须知（老师的备课风格、课型、授课对象、选定的教学方法——必须遵守）、教学设计、每页课件内容（含页码、版式、阶段、讲稿摘要）和每页建议时长。制作或修改课件前先调用。',
    parameters: { lesson_id: LESSON_ID, full_notes: { type: 'boolean', description: '是否返回完整讲稿（默认只返回前 80 字）' } },
    output: out,
    async execute(args) {
      const l = await lesson(args.lesson_id)
      const p = pace(l.slides)
      const plan = PLAN_KEYS.filter(k => String(l.plan[k] || '').trim()).map(k => `【${PLAN_NAMES[k]}】${l.plan[k]}`).join('\n')
      const g = await svc.guidance(l)
      const vids = l.slides.map((s, i) => (s.layout === 'video' ? `第${i + 1}页：${{ running: '生成中', succeeded: '已完成', failed: '失败：' + (s.video.error || '') }[s.video.status] || s.video.status}` : '')).filter(Boolean)
      return `${summary(l)}\n课型：${TYPES[l.lessonType]?.[0] || '新授课'}${l.audience ? `；授课对象：${l.audience}` : ''}；配色：${l.theme}` +
        (g ? `\n\n【备课须知】\n${g}` : '') +
        `\n\n【教学设计】\n${plan || '（还没有）'}\n\n【课件】\n${deckText(l.slides, args.full_notes ? 3000 : 80)}` +
        (vids.length ? `\n\n【教学视频】${vids.join('；')}（视频页用 patch 模式修改时不要改 layout 和 video 字段）` : '') +
        (l.slides.length ? `\n\n【每页建议时长（分钟）】${p.map((v, i) => `${i + 1}:${v}`).join('  ')}` : '')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_save_slides',
    description: '保存课件。mode="replace" 时 slides 给出完整的一套课件（从零制作或大改）；mode="patch" 时 ops 给出逐页修改：{"op":"update","index":3,"slide":{只写要改的字段}}、{"op":"insert","after":3,"slide":{...}}、{"op":"delete","index":5}，页码从 1 开始、指修改前的页码。版式：title objectives bullets two diagram quiz section summary；每页可写 phase（B O P1 P2 P3 S）和 notes 讲稿。教学视频页由 beike_video 生成，replace 时原有视频页会自动保留。详细规则见 beike 技能。每次保存都会留下可撤销的旧版本。',
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
        slides = normalize(args.slides.filter(s => s && s.layout !== 'video'))
        // 老师手动上传的配图：标题相同的页保留
        for (const s of slides) { if (!s.image) { const o = l.slides.find(x => x.image && x.title === s.title); if (o) s.image = o.image } }
        // 原有的教学视频页：插回原来的位置
        l.slides.forEach((s, i) => { if (s.layout === 'video') slides.splice(Math.min(i, slides.length), 0, s) })
      } else {
        if (!Array.isArray(args.ops) || !args.ops.length) throw new Error('mode=patch 时 ops 必须是非空数组')
        const ops = args.ops.map(o => {
          const cur = o && o.op === 'update' && l.slides[Number(o.index) - 1]
          // 视频页只允许改标题、讲稿和环节
          if (cur && cur.layout === 'video' && o.slide) return { ...o, slide: { title: o.slide.title ?? cur.title, notes: o.slide.notes ?? cur.notes, phase: o.slide.phase ?? cur.phase } }
          if (o && o.slide && o.slide.layout === 'video') return { ...o, slide: { ...o.slide, layout: 'bullets' } }
          return o
        })
        slides = applyOps(l.slides, ops)
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
      analysis: { type: 'string', description: '学情分析：已有基础、可能的困难、学习特点' },
      objectives: { type: 'string', description: '学习目标：2–4 条可观测目标' },
      key: { type: 'string', description: '教学重点' },
      difficult: { type: 'string', description: '教学难点' },
      misconceptions: { type: 'string', description: '学生常见误区及对策' },
      process: { type: 'string', description: '教学过程：BOPPPS 各环节的时长、教师活动、学生活动、检测方式' },
      ideology: { type: 'string', description: '课程思政：融入点和方式（自然融入，不贴标签）' },
      homework: { type: 'string', description: '作业与课后任务' },
      board: { type: 'string', description: '板书设计' },
      reflection: { type: 'string', description: '课后反思（一般由老师课后填写）' },
    },
    output: out,
    async execute(args) {
      const l = await lesson(args.lesson_id)
      const changed = PLAN_KEYS.filter(k => typeof args[k] === 'string')
      for (const k of changed) l.plan[k] = args[k].slice(0, 6000)
      await store.save(l)
      return changed.length ? `已保存教学设计：${changed.map(k => PLAN_NAMES[k]).join('、')}。` : '没有需要保存的字段。'
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_set_lesson',
    description: '修改课次信息：课题、课程、课时、课型、授课对象、教学方法、配色（36 套内置配色，如 blue 学院蓝、green 松石绿、red 中国红、navy 藏青、science 科技青、mint 薄荷、mono 极简黑白、dark 深色；老师上传的学校模板代号为 tpl:xxx）。',
    parameters: {
      lesson_id: LESSON_ID,
      title: { type: 'string' }, course: { type: 'string' }, minutes: { type: 'integer' },
      lesson_type: { type: 'string', description: '课型：新授课 / 复习课 / 习题课 / 实验实训课 / 研讨课 / 公开课' },
      audience: { type: 'string', description: '授课对象' },
      methods: { type: 'array', items: { type: 'string' }, description: '教学方法代号（整体替换，最多 6 个，建议 1–4 个）' },
      theme: { type: 'string', description: '配色或模板代号；不确定时先传 "list" 查看全部' },
    },
    output: out,
    async execute(args) {
      const l = await lesson(args.lesson_id)
      const all = themes()
      if (args.theme === 'list') {
        const kit = await profile.renderKit(f => f)
        return (kit.templates.length ? '学校模板：\n' + kit.templates.map(t => `tpl:${t.id} ${t.name}`).join('\n') + '\n\n内置配色：\n' : '') + Object.entries(all).map(([k, v]) => `${k} ${v.name}（${v.group}）`).join('\n')
      }
      if (args.theme && !(await svc.validTheme(args.theme))) throw new Error(`没有配色“${args.theme}”，传 theme="list" 查看可选配色`)
      if (args.title) l.title = String(args.title).slice(0, 80)
      if (args.course) l.course = String(args.course).slice(0, 60)
      if (args.minutes) l.minutes = Math.max(10, Math.min(300, args.minutes))
      if (args.theme) l.theme = args.theme
      if (args.lesson_type) l.lessonType = typeKey(args.lesson_type)
      if (typeof args.audience === 'string') l.audience = args.audience.trim().slice(0, 200)
      if (Array.isArray(args.methods)) l.methods = await profile.cleanMethods(args.methods)
      await store.save(l)
      const ms = await profile.methodsFor(l.methods)
      return `已更新。${summary(l)}，课型：${TYPES[l.lessonType]?.[0] || '新授课'}，配色：${all[l.theme]?.name || l.theme}` + (ms.length ? `，教学方法：${ms.map(m => m.name).join('、')}` : '')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_profile',
    description: '老师的个人备课设置。action=get 查看备课风格、我的技能、常用指令、默认教学方法；action=methods 列出教学方法库（含代号、适用场景）；action=save_style 保存备课风格（只传要改的字段；“从资料库学习风格”时先读资料库里的旧课件 / 教案，总结后征得老师同意再保存）；action=save_skill 新建或修改一条“我的技能”（可反复使用的具体要求）。',
    parameters: {
      action: { type: 'string', required: true, enum: ['get', 'methods', 'save_style', 'save_skill'] },
      style: { type: 'json', description: `save_style 时：{ students 学生情况, tone 语言风格(${Object.keys(TONES).filter(Boolean).join('/')}), density 每页信息量(${Object.keys(DENSITY).filter(Boolean).join('/')}), must 必有环节数组(${Object.keys(MUST).join('/')}), cases 案例偏好, avoid 不要这样做, notes 其他习惯 }` },
      skill: { type: 'json', description: 'save_skill 时：{ id(修改时填), name 名称, instructions 具体要求, summary 一句说明, auto 是否新课次默认带上 }' },
    },
    output: out,
    async execute(args) {
      await ready
      const d = await profile.load()
      if (args.action === 'methods') {
        const ms = await profile.methods()
        return ms.map(m => `${m.key}｜${m.name}｜${m.category}｜${m.summary || ''}`).join('\n') + '\n\n给课次设置教学方法：beike_set_lesson 的 methods 参数（建议 1–4 个）。'
      }
      if (args.action === 'save_style') {
        if (!args.style || typeof args.style !== 'object') throw new Error('请提供 style')
        await profile.setStyle(args.style)
        return '已保存备课风格：\n' + ((await profile.styleText()) || '（空）')
      }
      if (args.action === 'save_skill') {
        const s = await profile.saveSkill(args.skill || {})
        return `已保存技能「${s.name}」（代号 ${s.id}）。` + (args.skill?.auto ? '以后新建的课次会默认带上。' : '需要时用 beike_set_lesson 的 methods 加到课次。')
      }
      const auto = await profile.methodsFor(d.autoMethods)
      return [(await profile.styleText()) || '【备课风格】还没有设置。可以问老师学生情况和讲课习惯，或者读资料库里的旧课件总结风格（征得同意后用 action=save_style 保存）。',
        d.skills.length ? '【我的技能】\n' + d.skills.map(s => `${s.id}｜${s.name}：${s.instructions}`).join('\n') : '【我的技能】无',
        auto.length ? '【新课次默认教学方法】' + auto.map(m => m.name).join('、') : '',
        d.cmds.length ? '【常用指令】\n' + d.cmds.map(c => '- ' + c).join('\n') : '',
        d.brand.name ? `【学校】${d.brand.name}` : ''].filter(Boolean).join('\n\n')
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_library',
    description: '老师的资料库（跨课次复用的讲义、旧课件、教案）。action=list 列出（可用 query 搜索全文）；action=suggest 按课题推荐相关资料；action=read 读取某份资料全文（分段）；action=add 存入资料（path 文件或 text 文字，folder 为课程分类）；action=attach 把资料库条目加入某个课次的资料。',
    parameters: {
      action: { type: 'string', required: true, enum: ['list', 'suggest', 'read', 'add', 'attach'] },
      query: { type: 'string', description: 'list 时搜索词；suggest 时为课题' },
      id: { type: 'string', description: 'read 时的资料编号' },
      ids: { type: 'array', items: { type: 'string' }, description: 'attach 时的资料编号' },
      lesson_id: { type: 'string', description: 'attach 时的课次编号' },
      path: { type: 'string', description: 'add 时的文件路径' },
      text: { type: 'string', description: 'add 时的文字' },
      name: { type: 'string', description: 'add 时的资料名称' },
      folder: { type: 'string', description: 'add 时的课程分类' },
      offset: { type: 'integer', description: 'read 时从第几个字开始' },
    },
    output: out,
    async execute(args, exec) {
      await ready
      const row = x => `${x.id}｜${x.folder || '未分类'}｜${x.name}｜${x.chars} 字`
      switch (args.action) {
        case 'suggest': {
          const r = await library.suggest(args.query || '', 8)
          return r.length ? r.map(row).join('\n') : '资料库里没有找到相关资料。'
        }
        case 'read': {
          const it = await library.get(String(args.id || ''))
          const off = Math.max(0, args.offset || 0), chunk = it.text.slice(off, off + 15000), end = off + chunk.length
          return `【${it.name}】第 ${off + 1}–${end} 字 / 共 ${it.text.length} 字\n${chunk}` + (end < it.text.length ? `\n\n（未读完，下一次用 offset=${end}）` : '')
        }
        case 'add': {
          let t, label
          if (args.path) { const file = isAbsolute(args.path) ? args.path : resolve(await cwdOf(exec), args.path); t = await extractText(file, await readFile(file)); label = args.name || basename(file) } else if (args.text) { t = args.text; label = args.name || '对话中提供的资料' } else throw new Error('请提供 path 或 text')
          const r = await library.add(label, t, args.folder || '')
          return r.dup ? `资料库里已有相同内容（${r.id}），没有重复保存。` : `已存入资料库：${r.id}「${label}」，${String(t).length} 字。`
        }
        case 'attach': {
          const l = await lesson(args.lesson_id)
          const names = await svc.attach(l, args.ids || [])
          return names.length ? `已加入课次《${l.title}》：${names.map(n => `「${n}」`).join('、')}。` : '没有新加入的资料（可能已经在课次里）。'
        }
        default: {
          const r = await library.list(args.query || '')
          return r.length ? `共 ${r.length} 份：\n` + r.slice(0, 80).map(row).join('\n') : (args.query ? '没有找到匹配的资料。' : '资料库还是空的。老师可以在备课工作台的「我的资料库」上传讲义、旧课件、教案。')
        }
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_image',
    description: '给课件页配图（封面、要点、学习目标、小结、章节过渡页可以配图）。action=search 按画面关键词搜索免费图库（描述看得见的东西，如“图书馆 书架”），返回候选编号；action=set 用候选的 url 和 credit 设为某页配图；action=ai 用 MiniMax H3-Image 生成一张写实示意图（需老师在工作台「设置」里填 MiniMax Key）；action=remove 去掉配图。',
    parameters: {
      action: { type: 'string', required: true, enum: ['search', 'set', 'ai', 'remove'] },
      lesson_id: { type: 'string', description: 'set / ai / remove 时的课次编号' },
      index: { type: 'integer', description: '页码（从 1 开始）' },
      query: { type: 'string', description: 'search 时的关键词（中英文均可，英文效果更好）' },
      url: { type: 'string', description: 'set 时的图片地址（来自 search 结果）' },
      credit: { type: 'string', description: 'set 时的图片来源说明（来自 search 结果）' },
      prompt: { type: 'string', description: 'ai 时的画面描述：主体、场景、构图、光线，写实风格，不要文字' },
    },
    output: out,
    async execute(args) {
      await ready
      if (args.action === 'search') {
        const r = await svc.searchImages(args.query, 1)
        return r.length ? r.slice(0, 8).map((x, i) => `${i + 1}. url=${x.url}\n   来源：${x.credit}`).join('\n') + '\n\n选一张用 action=set 设置（url 和 credit 原样传入）。' : '没有搜到合适的图片，换个更具体的画面关键词试试，或用 action=ai 生成。'
      }
      const l = await lesson(args.lesson_id)
      if (args.action === 'remove') { await svc.removeImage(l, args.index); return `已去掉第 ${args.index} 页的配图。` }
      if (args.action === 'ai') { await svc.aiImage(l, args.index, args.prompt || l.slides[args.index - 1]?.title || l.title); return `已为第 ${args.index} 页生成并设置 AI 示意图（讲稿备注里注明了来源）。` }
      await svc.setImageFromUrl(l, args.index, args.url, args.credit)
      return `已为第 ${args.index} 页配图。`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_video',
    description: `用 MiniMax 海螺 H3 生成 4–15 秒、带声音的课堂短视频，作为新的一页插在指定页后面（需老师在工作台「设置」里填 MiniMax Key；生成一般 1–5 分钟，完成后自动下载到本机，工作台和导出的 PPT 里都能播放）。action=create 新建；action=retry 重新生成某个视频页；action=status 查看各视频页状态。类型 kind：${Object.entries(VIDEO_KINDS).map(([k, v]) => `${k} ${v[0]}`).join('，')}。prompt 写具体画面：主体、动作、场景、镜头运动、光线，不要画面文字。`,
    parameters: {
      action: { type: 'string', required: true, enum: ['create', 'retry', 'status'] },
      lesson_id: LESSON_ID,
      after: { type: 'integer', description: 'create 时插在第几页后面（0 表示放在最前）' },
      index: { type: 'integer', description: 'retry 时的视频页页码' },
      kind: { type: 'string', enum: Object.keys(VIDEO_KINDS) },
      prompt: { type: 'string', description: 'create 时的画面描述' },
      title: { type: 'string', description: '视频页标题' },
      duration: { type: 'integer', description: '秒数 4–15，默认 6' },
      first_frame_page: { type: 'integer', description: '用某一页的配图作为视频第一帧（可选）' },
    },
    output: out,
    async execute(args) {
      const l = await lesson(args.lesson_id)
      if (args.action === 'status') {
        const v = l.slides.map((s, i) => (s.layout === 'video' ? `第${i + 1}页「${s.title}」：${{ running: '生成中', succeeded: '已完成', failed: '失败：' + (s.video.error || '') }[s.video.status] || s.video.status}` : '')).filter(Boolean)
        return v.length ? v.join('\n') : '这节课还没有视频页。'
      }
      if (args.action === 'retry') { await svc.retryVideo(l, args.index); return `第 ${args.index} 页的视频已重新提交生成，一般 1–5 分钟完成。` }
      const r = await svc.startVideo(l, { after: args.after, prompt: args.prompt, kind: args.kind, duration: args.duration, title: args.title, firstFramePage: args.first_frame_page })
      return `已提交视频生成（任务 ${r.task}），视频页插在第 ${r.page} 页。一般 1–5 分钟完成，插件会自动下载；可以先做别的，稍后用 action=status 查看。`
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
    name: 'beike_export',
    description: '导出到当前工作区（或指定路径）：format=pptx 课件（16:9，文字可编辑，结构图为原生形状，讲稿和答案在备注里，带学校模板 / 校徽和教学视频）；format=docx Word 教案（基本信息、教学方法、学情、目标、重难点、过程、思政、板书、作业，附逐页课件内容与讲稿）。',
    parameters: {
      lesson_id: LESSON_ID,
      format: { type: 'string', enum: ['pptx', 'docx'], description: '默认 pptx' },
      path: { type: 'string', description: '保存路径（可选；相对路径基于当前工作区）' },
    },
    output: out,
    async execute(args, exec) {
      const l = await lesson(args.lesson_id)
      const fmt = args.format === 'docx' ? 'docx' : 'pptx'
      if (fmt === 'pptx' && !l.slides.length) throw new Error('这个课次还没有课件')
      const buf = fmt === 'pptx' ? await svc.pptx(l) : await svc.docx(l)
      const fname = `${l.course}-${l.title}`.replace(/[\\/:*?"<>|]/g, '_') + (fmt === 'pptx' ? '.pptx' : '-教案.docx')
      let file = args.path ? (isAbsolute(args.path) ? args.path : resolve(await cwdOf(exec), args.path)) : join(await cwdOf(exec), fname)
      if (!new RegExp(`\\.${fmt}$`, 'i').test(file)) file += '.' + fmt
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, buf)
      return `已导出：${file}（${fmt === 'pptx' ? l.slides.length + ' 页，' : ''}${Math.round(buf.length / 1024)} KB）`
    },
  }))

  ctx.tools.register(defineTool({
    name: 'beike_open',
    description: '返回备课工作台网页地址：老师可在网页里预览课件、逐页修改、换配色或学校模板、看体检与出处核对、管理资料与资料库、设置备课风格、配图和生成教学视频、点「上课」直接放映（带演讲者视图）、下载 PPT 和 Word 教案。做完课件后把链接告诉老师。',
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
        t += `\n打印教案：${urls[0]}print/${l.id}`
        t += `\n（打开工作台后在左侧选《${l.title}》）`
      }
      return t + `\n课件和资料保存在：${store.dir}`
    },
  }))


  ctx.logger.info(`beike: 备课工作台已加载，数据目录 ${dataDir}`)
}

/** 供测试与其他工具使用 */
export { LAYOUTS, PHASES }
