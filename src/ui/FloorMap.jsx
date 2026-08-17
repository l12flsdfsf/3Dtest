import { HALLS, getHallWorldWall } from '../data/halls.js'
import { CONFIG } from '../data/config.js'

const SIZE = 280
const FRAME_INSET = 2
const MAP_INSET = FRAME_INSET
const MAP_RADIUS = 12
const DRAW_SIZE = SIZE - MAP_INSET * 2
const scale = DRAW_SIZE / CONFIG.hall.width
const halfW = CONFIG.hall.width / 2
const halfD = CONFIG.hall.depth / 2
const corridorHalf = CONFIG.hall.corridorHalf ?? 4
const roomHalf = CONFIG.hall.width / 6
const CURRENT_MARKER_OFFSET = { x: 0, y: -22 }
const MAP_CLIP_ID = 'floor-map-shape'
const EDGE_KEY_PRECISION = 1000

const sx = (z) => MAP_INSET + (z + halfD) * scale
const sy = (x) => MAP_INSET + (x + halfW) * scale

function buildRooms() {
  return HALLS.map((hall) => {
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

function buildRoomEdges(room) {
  const left = room.x
  const right = room.x + room.w
  const top = room.y
  const bottom = room.y + room.h

  return [
    { x1: left, y1: top, x2: right, y2: top },
    { x1: right, y1: top, x2: right, y2: bottom },
    { x1: left, y1: bottom, x2: right, y2: bottom },
    { x1: left, y1: top, x2: left, y2: bottom },
  ]
}

function buildEdgeKey({ x1, y1, x2, y2 }) {
  const start = `${Math.round(x1 * EDGE_KEY_PRECISION)},${Math.round(y1 * EDGE_KEY_PRECISION)}`
  const end = `${Math.round(x2 * EDGE_KEY_PRECISION)},${Math.round(y2 * EDGE_KEY_PRECISION)}`
  return start < end ? `${start}:${end}` : `${end}:${start}`
}

function isOuterEdge(edge) {
  const left = FRAME_INSET
  const right = SIZE - FRAME_INSET
  const top = FRAME_INSET
  const bottom = SIZE - FRAME_INSET

  return (
    (edge.x1 === left && edge.x2 === left) ||
    (edge.x1 === right && edge.x2 === right) ||
    (edge.y1 === top && edge.y2 === top) ||
    (edge.y1 === bottom && edge.y2 === bottom)
  )
}

function buildInteriorEdges(rooms) {
  const edges = new Map()

  rooms.forEach((room) => {
    buildRoomEdges(room).forEach((edge) => {
      if (isOuterEdge(edge)) return
      edges.set(buildEdgeKey(edge), edge)
    })
  })

  return Array.from(edges.values())
}

function getMarkerAnchor(currentHall, roomById) {
  const room = roomById[currentHall?.id ?? 'corridor']
  if (room) return { cx: room.cx, cy: room.cy }

  if (currentHall?.id === 'entrance') return { cx: sx(0), cy: sy(halfW - 3) }
  return { cx: sx(0), cy: sy(0) }
}

export function FloorMap({ currentHall, onHallClick }) {
  const id = currentHall?.id ?? 'corridor'
  const rooms = buildRooms()
  const roomById = Object.fromEntries(rooms.map((room) => [room.id, room]))
  const interiorEdges = buildInteriorEdges(rooms)
  const currentRoom = roomById[id]
  const currentEdgeKeys = new Set(
    currentRoom ? buildRoomEdges(currentRoom).filter((edge) => !isOuterEdge(edge)).map(buildEdgeKey) : [],
  )
  const anchor = getMarkerAnchor(currentHall, roomById)
  const markerX = anchor.cx + CURRENT_MARKER_OFFSET.x
  const markerY = anchor.cy + CURRENT_MARKER_OFFSET.y

  const handleRoomClick = (hallId, event) => {
    event.preventDefault()
    event.stopPropagation()
    if (onHallClick && hallId !== id) {
      onHallClick(hallId)
    }
  }

  return (
    <div
      className='relative mx-auto'
      style={{ height: 'min(48vh, 480px)', aspectRatio: '1 / 1' }}
    >
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className='absolute inset-0 h-full w-full'
        role='img'
        aria-label={'\u5c55\u5385\u5e73\u9762\u56fe'}
      >
        <defs>
          <clipPath id={MAP_CLIP_ID}>
            <rect
              x={FRAME_INSET}
              y={FRAME_INSET}
              width={SIZE - FRAME_INSET * 2}
              height={SIZE - FRAME_INSET * 2}
              rx={MAP_RADIUS}
            />
          </clipPath>
        </defs>

        <g clipPath={`url(#${MAP_CLIP_ID})`}>
          <rect
            x={FRAME_INSET}
            y={FRAME_INSET}
            width={SIZE - FRAME_INSET * 2}
            height={SIZE - FRAME_INSET * 2}
            fill='#ffffff'
          />

          <rect
            x={sx(-corridorHalf)}
            y={MAP_INSET}
            width={sx(corridorHalf) - sx(-corridorHalf)}
            height={DRAW_SIZE}
            fill='#eef2f7'
            opacity={0.5}
          />

          {rooms.map((room) => {
            const here = id === room.id
            const isClickable = onHallClick && !here

            return (
              <g key={room.id}>
                <rect
                  x={room.x}
                  y={room.y}
                  width={room.w}
                  height={room.h}
                  fill={here ? '#dbeafe' : '#ffffff'}
                  fillOpacity={here ? 0.9 : 0.7}
                />
                {/* ¿Éµã»÷ÇøÓò - Í¸Ã÷¾ØÐÎ */}
                {isClickable && (
                  <rect
                    x={room.x}
                    y={room.y}
                    width={room.w}
                    height={room.h}
                    fill='transparent'
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => handleRoomClick(room.id, e)}
                  />
                )}
              </g>
            )
          })}
        </g>

        <rect
          x={FRAME_INSET}
          y={FRAME_INSET}
          width={SIZE - FRAME_INSET * 2}
          height={SIZE - FRAME_INSET * 2}
          rx={MAP_RADIUS}
          fill='none'
          stroke='#cbd5e1'
          strokeWidth={1.5}
        />

        <text
          x={sx(0)}
          y={sy(0)}
          textAnchor='middle'
          dominantBaseline='middle'
          fontSize={11}
          fill='#94a3b8'
        >
          {'\u5c55\u9986\u5927\u5385'}
        </text>

        {interiorEdges.map((edge) => {
          const key = buildEdgeKey(edge)
          const highlighted = currentEdgeKeys.has(key)

          return (
            <line
              key={key}
              x1={edge.x1}
              y1={edge.y1}
              x2={edge.x2}
              y2={edge.y2}
              stroke={highlighted ? '#60a5fa' : '#cbd5e1'}
              strokeWidth={highlighted ? 2 : 1.4}
            />
          )
        })}

        {rooms.map((room) => {
          const here = id === room.id

          return (
            <text
              key={room.id}
              x={room.cx}
              y={room.cy}
              textAnchor='middle'
              dominantBaseline='middle'
              fontSize={12}
              fill='#334155'
              fontWeight={here ? 700 : 600}
              style={{ pointerEvents: 'none' }}
            >
              {room.name}
            </text>
          )
        })}

        <text
          x={sx(0)}
          y={SIZE - 26}
          textAnchor='middle'
          fontSize={11}
          fill='#64748b'
          fontWeight={600}
        >
          {'\u5165\u53e3'}
        </text>
        <path
          d={`M ${sx(0) - 7} ${SIZE - 20} L ${sx(0) + 7} ${SIZE - 20} L ${sx(0)} ${SIZE - 10} Z`}
          fill='#94a3b8'
        />

        <g>
          <circle cx={markerX} cy={markerY} r={11} fill='#2563eb' opacity={0.16} />
          <circle cx={markerX} cy={markerY} r={5} fill='#2563eb' />
        </g>
      </svg>
    </div>
  )
}
