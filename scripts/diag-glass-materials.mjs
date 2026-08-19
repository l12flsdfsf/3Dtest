// 对比原版 0817 与压缩后 GLB 的玻璃材质：透射/体积/alpha/贴图通道
import fs from 'node:fs'

function readDoc(path) {
  if (path.endsWith('.gltf')) return JSON.parse(fs.readFileSync(path, 'utf8'))
  const buf = fs.readFileSync(path)
  const jsonLen = buf.readUInt32LE(12)
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
}

const A = readDoc('D:/3Dtest/public/models/0817/展厅.gltf') // 原版
const B = readDoc('D:/3Dtest/public/models/scene-0817.glb') // 压缩后

const sum = (doc) => {
  const glass = []
  for (const m of doc.materials ?? []) {
    const ext = m.extensions ?? {}
    const hasGlassExt = !!(ext.KHR_materials_transmission || ext.KHR_materials_volume)
    const nameGlass = /玻璃|glass|JiangBei/i.test(m.name ?? '')
    const alpha = (m.alphaMode ?? 'OPAQUE') !== 'OPAQUE'
    if (!hasGlassExt && !nameGlass && !alpha) continue
    glass.push(m)
  }
  return glass
}

const describeTexture = (doc, texIndex) => {
  if (texIndex == null) return null
  const tex = doc.textures?.[texIndex]
  if (!tex) return null
  const img = doc.images?.[tex.source] ?? {}
  return { mime: img.mimeType, ext: (img.uri ?? '').split('.').pop(), ktx2: tex.extensions?.KHR_texture_basisu != null }
}

const describeMaterial = (m, doc) => {
  const ext = m.extensions ?? {}
  const parts = [m.name]
  parts.push(`alphaMode=${m.alphaMode ?? 'OPAQUE'}`)
  if (m.alphaCutoff != null) parts.push(`cutoff=${m.alphaCutoff}`)
  parts.push(`baseColor=${JSON.stringify(m.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1])}`)
  parts.push(`metallicRough=${m.pbrMetallicRoughness?.metallicFactor ?? 1}/${m.pbrMetallicRoughness?.roughnessFactor ?? 1}`)
  const bt = describeTexture(doc, m.pbrMetallicRoughness?.baseColorTexture?.index)
  if (bt) parts.push(`baseTex=${bt.mime}:${bt.ext}${bt.ktx2 ? '+ktx2' : ''}`)
  for (const key of ['KHR_materials_transmission', 'KHR_materials_volume', 'KHR_materials_ior', 'KHR_materials_specular']) {
    if (ext[key]) parts.push(`${key}=${JSON.stringify(ext[key])}`)
  }
  if (m.doubleSided) parts.push('doubleSided')
  return parts.join(' | ')
}

const listA = sum(A)
const listB = sum(B)
console.log(`原版材质总数=${A.materials?.length ?? 0} 玻璃/透明类=${listA.length}`)
console.log(`压缩材质总数=${B.materials?.length ?? 0} 玻璃/透明类=${listB.length}`)
console.log('\n=== 原版（展厅.gltf）玻璃/透明材质 ===')
for (const m of listA) console.log('  ' + describeMaterial(m, A))
console.log('\n=== 压缩后（scene-0817.glb 107MB）玻璃/透明材质 ===')
for (const m of listB) console.log('  ' + describeMaterial(m, B))

console.log('\n=== extensionsUsed 对比 ===')
console.log('原版 :', (A.extensionsUsed ?? []).join(', '))
console.log('压缩:', (B.extensionsUsed ?? []).join(', '))
