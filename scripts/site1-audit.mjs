// 设备/奖杯摆位体检：最终合并件 vs 旧模型 placements.json 逐节点对比
// 标记：MISSING(交付缺) EMPTY(空几何=隐形) SIZE(尺寸差>40%) FLOAT(底面悬浮>0.15m) POS(中心偏>0.5m)
// 用法: node scripts/site1-audit.mjs [最终.glb]
import { readFileSync } from 'node:fs'

// 注意：最终件是量化压缩的（accessor min/max 为量化值），体检跑未压缩中间件
const FILES = [
  'models-src/site1-migration/电影厅设备.glb',
  'models-src/site1-migration/广播厅设备.glb',
  'models-src/site1-migration/技术厅设备.glb',
  'models-src/site1-migration/电视厅设备.glb',
  'models-src/site1-migration/奖杯.glb',
]
const placements = JSON.parse(readFileSync('models-src/site1-migration/placements.json', 'utf8'))

// 汇集所有文件的节点/网格数据（名字全局唯一，索引各自独立）
const docs = FILES.map((f) => {
  const buf = readFileSync(f)
  const jsonLen = buf.readUInt32LE(12)
  return JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
})
const j = { nodes: [], meshes: [], accessors: [] }
for (const d of docs) {
  const nodeOff = j.nodes.length
  const meshOff = j.meshes.length
  const accOff = j.accessors.length
  j.nodes.push(
    ...(d.nodes ?? []).map((n) => ({
      ...n,
      mesh: n.mesh === undefined ? undefined : n.mesh + meshOff,
      children: (n.children ?? []).map((c) => c + nodeOff),
    })),
  )
  j.meshes.push(...(d.meshes ?? []).map((m) => ({ ...m, primitives: (m.primitives ?? []).map((p) => ({ ...p, attributes: Object.fromEntries(Object.entries(p.attributes ?? {}).map(([k, v]) => [k, v + accOff])), indices: p.indices === undefined ? undefined : p.indices + accOff })) })))
  j.accessors.push(...(d.accessors ?? []))
}
const { nodes, meshes, accessors } = j

const normKey = (s) => String(s ?? '').replace(/[.\s]/g, '')

// 节点世界矩阵（含父链）
const nodeIndex = new Map(nodes.map((n, i) => [n, i]))
const parentOf = new Map()
nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parentOf.set(c, i)))

function mat4(node, parent) {
  let local
  if (node.matrix) local = node.matrix
  else {
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
function worldMatrix(i) {
  const chain = []
  let cur = i
  while (cur !== undefined) {
    chain.unshift(cur)
    cur = parentOf.get(cur)
  }
  let m = null
  for (const idx of chain) m = mat4(nodes[idx], m)
  return m
}
// 子树世界包围盒（8角全变换）
function subtreeWorldBox(i) {
  const n = nodes[i]
  let box = null
  if (n.mesh !== undefined) {
    const m = worldMatrix(i)
    for (const p of meshes[n.mesh].primitives ?? []) {
      const acc = accessors[p.attributes?.POSITION]
      if (!acc?.min) continue
      for (const x of [acc.min[0], acc.max[0]])
        for (const y of [acc.min[1], acc.max[1]])
          for (const z of [acc.min[2], acc.max[2]]) {
            const w = apply(m, [x, y, z])
            if (!box) box = { min: [...w], max: [...w] }
            else
              for (let k = 0; k < 3; k++) {
                box.min[k] = Math.min(box.min[k], w[k])
                box.max[k] = Math.max(box.max[k], w[k])
              }
          }
    }
  }
  for (const c of n.children ?? []) {
    const sub = subtreeWorldBox(c)
    if (!sub) continue
    if (!box) box = sub
    else
      for (let k = 0; k < 3; k++) {
        box.min[k] = Math.min(box.min[k], sub.min[k])
        box.max[k] = Math.max(box.max[k], sub.max[k])
      }
  }
  return box
}

const boxes = new Map()
nodes.forEach((n, i) => {
  // 只审计顶层节点（子件随父节点子树盒一并覆盖；单独比对子件会因父级缩放产生误报）
  if (parentOf.has(i)) return
  if (/^tripo_node_|^JiangBei|^CD$|^cidai|^Box00|^Cylinder00|^对象|^node_0|^pCube230|^polySurface46|^mesh_rep_0/.test(n.name ?? '')) {
    boxes.set(n.name, subtreeWorldBox(i))
  }
})

const rows = []
for (const p of placements) {
  const key = [...boxes.keys()].find((n) => normKey(n) === normKey(p.name)) ?? null
  const nb = key ? boxes.get(key) : null
  if (!key) {
    rows.push({ name: p.name, flag: 'MISSING', note: '交付中无此节点' })
    continue
  }
  if (!nb) {
    rows.push({ name: p.name, flag: 'EMPTY', note: '几何为空/不可见' })
    continue
  }
  const nSize = [0, 1, 2].map((i) => nb.max[i] - nb.min[i])
  const oSize = [0, 1, 2].map((i) => p.boxMax[i] - p.boxMin[i])
  const nC = [0, 1, 2].map((i) => (nb.min[i] + nb.max[i]) / 2)
  const oC = [0, 1, 2].map((i) => (p.boxMin[i] + p.boxMax[i]) / 2)
  const sizeRatio = Math.max(...nSize) / Math.max(0.01, Math.max(...oSize))
  const posDelta = Math.max(...[0, 1, 2].map((i) => Math.abs(nC[i] - oC[i])))
  const floatGap = nb.min[1] - p.boxMin[1]
  const flags = []
  if (sizeRatio > 1.4 || sizeRatio < 0.7) flags.push(`SIZE×${sizeRatio.toFixed(2)}`)
  if (posDelta > 0.5) flags.push(`POS${posDelta.toFixed(2)}m`)
  if (floatGap > 0.15) flags.push(`FLOAT+${floatGap.toFixed(2)}m`)
  if (floatGap < -0.15) flags.push(`SINK${floatGap.toFixed(2)}m`)
  rows.push({
    name: p.name,
    flag: flags.join(' ') || 'OK',
    note: `${nSize.map((v) => v.toFixed(2)).join('×')} 旧${oSize.map((v) => v.toFixed(2)).join('×')} 底差${floatGap.toFixed(2)}`,
  })
}
// 交付里有但 placements 没有的（新增）
const extra = [...boxes.keys()].filter((n) => !placements.some((p) => normKey(p.name) === normKey(n)))

const bad = rows.filter((r) => r.flag !== 'OK')
console.log(`共 ${rows.length} 个摆位节点，异常 ${bad.length} 个：`)
for (const r of bad) console.log(`  [${r.flag}] ${r.name} — ${r.note}`)
console.log(`\n placements 之外的新增节点 ${extra.length} 个: ${extra.join(' | ') || '无'}`)
