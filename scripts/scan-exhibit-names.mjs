// 扫描 GLB：列出所有「中文名_basecolor」式的展品贴图名 + 对应材质名
import { readFileSync } from 'node:fs'

const buf = readFileSync('public/models/scene-0817.glb')
const jsonLen = buf.readUInt32LE(12)
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))

const names = new Map()
for (const m of gltf.materials ?? []) {
  const idx = m.pbrMetallicRoughness?.baseColorTexture?.index
  if (idx == null) continue
  const tex = gltf.textures[idx]
  const src = tex?.source ?? tex?.extensions?.KHR_texture_basisu?.source
  const img = gltf.images[src]
  if (!img?.name) continue
  const match = img.name.match(/^(.+)_basecolor$/i)
  if (match && /[一-鿿]/.test(match[1])) {
    names.set(match[1], (names.get(match[1]) ?? 0) + 1)
  }
}
for (const [name, count] of [...names.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${name} x${count}`)
}
console.log(`共 ${names.size} 个中文名展品贴图`)
