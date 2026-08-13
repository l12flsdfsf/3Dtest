import { HALLS, getHallWorldWall, normalizeWorldPositionToHallLayout } from '../data/halls.js'
import { CONFIG } from '../data/config.js'

const SIZE = 280
const scale = SIZE / CONFIG.hall.width
const halfW = CONFIG.hall.width / 2
const halfD = CONFIG.hall.depth / 2
const corridorHalf = CONFIG.hall.corridorHalf ?? 4
const roomHalf = CONFIG.hall.width / 6
const CURRENT_MARKER_OFFSET = { x: 0, y: -22 }

const sx = (z) => (z + halfD) * scale
const sy = (x) => (x + halfW) * scale

function buildRooms(worldLayout) {
  const layoutRooms = new Map((worldLayout?.halls ?? []).map((hall) => [hall.id, hall]))

  return HALLS.map((hall) => {
    const layoutRoom = layoutRooms.get(hall.id)

    if (layoutRoom) {
      const isRightSide = layoutRoom.z >= 0
      const zNear = isRightSide ? corridorHalf : -halfD
      const zFar = isRightSide ? halfD : -corridorHalf
      const left = sx(Math.min(zNear, zFar))
      const right = sx(Math.max(zNear, zFar))
      const top = sy(layoutRoom.x - roomHalf)
      const bottom = sy(layoutRoom.x + roomHalf)

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
    }

    const worldWall = getHallWorldWall(hall)
    const isRightSide = worldWall === 'front'
    const zNear = isRightSide ? corridorHalf : -halfD
    const zFar = isRightSide ? halfD : -corridorHalf
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
}

function getMarkerAnchor(currentHall, roomById) {
  const normalized = currentHall?.playerWorld
    ? normalizeWorldPositionToHallLayout(
        currentHall.playerWorld.x,
        currentHall.playerWorld.z,
        currentHall.worldLayout,
      )
    : null

  if (normalized) {
    return {
      cx: sx(normalized.z),
      cy: sy(normalized.x),
    }
  }

  const room = roomById[currentHall?.id ?? 'corridor']
  if (room) return { cx: room.cx, cy: room.cy }

  if (currentHall?.id === 'entrance') return { cx: sx(0), cy: sy(halfW - 3) }
  return { cx: sx(0), cy: sy(0) }
}

export function FloorMap({ currentHall }) {
  const id = currentHall?.id ?? 'corridor'
  const rooms = buildRooms(currentHall?.worldLayout)
  const roomById = Object.fromEntries(rooms.map((room) => [room.id, room]))
  const anchor = getMarkerAnchor(currentHall, roomById)
  const markerX = anchor.cx + CURRENT_MARKER_OFFSET.x
  const markerY = anchor.cy + CURRENT_MARKER_OFFSET.y

  return (
    <div
      className="relative mx-auto"
      style={{ height: 'min(48vh, 480px)', aspectRatio: '1 / 1' }}
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="absolute inset-0 h-full w-full"
        role="img"
        aria-label={'\u5c55\u5385\u5e73\u9762\u56fe'}
      >
        <rect
          x={2}
          y={2}
          width={SIZE - 4}
          height={SIZE - 4}
          rx={12}
          fill="none"
          stroke="#cbd5e1"
          strokeWidth={1.5}
        />

        <rect
          x={sx(-corridorHalf)}
          y={2}
          width={sx(corridorHalf) - sx(-corridorHalf)}
          height={SIZE - 4}
          fill="#eef2f7"
          opacity={0.5}
        />
        <text
          x={sx(0)}
          y={sy(0)}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
          fill="#94a3b8"
        >
          {'\u4e2d\u592e\u8d70\u5eca'}
        </text>

        {rooms.map((room) => {
          const here = id === room.id

          return (
            <g key={room.id}>
              <rect
                x={room.x + 3}
                y={room.y + 3}
                width={room.w - 6}
                height={room.h - 6}
                rx={7}
                fill={here ? '#dbeafe' : '#ffffff'}
                fillOpacity={here ? 0.85 : 0.62}
                stroke={here ? '#60a5fa' : '#cbd5e1'}
                strokeWidth={here ? 2 : 1.4}
              />
              <text
                x={room.cx}
                y={room.cy}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={12}
                fill="#334155"
                fontWeight={600}
              >
                {room.name}
              </text>
            </g>
          )
        })}

        <text
          x={sx(0)}
          y={SIZE - 26}
          textAnchor="middle"
          fontSize={11}
          fill="#64748b"
          fontWeight={600}
        >
          {'\u5165\u53e3'}
        </text>
        <path
          d={`M ${sx(0) - 7} ${SIZE - 20} L ${sx(0) + 7} ${SIZE - 20} L ${sx(0)} ${SIZE - 10} Z`}
          fill="#94a3b8"
        />

        <g>
          <circle cx={markerX} cy={markerY} r={11} fill="#2563eb" opacity={0.16} />
          <circle cx={markerX} cy={markerY} r={5} fill="#2563eb" />
        </g>
      </svg>
    </div>
  )
}
