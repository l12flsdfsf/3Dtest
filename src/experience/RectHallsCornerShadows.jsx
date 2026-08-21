import { HallCornerShadows, makeRectangularMeasureJunctions } from './HallCornerShadows.jsx'

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

export function RectHallsCornerShadows({ scene, worldLayout }) {
  return (
    <>
      {RECT_HALLS.map((hall) => (
        <HallCornerShadows
          key={hall.id}
          scene={scene}
          hallEntry={worldLayout?.halls?.find((entry) => entry.id === hall.id)}
          wallMaterialNames={hall.wallMaterialNames}
          measureJunctions={RECT_MEASURE}
          debugKey={hall.debugKey}
        />
      ))}
    </>
  )
}
