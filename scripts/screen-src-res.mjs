// 解析 models-src GLB:列出名字带 屏/内容 的贴图原始分辨率,确认压缩时是否被降采样
import { readFileSync } from 'node:fs'

function parseGlbImages(path) {
  const buf = readFileSync(path)
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
  const binStart = 20 + jsonLen + 8
  const views = json.bufferViews || []
  const out = []
  for (const img of json.images || []) {
    const view = views[img.bufferView]
    if (!view) continue
    const start = binStart + view.byteOffset
    const b = buf.subarray(start, start + view.byteLength)
    let dims = null
    if (b[0] === 0x89 && b[1] === 0x50) {
      dims = { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } // PNG IHDR
    } else if (b[0] === 0xff && b[1] === 0xd8) {
      // JPG: 扫 SOF0/1/2 段
      let k = 2
      while (k < b.length - 9) {
        if (b[k] !== 0xff) { k++; continue }
        const marker = b[k + 1]
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          dims = { h: b.readUInt16BE(k + 5), w: b.readUInt16BE(k + 7) }
          break
        }
        k += 2 + b.readUInt16BE(k + 2)
      }
    } else if (b[0] === 0xab && b[1] === 0x4b && b[2] === 0x54 && b[3] === 0x58) {
      dims = { ktx2: true } // KTX2 容器,像素尺寸在 DFD 段
      try {
        const w = b.readUInt32LE(36), h = b.readUInt32LE(40) // KTX2 读头 pixelWidth/Height
        dims = { ktx2: true, w, h }
      } catch {}
    }
    out.push({ name: img.name || `(view ${img.bufferView})`, mime: img.mimeType, ...dims, bytes: view.byteLength })
  }
  return out
}

for (const f of ['models-src/scene-0817.material-ext.glb', 'models-src/0817.meshopt.glb', 'models-src/0817.glb']) {
  try {
    const images = parseGlbImages(f)
    const hits = images.filter((i) => /屏|内容/.test(i.name))
    console.log(`\n=== ${f} (共 ${images.length} 图, 匹配 ${hits.length}) ===`)
    for (const i of hits) console.log(JSON.stringify(i))
  } catch (e) {
    console.log(`\n=== ${f} 解析失败: ${e.message}`)
  }
}
