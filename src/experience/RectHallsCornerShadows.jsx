import { useMemo } from 'react'
import * as THREE from 'three'
import { HallCornerShadows, makeRectangularMeasureJunctions } from './HallCornerShadows.jsx'
import { WALL_MATERIAL_NAMES as TECH_HALL_WALL_MATERIALS } from './TechHallCornerShadows.jsx'
import { WALL_MATERIAL_NAMES as CARE_HALL_WALL_MATERIALS } from './CareHallCornerShadows.jsx'
import { MAIN_HALL_MATERIALS } from './MainHallCornerShadows.jsx'

// 其余四厅的墙角暗角（实测 scene-0817）：广播/电视/电影/展望都是无柱矩形
// 四角——各轴墙面命中都是单簇，没有技术设备厅那种柱面+凹墙双簇（21.56/22.58），
// 所以统一走关怀厅的矩形量法。
// - 探针 y=1.6：四厅墙面在 1.6/2.6 两高度命中一致，墙前没有关怀厅那种
//   1.88m 高的通长展柜；
// - 门洞：广播/电视在东墙（A 排），电影/展望在西墙（B 排），穿洞射线对
//   厅名材质网格直接落空，量法里的超距过滤再兜一层；
// - 各厅「可见内墙面」材质：
//   广播厅(网格082 墙体)+广播厅金属(pCube200 墙面金属带 y0.52~5.01)；
//   电视厅(pCube130 墙体)+电视厅海报版(pCube161 y1.54~5.07)；
//   电影厅(polySurface78001 墙体)+电影厅海豹板(polySurface123 y0.92~3.79)；
//   展望厅(pCube166 单层墙体)。
//   展台/展柜/地板/灯等家具材质不纳入（技术设备厅的教训：不往家具上做暗角）。
// 顶部:四厅角部无灯,暗带直通天花(topGap=0、淡出收窄)——
// 关怀厅顶上有灯才留空档,别把那截缺口带到这四厅来
const RECT_MEASURE = makeRectangularMeasureJunctions({ probeHeight: 1.6, topGap: 0, verticalFadeOut: 0.12 })

const RECT_HALLS = [
  { id: 'broadcast', wallMaterialNames: ['广播厅', '广播厅金属'], debugKey: '__broadcastCornerShadows' },
  { id: 'tv', wallMaterialNames: ['电视厅', '电视厅海报版'], debugKey: '__tvCornerShadows' },
  { id: 'cinema', wallMaterialNames: ['电影厅', '电影厅海豹板'], debugKey: '__cinemaCornerShadows' },
  { id: 'future', wallMaterialNames: ['展望厅'], debugKey: '__futureCornerShadows' },
]

// 材质名匹配不上时的几何 fallback：按厅边界（worldLayout 的可行走边界外扩
// HALL_BOUND_PADDING）收集贴边的高墙面——高度 ≥1.8m、顶 ≥2.8m、跨度 ≥1.2m，
// 且包围盒碰厅某一侧边界。fallback 命中的墙面直接给当前材质打 shader，
// 后续 JSON 换材质名也不受影响。
const HALL_BOUND_PADDING = 0.35
const WALL_BOUNDARY_TOLERANCE = 0.55
const MIN_WALL_HEIGHT = 1.8
const MIN_WALL_TOP = 2.8
const MIN_WALL_SPAN = 1.2

// 厅与厅相邻（关怀↔广播共享 z≈10.3 墙、技术设备↔展望边界重叠、大厅外壳
// 贴每个厅的边），本组件挂载在 Tech/Care 之后——fallback 若把这些厅已按
// 材质认领的墙也收进来，后打的 clone 会覆盖它们的 junctions，表现为那些厅
// 的墙角暗角消失。fallback 只兜「材质没被任何厅认领」的墙。白墙是贯穿
// 全馆的外壳，任何厅都不能碰（技术设备厅的教训）。
const FOREIGN_HALL_MATERIALS = new Set([
  ...TECH_HALL_WALL_MATERIALS,
  ...CARE_HALL_WALL_MATERIALS,
  ...MAIN_HALL_MATERIALS,
  '白墙',
])

function makeBoundaryWallFilter(hallEntry) {
  if (!hallEntry) return null

  return function isBoundaryWall(object) {
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    if (materials.some((material) => FOREIGN_HALL_MATERIALS.has(material?.name))) return false

    const box = new THREE.Box3().setFromObject(object)
    if (box.isEmpty()) return false

    if (
      box.max.x < hallEntry.worldMinX - HALL_BOUND_PADDING ||
      box.min.x > hallEntry.worldMaxX + HALL_BOUND_PADDING ||
      box.max.z < hallEntry.worldMinZ - HALL_BOUND_PADDING ||
      box.min.z > hallEntry.worldMaxZ + HALL_BOUND_PADDING
    ) {
      return false
    }

    const size = box.getSize(new THREE.Vector3())
    if (size.y < MIN_WALL_HEIGHT || box.max.y < MIN_WALL_TOP) return false
    if (Math.max(size.x, size.z) < MIN_WALL_SPAN) return false

    const touchesWest =
      box.min.x <= hallEntry.worldMinX + WALL_BOUNDARY_TOLERANCE &&
      box.max.x >= hallEntry.worldMinX - WALL_BOUNDARY_TOLERANCE
    const touchesEast =
      box.min.x <= hallEntry.worldMaxX + WALL_BOUNDARY_TOLERANCE &&
      box.max.x >= hallEntry.worldMaxX - WALL_BOUNDARY_TOLERANCE
    const touchesSouth =
      box.min.z <= hallEntry.worldMinZ + WALL_BOUNDARY_TOLERANCE &&
      box.max.z >= hallEntry.worldMinZ - WALL_BOUNDARY_TOLERANCE
    const touchesNorth =
      box.min.z <= hallEntry.worldMaxZ + WALL_BOUNDARY_TOLERANCE &&
      box.max.z >= hallEntry.worldMaxZ - WALL_BOUNDARY_TOLERANCE

    return touchesWest || touchesEast || touchesSouth || touchesNorth
  }
}

function RectHallCornerShadow({ hall, hallEntry, scene }) {
  const fallbackMeshFilter = useMemo(() => makeBoundaryWallFilter(hallEntry), [hallEntry])

  return (
    <HallCornerShadows
      scene={scene}
      hallEntry={hallEntry}
      wallMaterialNames={hall.wallMaterialNames}
      measureJunctions={RECT_MEASURE}
      debugKey={hall.debugKey}
      fallbackMeshFilter={fallbackMeshFilter}
    />
  )
}

export function RectHallsCornerShadows({ scene, worldLayout }) {
  return (
    <>
      {RECT_HALLS.map((hall) => {
        const hallEntry = worldLayout?.halls?.find((entry) => entry.id === hall.id)

        return (
          <RectHallCornerShadow
            key={hall.id}
            scene={scene}
            hall={hall}
            hallEntry={hallEntry}
          />
        )
      })}
    </>
  )
}
