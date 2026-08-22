// 技术厅门洞三角形级剖面扫描：沿走廊->厅内做垂直切片，逐点测三角面占用
// 输出每个横向偏移处的通行情况，判断门洞是否存在/移位/被堵
// 用法: node scripts/site1-door-section.mjs
import { readFileSync } from 'node:fs'

// 旧模型 transform 的逆（六厅逐分米吻合可复用）
const a = 0.00007868816874987967, b = 0.5989909289668992, e = -2.0191278282338776
const c = 0.4920730998694103, d = 0.015294848503539373, f = -0.1295345693062784
const det = a * d - b * c
const inv = (cx, cz) => {
  const dx = cx - e, dz = cz - f
  return { x: (d * dx - b * dz) / det, z: (-c * dx + a * dz) / det }
}

// 三角形-AABB 相交（分离轴特例：先砍到三角 AABB，再用 2D xz 投影 + y 层判定）
function triIntersectsBox(tri, box) {
  // 快速 AABB 剔除
  for (let k = 0; k < 3; k++) {
    const tmin = Math.min(tri[0][k], tri[1][k], tri[2][k])
    const tmax = Math.max(tri[0][k], tri[1][k], tri[2][k])
    if (tmax < box.min[k] || tmin > box.max[k]) return false
  }
  // 精测：三角形三条边与盒子、盒子顶点符号测试（简化：用SAT 13轴）
  const axes = [
    [1, 0, 0], [0, 1, 0], [0, 0, 1],
  ]
  const edges = [
    [tri[1][0] - tri[0][0], tri[1][1] - tri[0][1], tri[1][2] - tri[0][2]],
    [tri[2][0] - tri[1][0], tri[2][1] - tri[1][1], tri[2][2] - tri[1][2]],
    [tri[0][0] - tri[2][0], tri[0][1] - tri[2][1], tri[0][2] - tri[2][2]],
  ]
  const center = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2]
  const half = [(box.max[0] - box.min[0]) / 2, (box.max[1] - box.min[1]) / 2, (box.max[2] - box.min[2]) / 2]
  const project = (ax, p) => ax[0] * p[0] + ax[1] * p[1] + ax[2] * p[2]
  const allAxes = [...axes]
  for (const e1 of edges)
    for (const e2 of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
      allAxes.push([
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ])
    }
  for (const ax of allAxes) {
    const len = Math.hypot(...ax)
    if (len < 1e-9) continue
    const n = [ax[0] / len, ax[1] / len, ax[2] / len]
    const tp = tri.map((p) => project(n, p))
    const r = half[0] * Math.abs(n[0]) + half[1] * Math.abs(n[1]) + half[2] * Math.abs(n[2])
    const dist = Math.abs(project(n, center) - (Math.min(...tp) + Math.max(...tp)) / 2)
    if (dist > r + (Math.max(...tp) - Math.min(...tp)) / 2) return false
    if (Math.max(...tp) < project(n, center) - r || Math.min(...tp) > project(n, center) + r) return false
  }
  return true
}

function loadMeshes(file) {
  const buf = readFileSync(file)
  const l = buf.readUInt32LE(12)
  const j = JSON.parse(buf.slice(20, 20 + l).toString('utf8'))
  const bin = buf.subarray(20 + l + 8)
  const out = []
  const mat4 = (n, p) => {
    let m
    if (n.matrix) m = n.matrix
    else {
      const t = n.translation || [0, 0, 0], q = n.rotation || [0, 0, 0, 1], s = n.scale || [1, 1, 1]
      const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z
      const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2
      const wx = w * x2, wy = w * y2, wz = w * z2
      m = [
        (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
        (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
        (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
        t[0], t[1], t[2], 1,
      ]
    }
    if (!p) return m
    const o = new Array(16).fill(0)
    for (let cc = 0; cc < 4; cc++)
      for (let r = 0; r < 4; r++)
        for (let k = 0; k < 4; k++) o[cc * 4 + r] += p[k * 4 + r] * m[cc * 4 + k]
    return o
  }
  const readAccessor = (idx) => {
    const acc = j.accessors[idx]
    const bv = j.bufferViews[acc.bufferView]
    const off = (bv.byteOffset || 0) + (acc.byteOffset || 0)
    const count = acc.count
    const comp = { 5126: 4, 5123: 2, 5125: 4 }[acc.componentType]
    const size = { SCALAR: 1, VEC2: 2, VEC3: 3 }[acc.type]
    if (acc.componentType === 5126) {
      const arr = new Float32Array(bin.buffer, bin.byteOffset + off, count * size)
      return Array.from(arr)
    }
    if (acc.componentType === 5123) return Array.from(new Uint16Array(bin.buffer, bin.byteOffset + off, count))
    return Array.from(new Uint32Array(bin.buffer, bin.byteOffset + off, count))
  }
  const visit = (i, pm) => {
    const n = j.nodes[i]
    const m = mat4(n, pm)
    if (n.mesh !== undefined) {
      for (const p of j.meshes[n.mesh].primitives || []) {
        const pa = j.accessors[p.attributes?.POSITION]
        if (!pa?.min) continue
        const pos = readAccessor(p.attributes.POSITION)
        const idx = p.indices !== undefined ? readAccessor(p.indices) : null
        out.push({ name: n.name, m, pos, idx, min: pa.min, max: pa.max })
      }
    }
    for (const ch of n.children || []) visit(ch, m)
  }
  for (const r of j.scenes[j.scene || 0].nodes || []) visit(r, null)
  return out
}

const meshes = [
  ...loadMeshes('models-src/site1-migration/右侧.materials.glb').map((x) => ({ ...x, src: '场地右侧' })),
  ...loadMeshes('models-src/site1-migration/技术厅设备.glb').map((x) => ({ ...x, src: '技术厅设备' })),
]

// 剖面：canonical x 从 -2.5 到 +2.5 每 0.5m 一列，通道从走廊(z cano 3.8)到厅内(6.4)
// 每列测一个 0.5×2.0(y 0.15~2.15)×通道长的盒子被多少三角形占据
console.log('canonical_x | 占用三角形数( Top 来源 )')
for (let cx = -2.5; cx <= 2.51; cx += 0.5) {
  const p1 = inv(0.55 + cx, 3.9)
  const p2 = inv(0.55 + cx, 6.3)
  const box = {
    min: [Math.min(p1.x, p2.x) - 0.2, 0.2, Math.min(p1.z, p2.z) - 0.2],
    max: [Math.max(p1.x, p2.x) + 0.2, 1.7, Math.max(p1.z, p2.z) + 0.2],
  }
  const hits = new Map()
  for (const mesh of meshes) {
    // AABB 预筛
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]
    const w = (v) => [
      mesh.m[0] * v[0] + mesh.m[4] * v[1] + mesh.m[8] * v[2] + mesh.m[12],
      mesh.m[1] * v[0] + mesh.m[5] * v[1] + mesh.m[9] * v[2] + mesh.m[13],
      mesh.m[2] * v[0] + mesh.m[6] * v[1] + mesh.m[10] * v[2] + mesh.m[14],
    ]
    // 直接采样三角形（数量可控：预筛后逐三角变换+测试）
    const triCount = mesh.idx ? mesh.idx.length / 3 : mesh.pos.length / 9
    // AABB 粗筛用 accessor min/max 变换 8 角
    for (const x of [mesh.min[0], mesh.max[0]])
      for (const y of [mesh.min[1], mesh.max[1]])
        for (const z of [mesh.min[2], mesh.max[2]]) {
          const W = w([x, y, z])
          for (let k = 0; k < 3; k++) {
            mn[k] = Math.min(mn[k], W[k])
            mx[k] = Math.max(mx[k], W[k])
          }
        }
    if (mx[0] < box.min[0] || mn[0] > box.max[0] || mx[1] < box.min[1] || mn[1] > box.max[1] || mx[2] < box.min[2] || mn[2] > box.max[2]) continue
    let n = 0
    const tri = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
    for (let t = 0; t < triCount; t += 1) {
      for (let v = 0; v < 3; v += 1) {
        const vi = mesh.idx ? mesh.idx[t * 3 + v] : t * 3 + v
        tri[v] = w([mesh.pos[vi * 3], mesh.pos[vi * 3 + 1], mesh.pos[vi * 3 + 2]])
      }
      if (triIntersectsBox(tri, box)) n += 1
    }
    if (n) hits.set(mesh.src + ':' + mesh.name, n)
  }
  const total = [...hits.values()].reduce((s, v) => s + v, 0)
  const top = [...hits.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k, v]) => `${k}(${v})`).join(' ')
  console.log(`${(0.55 + cx).toFixed(1).padStart(5)} | ${String(total).padStart(4)} ${total < 5 ? '✅可通行' : ''} ${top}`)
}
