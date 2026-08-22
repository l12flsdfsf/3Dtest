// 验证 设备0822/*.json 自带摆位(mesh matrix)在新场地家具上的落座情况
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
function walk(n, p) {
  parentOf.set(n, p)
  for (const c of n.listChildren()) walk(c, n)
}
walk(scene, null)

function WM(node) {
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

// 广播厅家具全集(西墙+北墙)
const tris = []
for (const name of ['polySurface46.001', 'pCube211', 'cidai', 'pCube229', 'pCube231', 'pCube231.001', 'pCube230']) {
  const node = root.listNodes().find((n) => n.getName() === name)
  if (!node?.getMesh()) continue
  const M = WM(node)
  for (const prim of node.getMesh().listPrimitives()) {
    const a = prim.getAttribute('POSITION').getArray()
    const idx = prim.getIndices()?.getArray()
    const tf = (i) => [
      M[0] * a[i * 3] + M[4] * a[i * 3 + 1] + M[8] * a[i * 3 + 2] + M[12],
      M[1] * a[i * 3] + M[5] * a[i * 3 + 1] + M[9] * a[i * 3 + 2] + M[13],
      M[2] * a[i * 3] + M[6] * a[i * 3 + 1] + M[10] * a[i * 3 + 2] + M[14],
    ]
    const push = (i, j, k) => {
      const A = tf(i), B = tf(j), C = tf(k)
      const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2]
      const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2]
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      const l = Math.hypot(nx, ny, nz) || 1
      tris.push({ A, B, C, ny: ny / l })
    }
    if (idx) for (let i = 0; i < idx.length; i += 3) push(idx[i], idx[i + 1], idx[i + 2])
    else for (let i = 0; i < a.length / 3 - 2; i += 3) push(i, i + 1, i + 2)
  }
}
console.log('家具三角:', tris.length)

const pit = (px, pz, A, B, C) => {
  const e = (ax, az, bx, bz) => (bx - ax) * (pz - az) - (bz - az) * (px - ax)
  const d1 = e(A[0], A[2], B[0], B[2])
  const d2 = e(B[0], B[2], C[0], C[2])
  const d3 = e(C[0], C[2], A[0], A[2])
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))
}
const ty = (px, pz, A, B, C) => {
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2]
  const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2]
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  return Math.abs(ny) < 1e-9 ? A[1] : A[1] - ((px - A[0]) * nx + (pz - A[2]) * nz) / ny
}

// 设备.json 摆位(name, x, y, z, 尺寸w×d 取自旧盒)
const DEV = [
  ['声频功率放大器', -21.889, 1.016, -0.599, 1.0, 1.32],
  ['调频收转机', -21.828, 1.023, 1.079, 0.98, 1.44],
  ['晶体管收音机', -21.767, 1.023, 5.646, 0.21, 0.6],
  ['海燕8-晶体管收音机', -21.797, 1.019, 7.345, 0.19, 0.59],
]
for (const [name, x, y, z, w, d] of DEV) {
  const r = Math.max(w, d) * 0.4
  let best = null
  let cov = 0
  const tot = 25
  for (let i = 0; i <= 4; i++)
    for (let j = 0; j <= 4; j++) {
      const px = x + ((2 * i) / 4 - 1) * r
      const pz = z + ((2 * j) / 4 - 1) * r
      let hit = null
      for (const t of tris) {
        if (t.ny < 0.5) continue
        if (!pit(px, pz, t.A, t.B, t.C)) continue
        const yy = ty(px, pz, t.A, t.B, t.C)
        if (!hit || yy > hit.y) hit = { y: yy }
      }
      if (hit) {
        cov++
        if (!best || hit.y > best.y) best = hit
      }
    }
  const verdict = !best ? '真悬空(脚下无家具)' : Math.abs(best.y - y) < 0.06 ? `落座吻合(y=${best.y.toFixed(3)})` : best.y > y ? `台面更高 ${ (best.y - y).toFixed(2) }m(会嵌入)` : `悬空 ${(y - best.y).toFixed(2)}m`
  console.log(`${name.padEnd(10)} json位(${x}, ${y.toFixed(2)}, ${z}) 脚印覆盖 ${cov}/${tot} → ${verdict}`)
}
