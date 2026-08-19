// 从 scene-0817.glb 抽出「展示柜白/关怀厅」相关的烘焙贴图，验证黑块是否原生在贴图里
import { readFileSync, writeFileSync } from 'node:fs'

const buf = readFileSync('public/models/scene-0817.glb')
const jsonLen = buf.readUInt32LE(12)
const jsonType = buf.readUInt32LE(16)
if (jsonType !== 0x4e4f534a) {
  console.log('unexpected chunk type', jsonType.toString(16))
  process.exit(1)
}
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
console.log(`images: ${gltf.images?.length ?? 0}`)

// 材质名 -> 贴图索引
const matToImage = []
for (const m of gltf.materials ?? []) {
  const idx = m.pbrMetallicRoughness?.baseColorTexture?.index
  if (idx == null) continue
  const tex = gltf.textures[idx]
  const src = tex?.source ?? tex?.extensions?.KHR_texture_basisu?.source
  const img = gltf.images[src]
  if (!img) continue
  matToImage.push({ mat: m.name || '', img: img.name || '', mime: img.mimeType ?? tex.extensions?.KHR_texture_basisu ? 'image/ktx2' : '', view: img.bufferView })
}
const hits = matToImage.filter((x) => /展示柜|关怀|桌面|桌/.test(x.mat))
for (const h of hits) console.log(JSON.stringify(h))

// 抽前 3 张命中的
for (const [i, h] of hits.slice(0, 3).entries()) {
  const view = gltf.bufferViews[h.view]
  const start = 8 + jsonLen + view.byteOffset
  const data = buf.subarray(start, start + view.byteLength)
  const ext = h.mime?.includes('jpeg') ? 'jpg' : h.mime?.includes('ktx') ? 'ktx2' : 'png'
  writeFileSync(`.tmp-ktx/desk-tex-${i}-${h.mat}.${ext}`, data)
  const magic = data.subarray(0, 4).toString('hex')
  console.log(`desk-tex-${i}: ${h.mat} magic=${magic} bytes=${view.byteLength}`)
}
