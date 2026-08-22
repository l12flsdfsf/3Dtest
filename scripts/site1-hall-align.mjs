// 六厅 AABB 对齐核对：合并产物(纯几何计算) vs 现模型运行时 worldLayout
// 用法: node scripts/site1-hall-align.mjs <合并.glb>
import { readFileSync } from 'node:fs'

const HALLS = {
  关怀厅: [-22.47, -12.19, 10.54, 22.92],
  广播厅: [-22.63, -11.65, -3.02, 10.28],
  电视厅: [-22.47, -10.52, -16.39, -3.58],
  电影厅: [12.65, 22.53, -14.44, -4.04],
  技术设备厅: [10.41, 22.41, -2.93, 10.17],
  展望厅: [11.23, 22.4, 10.49, 22.96],
}

const buf = readFileSync(process.argv[2])
const jsonLen = buf.readUInt32LE(12)
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
const binStart = 20 + jsonLen + 8
const { nodes, meshes, accessors } = json

function mat4(node, parent) {
  let local
  if (node.matrix) {
    local = node.matrix
  } else {
    const t = node.translation ?? [0, 0, 0]
    const q = node.rotation ?? [0, 0, 0, 1]
    const s = node.scale ?? [1, 1, 1]
    const [x, y, z, w] = q
    const x2 = x + x, y2 = y + y, z2 = z + z
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2
    const wx = w * x2, wy = w * y2, wz = w * z2
    local = [
      (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
      (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
      (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
      t[0], t[1], t[2], 1,
    ]
  }
  if (!parent) return local
  const out = new Array(16).fill(0)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++) out[c * 4 + r] += parent[k * 4 + r] * local[c * 4 + k]
  return out
}
const apply = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
]

for (const [hall, old] of Object.entries(HALLS)) {
  const starts = new Set()
  for (const n of nodes) if ((n.name ?? '').startsWith(hall)) starts.add(n)
  const idxs = []
  nodes.forEach((n, i) => {
    if ((n.name ?? '').startsWith(hall)) idxs.push(i)
  })
  if (!idxs.length) {
    console.log(`${hall.padEnd(6)}: 无节点`)
    continue
  }
  let box = null
  const visit = (i, parentM) => {
    const n = nodes[i]
    const m = mat4(n, parentM)
    if (n.mesh !== undefined) {
      for (const p of meshes[n.mesh].primitives ?? []) {
        const acc = accessors[p.attributes?.POSITION]
        if (!acc?.min) continue
        for (const x of [acc.min[0], acc.max[0]])
          for (const y of [acc.min[1], acc.max[1]])
            for (const z of [acc.min[2], acc.max[2]]) {
              const w = apply(m, [x, y, z])
              if (!box) box = { min: [...w], max: [...w] }
              else for (let k = 0; k < 3; k++) {
                box.min[k] = Math.min(box.min[k], w[k])
                box.max[k] = Math.max(box.max[k], w[k])
              }
            }
      }
    }
    for (const c of n.children ?? []) visit(c, m)
  }
  const roots = idxs.filter((i) => !nodes.some((p) => (p.children ?? []).includes(i)))
  roots.forEach((r) => visit(r, null))
  const f = (v) => v.map((n) => n.toFixed(1)).join(',')
  const newBox = [box.min[0], box.max[0], box.min[2], box.max[2]]
  const d = newBox.map((v, i) => v - old[i])
  console.log(
    `${hall.padEnd(6)}: 新 minX/maxX/minZ/maxZ [${f([box.min[0], box.max[0]])}, ${f([box.min[2], box.max[2]])}] 旧 [${old.map((v) => v.toFixed(1)).join(', ')}] 偏差 [${d.map((v) => v.toFixed(2)).join(', ')}]`,
  )
}
