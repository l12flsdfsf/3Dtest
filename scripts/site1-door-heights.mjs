// 六厅门洞净高测量：门柱范围内场地网格三角面的最低底沿（>1m 的最小 y）
// 用法: node scripts/site1-door-heights.mjs <场地.glb> <canonicalZ符号>
import { readFileSync } from 'node:fs'

const FILE = process.argv[2]
const SIDE = Number(process.argv[3] ?? 1) // 门在 canonical z 的符号侧
const a = 0.00007868816874987967, b = 0.5989909289668992, e = -2.0191278282338776
const c = 0.4920730998694103, d = 0.015294848503539373, f = -0.1295345693062784
const det = a * d - b * c
const inv = (cx, cz) => {
  const dx = cx - e, dz = cz - f
  return { x: (d * dx - b * dz) / det, z: (-c * dx + a * dz) / det }
}
const DOORS = { 关怀厅: 7.9, 广播厅: 0.55, 电视厅: -7.5, 电影厅: -7.5, 技术设备厅: 0.55, 展望厅: 7.9 }

const buf = readFileSync(FILE)
const l = buf.readUInt32LE(12)
const j = JSON.parse(buf.slice(20, 20 + l).toString('utf8'))
const bin = buf.subarray(20 + l + 8)
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
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3 }[acc.type]
  if (acc.componentType === 5126) return Array.from(new Float32Array(bin.buffer, bin.byteOffset + off, acc.count * size))
  if (acc.componentType === 5123) return Array.from(new Uint16Array(bin.buffer, bin.byteOffset + off, acc.count * size))
  return Array.from(new Uint32Array(bin.buffer, bin.byteOffset + off, acc.count * size))
}
const meshes = []
const visit = (i, pm) => {
  const n = j.nodes[i]
  const m = mat4(n, pm)
  if (n.mesh !== undefined)
    for (const p of j.meshes[n.mesh].primitives || []) {
      const pa = j.accessors[p.attributes?.POSITION]
      if (!pa?.min) continue
      meshes.push({
        name: n.name, m,
        pos: readAccessor(p.attributes.POSITION),
        idx: p.indices !== undefined ? readAccessor(p.indices) : null,
        min: pa.min, max: pa.max,
      })
    }
  for (const ch of n.children || []) visit(ch, m)
}
for (const r of j.scenes[j.scene || 0].nodes || []) visit(r, null)

for (const [hall, cx] of Object.entries(DOORS)) {
  const door = inv(cx, SIDE * 4.8)
  // 门柱:1.0m 宽,从走廊 0.8m 到厅内 0.8m
  const inner = inv(cx, SIDE * 6.0)
  const lo = { x: Math.min(door.x, inner.x), z: Math.min(door.z, inner.z) }
  const hi = { x: Math.max(door.x, inner.x), z: Math.max(door.z, inner.z) }
  let lintelMin = Infinity
  const hitNames = new Map()
  for (const mesh of meshes) {
    const w = (v) => [
      mesh.m[0] * v[0] + mesh.m[4] * v[1] + mesh.m[8] * v[2] + mesh.m[12],
      mesh.m[1] * v[0] + mesh.m[5] * v[1] + mesh.m[9] * v[2] + mesh.m[13],
      mesh.m[2] * v[0] + mesh.m[6] * v[1] + mesh.m[10] * v[2] + mesh.m[14],
    ]
    // 变换后的 AABB
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]
    for (const x of [mesh.min[0], mesh.max[0]])
      for (const y of [mesh.min[1], mesh.max[1]])
        for (const z of [mesh.min[2], mesh.max[2]]) {
          const W = w([x, y, z])
          for (let k = 0; k < 3; k++) {
            mn[k] = Math.min(mn[k], W[k])
            mx[k] = Math.max(mx[k], W[k])
          }
        }
    if (mx[0] < lo.x - 0.5 || mn[0] > hi.x + 0.5 || mx[2] < lo.z - 0.5 || mn[2] > hi.z + 0.5) continue
    const triCount = mesh.idx ? mesh.idx.length / 3 : mesh.pos.length / 9
    for (let t = 0; t < triCount; t += 1) {
      let minY = Infinity, maxX = -Infinity, minX = Infinity, maxZ = -Infinity, minZ = Infinity
      for (let v = 0; v < 3; v += 1) {
        const vi = mesh.idx ? mesh.idx[t * 3 + v] : t * 3 + v
        const W = w([mesh.pos[vi * 3], mesh.pos[vi * 3 + 1], mesh.pos[vi * 3 + 2]])
        minY = Math.min(minY, W[1])
        minX = Math.min(minX, W[0]); maxX = Math.max(maxX, W[0])
        minZ = Math.min(minZ, W[2]); maxZ = Math.max(maxZ, W[2])
      }
      // 三角的 xz 覆盖须落在门柱内,且底沿>0.5(排除地面)
      if (maxX < lo.x - 0.2 || minX > hi.x + 0.2 || maxZ < lo.z - 0.2 || minZ > hi.z + 0.2) continue
      if (minY > 0.5 && minY < lintelMin) {
        lintelMin = minY
        hitNames.clear()
        hitNames.set(mesh.name, minY)
      } else if (minY > 0.5 && minY < lintelMin + 0.05) hitNames.set(mesh.name, minY)
    }
  }
  const verdict = lintelMin > 1.95 ? '✅ 可过(胶囊1.95m)' : `❌ 堵(净高${lintelMin.toFixed(2)}m < 胶囊1.95m)`
  console.log(`${hall.padEnd(6)} 门洞净高 ${lintelMin === Infinity ? '无覆盖' : lintelMin.toFixed(2) + 'm'} ${verdict} <- ${[...hitNames.keys()].slice(0, 3).join(',')}`)
}
