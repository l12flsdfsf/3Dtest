import { HALLS } from '../data/halls.js'
import { CONFIG } from '../data/config.js'

// 展厅俯视平面图：背景为 C-3.png，上方叠加按真实几何生成的分厅 / 走廊 / 入口，
// 并以蓝色圆点标记当前区域（圆点置于名称上方，避免遮挡文字）。方向：入口（+x）在下方。
const SIZE = 280
const scale = SIZE / CONFIG.hall.width
const halfW = CONFIG.hall.width / 2
const halfD = CONFIG.hall.depth / 2
const corridorHalf = CONFIG.hall.corridorHalf ?? 4
const roomHalf = CONFIG.hall.width / 6

// 入口在 +x（右墙）→ 按要求「入口在下面」，故世界 +x 映射到 svg 底部。
const sx = (z) => (z + halfD) * scale // 世界 z → 水平
const sy = (x) => (x + halfW) * scale // 世界 x → 垂直（+x 在底）

const ROOMS = HALLS.map((hall) => {
  const isFront = hall.wall === 'front'
  const zNear = isFront ? corridorHalf : -halfD
  const zFar = isFront ? halfD : -corridorHalf
  const left = sx(Math.min(zNear, zFar))
  const right = sx(Math.max(zNear, zFar))
  const top = sy(hall.center - roomHalf)
  const bottom = sy(hall.center + roomHalf)
  return {
    id: hall.id,
    name: hall.name,
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
    cx: (left + right) / 2,
    cy: (top + bottom) / 2,
  }
})

const ROOM_BY_ID = Object.fromEntries(ROOMS.map((room) => [room.id, room]))

const ANCHORS = {
  corridor: { cx: sx(0), cy: sy(0), label: '中央走廊' },
  entrance: { cx: sx(0), cy: sy(halfW - 3), label: '主入口' },
}

export function FloorMap({ currentHall }) {
  const id = currentHall?.id ?? 'corridor'
  const room = ROOM_BY_ID[id]
  const anchor = room
    ? { cx: room.cx, cy: room.cy, label: room.name }
    : ANCHORS[id] ?? ANCHORS.corridor

  return (
    <div
      className="relative mx-auto"
      style={{ height: 'min(48vh, 480px)', aspectRatio: '1 / 1' }}
    >
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="absolute inset-0 h-full w-full" role="img" aria-label="展厅平面图">
        {/* 外轮廓 */}
        <rect x={2} y={2} width={SIZE - 4} height={SIZE - 4} rx={12} fill="none" stroke="#cbd5e1" strokeWidth={1.5} />

        {/* 中央走廊（纵向带） */}
        <rect
          x={sx(-corridorHalf)}
          y={2}
          width={sx(corridorHalf) - sx(-corridorHalf)}
          height={SIZE - 4}
          fill="#eef2f7"
          opacity={0.5}
        />
        <text x={sx(0)} y={sy(0)} textAnchor="middle" dominantBaseline="middle" fontSize={11} fill="#94a3b8">
          中央走廊
        </text>

        {/* 六个分厅 */}
        {ROOMS.map((r) => {
          const here = id === r.id
          return (
            <g key={r.id}>
              <rect
                x={r.x + 3}
                y={r.y + 3}
                width={r.w - 6}
                height={r.h - 6}
                rx={7}
                fill={here ? '#dbeafe' : '#ffffff'}
                fillOpacity={here ? 0.85 : 0.62}
                stroke={here ? '#60a5fa' : '#cbd5e1'}
                strokeWidth={here ? 2 : 1.4}
              />
              <text x={r.cx} y={r.cy} textAnchor="middle" dominantBaseline="middle" fontSize={12} fill="#334155" fontWeight={600}>
                {r.name}
              </text>
            </g>
          )
        })}

        {/* 主入口（底部） */}
        <text x={sx(0)} y={SIZE - 26} textAnchor="middle" fontSize={11} fill="#64748b" fontWeight={600}>
          入口
        </text>
        <path d={`M ${sx(0) - 7} ${SIZE - 20} L ${sx(0) + 7} ${SIZE - 20} L ${sx(0)} ${SIZE - 10} Z`} fill="#94a3b8" />

        {/* 当前位置标记：圆点置于区域名称上方，避免遮挡文字 */}
        <g>
          <circle cx={anchor.cx} cy={anchor.cy - 22} r={11} fill="#2563eb" opacity={0.16} />
          <circle cx={anchor.cx} cy={anchor.cy - 22} r={5} fill="#2563eb" />
        </g>
      </svg>
    </div>
  )
}
