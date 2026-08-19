// 玻璃材质的网格归属：M_JiangBei_5-1*（丢扩展的透射玻璃）、玻璃、电视厅玻璃
import fs from 'node:fs'

function readDoc(path) {
  if (path.endsWith('.gltf')) return JSON.parse(fs.readFileSync(path, 'utf8'))
  const buf = fs.readFileSync(path)
  const jsonLen = buf.readUInt32LE(12)
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
}

const doc = readDoc('D:/3Dtest/models-src/0817/展厅.gltf')
const targetNames = new Set(['M_JiangBei_5-1', 'M_JiangBei_5-1.001', 'M_JiangBei_5-1.002', 'M_JiangBei_5-1.003', '玻璃', '电视厅玻璃'])
const matIndex = new Map((doc.materials ?? []).map((m, i) => [i, m.name]))

const usage = new Map()
for (const node of doc.nodes ?? []) {
  if (node.mesh == null) continue
  const used = new Set()
  for (const prim of doc.meshes[node.mesh].primitives ?? []) {
    const name = matIndex.get(prim.material)
    if (targetNames.has(name)) used.add(name)
  }
  if (used.size) usage.set(node.name ?? `mesh#${node.mesh}`, [...used])
}
console.log('玻璃类材质 → 网格（0817 原件）:')
for (const [node, mats] of usage) console.log(`  ${node}: ${mats.join(', ')}`)
console.log(`共 ${usage.size} 个网格`)
