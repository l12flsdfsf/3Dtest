import { CONFIG } from './config.js'

const WALL_INNER_X = -CONFIG.hall.width / 2 + CONFIG.hall.wallThickness / 2 // 后墙内表面 ≈ -11.88

// 后墙嵌入式展柜（壁龛）：开口与墙面齐平、向墙内凹陷，内部为多层搁板的网格陈列。
// Hall.jsx 依此在后墙上预留同尺寸开口；TrophyDisplay 依此构建展柜与奖杯网格。
export const TROPHY_NICHE = {
  frontX: WALL_INNER_X,
  backX: WALL_INNER_X - 0.5,
  zMin: -2.8,
  zMax: 2.8,
  yBottom: 0.45,
  yTop: 2.55,
  rows: 3, // 搁板层数（行）
  cols: 4, // 每层个数（列）
}

const NICHE_MID_X = (TROPHY_NICHE.frontX + TROPHY_NICHE.backX) / 2
const ROW_H = (TROPHY_NICHE.yTop - TROPHY_NICHE.yBottom) / TROPHY_NICHE.rows
const CELL_W = (TROPHY_NICHE.zMax - TROPHY_NICHE.zMin) / TROPHY_NICHE.cols

// 每行搁板的 y（奖杯底座放在此面）
export const TROPHY_SHELF_YS = Array.from({ length: TROPHY_NICHE.rows }, (_, r) => TROPHY_NICHE.yBottom + r * ROW_H)

// 网格生成奖杯占位：name/caption 为占位，后续替换为真实内容与 3D 模型。
// 调整 rows/cols 即可改变网格密度。
const TROPHIES = []
for (let r = 0; r < TROPHY_NICHE.rows; r += 1) {
  for (let c = 0; c < TROPHY_NICHE.cols; c += 1) {
    const n = r * TROPHY_NICHE.cols + c + 1
    TROPHIES.push({
      id: `trophy-${n}`,
      name: `奖杯 ${n}`,
      row: r,
      col: c,
      caption: '奖杯占位：后续替换为真实 3D 奖杯模型与说明文字。',
      position: [NICHE_MID_X, TROPHY_SHELF_YS[r], TROPHY_NICHE.zMin + (c + 0.5) * CELL_W],
    })
  }
}

export { TROPHIES }
