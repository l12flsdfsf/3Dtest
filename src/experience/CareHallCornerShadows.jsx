import * as THREE from 'three'
import { HallCornerShadows } from './HallCornerShadows.jsx'

// 构成关怀厅「可见内墙面」的材质（实测 scene-0817）：
// - 关怀厅：pCube35 墙体（外墙 x=-22.58 / 门墙 x=-10.27，含天花檐口带 pCube35002）
// - 关怀厅板：pCube31 展板带（南/北墙中段 y 1.22~4.21，比结构墙面凸出 ~8cm）
// 不能碰 白墙（贯穿全馆的外壳）、玻璃/展柜材质（墙前一圈展柜）与照片材质
// （材质.NNN 系列，照片不压暗）。
const WALL_MATERIAL_NAMES = ['关怀厅', '关怀厅板']

// 与技术设备厅的差异（实测 scene-0817）：
// - 四个角都是普通矩形角——没有柱子、没有凹墙，量 4 条缝就够；
// - 但墙前一圈展柜（白柜 0~1.02m + 玻璃柜 1.02~1.88m，沿西/南/北墙）挡住低处，
//   探针打 y=2.6（柜顶之上、天花檐口之下），技术设备厅的 1.6 在这里会打到柜子；
// - 门墙（东 x=-10.27）中段是门洞（z≈14.5~18），穿洞射线会飞到走廊对面
//   展望厅的玻璃（x≈21）——超距过滤丢弃，不能像技术设备厅那样靠 min 兜底
//   （厅内东北角有高家具，min 会误取）。
// 量法（只对墙面网格打射线）：
// 1) 南/北墙平面：厅内中线附近垂直打。墙面双层（展板带/照片在前、结构墙在后
//    ~8-10cm），与技术设备厅同理取每条射线前 3 个命中的最外层，让两层都落在缝内；
// 2) 东/西：中段偏移 + 南北贴角各补一条，同样取最外层；
// 3) 超距过滤：墙面离厅中心最远 ~7m（可行走边界 worldMaxX=-12.19 比真门墙内收
//    ~2m，别拿边界当墙），走廊对面 ~38m，以 15m 分界；
// 4) 四条缝记为 (缝x, 缝z, x朝向, z朝向)，朝向=房间在缝的哪一侧（±1）。
const PROBE_HEIGHT = 2.6
const MAX_WALL_DISTANCE = 15

function measureJunctions(meshes, fallbackBox, hallEntry) {
  const raycaster = new THREE.Raycaster()
  raycaster.far = 40
  const cx = (hallEntry.worldMinX + hallEntry.worldMaxX) / 2
  const cz = (hallEntry.worldMinZ + hallEntry.worldMaxZ) / 2
  const halfX = (hallEntry.worldMaxX - hallEntry.worldMinX) / 2
  const halfZ = (hallEntry.worldMaxZ - hallEntry.worldMinZ) / 2
  const midOffsets = [-0.42, -0.21, 0, 0.21, 0.42]

  // 每条射线取前 depth 个命中里贴近首命中的层（容差 0.3m），再丢弃超距命中
  const castAxisDeep = (dirX, dirZ, origins, depth) => {
    const values = []
    for (const origin of origins) {
      raycaster.set(origin, new THREE.Vector3(dirX, 0, dirZ))
      const hits = raycaster.intersectObjects(meshes, false).slice(0, depth)
      if (!hits.length) continue
      const primary = dirX !== 0 ? hits[0].point.x : hits[0].point.z
      const center = dirX !== 0 ? cx : cz
      for (const hit of hits) {
        const value = dirX !== 0 ? hit.point.x : hit.point.z
        if (Math.abs(value - primary) <= 0.3 && Math.abs(value - center) <= MAX_WALL_DISTANCE) {
          values.push(value)
        }
      }
    }
    return values
  }

  // 1) 南/北墙平面
  const southHits = castAxisDeep(
    0,
    -1,
    midOffsets.map((t) => new THREE.Vector3(cx + t * halfX, PROBE_HEIGHT, cz)),
    3,
  )
  const northHits = castAxisDeep(
    0,
    1,
    midOffsets.map((t) => new THREE.Vector3(cx + t * halfX, PROBE_HEIGHT, cz)),
    3,
  )
  // 南墙取最小 z（最外层）、北墙取最大 z，展板带与结构墙都在缝内侧
  const z0 = southHits.length ? Math.min(...southHits) : fallbackBox.min.z + 0.12
  const z1 = northHits.length ? Math.max(...northHits) : fallbackBox.max.z - 0.12

  // 2) 东/西：中段偏移 + 贴角（z0/z1 各内收 0.5m，贴角段总有墙）
  const zForX = [...midOffsets.map((t) => cz + t * halfZ), z0 + 0.5, z1 - 0.5]
  const westHits = castAxisDeep(
    -1,
    0,
    zForX.map((z) => new THREE.Vector3(cx, PROBE_HEIGHT, z)),
    3,
  )
  const eastHits = castAxisDeep(
    1,
    0,
    zForX.map((z) => new THREE.Vector3(cx, PROBE_HEIGHT, z)),
    3,
  )
  const x0 = westHits.length ? Math.min(...westHits) : fallbackBox.min.x + 0.12
  const x1 = eastHits.length ? Math.max(...eastHits) : fallbackBox.max.x - 0.12

  const junctions = [
    // 外墙两个角（房间在缝的 +x 侧）
    [x0, z0, 1, 1],
    [x0, z1, 1, -1],
    // 门墙两个角（房间在缝的 -x 侧）
    [x1, z0, -1, 1],
    [x1, z1, -1, -1],
  ]

  return {
    junctions: junctions.map(([x, z, fx, fz]) => new THREE.Vector4(x, z, fx, fz)),
    yBottom: fallbackBox.min.y,
    yTop: fallbackBox.max.y - 0.14,
  }
}

export function CareHallCornerShadows({ scene, worldLayout }) {
  const careHall = worldLayout?.halls?.find((hall) => hall.id === 'care')

  return (
    <HallCornerShadows
      scene={scene}
      hallEntry={careHall}
      wallMaterialNames={WALL_MATERIAL_NAMES}
      measureJunctions={measureJunctions}
      debugKey="__careCornerShadows"
    />
  )
}
