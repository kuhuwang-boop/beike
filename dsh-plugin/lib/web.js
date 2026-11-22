/**
 * 备课工作台网页：在 DSH Web 界面里挂在 /beike，命令行模式下也可单独开一个本机端口。
 * 只提供本插件自己的数据；写操作都要求自定义请求头 X-Beike，防止其他网站伪造请求。
 */
import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalize, pace, health, grounding } from './core.js'
import { extractText } from './extract.js'
import { exportPptx } from './export.js'

const WEB = fileURLToPath(new URL('../web/', import.meta.url))
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }
const MAX_UPLOAD = 30 * 1024 * 1024

function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra })
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body))
}
const fail = (res, status, msg) => send(res, status, { error: msg })

function readBody(req, limit = MAX_UPLOAD) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let n = 0
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('文件太大（最大 30MB）')); req.destroy() } else chunks.push(c) })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}
async function readJson(req) {
  const b = await readBody(req, 4 * 1024 * 1024)
  try { return b.length ? JSON.parse(b.toString('utf8')) : {} } catch { throw new Error('请求格式错误') }
}

/** 给浏览器的课次数据：图片换成可访问的地址，并附上体检、课时估算和出处核对 */
export async function lessonView(store, l, base) {
  const src = await store.materialsText(l)
  const slides = l.slides.map(s => (s.image ? { ...s, image: { ...s.image, src: `${base}/files/${l.id}/${s.image.file}` } } : s))
  return {
    id: l.id, title: l.title, course: l.course, minutes: l.minutes, lessonType: l.lessonType, theme: l.theme || 'blue',
    plan: l.plan || {}, materials: l.materials, updatedAt: l.updatedAt, versions: (l.history || []).length,
    slides, pace: pace(l.slides), health: health(l.slides, l.minutes), ground: grounding(l.slides, src),
  }
}

/**
 * @param {object} o
 * @param {import('./store.js').Store} o.store
 * @param {string} o.base 路径前缀，例如 /beike
 * @param {(req)=>number|undefined} [o.reject] 宿主的访问控制（返回 401/403 表示拒绝）
 * @param {string} [o.token] 独立端口模式的访问口令
 */
export function createHandler({ store, base, reject, token, logger }) {
  const cookieName = 'beike_t'
  const hasToken = req => !token || (req.headers.cookie || '').split(/;\s*/).includes(`${cookieName}=${token}`)

  return async function handle(req, res) {
    try {
      const url = new URL(req.url || '/', 'http://x')
      let p = url.pathname
      if (p !== base && !p.startsWith(base + '/')) return fail(res, 404, 'not found')
      p = p.slice(base.length) || '/'

      const rj = reject?.(req)
      if (rj) return fail(res, rj, '没有访问权限')

      // 独立端口模式：首次通过带口令的链接进入，换成 Cookie
      if (token && url.searchParams.get('t') === token) {
        return send(res, 302, '', 'text/plain', { Location: base + (p === '/' ? '/' : p), 'Set-Cookie': `${cookieName}=${token}; Path=${base}; HttpOnly; SameSite=Strict` })
      }
      if (!hasToken(req)) return send(res, 401, '<meta charset="utf-8"><p style="font:16px sans-serif;padding:40px">请在 DeepSeek Harness 里让 AI 调用 <b>beike_open</b>，用它给出的链接打开备课工作台。</p>', 'text/html; charset=utf-8')

      // 写操作必须带自定义请求头（浏览器跨站请求无法添加，起到防伪造作用）
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers['x-beike'] !== '1') return fail(res, 403, '请求来源无效')

      if (p === '/' || p === '/index.html') {
        const html = (await readFile(join(WEB, 'index.html'), 'utf8')).replaceAll('__BASE__', base)
        return send(res, 200, html, TYPES['.html'])
      }
      let m
      if ((m = p.match(/^\/present\/([a-z0-9]{6,24})$/))) {
        const l = await store.get(m[1])
        const v = await lessonView(store, l, base)
        const data = JSON.stringify({ id: l.id, title: l.title, course: l.course, minutes: l.minutes, slides: v.slides, theme: v.theme, pace: v.pace, templates: [], brand: null })
          .replace(/</g, '\\u003c')
        const html = (await readFile(join(WEB, 'present.html'), 'utf8')).replaceAll('__BASE__', base).replace('__DATA__', data).replaceAll('__TITLE__', l.title.replace(/[<&"]/g, ''))
        return send(res, 200, html, TYPES['.html'])
      }
      if ((m = p.match(/^\/assets\/((?:vendor\/)?[\w.-]+\.(?:js|css|svg))$/))) {
        const body = await readFile(join(WEB, m[1]))
        return send(res, 200, body, TYPES[extname(m[1])], { 'Cache-Control': 'max-age=300' })
      }
      if ((m = p.match(/^\/files\/([a-z0-9]{6,24})\/([\w.-]{1,80}\.(?:jpg|jpeg|png|webp|gif))$/i))) {
        const body = await readFile(store.path(m[1], 'images', m[2]))
        return send(res, 200, body, TYPES[extname(m[2]).toLowerCase()], { 'Cache-Control': 'max-age=86400' })
      }
      if (p.startsWith('/api/')) return await apiRoute(req, res, p.slice(4), url)
      return fail(res, 404, 'not found')
    } catch (e) {
      logger?.warn?.(`beike web: ${e?.message || e}`)
      if (!res.headersSent) fail(res, /没有找到/.test(String(e?.message)) ? 404 : 400, String(e?.message || e))
    }
  }

  async function apiRoute(req, res, p, url) {
    let m
    if (p === '/state') return send(res, 200, { version: store.version, lessons: await store.list() })
    if (p === '/lesson' && req.method === 'POST') {
      const b = await readJson(req)
      const l = await store.create({ title: b.title, course: b.course, minutes: b.minutes })
      return send(res, 200, { ok: true, id: l.id })
    }
    if (!(m = p.match(/^\/lesson\/([a-z0-9]{6,24})(\/.*)?$/))) return fail(res, 404, 'not found')
    const id = m[1], sub = m[2] || ''
    const l = await store.get(id)
    if (!sub && req.method === 'GET') return send(res, 200, await lessonView(store, l, base))
    if (!sub && req.method === 'POST') {
      const b = await readJson(req)
      if (b.title !== undefined) l.title = String(b.title).trim().slice(0, 80) || l.title
      if (b.course !== undefined) l.course = String(b.course).trim().slice(0, 60) || l.course
      if (b.minutes !== undefined) l.minutes = Math.max(10, Math.min(300, Number(b.minutes) || l.minutes))
      if (b.theme !== undefined && /^[a-z0-9]{2,20}$/.test(b.theme)) l.theme = b.theme
      if (b.plan && typeof b.plan === 'object') {
        l.plan = {}
        for (const k of ['objectives', 'key', 'difficult', 'misconceptions', 'process', 'homework', 'board', 'reflection']) l.plan[k] = String(b.plan[k] ?? '').slice(0, 6000)
      }
      await store.save(l)
      return send(res, 200, { ok: true })
    }
    if (sub === '/delete' && req.method === 'POST') { await store.remove(id); return send(res, 200, { ok: true }) }
    if (sub === '/slides' && req.method === 'POST') {
      const b = await readJson(req)
      // 浏览器回传的图片带 src，这里换回文件名
      const slides = normalize((b.slides || []).map(s => (s && s.image ? { ...s, image: { file: s.image.file, credit: s.image.credit } } : s)))
      await store.saveSlides(l, slides, b.note || '在工作台手动修改')
      return send(res, 200, { ok: true })
    }
    if (sub === '/undo' && req.method === 'POST') { const note = await store.undo(l); return send(res, 200, { ok: true, note }) }
    if (sub === '/material' && req.method === 'POST') {
      const name = decodeURIComponent(String(req.headers['x-file-name'] || ''))
      let text, label
      if (name) { text = await extractText(name, await readBody(req)); label = name }
      else { const b = await readJson(req); text = String(b.text || '').trim(); label = String(b.name || '粘贴的文字').trim() || '粘贴的文字' }
      if (!text) return fail(res, 400, '资料里没有文字')
      const mid = await store.addMaterial(l, label, text)
      return send(res, 200, { ok: true, id: mid, chars: text.length })
    }
    if ((m = sub.match(/^\/material\/(m[a-z0-9]{4,24})(\/delete)?$/))) {
      if (m[2] && req.method === 'POST') { await store.removeMaterial(l, m[1]); return send(res, 200, { ok: true }) }
      if (!l.materials.some(x => x.id === m[1])) return fail(res, 404, '没有这份资料')
      const text = await readFile(store.path(id, 'materials', `${m[1]}.txt`), 'utf8')
      return send(res, 200, { text })
    }
    if (sub === '/image' && req.method === 'POST') {
      const i = Number(url.searchParams.get('index'))
      if (!(i >= 1 && i <= l.slides.length)) return fail(res, 400, '页码无效')
      const buf = await readBody(req, 8 * 1024 * 1024)
      const ext = buf[0] === 0x89 && buf[1] === 0x50 ? 'png' : buf[0] === 0xff && buf[1] === 0xd8 ? 'jpg' : buf.slice(8, 12).toString() === 'WEBP' ? 'webp' : buf.slice(0, 3).toString() === 'GIF' ? 'gif' : ''
      if (!ext) return fail(res, 400, '只支持 JPG、PNG、WebP、GIF 图片')
      const file = await store.saveImage(l, buf, ext)
      const slides = l.slides.map((s, k) => (k === i - 1 ? { ...s, image: { file, credit: '教师上传' } } : s))
      await store.saveSlides(l, slides, `第${i}页上传图片`)
      return send(res, 200, { ok: true })
    }
    if (sub === '/pptx' && req.method === 'GET') {
      if (!l.slides.length) return fail(res, 400, '还没有课件')
      const buf = await exportPptx(l, f => store.path(id, 'images', f))
      const name = `${l.course}-${l.title}`.replace(/[\\/:*?"<>|]/g, '_') + '.pptx'
      return send(res, 200, buf, 'application/vnd.openxmlformats-officedocument.presentationml.presentation', { 'Content-Disposition': `attachment; filename="lesson.pptx"; filename*=UTF-8''${encodeURIComponent(name)}` })
    }
    return fail(res, 404, 'not found')
  }
}
