import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Octree } from 'three/examples/jsm/math/Octree.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { CONFIG } from '../data/config.js'
import { HALLS, getHallCanonicalCenter } from '../data/halls.js'
import { findPictureTexture, textureToPhoto } from './pictureTexture.js'

function listMaterialNames(material) {
  if (!material) return []
  const materials = Array.isArray(material) ? material : [material]
  return materials
    .map((item) => (typeof item?.name === 'string' ? item.name.trim() : ''))
    .filter(Boolean)
}

function objectNameMatchesHall(object, hallName) {
  const objectName = typeof object?.name === 'string' ? object.name.trim() : ''
  if (objectName.startsWith(hallName) || objectName.includes(hallName)) return true

  const userDataName = typeof object?.userData?.name === 'string' ? object.userData.name.trim() : ''
  if (userDataName.startsWith(hallName) || userDataName.includes(hallName)) return true

  return false
}

function objectMaterialMatchesHall(object, hallName) {
  return listMaterialNames(object?.material).some((name) => name.includes(hallName))
}

function objectMatchesLabel(object, label) {
  return objectNameMatchesHall(object, label) || objectMaterialMatchesHall(object, label)
}

function buildNamedAnchor(scene, label) {
  const box = new THREE.Box3()
  let matched = false

  scene.traverse((object) => {
    if (object === scene) return
    if (!objectMatchesLabel(object, label)) return

    const objectBox = new THREE.Box3().setFromObject(object)
    if (objectBox.isEmpty()) return

    box.union(objectBox)
    matched = true
  })

  if (!matched || box.isEmpty()) return null

  const center = new THREE.Vector3()
  box.getCenter(center)

  return {
    x: center.x,
    y: center.y,
    z: center.z,
  }
}

function buildSceneAnchors(scene) {
  return {
    honorChapter: buildNamedAnchor(scene, '荣誉篇章'),
    trophyArea: buildNamedAnchor(scene, '奖杯'),
  }
}

function solveLinear3(system, values) {
  const matrix = system.map((row, index) => [...row, values[index]])
  const size = matrix.length

  for (let pivot = 0; pivot < size; pivot += 1) {
    let best = pivot
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(matrix[row][pivot]) > Math.abs(matrix[best][pivot])) best = row
    }

    if (Math.abs(matrix[best][pivot]) < 1e-8) return null
    if (best !== pivot) [matrix[pivot], matrix[best]] = [matrix[best], matrix[pivot]]

    const factor = matrix[pivot][pivot]
    for (let column = pivot; column <= size; column += 1) {
      matrix[pivot][column] /= factor
    }

    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue
      const scale = matrix[row][pivot]
      if (Math.abs(scale) < 1e-8) continue

      for (let column = pivot; column <= size; column += 1) {
        matrix[row][column] -= scale * matrix[pivot][column]
      }
    }
  }

  return matrix.map((row) => row[size])
}

function determinant3(rows) {
  const [[a, b, c], [d, e, f], [g, h, i]] = rows
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
}

function buildLayoutTransform(hallBoxes) {
  if (hallBoxes.length < 3) return null

  const pairs = hallBoxes
    .map((layoutHall) => {
      const hall = HALLS.find((item) => item.id === layoutHall.id)
      if (!hall) return null

      const canonical = getHallCanonicalCenter(hall)
      return {
        world: [layoutHall.centerX, layoutHall.centerZ, 1],
        canonical,
      }
    })
    .filter(Boolean)

  if (pairs.length < 3) return null

  let triplet = null
  let bestDeterminant = 0

  for (let i = 0; i < pairs.length - 2; i += 1) {
    for (let j = i + 1; j < pairs.length - 1; j += 1) {
      for (let k = j + 1; k < pairs.length; k += 1) {
        const candidate = [pairs[i], pairs[j], pairs[k]]
        const determinant = Math.abs(determinant3(candidate.map((pair) => pair.world)))
        if (determinant > bestDeterminant) {
          bestDeterminant = determinant
          triplet = candidate
        }
      }
    }
  }

  if (!triplet || bestDeterminant < 1e-8) return null

  const system = triplet.map((pair) => pair.world)
  const xValues = triplet.map((pair) => pair.canonical.x)
  const zValues = triplet.map((pair) => pair.canonical.z)
  const xCoefficients = solveLinear3(system, xValues)
  const zCoefficients = solveLinear3(system, zValues)

  if (!xCoefficients || !zCoefficients) return null

  const projectionError = pairs.reduce((max, pair) => {
    const mappedX =
      xCoefficients[0] * pair.world[0] + xCoefficients[1] * pair.world[1] + xCoefficients[2]
    const mappedZ =
      zCoefficients[0] * pair.world[0] + zCoefficients[1] * pair.world[1] + zCoefficients[2]
    const dx = Math.abs(mappedX - pair.canonical.x)
    const dz = Math.abs(mappedZ - pair.canonical.z)
    return Math.max(max, dx, dz)
  }, 0)

  if (projectionError > 2.5) return null

  return {
    x: xCoefficients,
    z: zCoefficients,
  }
}

function buildWorldLayout(scene) {
  const hallBoxes = HALLS.map((hall) => {
    const nameMatches = []
    scene.traverse((object) => {
      if (object === scene) return
      if (!objectNameMatchesHall(object, hall.name)) return
      nameMatches.push(object)
    })

    const matches = nameMatches.length
      ? nameMatches
      : (() => {
          const materialMatches = []
          scene.traverse((object) => {
            if (object === scene) return
            if (!objectMaterialMatchesHall(object, hall.name)) return
            materialMatches.push(object)
          })
          return materialMatches
        })()

    if (!matches.length) return null

    const box = new THREE.Box3()
    matches.forEach((object) => {
      const objectBox = new THREE.Box3().setFromObject(object)
      if (!objectBox.isEmpty()) box.union(objectBox)
    })
    if (box.isEmpty()) return null

    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)

    return {
      id: hall.id,
      name: hall.name,
      centerX: center.x,
      centerZ: center.z,
      sizeX: size.x,
      sizeZ: size.z,
      worldMinX: box.min.x,
      worldMaxX: box.max.x,
      worldMinZ: box.min.z,
      worldMaxZ: box.max.z,
    }
  }).filter(Boolean)

  if (hallBoxes.length < 4) return null

  const transform = buildLayoutTransform(hallBoxes)

  const baseHalfWidth = CONFIG.hall.width / 2
  const baseHalfDepth = CONFIG.hall.depth / 2
  const xValues = hallBoxes.map((hall) => hall.centerX)
  const zValues = hallBoxes.map((hall) => hall.centerZ)
  const centerX = (Math.min(...xValues) + Math.max(...xValues)) / 2
  const centerZ = (Math.min(...zValues) + Math.max(...zValues)) / 2
  const avgHalfHallWidth = hallBoxes.reduce((sum, hall) => sum + hall.sizeX / 2, 0) / hallBoxes.length
  const avgHalfHallDepth = hallBoxes.reduce((sum, hall) => sum + hall.sizeZ / 2, 0) / hallBoxes.length
  const halfWidth = Math.max(...hallBoxes.map((hall) => Math.abs(hall.centerX - centerX) + hall.sizeX / 2), avgHalfHallWidth)
  const halfDepth = Math.max(...hallBoxes.map((hall) => Math.abs(hall.centerZ - centerZ) + hall.sizeZ / 2), avgHalfHallDepth)

  return {
    centerX,
    centerZ,
    halfWidth,
    halfDepth,
    transform,
    halls: hallBoxes.map((hall) => {
      const mapped = transform
        ? {
            x: transform.x[0] * hall.centerX + transform.x[1] * hall.centerZ + transform.x[2],
            z: transform.z[0] * hall.centerX + transform.z[1] * hall.centerZ + transform.z[2],
          }
        : {
            x: ((hall.centerX - centerX) * baseHalfWidth) / halfWidth,
            z: ((hall.centerZ - centerZ) * baseHalfDepth) / halfDepth,
          }

      return {
        id: hall.id,
        name: hall.name,
        x: mapped.x,
        z: mapped.z,
        sizeX: (hall.sizeX * baseHalfWidth) / halfWidth,
        sizeZ: (hall.sizeZ * baseHalfDepth) / halfDepth,
        worldMinX: hall.worldMinX,
        worldMaxX: hall.worldMaxX,
        worldMinZ: hall.worldMinZ,
        worldMaxZ: hall.worldMaxZ,
      }
    }),
  }
}

const sceneLayoutCache = new WeakMap()

// 单个网格的三角形总数（多材质分组时索引为准）
function countMeshTriangles(mesh) {
  const geometries = Array.isArray(mesh.geometry) ? mesh.geometry : [mesh.geometry]
  return geometries.reduce((total, geometry) => {
    if (!geometry) return total
    if (geometry.index) return total + geometry.index.count / 3
    return total + (geometry.attributes?.position?.count || 0) / 3
  }, 0)
}

// 高密度网格（如 tripo 生成的展品实物，单个几万面）不适合直接进碰撞 Octree：
// 全量 2.8M 三角形的八叉树会吃掉 1-2GB 内存并卡死解析阶段。
// 这类网格改用世界包围盒的 12 三角代理做碰撞，建筑墙体/展板仍走精确三角。
const DENSE_TRIANGLE_LIMIT = 2000
// 精确三角总量预算：实测 three Octree 入树 ~8K 三角≈1.6s，40K 约 10s 内可完成；
// 超预算的网格退化为包围盒代理（分格小盒），不再依赖场景级一刀切禁用
const COLLISION_TRIANGLE_BUDGET = 60000
const COLLISION_SCENE_TRIANGLE_LIMIT = 5000000
const TOPOLOGY_SENSITIVE_TRIANGLE_LIMIT = 800
const TOPOLOGY_SENSITIVE_MIN_SPAN = 4

function countSceneTriangles(scene) {
  let total = 0
  scene.traverse((object) => {
    if (object.isMesh) total += countMeshTriangles(object)
  })
  return total
}

function requiresPreciseCollision(triangleCount, size) {
  const largestSpan = Math.max(size.x, size.y, size.z)
  return (
    triangleCount <= TOPOLOGY_SENSITIVE_TRIANGLE_LIMIT &&
    largestSpan >= TOPOLOGY_SENSITIVE_MIN_SPAN
  )
}

// 碰撞体策略：
// - Octree 默认 maxLevel=16，遇共面巨型三角形会病态细分（4^16 节点潜力）导致卡死/爆内存。
//   限到 5 层（碰撞粒度 ~1.5m，足够玩家胶囊），建筑网格（外壳/地面/带门洞墙体）全部
//   保留原始三角精确碰撞——盒子化外壳会把空心建筑填实、封死门洞（实测教训）。
// - 只有超过单网格面数上限或总预算的高模（tripo 展品等小实物）用分格包围盒代理。
const COLLISION_MAX_LEVEL = 5
const PROXY_CELL_SIZE = 2
const PROXY_MAX_CELLS = 512

function buildCollisionWorld(scene) {
  // Keep high-poly exports interactive: their collider generation can take
  // minutes even when the compressed .glb itself is small.
  if (countSceneTriangles(scene) > COLLISION_SCENE_TRIANGLE_LIMIT) return null

  console.info('[perf] collision 开始')
  const startedAt = performance.now()
  const octree = new Octree()
  octree.maxLevel = COLLISION_MAX_LEVEL
  const proxies = []
  const pendingPrecise = []
  let preciseTriangleCount = 0
  let meshCount = 0

  scene.traverse((object) => {
    if (!object.isMesh) return
    meshCount += 1
    const triangleCount = countMeshTriangles(object)
    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())

    // Large, low-poly room meshes can include actual door openings. Bounding
    // boxes would fill those openings, so keep their triangle topology.
    const usePreciseCollision =
      triangleCount <= DENSE_TRIANGLE_LIMIT &&
      (requiresPreciseCollision(triangleCount, size) ||
        preciseTriangleCount + triangleCount <= COLLISION_TRIANGLE_BUDGET)

    if (!usePreciseCollision) {
      // 高模（小实物）用分格包围盒代理；格子限制数量防爆
      const dims = [size.x, size.y, size.z].map((value) => Math.max(value, 0.04))
      let cells = dims.map((value) => Math.max(1, Math.ceil(value / PROXY_CELL_SIZE)))
      const cellTotal = cells[0] * cells[1] * cells[2]
      if (cellTotal > PROXY_MAX_CELLS) {
        const scale = Math.cbrt(cellTotal / PROXY_MAX_CELLS)
        cells = cells.map((value) => Math.max(1, Math.ceil(value / scale)))
      }
      for (let cx = 0; cx < cells[0]; cx += 1) {
        for (let cy = 0; cy < cells[1]; cy += 1) {
          for (let cz = 0; cz < cells[2]; cz += 1) {
            const cellSize = [dims[0] / cells[0], dims[1] / cells[1], dims[2] / cells[2]]
            const proxy = new THREE.Mesh(
              new THREE.BoxGeometry(cellSize[0], cellSize[1], cellSize[2]),
            )
            proxy.position.set(
              box.min.x + cellSize[0] * (cx + 0.5),
              box.min.y + cellSize[1] * (cy + 0.5),
              box.min.z + cellSize[2] * (cz + 0.5),
            )
            proxy.updateMatrix()
            proxy.matrixWorld.copy(proxy.matrix)
            proxies.push(proxy)
          }
        }
      }
      return
    }

    preciseTriangleCount += triangleCount
    pendingPrecise.push(object)
  })
  console.info(
    `[perf] collision 网格分类完成 meshes=${meshCount} 精确三角=${preciseTriangleCount} 代理盒=${proxies.length} 耗时=${(performance.now() - startedAt).toFixed(0)}ms`,
  )
  for (const object of pendingPrecise) octree.fromGraphNode(object)
  console.info(
    `[perf] collision 精确网格入树完成 耗时=${(performance.now() - startedAt).toFixed(0)}ms`,
  )
  for (const proxy of proxies) {
    octree.fromGraphNode(proxy)
    proxy.geometry.dispose()
  }
  console.info(`[perf] collision 完成 耗时=${(performance.now() - startedAt).toFixed(0)}ms`)
  return octree
}

function buildFallbackWorldLayout(scene) {
  const box = new THREE.Box3().setFromObject(scene)
  if (box.isEmpty()) return null

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())

  return {
    centerX: center.x,
    centerZ: center.z,
    halfWidth: Math.max(size.x / 2, CONFIG.hall.width / 2),
    halfDepth: Math.max(size.z / 2, CONFIG.hall.depth / 2),
    transform: null,
    halls: [],
  }
}

function getSceneLayout(scene) {
  const cached = sceneLayoutCache.get(scene)
  if (cached) return cached

  console.info('[perf] layout 开始')
  scene.updateMatrixWorld(true)
  const worldLayout = buildWorldLayout(scene) ?? buildFallbackWorldLayout(scene)
  console.info('[perf] worldLayout 完成', worldLayout ? worldLayout.halls?.length + '厅' : 'null')
  const anchors = buildSceneAnchors(scene)
  console.info('[perf] anchors 完成')
  const layout = worldLayout ? { ...worldLayout, anchors } : null
  sceneLayoutCache.set(scene, layout)
  return layout
}

export function GltfModel({ url, collisionWorldRef, onWorldLayout, onSelectPicture }) {
  const gl = useThree((state) => state.gl)
  // KTX2（GPU 压缩纹理）支持：basis 转码器放 public/basis/，按当前渲染器能力选择转码目标
  const ktx2Loader = useMemo(
    () => new KTX2Loader().setTranscoderPath('/basis/').detectSupport(gl),
    [gl],
  )
  // 第三个参数启用 MeshoptDecoder：新模型的几何带 EXT_meshopt_compression
  const { scene } = useGLTF(url, false, true, (loader) => {
    loader.setKTX2Loader(ktx2Loader)
  })
  const worldLayout = useMemo(() => {
    if (typeof window !== 'undefined') window.__gltfScene = scene // 调试用：自动化测试检查场景网格
    return getSceneLayout(scene)
  }, [scene])
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    onWorldLayout?.(worldLayout)
  }, [onWorldLayout, worldLayout])

  useEffect(() => {
    console.info('[perf] collision effect 触发, ref=', !!collisionWorldRef)
    if (!collisionWorldRef) return undefined

    collisionWorldRef.current = null
    let disposed = false
    const timer = window.setTimeout(() => {
      console.info('[perf] collision 定时器回调, disposed=', disposed)
      if (disposed) return
      const collisionWorld = buildCollisionWorld(scene)
      if (!disposed) collisionWorldRef.current = collisionWorld
    }, 0)

    return () => {
      disposed = true
      window.clearTimeout(timer)
      collisionWorldRef.current = null
    }
  }, [collisionWorldRef, scene])

  // 点击墙上照片/展板/屏幕：从命中网格的材质里取出图片贴图，导出原图交给查看器。
  // R3F 会沿射线对每个命中对象各派发一次事件，只处理最近命中面，
  // 使墙体和展板空白区域等可见遮挡物能够阻止其后的图片被选中。
  const handlePictureClick = async (event) => {
    if (event.delta > 6) return // 拖拽旋转视角的抬起不视为点击

    const nearest = event.intersections?.[0]
    if (!nearest || nearest.object !== event.object) return

    event.stopPropagation()

    try {
      const picture = findPictureTexture(nearest.object, nearest.face)
      if (!picture?.texture) return

      const photo = await textureToPhoto(picture.texture, picture.name, {
        board: picture.board,
        uv: nearest.uv,
      })

      if (photo && mountedRef.current) onSelectPicture?.(photo)
    } catch (error) {
      console.error('导出图片贴图失败', error)
    }
  }

  return <primitive object={scene} onClick={handlePictureClick} />
}
