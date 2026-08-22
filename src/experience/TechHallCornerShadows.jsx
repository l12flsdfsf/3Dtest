import * as THREE from 'three'
import { HallCornerShadows, MAX_JUNCTIONS } from './HallCornerShadows.jsx'

// 构成技术设备厅「可见内墙面」的材质（实测 scene-0817）：
// - 技术设备厅：pCube172 墙体（含下段与檐口带 pCube172002）
// - 技术展厅海报背板：pCube176 主墙面（y 1.45~4.87）
// 不能碰 白墙（polySurface83 是贯穿全馆的外壳，会影响其它厅的墙亮度）。
// 导出给 RectHallsCornerShadows 的边界 fallback 做跨厅排除。
export const WALL_MATERIAL_NAMES = ['技术设备厅', '技术展厅海报背板']

// 这个厅的墙角缝不止 4 条，不能用单一矩形描述（实测 scene-0817）：
// - 门口墙（西 x=10.27）没有柱子，中段还是门洞；
// - 对面（东）中段墙面凹进（x=22.58），两端柱子凸出（柱面 x=21.56），
//   柱子的两个侧面各形成一条凹角缝：与南/北墙的交角 (21.56, ∓2.94)，
//   与凹墙的交角 (22.58, -1.97 / 9.23)。
// 量法（只对墙面网格打射线，穿门洞的射线自然落空）：
// 1) 南/北墙平面：厅内中线附近垂直打（原点 x 锁中段，够不到两端柱子）；
// 2) 门口墙面：中段多偏移 + 贴角各补一条（门洞再大，贴角总有墙），取最靠内的命中；
// 3) 东侧：同样打（深打收层），命中按值聚簇——最靠内的簇是柱面，更远的簇是
//    凹墙段、缝取簇内最外层，再从凹墙跟前 (凹墙x-0.3) 沿 ±z 补两条射线找柱子回转面；
// 4) 每条凹角缝记为 (缝x, 缝z, x朝向, z朝向)，朝向=房间在缝的哪一侧（±1）。
function measureJunctions(meshes, fallbackBox, hallEntry) {
  const raycaster = new THREE.Raycaster()
  raycaster.far = 40
  const cx = (hallEntry.worldMinX + hallEntry.worldMaxX) / 2
  const cz = (hallEntry.worldMinZ + hallEntry.worldMaxZ) / 2
  const halfX = (hallEntry.worldMaxX - hallEntry.worldMinX) / 2
  const halfZ = (hallEntry.worldMaxZ - hallEntry.worldMinZ) / 2
  const midOffsets = [-0.42, -0.21, 0, 0.21, 0.42]
  const eyeHeight = 1.6

  const castAxis = (dirX, dirZ, origins) => {
    const values = []
    for (const origin of origins) {
      raycaster.set(origin, new THREE.Vector3(dirX, 0, dirZ))
      const hit = raycaster.intersectObjects(meshes, false)[0]
      if (!hit) continue
      values.push(dirX !== 0 ? hit.point.x : hit.point.z)
    }
    return values
  }

  // 1) 南/北墙平面。墙面有前后两层：海报背板 (pCube176, y1.45~4.87) 在前、
  //    下段墙基 (pCube172) 在后 ~3-4cm——缝若取前层面，下段墙基会落在缝外
  //    被门控成零，柱子旁的暗带就只有背板那半段高。取每条射线前 3 个命中里
  //    贴近首命中的最外层面，让两层都落在缝内侧。
  const castAxisDeep = (dirX, dirZ, origins, depth) => {
    const values = []
    for (const origin of origins) {
      raycaster.set(origin, new THREE.Vector3(dirX, 0, dirZ))
      const hits = raycaster.intersectObjects(meshes, false).slice(0, depth)
      if (!hits.length) continue
      const primary = dirX !== 0 ? hits[0].point.x : hits[0].point.z
      for (const hit of hits) {
        const value = dirX !== 0 ? hit.point.x : hit.point.z
        if (Math.abs(value - primary) <= 0.3) values.push(value)
      }
    }
    return values
  }

  const southHits = castAxisDeep(
    0,
    -1,
    midOffsets.map((t) => new THREE.Vector3(cx + t * halfX, eyeHeight, cz)),
    3,
  )
  const northHits = castAxisDeep(
    0,
    1,
    midOffsets.map((t) => new THREE.Vector3(cx + t * halfX, eyeHeight, cz)),
    3,
  )
  // 南墙取最小 z（最外层）、北墙取最大 z，两层墙面都在缝内侧
  const z0 = southHits.length ? Math.min(...southHits) : fallbackBox.min.z + 0.12
  const z1 = northHits.length ? Math.max(...northHits) : fallbackBox.max.z - 0.12

  // 2/3) 东/西：中段偏移 + 贴角（z0/z1 各内收 0.5m，正好打在柱面/墙角段上）。
  // 东侧用深打（前 3 命中、层间容差 0.3m）：凹墙段是三层（海报背板 22.41/22.50 +
  // 结构墙 22.58），中段射线把三层都收进来；柱面段 21.56 与其后的 22.58 相差
  // >0.3m，只收柱面本身。
  const zForX = [...midOffsets.map((t) => cz + t * halfZ), z0 + 0.5, z1 - 0.5]
  const westHits = castAxis(-1, 0, zForX.map((z) => new THREE.Vector3(cx, eyeHeight, z)))
  const eastHits = castAxisDeep(1, 0, zForX.map((z) => new THREE.Vector3(cx, eyeHeight, z)), 3)
  const x0 = westHits.length ? Math.max(...westHits) : fallbackBox.min.x + 0.12
  const x1 = eastHits.length ? Math.min(...eastHits) : fallbackBox.max.x - 0.12

  // 东侧命中的不同面按值聚簇（容差 0.15m）：最靠内的簇是柱面，更远的簇是凹墙段。
  // 凹墙缝取簇内最外层（max）：1.45m 以下没有背板、直接露结构墙（x≈22.58），
  // 缝若取在背板前层面（≈22.41），下段会落在缝外被门控成零——柱旁暗带就只有
  // 背板那半段高（南/北墙取最外层同理）。
  const eastClusters = []
  for (const value of [...eastHits].sort((a, b) => a - b)) {
    const cluster = eastClusters[eastClusters.length - 1]
    if (!cluster || value > cluster.max + 0.15) eastClusters.push({ min: value, max: value })
    else cluster.max = value
  }

  const junctions = [
    // 门口墙两个角（房间在缝的 +x / ±z 侧）
    [x0, z0, 1, 1],
    [x0, z1, 1, -1],
    // 柱面与南/北墙的交角（房间在缝的 -x 侧）
    [x1, z0, -1, 1],
    [x1, z1, -1, -1],
  ]

  // 凹墙与柱子回转面的交角（凹墙比柱面退 >0.3m 才存在）
  const recessedCluster = eastClusters.find((cluster) => cluster.min > x1 + 0.3)
  if (recessedCluster) {
    const recessedSeam = recessedCluster.max
    const probeX = recessedSeam - 0.3
    const returnSouth = castAxis(0, -1, [new THREE.Vector3(probeX, eyeHeight, cz)])
    const returnNorth = castAxis(0, 1, [new THREE.Vector3(probeX, eyeHeight, cz)])
    if (returnSouth.length) junctions.push([recessedSeam, returnSouth[0], -1, 1])
    if (returnNorth.length) junctions.push([recessedSeam, returnNorth[0], -1, -1])
  }

  return {
    junctions: junctions.slice(0, MAX_JUNCTIONS).map(([x, z, fx, fz]) => new THREE.Vector4(x, z, fx, fz)),
    yBottom: fallbackBox.min.y,
    yTop: fallbackBox.max.y - 0.14,
  }
}

export function TechHallCornerShadows({ scene, worldLayout }) {
  const techHall = worldLayout?.halls?.find((hall) => hall.id === 'tech')

  return (
    <HallCornerShadows
      scene={scene}
      hallEntry={techHall}
      wallMaterialNames={WALL_MATERIAL_NAMES}
      measureJunctions={measureJunctions}
      debugKey="__techCornerShadows"
      layerSeamTolerance={0.2}
    />
  )
}
