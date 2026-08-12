import { useMemo } from 'react'
import * as THREE from 'three'
import { CONFIG } from '../data/config.js'
import { HALLS, LOCAL_ANCHORS } from '../data/halls.js'
import { TROPHY_NICHE } from '../data/trophies.js'

const FLOOR_GUIDE_TEXTURE_VERSION = '2026-08-12-floor-guides-v3'

function toCanvas(size, width, depth, x, z) {
  return [((x / width) + 0.5) * size, (0.5 - z / depth) * size]
}

function drawFlowLine(ctx, size, width, depth, points, color, glow, lineWidth) {
  const mapped = points.map(([x, z]) => toCanvas(size, width, depth, x, z))

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const drawSmoothPath = () => {
    if (mapped.length < 2) return
    ctx.beginPath()
    ctx.moveTo(mapped[0][0], mapped[0][1])

    for (let i = 0; i < mapped.length - 1; i += 1) {
      const [x0, y0] = mapped[i]
      const [x1, y1] = mapped[i + 1]
      const midX = (x0 + x1) / 2
      const midY = (y0 + y1) / 2

      if (i === 0) {
        ctx.quadraticCurveTo(x0, y0, midX, midY)
      } else {
        ctx.quadraticCurveTo(x0, y0, midX, midY)
      }
    }

    const [lastX, lastY] = mapped[mapped.length - 1]
    ctx.lineTo(lastX, lastY)
  }

  ctx.strokeStyle = glow
  ctx.lineWidth = lineWidth * 1.18
  ctx.shadowColor = glow
  ctx.shadowBlur = lineWidth * 0.34
  drawSmoothPath()
  ctx.stroke()

  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.shadowBlur = 0
  drawSmoothPath()
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255,255,255,0.28)'
  ctx.lineWidth = Math.max(1.2, lineWidth * 0.12)
  drawSmoothPath()
  ctx.stroke()

  ctx.restore()
}

function drawArrow(ctx, size, width, depth, x, z, angle, color, arrowSize = 48) {
  const [px, py] = toCanvas(size, width, depth, x, z)
  const tailX = -arrowSize * 0.76
  const headBaseX = arrowSize * 0.08
  const tipX = arrowSize * 0.74
  const wingY = arrowSize * 0.25
  const haloWidth = Math.max(3, arrowSize * 0.16)
  const shaftWidth = Math.max(1.8, arrowSize * 0.09)

  const drawHead = (scale = 1) => {
    ctx.beginPath()
    ctx.moveTo(tipX * scale, 0)
    ctx.lineTo(headBaseX * scale, -wingY * scale)
    ctx.lineTo(headBaseX * scale, wingY * scale)
    ctx.closePath()
  }

  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(angle)

  ctx.lineCap = 'round'

  ctx.strokeStyle = 'rgba(15,23,42,0.22)'
  ctx.lineWidth = haloWidth
  ctx.beginPath()
  ctx.moveTo(tailX, 0)
  ctx.lineTo(headBaseX, 0)
  ctx.stroke()

  ctx.fillStyle = 'rgba(15,23,42,0.16)'
  drawHead(1.16)
  ctx.fill()

  ctx.strokeStyle = color
  ctx.lineWidth = shaftWidth
  ctx.beginPath()
  ctx.moveTo(tailX, 0)
  ctx.lineTo(headBaseX, 0)
  ctx.stroke()

  ctx.fillStyle = color
  drawHead()
  ctx.fill()

  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.lineWidth = Math.max(1, arrowSize * 0.04)
  drawHead()
  ctx.stroke()

  ctx.restore()
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min)
}

function drawFineEllipses(ctx, size, { count, tone, alpha, radius, stretch = [0.4, 1.4], margin = 0 }) {
  for (let i = 0; i < count; i += 1) {
    const toneValue = Math.round(randomBetween(tone[0], tone[1]))
    const opacity = randomBetween(alpha[0], alpha[1])
    const rx = randomBetween(radius[0], radius[1])
    const ry = rx * randomBetween(stretch[0], stretch[1])

    ctx.save()
    ctx.translate(randomBetween(margin, size - margin), randomBetween(margin, size - margin))
    ctx.rotate(randomBetween(0, Math.PI))
    ctx.fillStyle = `rgba(${toneValue},${toneValue},${toneValue},${opacity})`
    ctx.beginPath()
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

function useFloorTexture() {
  const { width, depth } = CONFIG.hall

  return useMemo(() => {
    const size = 3072
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#f5f4f1'
    ctx.fillRect(0, 0, size, size)

    const wash = ctx.createLinearGradient(0, 0, size, size)
    wash.addColorStop(0, 'rgba(255,255,255,0.54)')
    wash.addColorStop(0.45, 'rgba(255,255,255,0.14)')
    wash.addColorStop(1, 'rgba(203,213,225,0.08)')
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, size, size)

    const chips = [
      'rgba(203,213,225,0.18)',
      'rgba(148,163,184,0.12)',
      'rgba(226,232,240,0.22)',
      'rgba(196,181,253,0.10)',
      'rgba(45,212,191,0.08)',
    ]
    for (let i = 0; i < 5200; i += 1) {
      const x = Math.random() * size
      const y = Math.random() * size
      const w = 2 + Math.random() * 8
      const h = 1.5 + Math.random() * 5
      const rotation = Math.random() * Math.PI

      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rotation)
      ctx.fillStyle = chips[i % chips.length]
      ctx.fillRect(-w / 2, -h / 2, w, h)
      ctx.restore()
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.10)'
    ctx.lineWidth = 4
    for (let i = 0; i < 10; i += 1) {
      ctx.beginPath()
      ctx.moveTo(size * 0.04, size * (0.16 + i * 0.07))
      ctx.lineTo(size * 0.96, size * (0.12 + i * 0.07))
      ctx.stroke()
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    return texture
  }, [depth, width])
}

function useFloorGuideTexture() {
  const { width, depth } = CONFIG.hall

  return useMemo(() => {
    const size = 3072
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')

    ctx.clearRect(0, 0, size, size)

    drawFlowLine(
      ctx,
      size,
      width,
      depth,
      [
        [10.9, 0],
        [6.1, 0],
        [3.1, 0.95],
        [1.3, 2.6],
        [-2.2, 3.05],
        [-9.8, 3.05],
      ],
      'rgba(41,198,255,0.9)',
      'rgba(41,198,255,0.34)',
      10,
    )
    drawFlowLine(
      ctx,
      size,
      width,
      depth,
      [
        [10.9, 0],
        [6.1, 0],
        [3.1, -0.95],
        [1.3, -2.6],
        [-2.2, -3.05],
        [-9.8, -3.05],
      ],
      'rgba(255,92,168,0.9)',
      'rgba(255,92,168,0.34)',
      10,
    )
    drawFlowLine(
      ctx,
      size,
      width,
      depth,
      [
        [10.9, 0],
        [6.8, 0],
        [3.6, 0],
        [2.1, 0],
      ],
      'rgba(245,158,11,0.88)',
      'rgba(245,158,11,0.28)',
      7,
    )
    drawFlowLine(
      ctx,
      size,
      width,
      depth,
      [
        [-1.9, 3.05],
        [-2.8, 3.75],
        [-4.4, 4.1],
      ],
      'rgba(20,184,166,0.9)',
      'rgba(20,184,166,0.26)',
      5.5,
    )
    drawFlowLine(
      ctx,
      size,
      width,
      depth,
      [
        [-1.9, -3.05],
        [-2.8, -3.75],
        [-4.4, -4.1],
      ],
      'rgba(139,92,246,0.9)',
      'rgba(139,92,246,0.26)',
      5.5,
    )

    drawArrow(ctx, size, width, depth, 9.1, 0, Math.PI, 'rgba(245,158,11,0.96)', 42)
    drawArrow(ctx, size, width, depth, -6.9, 3.05, Math.PI, 'rgba(41,198,255,0.96)', 36)
    drawArrow(ctx, size, width, depth, -6.9, -3.05, Math.PI, 'rgba(255,92,168,0.96)', 36)
    drawArrow(ctx, size, width, depth, -4.05, 4.02, -2.6, 'rgba(20,184,166,0.96)', 28)
    drawArrow(ctx, size, width, depth, -4.05, -4.02, 2.6, 'rgba(139,92,246,0.96)', 28)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 12
    return texture
  }, [depth, width, FLOOR_GUIDE_TEXTURE_VERSION])
}

function useWallMaterialMaps() {
  return useMemo(() => {
    const size = 2048
    const edgeMargin = 80

    const colorCanvas = document.createElement('canvas')
    colorCanvas.width = size
    colorCanvas.height = size
    const colorCtx = colorCanvas.getContext('2d')

    colorCtx.fillStyle = '#f6efe8'
    colorCtx.fillRect(0, 0, size, size)
    drawFineEllipses(colorCtx, size, {
      count: 5400,
      tone: [240, 250],
      alpha: [0.006, 0.016],
      radius: [0.35, 1.1],
      stretch: [0.45, 1.35],
      margin: edgeMargin,
    })
    drawFineEllipses(colorCtx, size, {
      count: 2800,
      tone: [228, 238],
      alpha: [0.004, 0.012],
      radius: [0.45, 1.45],
      stretch: [0.5, 1.45],
      margin: edgeMargin,
    })

    const bumpCanvas = document.createElement('canvas')
    bumpCanvas.width = size
    bumpCanvas.height = size
    const bumpCtx = bumpCanvas.getContext('2d')

    bumpCtx.fillStyle = '#7f7f7f'
    bumpCtx.fillRect(0, 0, size, size)

    drawFineEllipses(bumpCtx, size, {
      count: 5200,
      tone: [124, 132],
      alpha: [0.008, 0.02],
      radius: [0.3, 0.95],
      stretch: [0.45, 1.4],
      margin: edgeMargin,
    })
    drawFineEllipses(bumpCtx, size, {
      count: 1800,
      tone: [120, 136],
      alpha: [0.006, 0.014],
      radius: [0.6, 1.6],
      stretch: [0.5, 1.5],
      margin: edgeMargin,
    })

    const roughnessCanvas = document.createElement('canvas')
    roughnessCanvas.width = size
    roughnessCanvas.height = size
    const roughnessCtx = roughnessCanvas.getContext('2d')

    roughnessCtx.fillStyle = '#dddddd'
    roughnessCtx.fillRect(0, 0, size, size)
    drawFineEllipses(roughnessCtx, size, {
      count: 4200,
      tone: [212, 228],
      alpha: [0.008, 0.018],
      radius: [0.35, 1.2],
      stretch: [0.45, 1.4],
      margin: edgeMargin,
    })
    drawFineEllipses(roughnessCtx, size, {
      count: 1800,
      tone: [194, 210],
      alpha: [0.006, 0.014],
      radius: [0.55, 1.6],
      stretch: [0.5, 1.45],
      margin: edgeMargin,
    })

    const colorMap = new THREE.CanvasTexture(colorCanvas)
    colorMap.colorSpace = THREE.SRGBColorSpace
    colorMap.wrapS = colorMap.wrapT = THREE.ClampToEdgeWrapping
    colorMap.anisotropy = 8

    const bumpMap = new THREE.CanvasTexture(bumpCanvas)
    bumpMap.wrapS = bumpMap.wrapT = THREE.ClampToEdgeWrapping
    bumpMap.anisotropy = 8

    const roughnessMap = new THREE.CanvasTexture(roughnessCanvas)
    roughnessMap.wrapS = roughnessMap.wrapT = THREE.ClampToEdgeWrapping
    roughnessMap.anisotropy = 8

    return { colorMap, bumpMap, roughnessMap }
  }, [])
}

function useSignTexture(name, opts = {}) {
  const { bg = null, color = '#0f172a', height = 160, width = 640, font = '600 72px' } = opts
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')

    ctx.clearRect(0, 0, width, height)
    if (bg) {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, width, height)
    }
    ctx.fillStyle = color
    ctx.font = `${font} "PingFang SC","Microsoft YaHei","Source Han Sans SC",sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(name, width / 2, height / 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    return texture
  }, [name, bg, color, height, width, font])
}

function useLedTexture() {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 384
    const ctx = canvas.getContext('2d')

    const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
    bg.addColorStop(0, '#040506')
    bg.addColorStop(0.5, '#08111a')
    bg.addColorStop(1, '#020304')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.fillStyle = 'rgba(46,163,255,0.14)'
    ctx.fillRect(120, 120, canvas.width - 240, 16)
    ctx.fillRect(120, 248, canvas.width - 240, 16)

    ctx.strokeStyle = 'rgba(103,232,249,0.24)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(80, canvas.height * 0.58)
    ctx.bezierCurveTo(
      canvas.width * 0.28,
      canvas.height * 0.2,
      canvas.width * 0.64,
      canvas.height * 0.82,
      canvas.width - 80,
      canvas.height * 0.4,
    )
    ctx.stroke()

    for (let x = 0; x < canvas.width; x += 10) {
      ctx.fillStyle = `rgba(255,255,255,${x % 20 === 0 ? 0.02 : 0.01})`
      ctx.fillRect(x, 0, 1, canvas.height)
    }

    for (let y = 0; y < canvas.height; y += 6) {
      ctx.fillStyle = `rgba(125,211,252,${y % 12 === 0 ? 0.03 : 0.015})`
      ctx.fillRect(0, y, canvas.width, 1)
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    return texture
  }, [])
}

function useSandTableTexture() {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#dfe5e8'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const wash = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
    wash.addColorStop(0, 'rgba(255,255,255,0.34)')
    wash.addColorStop(0.55, 'rgba(255,255,255,0.08)')
    wash.addColorStop(1, 'rgba(148,163,184,0.12)')
    ctx.fillStyle = wash
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 2
    for (let i = 0; i < 13; i += 1) {
      const offset = 72 + i * 72
      ctx.beginPath()
      ctx.moveTo(56, offset)
      ctx.lineTo(canvas.width - 56, offset)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(offset, 56)
      ctx.lineTo(offset, canvas.height - 56)
      ctx.stroke()
    }

    const parcels = [
      [112, 126, 236, 182, '#ebf0ea'],
      [386, 128, 214, 176, '#eff2e8'],
      [658, 120, 250, 188, '#e7edf0'],
      [132, 372, 214, 212, '#f0efe8'],
      [390, 364, 242, 194, '#e6eeed'],
      [676, 380, 196, 214, '#eef2eb'],
      [164, 654, 252, 174, '#ebeff2'],
      [454, 646, 192, 190, '#eef1e8'],
      [702, 652, 164, 170, '#e8efea'],
    ]

    for (const [x, y, w, h, color] of parcels) {
      ctx.fillStyle = color
      ctx.fillRect(x, y, w, h)
      ctx.strokeStyle = 'rgba(148,163,184,0.16)'
      ctx.lineWidth = 3
      ctx.strokeRect(x, y, w, h)
    }

    ctx.strokeStyle = 'rgba(34,197,94,0.45)'
    ctx.lineWidth = 22
    ctx.beginPath()
    ctx.moveTo(128, 860)
    ctx.bezierCurveTo(256, 698, 412, 618, 536, 520)
    ctx.bezierCurveTo(654, 426, 756, 320, 900, 148)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(56,189,248,0.42)'
    ctx.lineWidth = 14
    ctx.beginPath()
    ctx.moveTo(196, 220)
    ctx.bezierCurveTo(346, 298, 488, 374, 646, 548)
    ctx.bezierCurveTo(726, 634, 798, 704, 860, 828)
    ctx.stroke()

    ctx.strokeStyle = 'rgba(249,115,22,0.34)'
    ctx.lineWidth = 8
    ctx.beginPath()
    ctx.moveTo(84, 520)
    ctx.lineTo(944, 520)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(512, 88)
    ctx.lineTo(512, 936)
    ctx.stroke()

    for (let i = 0; i < 42; i += 1) {
      const x = 94 + Math.random() * 836
      const y = 94 + Math.random() * 836
      const r = 3 + Math.random() * 8
      ctx.fillStyle = i % 3 === 0 ? 'rgba(16,185,129,0.24)' : 'rgba(59,130,246,0.18)'
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    return texture
  }, [])
}

function CeilingLight({ position, rotation = [0, 0, 0], args = [5, 0.05, 0.08] }) {
  return (
    <mesh position={position} rotation={rotation}>
      <boxGeometry args={args} />
      <meshStandardMaterial
        color="#f6f8fb"
        emissive="#ecf1f6"
        emissiveIntensity={1.18}
        toneMapped={false}
      />
    </mesh>
  )
}

const WALL_SURFACE_COLOR = '#f6eee6'
const CEILING_SURFACE_COLOR = '#fbf6ef'
const FLOOR_SURFACE_COLOR = '#f6f5f2'
const TRIM_METAL_MATERIAL = {
  color: '#d8dde2',
  metalness: 0.16,
  roughness: 0.34,
  clearcoat: 0.36,
  clearcoatRoughness: 0.16,
}
const DOOR_FRAME_MATERIAL = {
  ...TRIM_METAL_MATERIAL,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
}

function WallSurfaceMaterial({ wallMaps, color = WALL_SURFACE_COLOR }) {
  return (
    <meshPhysicalMaterial
      color={color}
      map={wallMaps.colorMap}
      bumpMap={wallMaps.bumpMap}
      bumpScale={0.0045}
      roughnessMap={wallMaps.roughnessMap}
      roughness={0.92}
      metalness={0.01}
      clearcoat={0.02}
      clearcoatRoughness={0.9}
    />
  )
}

function FloorSurfaceMaterial({ floorTexture }) {
  return (
    <meshPhysicalMaterial
      map={floorTexture}
      color={FLOOR_SURFACE_COLOR}
      roughness={0.08}
      metalness={0.04}
      clearcoat={1}
      clearcoatRoughness={0.04}
    />
  )
}

function CorridorPortalWalls({ z, wallMaps }) {
  const { width, height } = CONFIG.hall
  const halfWidth = width / 2
  const doorCenters = [-width / 3, 0, width / 3]
  const doorRanges = doorCenters.map((center) => [center - DOOR_HALF, center + DOOR_HALF])
  const solidRanges = [
    [-halfWidth, doorRanges[0][0]],
    [doorRanges[0][1], doorRanges[1][0]],
    [doorRanges[1][1], doorRanges[2][0]],
    [doorRanges[2][1], halfWidth],
  ]

  return (
    <>
      {solidRanges.map(([xMin, xMax], index) => (
        <mesh key={`solid-${z}-${index}`} position={[(xMin + xMax) / 2, height / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[xMax - xMin, height, 0.22]} />
          <WallSurfaceMaterial wallMaps={wallMaps} />
        </mesh>
      ))}

      {doorCenters.map((center) => (
        <mesh key={`lintel-${z}-${center}`} position={[center, (DOOR_HEIGHT + height) / 2, z]} castShadow receiveShadow>
          <boxGeometry args={[DOOR_HALF * 2, height - DOOR_HEIGHT, 0.22]} />
          <WallSurfaceMaterial wallMaps={wallMaps} />
        </mesh>
      ))}
    </>
  )
}

function InsetWallLight({ position = [0, 0, 0], rotation = [0, 0, 0], length = 1.15 }) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, -0.018]} castShadow receiveShadow>
        <boxGeometry args={[0.094, length, 0.034]} />
        <meshStandardMaterial color="#a6afb7" roughness={0.82} metalness={0.06} />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <planeGeometry args={[0.024, length - 0.2]} />
        <meshStandardMaterial
          color="#f4f7fb"
          emissive="#e6edf5"
          emissiveIntensity={0.92}
          roughness={0.14}
          toneMapped={false}
        />
      </mesh>
      <pointLight position={[0, 0, -0.32]} intensity={0.3} distance={2.4} decay={2} color="#edf3fa" />
    </group>
  )
}

function DoorFrame({
  width,
  height,
  depth = 0.042,
  wallDepth = 0.22,
  frameThickness = 0.12,
  reveal = 0.018,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}) {
  const edgeOverlap = 0.016
  const jambHeight = height + frameThickness * 0.36
  const sideOffset = width / 2 + frameThickness / 2 - edgeOverlap / 2
  const sideY = jambHeight / 2
  const headerY = height + frameThickness / 2
  const layerOffsets = [
    -(wallDepth / 2 - depth / 2 - reveal),
    wallDepth / 2 - depth / 2 - reveal,
  ]

  return (
    <group position={position} rotation={rotation}>
      {layerOffsets.map((zOffset) => (
        <group key={zOffset} position={[0, 0, zOffset]}>
          <mesh position={[-sideOffset, sideY, 0]} castShadow receiveShadow renderOrder={2}>
            <boxGeometry args={[frameThickness, jambHeight, depth]} />
            <meshPhysicalMaterial {...DOOR_FRAME_MATERIAL} />
          </mesh>
          <mesh position={[sideOffset, sideY, 0]} castShadow receiveShadow renderOrder={2}>
            <boxGeometry args={[frameThickness, jambHeight, depth]} />
            <meshPhysicalMaterial {...DOOR_FRAME_MATERIAL} />
          </mesh>
          <mesh position={[0, headerY, 0]} castShadow receiveShadow renderOrder={2}>
            <boxGeometry args={[width + frameThickness * 2 - edgeOverlap, frameThickness, depth]} />
            <meshPhysicalMaterial {...DOOR_FRAME_MATERIAL} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function WallBaseTrim({
  width,
  trimHeight = 0.14,
  trimDepth = 0.08,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, trimHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[width, trimHeight, trimDepth]} />
        <meshPhysicalMaterial {...TRIM_METAL_MATERIAL} />
      </mesh>
    </group>
  )
}

function NameSign({ position, rotation, name }) {
  const texture = useSignTexture(name)

  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, 0, 0.12]}>
        <planeGeometry args={[2.6, 0.6]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
    </group>
  )
}

const CJK_FONT = '"PingFang SC","Microsoft YaHei","Source Han Sans SC",sans-serif'

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const chars = Array.from(text)
  let line = ''
  let cy = y
  let drawn = 0
  for (let i = 0; i < chars.length && drawn < maxLines - 1; i += 1) {
    const test = line + chars[i]
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cy)
      line = chars[i]
      cy += lineHeight
      drawn += 1
    } else {
      line = test
    }
  }
  if (drawn < maxLines && line) {
    if (ctx.measureText(line).width > maxWidth) line = `${line.slice(0, -1)}…`
    ctx.fillText(line, x, cy)
  }
}

// 程序化展板贴图：主题展板（竖版）/ 文献展板（横版）。占位内容，后续可替换为真实图文。
function useBoardTexture({ title, subtitle, body, accent, variant = 'doc' }) {
  return useMemo(() => {
    const portrait = variant === 'theme'
    const W = portrait ? 640 : 768
    const H = portrait ? 960 : 600
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    const pad = 52

    ctx.fillStyle = '#fbfbf9'
    ctx.fillRect(0, 0, W, H)

    ctx.strokeStyle = 'rgba(15,23,42,0.08)'
    ctx.lineWidth = 4
    roundRectPath(ctx, 10, 10, W - 20, H - 20, 28)
    ctx.stroke()

    ctx.fillStyle = accent
    ctx.fillRect(pad, pad, 96, 14)

    ctx.fillStyle = '#0f172a'
    ctx.font = `700 ${portrait ? 60 : 50}px ${CJK_FONT}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(title, pad, pad + 78)

    ctx.fillStyle = accent
    ctx.font = `600 ${portrait ? 30 : 28}px ${CJK_FONT}`
    ctx.fillText(subtitle, pad, pad + 120)

    ctx.strokeStyle = 'rgba(15,23,42,0.10)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(pad, pad + 150)
    ctx.lineTo(W - pad, pad + 150)
    ctx.stroke()

    ctx.fillStyle = '#475569'
    ctx.font = `400 30px ${CJK_FONT}`
    wrapText(ctx, body, pad, pad + 200, W - pad * 2, portrait ? 46 : 44, portrait ? 12 : 7)

    ctx.fillStyle = 'rgba(148,163,184,0.9)'
    ctx.font = `500 22px ${CJK_FONT}`
    ctx.fillText('（占位展板 · 内容可替换）', pad, H - pad - 8)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 8
    return texture
  }, [title, subtitle, body, accent, variant])
}

// 主题展板：贴本地 -x 墙（进门右侧），画面朝 +x。组内使用本地坐标。
function ThemeBoard({ texture }) {
  const [w, h] = LOCAL_ANCHORS.themeSize
  const [x, y, z] = LOCAL_ANCHORS.theme

  return (
    <group position={[x, y, z]}>
      <mesh position={[-0.06, 0, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.1, h + 0.18, w + 0.18]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      <mesh rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={texture} color="#ffffff" roughness={0.5} />
      </mesh>
    </group>
  )
}

// 文献展板：贴后墙，画面朝 -z。
function DocPanel({ texture, position, size }) {
  return (
    <group position={position}>
      <mesh position={[0, 0, -0.05]} castShadow receiveShadow>
        <boxGeometry args={[size[0] + 0.14, size[1] + 0.14, 0.08]} />
        <meshStandardMaterial color="#ffffff" roughness={0.5} />
      </mesh>
      <mesh rotation={[0, Math.PI, 0]}>
        <planeGeometry args={size} />
        <meshStandardMaterial map={texture} color="#ffffff" roughness={0.5} />
      </mesh>
    </group>
  )
}

function CentralLedStage() {
  const {
    footprintX,
    footprintZ,
    plinthHeight,
    screenSpan,
    screenHeight,
    screenThickness,
  } = CONFIG.hall.centralStage
  const screenTexture = useLedTexture()
  const screenGap = 0.028
  const screenCenterY = plinthHeight + screenHeight / 2 + 0.07
  const screenCenterX = 0.02
  const backboardThickness = 0.1
  const backboardWidth = screenSpan + 0.12
  const backboardHeight = screenHeight + 0.24
  const backboardCenterX = screenCenterX - screenThickness / 2 - screenGap - backboardThickness / 2
  const backboardCenterY = plinthHeight + backboardHeight / 2
  const grooveY = 0.048
  const grooveHeight = 0.034
  const grooveInset = 0.1
  const grooveWidthX = footprintX - grooveInset * 2
  const grooveWidthZ = footprintZ - grooveInset * 2
  const stripThickness = 0.028

  return (
    <group>
      <mesh position={[0, plinthHeight / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[footprintX, plinthHeight, footprintZ]} />
        <meshPhysicalMaterial
          color="#d8dbe0"
          metalness={0.1}
          roughness={0.44}
          clearcoat={0.24}
          clearcoatRoughness={0.2}
        />
      </mesh>

      {[
        { position: [0, grooveY, footprintZ / 2 - grooveInset / 2], args: [grooveWidthX, grooveHeight, stripThickness] },
        { position: [0, grooveY, -(footprintZ / 2 - grooveInset / 2)], args: [grooveWidthX, grooveHeight, stripThickness] },
        { position: [footprintX / 2 - grooveInset / 2, grooveY, 0], args: [stripThickness, grooveHeight, grooveWidthZ] },
        { position: [-(footprintX / 2 - grooveInset / 2), grooveY, 0], args: [stripThickness, grooveHeight, grooveWidthZ] },
      ].map((strip, index) => (
        <mesh key={index} position={strip.position} receiveShadow>
          <boxGeometry args={strip.args} />
          <meshStandardMaterial
            color="#fff1d8"
            emissive="#ffd5a0"
            emissiveIntensity={1.2}
            toneMapped={false}
          />
        </mesh>
      ))}

      <pointLight
        position={[0, 0.14, 0]}
        intensity={0.85}
        distance={3.8}
        decay={2}
        color="#ffe1b8"
      />

      <mesh position={[backboardCenterX, backboardCenterY, 0]} castShadow receiveShadow>
        <boxGeometry args={[backboardThickness, backboardHeight, backboardWidth]} />
        <meshPhysicalMaterial
          color="#bfc5cc"
          metalness={0.08}
          roughness={0.58}
          clearcoat={0.22}
          clearcoatRoughness={0.2}
        />
      </mesh>

      <mesh position={[screenCenterX, screenCenterY, 0]} castShadow>
        <boxGeometry args={[screenThickness, screenHeight, screenSpan]} />
        <meshPhysicalMaterial
          color="#050608"
          metalness={0.58}
          roughness={0.18}
          clearcoat={1}
          clearcoatRoughness={0.06}
        />
      </mesh>

      <mesh position={[screenCenterX + screenThickness / 2 + 0.003, screenCenterY, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[screenSpan - 0.34, screenHeight - 0.28]} />
        <meshStandardMaterial
          map={screenTexture}
          emissiveMap={screenTexture}
          emissive="#67e8f9"
          emissiveIntensity={0.42}
          roughness={0.12}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

function SandTable() {
  const { sandTable } = CONFIG.hall
  const topTexture = useSandTableTexture()

  if (!sandTable) return null

  const { centerX, centerZ, sizeX, sizeZ, height } = sandTable
  const topThickness = 0.08
  const surfaceInset = 0.14
  const surfaceX = sizeX - surfaceInset * 2
  const surfaceZ = sizeZ - surfaceInset * 2
  const modelBaseY = height + topThickness + 0.015
  const masses = [
    { position: [-0.52, 0, -0.82], args: [0.34, 0.12, 0.5], color: '#e3eaed' },
    { position: [0.08, 0, -0.26], args: [0.48, 0.18, 0.66], color: '#edf0f2' },
    { position: [0.54, 0, 0.72], args: [0.26, 0.14, 0.42], color: '#dfe8ea' },
    { position: [-0.18, 0, 0.88], args: [0.72, 0.1, 0.3], color: '#eef2f3' },
    { position: [-0.72, 0, 0.18], args: [0.22, 0.22, 0.22], color: '#d6dee3' },
    { position: [0.76, 0, -0.82], args: [0.2, 0.26, 0.2], color: '#d7e1e4' },
  ]

  return (
    <group position={[centerX, 0, centerZ]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[sizeX - 0.18, height, sizeZ - 0.18]} />
        <meshPhysicalMaterial
          color="#adb6be"
          metalness={0.12}
          roughness={0.48}
          clearcoat={0.26}
          clearcoatRoughness={0.22}
        />
      </mesh>

      <mesh position={[0, height + topThickness / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[sizeX, topThickness, sizeZ]} />
        <meshPhysicalMaterial
          color="#eef2f3"
          metalness={0.04}
          roughness={0.24}
          clearcoat={0.8}
          clearcoatRoughness={0.1}
        />
      </mesh>

      <mesh position={[0, height + topThickness + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[surfaceX, surfaceZ]} />
        <meshStandardMaterial map={topTexture} color="#e8edef" roughness={0.36} metalness={0.02} />
      </mesh>

      {masses.map((mass, index) => (
        <mesh
          key={index}
          position={[mass.position[0], modelBaseY + mass.args[1] / 2, mass.position[2]]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={mass.args} />
          <meshStandardMaterial color={mass.color} roughness={0.56} metalness={0.04} />
        </mesh>
      ))}

      <mesh position={[0, modelBaseY + 0.17, 0]} receiveShadow>
        <boxGeometry args={[surfaceX + 0.02, 0.018, surfaceZ + 0.02]} />
        <meshPhysicalMaterial
          color="#eef7ff"
          metalness={0}
          roughness={0.08}
          transparent
          opacity={0.2}
          clearcoat={1}
          clearcoatRoughness={0.04}
        />
      </mesh>
    </group>
  )
}

const CORRIDOR_HALF = CONFIG.hall.corridorHalf ?? 4
const ROOM_WIDTH = CONFIG.hall.width / 3
const ROOM_DEPTH = CONFIG.hall.depth / 2 - CORRIDOR_HALF
const DOOR_HALF = 1.15
const DOOR_HEIGHT = 2.5

function Room({ hall, wallMaps }) {
  const { height } = CONFIG.hall
  const width = ROOM_WIDTH
  const depth = ROOM_DEPTH
  const isFront = hall.wall === 'front'
  const wallZ = isFront ? CORRIDOR_HALF : -CORRIDOR_HALF
  const position = [hall.center, 0, wallZ]
  const rotationY = isFront ? 0 : Math.PI
  const pierWidth = width / 2 - DOOR_HALF

  const themeTex = useBoardTexture({
    title: hall.theme.title,
    subtitle: hall.chapter,
    body: hall.theme.body,
    accent: hall.color,
    variant: 'theme',
  })
  const docTexA = useBoardTexture({
    title: hall.docs[0].title,
    subtitle: '文献资料',
    body: hall.docs[0].body,
    accent: hall.color,
    variant: 'doc',
  })
  const docTexB = useBoardTexture({
    title: hall.docs[1].title,
    subtitle: '文献资料',
    body: hall.docs[1].body,
    accent: hall.color,
    variant: 'doc',
  })
  const [docAPos, docBPos] = LOCAL_ANCHORS.docPanels

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, height / 2, depth - 0.1]} receiveShadow castShadow>
        <boxGeometry args={[width, height, 0.2]} />
        <WallSurfaceMaterial wallMaps={wallMaps} />
      </mesh>

      <WallBaseTrim width={pierWidth} position={[-(width / 2 + DOOR_HALF) / 2, 0, -0.085]} />
      <WallBaseTrim width={pierWidth} position={[(width / 2 + DOOR_HALF) / 2, 0, -0.085]} />
      <InsetWallLight position={[-(width / 2 + DOOR_HALF) / 2, 1.38, -0.08]} />
      <InsetWallLight position={[(width / 2 + DOOR_HALF) / 2, 1.38, -0.08]} />

      {/* reveal 取负值让门套向走廊侧（及室内侧）外凸约 3cm，贴墙表面可见；
          否则门套会缩进 0.22 厚的墙体以内、被不透明墙面完全遮挡而看不见。 */}
      <DoorFrame width={DOOR_HALF * 2} height={DOOR_HEIGHT} reveal={-0.03} position={[0, 0, 0]} />

      <NameSign position={[0, DOOR_HEIGHT + 0.45, -0.06]} rotation={[0, Math.PI, 0]} name={hall.name} />

      <ThemeBoard texture={themeTex} />
      <DocPanel texture={docTexA} position={docAPos} size={LOCAL_ANCHORS.docSize} />
      <DocPanel texture={docTexB} position={docBPos} size={LOCAL_ANCHORS.docSize} />

      <CeilingLight position={[0, height - 0.16, depth * 0.5]} args={[width - 1.6, 0.06, 0.08]} />
    </group>
  )
}

export function Hall() {
  const { width, depth, height, wallThickness } = CONFIG.hall
  const corridorHalf = CONFIG.hall.corridorHalf ?? 4
  const floorTexture = useFloorTexture()
  const floorGuideTexture = useFloorGuideTexture()
  const wallMaps = useWallMaterialMaps()

  const halfWidth = width / 2
  const halfDepth = depth / 2
  const roomDepth = halfDepth - corridorHalf
  const dividerX = width / 6

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width, depth]} />
        <FloorSurfaceMaterial floorTexture={floorTexture} />
      </mesh>
      <mesh position={[halfWidth + 0.3, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[0.62, 6.04]} />
        <FloorSurfaceMaterial floorTexture={floorTexture} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} renderOrder={1}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial
          map={floorGuideTexture}
          transparent
          alphaTest={0.02}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, height, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color={CEILING_SURFACE_COLOR} roughness={0.98} />
      </mesh>

      {/* 后墙：走廊段预留壁龛开口（z∈[zMin,zMax], y∈[yBottom,yTop]），其余分段封墙 */}
      <mesh position={[-halfWidth, height / 2, (-halfDepth + TROPHY_NICHE.zMin) / 2]} receiveShadow castShadow>
        <boxGeometry args={[wallThickness, height, TROPHY_NICHE.zMin + halfDepth]} />
        <WallSurfaceMaterial wallMaps={wallMaps} />
      </mesh>
      <mesh position={[-halfWidth, height / 2, (halfDepth + TROPHY_NICHE.zMax) / 2]} receiveShadow castShadow>
        <boxGeometry args={[wallThickness, height, halfDepth - TROPHY_NICHE.zMax]} />
        <WallSurfaceMaterial wallMaps={wallMaps} />
      </mesh>
      <mesh position={[-halfWidth, (TROPHY_NICHE.yTop + height) / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[wallThickness, height - TROPHY_NICHE.yTop, TROPHY_NICHE.zMax - TROPHY_NICHE.zMin]} />
        <WallSurfaceMaterial wallMaps={wallMaps} />
      </mesh>
      <mesh position={[-halfWidth, TROPHY_NICHE.yBottom / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[wallThickness, TROPHY_NICHE.yBottom, TROPHY_NICHE.zMax - TROPHY_NICHE.zMin]} />
        <WallSurfaceMaterial wallMaps={wallMaps} />
      </mesh>
      <mesh position={[halfWidth, height / 2, (3 + halfDepth) / 2]} receiveShadow castShadow>
        <boxGeometry args={[wallThickness, height, halfDepth - 3]} />
        <WallSurfaceMaterial wallMaps={wallMaps} />
      </mesh>
      <mesh position={[halfWidth, height / 2, -(3 + halfDepth) / 2]} receiveShadow castShadow>
        <boxGeometry args={[wallThickness, height, halfDepth - 3]} />
        <WallSurfaceMaterial wallMaps={wallMaps} />
      </mesh>
      <mesh position={[halfWidth, (3.5 + height) / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[wallThickness, height - 3.5, 6]} />
        <WallSurfaceMaterial wallMaps={wallMaps} />
      </mesh>

      <mesh position={[halfWidth + 0.3, 1.75, -3]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 3.5, 0.22]} />
        <WallSurfaceMaterial wallMaps={wallMaps} />
      </mesh>
      <mesh position={[halfWidth + 0.3, 1.75, 3]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 3.5, 0.22]} />
        <WallSurfaceMaterial wallMaps={wallMaps} />
      </mesh>
      <mesh position={[halfWidth + 0.3, 3.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.6, 0.5, 6]} />
        <WallSurfaceMaterial wallMaps={wallMaps} />
      </mesh>

      <DoorFrame
        width={6}
        height={3.5}
        depth={0.36}
        frameThickness={0.16}
        position={[halfWidth + 0.32, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
      />

      {[-dividerX, dividerX].map((x) => (
        <mesh
          key={`front-${x}`}
          position={[x, height / 2, corridorHalf + roomDepth / 2]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.22, height, roomDepth]} />
          <WallSurfaceMaterial wallMaps={wallMaps} />
        </mesh>
      ))}
      {[-dividerX, dividerX].map((x) => (
        <mesh
          key={`back-${x}`}
          position={[x, height / 2, -(corridorHalf + roomDepth / 2)]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.22, height, roomDepth]} />
          <WallSurfaceMaterial wallMaps={wallMaps} />
        </mesh>
      ))}

      <CorridorPortalWalls z={corridorHalf} wallMaps={wallMaps} />
      <CorridorPortalWalls z={-corridorHalf} wallMaps={wallMaps} />

      <CeilingLight position={[0, height - 0.16, 0]} args={[width - 2.4, 0.06, 0.08]} />
      <CeilingLight
        position={[-halfWidth + 0.42, height - 0.16, 0]}
        rotation={[0, Math.PI / 2, 0]}
        args={[corridorHalf * 2 - 1, 0.06, 0.08]}
      />
      <CeilingLight
        position={[halfWidth - 0.42, height - 0.16, 0]}
        rotation={[0, Math.PI / 2, 0]}
        args={[corridorHalf * 2 - 1, 0.06, 0.08]}
      />

      <CentralLedStage />
      <SandTable />

      {HALLS.map((hall) => (
        <Room key={hall.id} hall={hall} wallMaps={wallMaps} />
      ))}
    </group>
  )
}
