// 精确落座检测:对广播厅四台设备,用三角形级下投求脚下真实最高台面
// (此前 reseat 的 per-primitive AABB 法对带旋转节点算错盒子,漏掉沿墙柜台)
import { NodeIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { Matrix4, Quaternion, Vector3 } from 'three'

const io = new NodeIO()
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu])
const doc = await io.read('models-src/site1-migration/左侧.materials.glb')
const root = doc.getRoot()
const scene = root.listScenes()[0]

const parentOf = new Map()
function walkParent(n, parent) {
  parentOf.set(n, parent)
  for (const c of n.listChildren()) walkParent(c, n)
}
for (const c of scene.listChildren()) walkParent(c, scene)

function worldMatrixOf(node) {
  const chain = []
  let p = node
  while (p && p !== scene) {
    chain.unshift(p)
    p = parentOf.get(p)
  }
  let M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  const mul = (A, B) => {
    const o = new Array(16).fill(0)
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += A[k * 4 + r] * B[c * 4 + k]
    return o
  }
  for (const nd of chain) {
    const q = new Quaternion(...nd.getRotation().map(Number))
    const m = new Matrix4().compose(
      new Vector3(...nd.getTranslation().map(Number)),
      q,
      new Vector3(...nd.getScale().map(Number)),
    )
    M = mul([...m.elements], M)
  }
  return M
}

// 参与台面检测的节点(广播厅西墙家具)
const FURNITURE = ['polySurface46.001', 'pCube211', 'cidai', 'pCube229', 'pCube231', 'pCube231.001']

// 世界三角收集
const tris = []
for (const name of FURNITURE) {
  const node = root.listNodes().find((n) => n.getName() === name)
  if (!node?.getMesh()) {
    console.log('!', name, '无网格')
    continue
  }
  const M = worldMatrixOf(node)
  const tf = (arr) => {
    const out = []
    for (let i = 0; i < arr.length; i += 3)
      out.push([
        M[0] * arr[i] + M[4] * arr[i + 1] + M[8] * arr[i + 2] + M[12],
        M[1] * arr[i] + M[5] * arr[i + 1] + M[9] * arr[i + 2] + M[13],
        M[2] * arr[i] + M[6] * arr[i + 1] + M[10] * arr[i + 2] + M[14],
      ])
    return out
  }
  for (const prim of node.getMesh().listPrimitives()) {
    const pos = tf(prim.getAttribute('POSITION').getArray())
    const idx = prim.getIndices()?.getArray()
    const push = (a, b, c) => {
      const [ax, ay, az] = pos[a]
      const [bx, by, bz] = pos[b]
      const [cx, cy, cz] = pos[c]
      // 上向面法线
      const ux = bx - ax, uy = by - ay, uz = bz - az
      const vx = cx - ax, vy = cy - ay, vz = cz - az
      const ny = uz * vx - ux * vz
      const nx = uy * vz - uz * vy
      const nz = ux * vy - uy * vx
      const len = Math.hypot(nx, ny, nz) || 1
      tris.push({ name, a: [ax, ay, az], b: [bx, by, bz], c: [cx, cy, cz], ny: ny / len })
    }
    if (idx) for (let i = 0; i < idx.length; i += 3) push(idx[i], idx[i + 1], idx[i + 2])
    else for (let i = 0; i < pos.length; i += 3) push(i, i + 1, i + 2)
  }
}
console.log('家具三角:', tris.length)

// 设备脚印(收缩 20%)与脚下最高上向面
const DEVICES = [
  ['声频功率放大器', -22.39, -21.39, -2.17, -0.85],
  ['调频收转机', -22.32, -21.34, -0.06, 1.38],
  ['晶体管收音机', -21.87, -21.66, 6.32, 6.92],
  ['海燕8-晶体管收音机', -21.89, -21.7, 8.41, 9.01],
]
// 点在 XZ 平面三角形内:三条边的叉积同号
const pointInTri = (px, pz, A, B, C) => {
  const e = (ax, az, bx, bz) => (bx - ax) * (pz - az) - (bz - az) * (px - ax)
  const d1 = e(A[0], A[2], B[0], B[2])
  const d2 = e(B[0], B[2], C[0], C[2])
  const d3 = e(C[0], C[2], A[0], A[2])
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}
// 三角形平面在 (px,pz) 处的 y(平面方程)
const triYat = (px, pz, A, B, C) => {
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2]
  const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2]
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  if (Math.abs(ny) < 1e-9) return A[1]
  return A[1] - ((px - A[0]) * nx + (pz - A[2]) * nz) / ny
}
for (const [name, x0, x1, z0, z1] of DEVICES) {
  const sx0 = x0 + (x1 - x0) * 0.2, sx1 = x1 - (x1 - x0) * 0.2
  const sz0 = z0 + (z1 - z0) * 0.2, sz1 = z1 - (z1 - z0) * 0.2
  // 脚印网格采样点 5x5
  let best = null
  let cover = 0
  const samples = 5
  for (let i = 0; i <= samples; i++)
    for (let j = 0; j <= samples; j++) {
      const px = sx0 + ((sx1 - sx0) * i) / samples
      const pz = sz0 + ((sz1 - sz0) * j) / samples
      let hit = null
      for (const t of tris) {
        if (t.ny < 0.5) continue // 只要上向面
        if (!pointInTri(px, pz, t.a, t.b, t.c)) continue
        const y = triYat(px, pz, t.a, t.b, t.c)
        if (!hit || y > hit.y) hit = { y, name: t.name }
      }
      if (hit) {
        cover++
        if (!best || hit.y > best.y) best = hit
      }
    }
  const total = (samples + 1) * (samples + 1)
  console.log(
    `${name}: 脚印覆盖 ${cover}/${total} 采样点` +
      (best ? `, 最高台面 y=${best.y.toFixed(3)} (${best.name}), 设备底面 y=1.02 → ${best.y > 1.08 ? '嵌入台面 ' + (best.y - 1.02).toFixed(2) + 'm' : best.y < 0.96 ? '悬空 ' + (1.02 - best.y).toFixed(2) + 'm' : '落座吻合'}` : ', 脚下无台面 → 悬空'),
  )
}
