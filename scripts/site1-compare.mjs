// 场地1 两个新 GLB 的世界包围盒 + 与当前模型的节点名差异
// 用法: node scripts/site1-compare.mjs
import { readFileSync } from 'node:fs'

function parseGlb(path) {
  const buf = readFileSync(path)
  const jsonLen = buf.readUInt32LE(12)
  return JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
}

// 组装节点世界矩阵（仅平移/旋转/缩放，够算 AABB 用）
function composeNode(node, parent) {
  const m = parent ? [...parent] : null
  // 直接用 matrix 或 TRS 构造 4x4（列主序）
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
  if (!m) return local
  // parent * local（列主序 4x4 乘法）
  const out = new Array(16).fill(0)
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++)
      for (let k = 0; k < 4; k++)
        out[c * 4 + r] += m[k * 4 + r] * local[c * 4 + k]
  return out
}

function applyMatrix(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ]
}

function worldAabbOfGroup(json, rootIndices) {
  const accessors = json.accessors
  const meshes = json.meshes
  const nodes = json.nodes
  let box = null
  const corners = (mn, mx) =>
    [0, 1, 2].flatMap((i) => [0, 1]).map(() => 0) // placeholder
  const allCorners = (mn, mx) => {
    const out = []
    for (const x of [mn[0], mx[0]])
      for (const y of [mn[1], mx[1]])
        for (const z of [mn[2], mx[2]]) out.push([x, y, z])
    return out
  }
  const visit = (idx, matrix) => {
    const node = nodes[idx]
    const m = composeNode(node, matrix)
    if (node.mesh !== undefined) {
      for (const p of meshes[node.mesh].primitives ?? []) {
        const pos = accessors[p.attributes?.POSITION]
        if (!pos?.min || !pos?.max) continue
        for (const c of allCorners(pos.min, pos.max)) {
          const w = applyMatrix(m, c)
          if (!box) box = { min: [...w], max: [...w] }
          else for (let i = 0; i < 3; i++) {
            box.min[i] = Math.min(box.min[i], w[i])
            box.max[i] = Math.max(box.max[i], w[i])
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child, m)
  }
  for (const root of rootIndices) visit(root, null)
  return box
}

const fmt = (v) => v.map((n) => Math.round(n * 10) / 10).join(', ')

const files = {
  大厅: parseGlb('D:/场地1/大厅.glb'),
  右侧: parseGlb('D:/场地1/右侧.glb'),
  当前: parseGlb('public/models/scene-0817.glb'),
}

// —— 1. 两个新文件的世界包围盒 ——
for (const [label, json] of Object.entries(files)) {
  if (label === '当前') continue
  const sceneNodes = json.scenes[json.scene ?? 0].nodes
  const box = worldAabbOfGroup(json, sceneNodes)
  console.log(`${label}.glb 世界AABB: min[${fmt(box.min)}] max[${fmt(box.max)}]`)
}

// —— 2. 右侧.glb 按厅名分组的世界 AABB ——
{
  const json = files.右侧
  const nodes = json.nodes
  for (const hall of ['电影厅', '技术设备厅', '展望厅', 'shu', 'pCube', '3d66']) {
    const idxs = []
    nodes.forEach((n, i) => {
      if ((n.name ?? '').startsWith(hall)) idxs.push(i)
    })
    if (!idxs.length) continue
    const roots = idxs.filter((i) => !nodes.some((p) => (p.children ?? []).includes(i)))
    const box = worldAabbOfGroup(json, roots)
    console.log(`右侧.glb "${hall}*" (${idxs.length}节点): min[${fmt(box.min)}] max[${fmt(box.max)}]`)
  }
}

// —— 3. 节点名差异：当前模型 vs (大厅 ∪ 右侧) ——
{
  const nameSet = (json) => new Set(json.nodes.map((n) => n.name).filter(Boolean))
  const cur = nameSet(files.当前)
  const lobby = nameSet(files.大厅)
  const right = nameSet(files.右侧)
  const news = new Set([...lobby, ...right])
  const strip = (s) => s.replace(/\.\d{3}$/, '')
  const curBase = new Set([...cur].map(strip))
  const newBase = new Set([...news].map(strip))
  const missing = [...curBase].filter((n) => !newBase.has(n)).sort()
  const added = [...newBase].filter((n) => !curBase.has(n)).sort()
  console.log(`\n当前模型基础节点名 ${curBase.size} 个, 新导出合计 ${newBase.size} 个`)
  console.log(`\n[当前有 / 新导出缺失] ${missing.length} 个:`)
  console.log('  ' + missing.join(' | '))
  console.log(`\n[新导出新增] ${added.length} 个:`)
  console.log('  ' + added.join(' | '))
}
