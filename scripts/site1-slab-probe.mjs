// 解码广播厅大跨度网格(polySurface46.001 / pCube211)的真实形状:
// AABB 是整厅大小,需看顶点 XZ 占用判断是否沿墙一圈的柜台,能否承载设备
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

// 父链表:从场景递归建 node -> 父 map
const parentOf = new Map()
function walkParent(n, parent) {
  parentOf.set(n, parent)
  for (const c of n.listChildren()) walkParent(c, n)
}
for (const c of scene.listChildren()) walkParent(c, scene)

// 节点世界矩阵(沿父链 compose)
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

for (const name of ['polySurface46.001', 'pCube211']) {
  const node = root.listNodes().find((n) => n.getName() === name)
  if (!node || !node.getMesh()) {
    console.log(name, '未找到/无网格')
    continue
  }
  const M = worldMatrixOf(node)
  const pts = []
  for (const prim of node.getMesh().listPrimitives()) {
    const arr = prim.getAttribute('POSITION').getArray()
    for (let i = 0; i < arr.length; i += 3) {
      const [x, y, z] = [arr[i], arr[i + 1], arr[i + 2]]
      pts.push([
        M[0] * x + M[4] * y + M[8] * z + M[12],
        M[1] * x + M[5] * y + M[9] * z + M[13],
        M[2] * x + M[6] * y + M[10] * z + M[14],
      ])
    }
  }
  const mn = [1e9, 1e9, 1e9]
  const mx = [-1e9, -1e9, -1e9]
  for (const p of pts) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]) }
  console.log(`◆ ${name} 顶点${pts.length} 世界盒 x[${mn[0].toFixed(2)},${mx[0].toFixed(2)}] y[${mn[1].toFixed(2)},${mx[1].toFixed(2)}] z[${mn[2].toFixed(2)},${mx[2].toFixed(2)}]`)

  // XZ 占用网格(1m 格)
  const x0 = Math.floor(mn[0])
  const z0 = Math.floor(mn[2])
  const W = Math.ceil(mx[0] - x0) + 1
  const H = Math.ceil(mx[2] - z0) + 1
  const grid = Array.from({ length: H }, () => Array(W).fill(0))
  for (const p of pts) grid[Math.min(H - 1, Math.floor(p[2] - z0))][Math.min(W - 1, Math.floor(p[0] - x0))]++
  const head = '     ' + Array.from({ length: W }, (_, c) => String((x0 + c) % 10)).join('')
  console.log(head)
  for (let r = 0; r < H; r++) {
    let line = ''
    for (let c = 0; c < W; c++) {
      const v = grid[r][c]
      line += v === 0 ? '·' : v < 5 ? '░' : v < 20 ? '▒' : '▓'
    }
    console.log('  z' + String(z0 + r).padStart(3) + ' ' + line)
  }

  // 四台设备 XZ 附近有没有台面顶点
  const devs = [
    ['声频功率放大器', -21.89, -1.51],
    ['调频收转机', -21.83, 0.66],
    ['晶体管收音机', -21.77, 6.62],
    ['海燕8', -21.8, 8.71],
  ]
  for (const [d, dx, dz] of devs) {
    let best = 1e9
    let by = null
    for (const p of pts) {
      const dist = Math.hypot(p[0] - dx, p[2] - dz)
      if (dist < best) { best = dist; by = p[1] }
    }
    console.log(`  ${d}: 最近顶点水平距 ${best.toFixed(2)}m, y≈${by.toFixed(2)}`)
  }
}
