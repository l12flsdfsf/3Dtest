// 指定设备的位置核对：中间件世界盒 vs 旧模型 placements 盒
// 用法: node scripts/site1-check-devices.mjs <中间件.glb> <中文名1> [中文名2 ...]
import { readFileSync } from 'node:fs'

const FILE = process.argv[2]
const TARGETS = process.argv.slice(3)
const names = JSON.parse(readFileSync('models-src/site1-migration/old-texture-names.json', 'utf8'))
const placements = JSON.parse(readFileSync('models-src/site1-migration/placements.json', 'utf8'))

const nodeOf = {}
for (const [k, v] of Object.entries(names)) {
  const bare = v.replace(/_basecolor$/i, '')
  if (TARGETS.includes(bare)) nodeOf[k] = bare
}

const buf = readFileSync(FILE)
const l = buf.readUInt32LE(12)
const j = JSON.parse(buf.slice(20, 20 + l).toString('utf8'))

function boxOf(nodeName) {
  const idx = (j.nodes || []).findIndex((n) => n.name === nodeName)
  if (idx < 0) return null
  const t = j.nodes[idx].translation || [0, 0, 0]
  const s = j.nodes[idx].scale || [1, 1, 1]
  const q = j.nodes[idx].rotation || [0, 0, 0, 1]
  const [qx, qy, qz, qw] = q
  const rot = (v) => [
    v[0] * (1 - 2 * (qy * qy + qz * qz)) + v[1] * 2 * (qx * qy - qz * qw) + v[2] * 2 * (qx * qz + qy * qw),
    v[0] * 2 * (qx * qy + qz * qw) + v[1] * (1 - 2 * (qx * qx + qz * qz)) + v[2] * 2 * (qy * qz - qx * qw),
    v[0] * 2 * (qx * qz - qy * qw) + v[1] * 2 * (qy * qz + qx * qw) + v[2] * (1 - 2 * (qx * qx + qy * qy)),
  ]
  let mn = [1e9, 1e9, 1e9]
  let mx = [-1e9, -1e9, -1e9]
  const collect = (i) => {
    const n = j.nodes[i]
    if (n.mesh !== undefined)
      for (const p of j.meshes[n.mesh].primitives || []) {
        const acc = j.accessors[p.attributes.POSITION]
        if (!acc.min) continue
        for (const x of [acc.min[0], acc.max[0]])
          for (const y of [acc.min[1], acc.max[1]])
            for (const z of [acc.min[2], acc.max[2]]) {
              const w = rot([x * s[0], y * s[1], z * s[2]]).map((c, k) => c + t[k])
              for (let k = 0; k < 3; k++) {
                mn[k] = Math.min(mn[k], w[k])
                mx[k] = Math.max(mx[k], w[k])
              }
            }
      }
    for (const c of n.children || []) collect(c)
  }
  collect(idx)
  return { mn, mx, t, s }
}

for (const [nodeName, cn] of Object.entries(nodeOf)) {
  const nb = boxOf(nodeName)
  const p = placements.find((x) => x.name === nodeName)
  if (!nb || !p) {
    console.log(`${cn}: 数据缺失 new=${!!nb} old=${!!p}`)
    continue
  }
  const nC = [0, 1, 2].map((i) => (nb.mn[i] + nb.mx[i]) / 2)
  const oC = [0, 1, 2].map((i) => (p.boxMin[i] + p.boxMax[i]) / 2)
  const nS = [0, 1, 2].map((i) => nb.mx[i] - nb.mn[i])
  const oS = [0, 1, 2].map((i) => p.boxMax[i] - p.boxMin[i])
  console.log(
    `${cn.padEnd(12)} 中心差: ${nC.map((v, i) => (v - oC[i]).toFixed(2)).join(',')} | 新尺寸 ${nS.map((v) => v.toFixed(2)).join('×')} 旧 ${oS.map((v) => v.toFixed(2)).join('×')} | 底差 ${(nb.mn[1] - p.boxMin[1]).toFixed(2)} | 新pos ${nb.t.map((v) => v.toFixed(2)).join(',')} 旧pos ${p.position.map((v) => v.toFixed(2)).join(',')} | 新scale ${nb.s.map((v) => v.toFixed(3)).join(',')}`,
  )
}
