/**
 * 配图与教学视频：
 *  - 搜索免费图库：Openverse（不用 Key）、Pexels / Pixabay（填了 Key 才用）
 *  - AI 生成图片：MiniMax H3-Image
 *  - AI 教学短视频：MiniMax 海螺 H3（异步任务，完成后下载到本机）
 * API Key 只保存在本机的 secrets.json，由插件在本机直接调用对应服务。
 */
import { imageInfo } from './profile.js'

const UA = 'BeikeWorkbench-DSH/1.3'

async function http(url, opt = {}, timeout = 15000) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeout)
  try {
    return await fetch(url, { ...opt, headers: { 'User-Agent': UA, ...(opt.headers || {}) }, signal: ac.signal })
  } finally { clearTimeout(t) }
}

/* ---------------- 图片搜索 ---------------- */
export function imageSources(sec) {
  const s = []
  if (sec.pexels_key) s.push('pexels')
  if (sec.pixabay_key) s.push('pixabay')
  s.push('openverse')
  return s
}

export async function searchImages(sec, q, page = 1, per = 8) {
  q = String(q || '').trim().slice(0, 100)
  if (!q) throw new Error('请输入要搜索的画面关键词')
  const out = []
  const errs = []
  for (const src of imageSources(sec)) {
    try {
      if (src === 'pexels') {
        const r = await http(`https://api.pexels.com/v1/search?per_page=${per}&orientation=landscape&page=${page}${/\p{Script=Han}/u.test(q) ? '&locale=zh-CN' : ''}&query=${encodeURIComponent(q)}`, { headers: { Authorization: sec.pexels_key } })
        const j = await r.json()
        for (const p of j.photos || []) out.push({ url: p.src?.large || p.src?.landscape, thumb: p.src?.medium || p.src?.small, credit: `摄影：${p.photographer || ''} / Pexels`, link: p.url, source: 'Pexels' })
      } else if (src === 'pixabay') {
        const r = await http(`https://pixabay.com/api/?image_type=photo&orientation=horizontal&safesearch=true&lang=zh&per_page=${Math.max(3, per)}&page=${page}&key=${encodeURIComponent(sec.pixabay_key)}&q=${encodeURIComponent(q)}`)
        const j = await r.json()
        for (const p of j.hits || []) out.push({ url: p.largeImageURL || p.webformatURL, thumb: p.webformatURL || p.previewURL, credit: `作者：${p.user || ''} / Pixabay`, link: p.pageURL, source: 'Pixabay' })
      } else {
        const r = await http(`https://api.openverse.org/v1/images/?page_size=${per}&mature=false&aspect_ratio=wide&page=${page}&q=${encodeURIComponent(q)}`)
        const j = await r.json()
        for (const p of j.results || []) {
          const lic = String(p.license || '').toUpperCase()
          out.push({ url: p.url, thumb: p.thumbnail || p.url, credit: `作者：${p.creator || '未知'} / ${p.source || 'Openverse'}${lic ? `（CC ${lic}）` : ''}`, link: p.foreign_landing_url, source: 'Openverse' })
        }
      }
    } catch (e) { errs.push(`${src}：${e?.name === 'AbortError' ? '连接超时' : e?.message || e}`) }
    if (out.length >= per) break
  }
  const list = out.filter(x => /^https?:\/\//.test(x.url || ''))
  if (!list.length && errs.length) throw new Error('图库暂时连不上（' + errs.join('；') + '）。可以换个关键词、稍后再试，或上传本地图片')
  return list
}

/** 下载一张图片（只接受 http/https，最大 12MB），返回 { buf, ext } */
export async function downloadImage(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error('图片地址无效')
  const r = await http(url, {}, 30000)
  if (!r.ok) throw new Error(`图片下载失败（${r.status}）`)
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length > 12 * 1024 * 1024) throw new Error('图片太大')
  const info = imageInfo(buf)
  if (!info) throw new Error('下载到的不是图片')
  return { buf, ext: info.ext }
}

/* ---------------- MiniMax ---------------- */
// BEIKE_MINIMAX_BASE 只用于本地测试或自建代理
const host = sec => process.env.BEIKE_MINIMAX_BASE || sec.minimax_host || 'https://api.minimax.cn'

function mmErr(code, d) {
  const m = d?.error?.message || d?.base_resp?.status_msg || d?.message || ''
  let hint = { 401: 'API Key 无效', 402: '账户余额不足，请到 MiniMax 开放平台充值', 403: '没有开通该模型的权限', 422: '请求内容不符合要求', 429: '请求太频繁或并发已满，请稍后再试' }[code] || ''
  if (/sensitive/i.test(m)) hint = '描述里有平台不允许的内容，请换个说法'
  return `MiniMax 返回错误 ${code}${hint ? `（${hint}）` : ''}${m ? '：' + String(m).slice(0, 160) : ''}`
}

async function mm(sec, method, path, body, timeout = 60000) {
  if (!sec.minimax_key) throw new Error('还没有填写 MiniMax 的 API Key：在备课工作台左下角「设置」里填写')
  let r
  try {
    r = await http(host(sec) + path, { method, headers: { Authorization: 'Bearer ' + sec.minimax_key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }, timeout)
  } catch (e) { throw new Error('无法连接 MiniMax：' + (e?.name === 'AbortError' ? '超时' : e?.message || e)) }
  let d = {}
  try { d = await r.json() } catch { /* 非 JSON */ }
  const sc = d?.base_resp?.status_code
  if (!r.ok || (sc && sc !== 0)) throw new Error(mmErr(r.ok ? sc : r.status, d))
  return d
}

export async function pingMiniMax(sec) {
  const t0 = Date.now()
  try { await mm(sec, 'GET', '/v2/query/video_generation/1', null, 15000) } catch (e) {
    if (/无法连接|API Key 无效|没有开通|还没有填写/.test(e.message)) throw e
  }
  return `连接正常（${Date.now() - t0} ms）`
}

/** H3-Image 生成一张 16:9 图片，返回下载好的 { buf, ext } */
export async function aiImage(sec, prompt) {
  const d = await mm(sec, 'POST', '/v1/images/generations', {
    model: 'MiniMax-H3-Image', prompt: String(prompt).slice(0, 2000) + '。画面中不要出现任何文字、字母、水印或标志。',
    size: '1600x900', n: 1, output_format: 'jpeg', output_compression: 88, response_format: 'url',
  }, 150000)
  const u = d?.data?.[0]?.url || d?.data?.image_urls?.[0]
  if (!u) throw new Error('MiniMax 没有返回图片')
  return downloadImage(u)
}

/** 提交视频任务，返回 task_id */
export async function createVideo(sec, { prompt, duration = 6, ratio = '16:9', firstFrame = null }) {
  const model = sec.video_model || 'MiniMax-H3'
  const content = [{ type: 'text', text: String(prompt).slice(0, 6000) }]
  if (firstFrame) content.push({ type: 'image_url', image_url: { url: firstFrame }, role: 'first_frame' })
  const d = await mm(sec, 'POST', '/v2/video_generation', {
    model, content, resolution: '768P', duration: Math.max(model === 'MiniMax-H3-Max' ? 5 : 4, Math.min(15, Number(duration) || 6)),
    ratio: firstFrame ? 'adaptive' : (['16:9', '4:3', '1:1', '9:16'].includes(ratio) ? ratio : '16:9'),
  })
  if (!d.task_id) throw new Error('MiniMax 没有返回任务编号')
  return String(d.task_id)
}

export async function queryVideo(sec, taskId) {
  let d
  try { d = await mm(sec, 'GET', '/v2/query/video_generation/' + encodeURIComponent(taskId), null, 20000) } catch (e) { return { status: 'unknown', error: e.message } }
  const t = d.task || {}
  let error = ''
  if (t.error) error = /sensitive/i.test(t.error.message || '') ? '视频描述里有平台不允许的内容，请换个说法再试' : mmErr(t.error.code || 0, { message: t.error.message })
  return { status: String(t.status || 'unknown'), url: t.content?.url || '', error, progress: t.progress ?? null }
}

export async function downloadVideo(url) {
  if (!/^https:\/\//i.test(url) && !(process.env.BEIKE_MINIMAX_BASE && /^http:\/\//i.test(url))) throw new Error('视频地址无效')
  const r = await http(url, {}, 240000)
  if (!r.ok) throw new Error(`视频下载失败（${r.status}）`)
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length < 1000 || buf.length > 150 * 1024 * 1024) throw new Error('视频文件异常')
  if (!['ftyp', 'moov', 'mdat', 'free', 'wide'].includes(buf.slice(4, 8).toString('latin1'))) throw new Error('下载到的不是 MP4 视频')
  return buf
}
