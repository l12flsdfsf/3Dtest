// 场地1 全套交付 vs 现用 scene-0817 的体积/显存分析
// GLB: 解析 images->bufferView,读 PNG/JPEG/KTX2 头取宽高
// JSON: 流式扫 dataURL,解 base64 前缀取宽高
// 用法: node scripts/site1-size-analysis.mjs
import { readFileSync, openSync, statSync, readSync, closeSync } from 'node:fs'

function imgDims(buf, offset) {
  // PNG: IHDR 宽高在 16..24
  if (buf.readUInt32BE(offset) === 0x89504e47) {
    return [buf.readUInt32BE(offset + 16), buf.readUInt32BE(offset + 20)]
  }
  // JPEG: 扫 SOF0-3/SOF-渐进
  if (buf.readUInt16BE(offset) === 0xffd8) {
    let i = offset + 2
    while (i < offset + 8192 && i < buf.length - 9) {
      if (buf[i] !== 0xff) { i += 1; continue }
      const marker = buf[i + 1]
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)] // 高在前
      }
      const len = buf.readUInt16BE(i + 2)
      i += 2 + len
    }
  }
  // KTX2: 12字节magic后 vkFormat u32, typeSize u32, pixelWidth u32, pixelHeight u32
  const ktx2 = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a])
  if (ktx2.equals(buf.subarray(offset, offset + 12))) {
    return [buf.readUInt32LE(offset + 20), buf.readUInt32LE(offset + 24)]
  }
  return null
}

function analyzeGlb(path) {
  const buf = readFileSync(path)
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
  // BIN chunk 头 8 字节在 JSON 数据之后，bufferView 偏移相对 BIN 数据起点
  const binStart = 20 + jsonLen + 8
  const bvs = json.bufferViews ?? []
  let verts = 0
  for (const acc of json.accessors ?? []) {
    if (acc.type === 'VEC3' && acc.count) verts = Math.max(verts, 0) // 占位
  }
  const posAccessor = (json.meshes ?? []).reduce((s, m) => {
    for (const p of m.primitives ?? []) {
      const a = json.accessors?.[p.attributes?.POSITION]
      if (a) s += a.count
    }
    return s
  }, 0)

  let files = 0
  let stored = 0
  let decoded = 0 // RGBA+mip
  let gpuFmt = 0 // KTX2(UASTC 8bit+mip)
  const buckets = {}
  for (const im of json.images ?? []) {
    const bv = bvs[im.bufferView]
    if (!bv) continue
    const dims = imgDims(buf, binStart + (bv.byteOffset ?? 0))
    files += 1
    stored += bv.byteLength
    if (dims) {
      const [w, h] = dims
      decoded += w * h * 4 * 1.333
      gpuFmt += w * h * 1.333 // 8bpp+mips
      const key = `${Math.max(w, h)}px`
      buckets[key] = (buckets[key] ?? 0) + 1
      buckets[`${key}B`] = Math.round((buckets[`${key}B`] ?? 0) + bv.byteLength / 1048576)
    }
  }
  const mb = (n) => (n / 1048576).toFixed(0)
  return { path, imgs: files, storedMB: +mb(stored), decodedMB: +mb(decoded), gpuMB: +mb(gpuFmt), verts: posAccessor, buckets }
}

// —— JSON 流式扫描 ——
async function analyzeJson(path) {
  const st = statSync(path)
  const fd = openSync(path, 'r')
  const CH = 4 * 1024 * 1024
  const buf = Buffer.alloc(CH)
  let carry = ''
  let pos = 0
  const dims = []
  let dataUrlBytes = 0
  while (true) {
    const n = readSync(fd, buf, 0, CH, null)
    if (n <= 0) break
    const s = carry + buf.subarray(0, n).toString('latin1')
    let idx = 0
    while (true) {
      const i = s.indexOf('data:image/', idx)
      if (i === -1) break
      const comma = s.indexOf(',', i)
      if (comma === -1) { idx = i; break }
      // 头部:逗号后 256 字符足够 PNG;JPEG 扫更长
      const headB64 = s.slice(comma + 1, comma + 1024)
      const head = Buffer.from(headB64, 'base64')
      const d = imgDims(head, 0)
      const endQ = s.indexOf('"', comma)
      const urlLen = endQ === -1 ? 0 : endQ - comma
      dims.push(d ? { w: d[0], h: d[1], len: urlLen } : { w: 0, h: 0, len: urlLen })
      dataUrlBytes += urlLen
      idx = (endQ === -1 ? comma : endQ) + 1
    }
    carry = s.slice(-2048)
    pos += n
  }
  closeSync(fd)
  let decoded = 0
  const buckets = {}
  let unknown = 0
  for (const d of dims) {
    if (!d.w) { unknown += 1; continue }
    decoded += d.w * d.h * 4 * 1.333
    const key = `${Math.max(d.w, d.h)}px`
    buckets[key] = (buckets[key] ?? 0) + 1
  }
  const mb = (n) => (n / 1048576).toFixed(0)
  return { path, imgs: dims.length, storedMB: +mb(dataUrlBytes), decodedMB: +mb(decoded), unknown, buckets }
}

const rows = []
for (const p of [
  'D:/场地1/大厅.glb',
  'D:/场地1/左侧.glb',
  'D:/场地1/右侧.glb',
  'public/models/scene-0817.glb',
]) rows.push(analyzeGlb(p))
for (const p of [
  'D:/场地1/大厅材质.json',
  'D:/场地1/左侧材质.json',
  'D:/场地1/右侧材质.json',
  'D:/场地1/设备0822/广播厅设备.json',
  'D:/场地1/设备0822/技术厅设备.json',
  'D:/场地1/设备0822/电视厅设备.json',
  'D:/场地1/设备0822/电影厅设备.json',
  'D:/场地1/奖杯.json',
]) rows.push(await analyzeJson(p))

const name = (p) => p.split('/').pop() + (p.includes('材质') || p.includes('设备') || p.includes('奖杯') ? '' : '')
console.log('文件 | 类型 | 贴图数 | 贴图存档MB | 解码RGBA显存MB | KTX2显存MB | 顶点')
for (const r of rows) {
  const isJson = r.verts === undefined
  console.log(
    `${name(r.path)} | ${isJson ? 'JSON' : 'GLB'} | ${r.imgs} | ${r.storedMB} | ${r.decodedMB}${r.unknown ? `(+${r.unknown}未识别)` : ''} | ${r.gpuMB ?? '-'} | ${r.verts ?? '-'}`,
  )
}
console.log('\n各文件分辨率分布:')
for (const r of rows) console.log(`  ${name(r.path)}: ${JSON.stringify(r.buckets)}`)
