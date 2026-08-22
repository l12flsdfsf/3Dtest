import { HallCornerShadows, makeRectangularMeasureJunctions } from './HallCornerShadows.jsx'

// 构成关怀厅「可见内墙面」的材质（实测 scene-0817）：
// - 关怀厅：pCube35 墙体（外墙 x=-22.58 / 门墙 x=-10.27，含天花檐口带 pCube35002）
// - 关怀厅板：pCube31 展板带（南/北墙中段 y 1.22~4.21，比结构墙面凸出 ~8cm）
// 不能碰 白墙（贯穿全馆的外壳）、玻璃/展柜材质（墙前一圈展柜）与照片材质
// （材质.NNN 系列，照片不压暗）。
// 导出给 RectHallsCornerShadows 的边界 fallback 做跨厅排除。
export const WALL_MATERIAL_NAMES = ['关怀厅', '关怀厅板']

// 与技术设备厅及其余四厅的差异（实测 scene-0817）：
// - 四个角都是普通矩形角——没有柱子、没有凹墙，量 4 条缝就够（共用
//   makeRectangularMeasureJunctions，量法注释见 HallCornerShadows.jsx）；
// - 但墙前一圈展柜（白柜 0~1.02m + 玻璃柜 1.02~1.88m，沿西/南/北墙）挡住低处，
//   探针打 y=2.6（柜顶之上、天花檐口之下），其它厅的 1.6 在这里会打到柜子；
// - 门墙（东 x=-10.27）中段是门洞（z≈14.5~18），穿洞射线会飞到走廊对面
//   展望厅的玻璃——量法的超距过滤兜底（厅内东北角有高家具，min/max 会误取）；
// - 可行走边界 worldMaxX=-12.19 比真门墙（-10.27）内收 ~2m，别拿边界当墙。
export const CARE_HALL_MEASURE_JUNCTIONS = makeRectangularMeasureJunctions({ probeHeight: 2.6 })

export function CareHallCornerShadows({ scene, worldLayout }) {
  const careHall = worldLayout?.halls?.find((hall) => hall.id === 'care')

  return (
    <HallCornerShadows
      scene={scene}
      hallEntry={careHall}
      wallMaterialNames={WALL_MATERIAL_NAMES}
      measureJunctions={CARE_HALL_MEASURE_JUNCTIONS}
      debugKey="__careCornerShadows"
      cornerRadius={0.55}
      cornerStrength={0.4}
    />
  )
}
