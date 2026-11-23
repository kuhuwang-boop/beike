/**
 * 备课工作台网页：在 DSH 网页版里挂在 /beike；桌面版和命令行模式下由插件在本机端口提供。
 * 只提供本插件自己的数据；写操作都要求自定义请求头 X-Beike，防止其他网站伪造请求。
 */
import { readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalize, pace, health, grounding } from './core.js'
import { extractText } from './extract.js'
import { TYPES, TONES, DENSITY, MUST, MAX_METHODS } from './profile.js'
import { imageInfo } from './profile.js'
import { VIDEO_KINDS, typeKey } from './service.js'
import { themes } from './export.js'

const WEB = fileURLToPath(new URL('../web/', import.meta.url))
const TYPES_MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4' }
const MAX_UPLOAD = 30 * 1024 * 1024
const LID = '([a-z0-9]{6,24})'

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra })
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body))
}
const fail = (res, status, msg) => send(res, status, { error: msg })
const ok = (res, extra = {}) => send(res, 200, { ok: true, ...extra })

function readBody(req, limit = MAX_UPLOAD) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let n = 0
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error(`文件太大（最大 ${Math.round(limit / 1048576)}MB）`)); req.destroy() } else chunks.push(c) })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}
async function readJson(req, limit = 4 * 1024 * 1024) {
  const b = await readBody(req, limit)
  try { return b.length ? JSON.parse(b.toString('utf8')) : {} } catch { throw new Error('请求格式错误') }
}

/** 静态文件（视频支持断点续传，浏览器拖动进度条需要） */
async function sendFile(req, res, file, type, cache = 'max-age=86400') {
  let st
  try { st = await stat(file) } catch { return fail(res, 404, '文件不存在') }
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '')
  if (range && type === 'video/mp4') {
    let a = range[1] === '' ? st.size - Number(range[2]) : Number(range[1])
    let b = range[1] !== '' && range[2] !== '' ? Number(range[2]) : st.size - 1
    a = Math.max(0, a); b = Math.min(st.size - 1, b)
    if (a > b) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); return res.end() }
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1, 'Cache-Control': cache })
    return createReadStream(file, { start: a, end: b }).pipe(res)
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' })
  if (req.method === 'HEAD') return res.end()
  createReadStream(file).pipe(res)
}

/** 给浏览器的课次数据：图片 / 视频换成可访问的地址，并附上体检、课时估算和出处核对 */
export async function lessonView(svc, l, base) {
  const { store, profile } = svc
  const src = await store.materialsText(l)
  const slides = l.slides.map(s => ({
    ...s,
    ...(s.image ? { image: { ...s.image, src: `${base}/files/${l.id}/${s.image.file}` } } : {}),
    ...(s.video ? { video: { ...s.video, src: s.video.file ? `${base}/files/${l.id}/v/${s.video.file}` : '' } } : {}),
  }))
  const ms = await profile.methodsFor(l.methods)
  return {
    id: l.id, title: l.title, course: l.course, minutes: l.minutes, lessonType: l.lessonType || '', audience: l.audience || '',
    theme: l.theme || 'blue', methods: ms.map(m => ({ key: m.key, name: m.name, summary: m.summary, mine: !!m.mine })),
    plan: l.plan || {}, materials: l.materials, updatedAt: l.updatedAt, versions: (l.history || []).length,
    slides, pace: pace(l.slides), health: health(l.slides, l.minutes), ground: grounding(l.slides, src),
  }
}

/**
 * @param {object} o
 * @param {import('./service.js').Service} o.svc
 * @param {string} o.base 路径前缀，例如 /beike
 * @param {(req)=>number|undefined} [o.reject] 宿主的访问控制（返回 401/403 表示拒绝）
 * @param {()=>number} [o.localPort] 本机端口模式：只接受 Host 为本机地址的请求（防 DNS 重绑定）
 */
export function createHandler({ svc, base, reject, localPort, logger }) {
  const { store, profile, library } = svc
  const hostOk = (req) => {
    if (!localPort) return true
    const h = String(req.headers.host || '').toLowerCase()
    const port = localPort()
    return h === `127.0.0.1:${port}` || h === `localhost:${port}` || h === `[::1]:${port}`
  }
  const assetUrl = f => `${base}/files/_/${f}`

  return async function handle(req, res) {
    try {
      const url = new URL(req.url || '/', 'http://x')
      let p = url.pathname
      if (p !== base && !p.startsWith(base + '/')) return fail(res, 404, 'not found')
      p = p.slice(base.length) || '/'

      const rj = reject?.(req)
      if (rj) return fail(res, rj, '没有访问权限')
      if (!hostOk(req)) return fail(res, 403, '只允许在本机打开')

      // 写操作必须带自定义请求头（浏览器跨站请求无法添加，起到防伪造作用）
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-beike'] !== '1') return fail(res, 403, '请求来源无效')

      if (p === '/' || p === '/index.html') {
        const html = (await readFile(join(WEB, 'index.html'), 'utf8')).replaceAll('__BASE__', base)
        return send(res, 200, html, TYPES_MIME['.html'])
      }
      let m
      if ((m = p.match(new RegExp(`^/present/${LID}$`)))) {
        const l = await store.get(m[1])
        const v = await lessonView(svc, l, base)
        const kit = await profile.renderKit(assetUrl)
        const data = JSON.stringify({ id: l.id, title: l.title, course: l.course, minutes: l.minutes, slides: v.slides, theme: v.theme, pace: v.pace, templates: kit.templates, brand: kit.brand })
          .replace(/</g, '\\u003c')
        const html = (await readFile(join(WEB, 'present.html'), 'utf8')).replaceAll('__BASE__', base).replace('__DATA__', data).replaceAll('__TITLE__', l.title.replace(/[<&"]/g, ''))
        return send(res, 200, html, TYPES_MIME['.html'])
      }
      if ((m = p.match(new RegExp(`^/print/${LID}$`)))) return send(res, 200, await printHtml(svc, await store.get(m[1])), TYPES_MIME['.html'])
      if ((m = p.match(/^\/assets\/((?:vendor\/)?[\w.-]+\.(?:js|css|svg))$/))) {
        const body = await readFile(join(WEB, m[1]))
        return send(res, 200, body, TYPES_MIME[extname(m[1])], { 'Cache-Control': 'max-age=300' })
      }
      if ((m = p.match(/^\/files\/_\/([a-f0-9]{20}\.(?:png|jpg|gif|webp))$/))) return sendFile(req, res, profile.assetPath(m[1]), TYPES_MIME[extname(m[1])])
      if ((m = p.match(new RegExp(`^/files/${LID}/v/([\\w-]{1,60}\\.mp4)$`)))) return sendFile(req, res, store.path(m[1], 'videos', m[2]), 'video/mp4')
      if ((m = p.match(new RegExp(`^/files/${LID}/([\\w.-]{1,80}\\.(?:jpg|jpeg|png|webp|gif))$`, 'i')))) return sendFile(req, res, store.path(m[1], 'images', m[2]), TYPES_MIME[extname(m[2]).toLowerCase()])
      if (p.startsWith('/api/')) return await apiRoute(req, res, p.slice(4), url)
      return fail(res, 404, 'not found')
    } catch (e) {
      logger?.warn?.(`beike web: ${e?.message || e}`)
      if (!res.headersSent) fail(res, /没有找到|没有这|不存在/.test(String(e?.message)) ? 404 : 400, String(e?.message || e))
    }
  }

  async function apiRoute(req, res, p, url) {
    let m
    const POST = req.method === 'POST'
    /* ---------- 总览 ---------- */
    if (p === '/state') {
      const lessons = (await store.list()).map(l => (l.first?.image ? { ...l, first: { ...l.first, image: { ...l.first.image, src: `${base}/files/${l.id}/${l.first.image.file}` } } } : l))
      return send(res, 200, { version: store.version, lessons })
    }
    if (p === '/me') {
      const d = await profile.load()
      const kit = await profile.renderKit(assetUrl)
      return send(res, 200, {
        style: d.style, cmds: d.cmds, skills: d.skills, autoMethods: d.autoMethods, methods: await profile.methods(), maxMethods: MAX_METHODS,
        brand: { ...kit.brand, name: d.brand.name, prefs: d.brand.prefs, logo: kit.brand?.logo || null, icon: kit.brand?.icon || null },
        renderBrand: kit.brand, templates: kit.templates,
        types: TYPES, tones: TONES, density: DENSITY, must: MUST, videoKinds: VIDEO_KINDS,
        keys: await profile.secretStatus(), folders: (await library.load(), library.folders()), dataDir: store.dir,
      })
    }
    /* ---------- 我的：风格、技能、常用指令、学校、模板、Key ---------- */
    if (POST && p === '/me/style') return ok(res, { style: await profile.setStyle(await readJson(req)) })
    if (POST && p === '/me/cmds') return ok(res, { cmds: await profile.setCmds((await readJson(req)).cmds) })
    if (POST && p === '/me/auto') return ok(res, { auto: await profile.setAuto((await readJson(req)).keys) })
    if (POST && p === '/me/skill') return ok(res, { skill: await profile.saveSkill(await readJson(req)) })
    if (POST && (m = p.match(/^\/me\/skill\/(u[a-z0-9]{4,24})\/delete$/))) { await profile.removeSkill(m[1]); return ok(res) }
    if (POST && p === '/me/brand') return ok(res, { brand: await profile.setBrand(await readJson(req)) })
    if (POST && (m = p.match(/^\/me\/brand\/(logo|icon)$/))) return ok(res, { image: await profile.setBrandImage(m[1], await readBody(req, 5 * 1024 * 1024)) })
    if (POST && p === '/me/template') {
      const b = await readJson(req, 120 * 1024 * 1024)
      const imgs = {}
      for (const [k, v] of Object.entries(b.images || {})) imgs[k] = Buffer.from(String(v), 'base64')
      const t = await profile.addTemplate(b.name, b.data, imgs)
      const kit = await profile.renderKit(assetUrl)
      return ok(res, { template: kit.templates.find(x => x.id === t.id) })
    }
    if (POST && (m = p.match(/^\/me\/template\/([a-z0-9]{4,24})\/(rename|delete)$/))) {
      if (m[2] === 'rename') await profile.renameTemplate(m[1], (await readJson(req)).name)
      else await profile.removeTemplate(m[1])
      return ok(res)
    }
    if (POST && p === '/me/keys') { await profile.setSecrets(await readJson(req)); return ok(res, { keys: await profile.secretStatus() }) }
    if (POST && p === '/me/ping') {
      const { pingMiniMax } = await import('./media.js')
      return ok(res, { msg: await pingMiniMax(await profile.secrets()) })
    }
    /* ---------- 我的资料库 ---------- */
    if (p === '/library' && !POST) return send(res, 200, { items: await library.list(url.searchParams.get('q')), folders: library.folders() })
    if (p === '/library/suggest') return send(res, 200, { items: await library.suggest(url.searchParams.get('title') || '', 6) })
    if (POST && p === '/library') {
      const name = decodeURIComponent(String(req.headers['x-file-name'] || ''))
      const folder = decodeURIComponent(String(req.headers['x-folder'] || ''))
      let r
      if (name) r = await library.add(name, await extractText(name, await readBody(req)), folder)
      else { const b = await readJson(req); r = await library.add(b.name || '粘贴的文字', b.text, b.folder || folder) }
      return ok(res, r)
    }
    if ((m = p.match(/^\/library\/(l[a-z0-9]{6,24})(\/delete)?$/))) {
      if (POST && m[2]) { await library.remove(m[1]); return ok(res) }
      if (POST) return ok(res, { item: await library.update(m[1], await readJson(req, 8 * 1024 * 1024)) })
      return send(res, 200, await library.get(m[1]))
    }
    /* ---------- 图片搜索 ---------- */
    if (p === '/images') return send(res, 200, { items: await svc.searchImages(url.searchParams.get('q'), Number(url.searchParams.get('page')) || 1) })

    /* ---------- 课次 ---------- */
    if (POST && p === '/lesson') {
      const b = await readJson(req)
      const { l, attached } = await svc.createLesson({ title: b.title, course: b.course, minutes: b.minutes, lessonType: b.lessonType, audience: b.audience, methods: b.methods, attachLibrary: 'none' })
      if (Array.isArray(b.library) && b.library.length) attached.push(...await svc.attach(l, b.library))
      return ok(res, { id: l.id, attached })
    }
    if (!(m = p.match(new RegExp(`^/lesson/${LID}(/.*)?$`)))) return fail(res, 404, 'not found')
    const id = m[1], sub = m[2] || ''
    const l = await store.get(id)
    if (!sub && !POST) return send(res, 200, await lessonView(svc, l, base))
    if (!sub && POST) {
      const b = await readJson(req)
      if (b.title !== undefined) l.title = String(b.title).trim().slice(0, 80) || l.title
      if (b.course !== undefined) l.course = String(b.course).trim().slice(0, 60) || l.course
      if (b.minutes !== undefined) l.minutes = Math.max(10, Math.min(300, Number(b.minutes) || l.minutes))
      if (b.theme !== undefined) { if (!(await svc.validTheme(b.theme))) throw new Error('没有这个配色或模板'); l.theme = b.theme }
      if (b.lessonType !== undefined) l.lessonType = typeKey(b.lessonType)
      if (b.audience !== undefined) l.audience = String(b.audience).trim().slice(0, 200)
      if (b.methods !== undefined) l.methods = await profile.cleanMethods(b.methods)
      if (b.plan && typeof b.plan === 'object') {
        for (const k of PLAN_KEYS) if (b.plan[k] !== undefined) l.plan[k] = String(b.plan[k] ?? '').slice(0, 6000)
      }
      await store.save(l)
      return ok(res)
    }
    if (POST && sub === '/delete') { await store.remove(id); return ok(res) }
    if (POST && sub === '/slides') {
      const b = await readJson(req, 8 * 1024 * 1024)
      // 浏览器回传的图片 / 视频带 src，这里换回文件名
      const slides = normalize((b.slides || []).map(s => {
        if (!s || typeof s !== 'object') return s
        const o = { ...s }
        if (s.image) o.image = { file: s.image.file, credit: s.image.credit }
        if (s.video) { o.video = { ...s.video }; delete o.video.src }
        return o
      }))
      await store.saveSlides(l, slides, b.note || '在工作台手动修改')
      return ok(res)
    }
    if (POST && sub === '/undo') { const note = await store.undo(l); return ok(res, { note }) }
    if (sub === '/versions') return send(res, 200, { items: store.versions(l) })
    if (POST && sub === '/restore') { await store.restore(l, Number((await readJson(req)).i)); return ok(res) }
    if (POST && sub === '/attach') return ok(res, { names: await svc.attach(l, (await readJson(req)).ids) })
    if (POST && sub === '/material') {
      const name = decodeURIComponent(String(req.headers['x-file-name'] || ''))
      let text, label
      if (name) { text = await extractText(name, await readBody(req)); label = name }
      else { const b = await readJson(req); text = String(b.text || '').trim(); label = String(b.name || '粘贴的文字').trim() || '粘贴的文字' }
      if (!text) return fail(res, 400, '资料里没有文字')
      const mid = await svc.addMaterial(l, label, text)
      return ok(res, { id: mid, chars: text.length })
    }
    if ((m = sub.match(/^\/material\/(m[a-z0-9]{4,24})(\/delete)?$/))) {
      if (m[2] && POST) { await store.removeMaterial(l, m[1]); return ok(res) }
      if (POST) { await store.updateMaterial(l, m[1], await readJson(req, 8 * 1024 * 1024)); return ok(res) }
      if (!l.materials.some(x => x.id === m[1])) return fail(res, 404, '没有这份资料')
      const text = await readFile(store.path(id, 'materials', `${m[1]}.txt`), 'utf8')
      return send(res, 200, { text })
    }
    if (POST && sub === '/image') {
      const i = Number(url.searchParams.get('index'))
      const buf = await readBody(req, 8 * 1024 * 1024)
      const info = imageInfo(buf)
      if (!info) return fail(res, 400, '只支持 JPG、PNG、WebP、GIF 图片')
      await svc.setImage(l, i, buf, info.ext, '教师上传')
      return ok(res)
    }
    if (POST && sub === '/image/url') { const b = await readJson(req); await svc.setImageFromUrl(l, b.index, b.url, b.credit); return ok(res) }
    if (POST && sub === '/image/ai') { const b = await readJson(req); await svc.aiImage(l, b.index, b.prompt); return ok(res) }
    if (POST && sub === '/image/remove') { await svc.removeImage(l, (await readJson(req)).index); return ok(res) }
    if (POST && sub === '/video') { const b = await readJson(req); return ok(res, await svc.startVideo(l, b)) }
    if (POST && sub === '/video/retry') { await svc.retryVideo(l, (await readJson(req)).index); return ok(res) }
    const fname = ext => `${l.course}-${l.title}`.replace(/[\\/:*?"<>|]/g, '_') + ext
    if (sub === '/pptx') {
      if (!l.slides.length) return fail(res, 400, '还没有课件')
      const buf = await svc.pptx(l)
      return send(res, 200, buf, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', { 'Content-Disposition': `attachment; filename="lesson.pptx"; filename*=UTF-8''${encodeURIComponent(fname('.pptx'))}` })
    }
    if (sub === '/docx') {
      const buf = await svc.docx(l)
      return send(res, 200, buf, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', { 'Content-Disposition': `attachment; filename="lesson-plan.docx"; filename*=UTF-8''${encodeURIComponent(fname('-教案.docx'))}` })
    }
    return fail(res, 404, 'not found')
  }
}

export const PLAN_KEYS = ['analysis', 'objectives', 'key', 'difficult', 'misconceptions', 'process', 'ideology', 'homework', 'board', 'reflection']
export const PLAN_NAMES = { analysis: '学情分析', objectives: '学习目标', key: '教学重点', difficult: '教学难点', misconceptions: '学生可能的误区及对策', process: '教学过程（BOPPPS）', ideology: '课程思政', homework: '作业与课后任务', board: '板书设计', reflection: '课后反思' }

/** 打印教案（浏览器里打印或另存为 PDF） */
async function printHtml(svc, l) {
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const br = s => e(s).replace(/\n/g, '<br>')
  const P = l.plan || {}
  const ms = await svc.profile.methodsFor(l.methods)
  const school = (await svc.profile.load()).brand.name
  const rows = [['课程', l.course], ['课题', l.title], ['课时', l.minutes + ' 分钟'], ['课型', TYPES[l.lessonType]?.[0] || '新授课']]
  if (l.audience) rows.push(['授课对象', l.audience])
  if (ms.length) rows.push(['教学方法', ms.map(m => m.name).join('、')])
  return `<!doctype html><meta charset="utf-8"><title>${e(l.title)} · 教案</title><style>
body{font:15px/1.75 "Microsoft YaHei","PingFang SC",sans-serif;color:#222;max-width:800px;margin:24px auto;padding:0 20px}
h1{text-align:center;font-size:24px;margin:0}.sub{text-align:center;color:#666;margin:4px 0 18px}
table{border-collapse:collapse;width:100%;margin-bottom:12px}td{border:1px solid #999;padding:6px 10px;vertical-align:top}td:first-child{width:110px;font-weight:600;background:#f5f5f5}
h2{font-size:17px;color:#1f4e79;border-bottom:1px solid #ddd;padding-bottom:3px;margin:20px 0 6px}.empty{color:#aaa}
.bar{position:sticky;top:0;background:#fff;padding:8px 0;text-align:right}button{font:inherit;padding:6px 16px;border-radius:8px;border:1px solid #1f4e79;background:#1f4e79;color:#fff;cursor:pointer}
@media print{.bar{display:none}body{margin:0;max-width:none}}</style>
<div class="bar"><button onclick="print()">打印 / 另存为 PDF</button></div>
<h1>《${e(l.title)}》教案</h1><p class="sub">${e(school ? school + ' · ' : '')}${e(l.course)}</p>
<table>${rows.map(r => `<tr><td>${e(r[0])}</td><td>${e(r[1])}</td></tr>`).join('')}</table>
${PLAN_KEYS.map(k => `<h2>${PLAN_NAMES[k]}</h2><div class="${P[k] ? '' : 'empty'}">${P[k] ? br(P[k]) : (k === 'reflection' ? '（课后填写）' : '（未填写）')}</div>`).join('')}`
}

export { themes }
