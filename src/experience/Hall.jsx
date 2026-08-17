import { useMemo } from 'react'
import * as THREE from 'three'
import { CONFIG } from '../data/config.js'
import { HALLS, LOCAL_ANCHORS } from '../data/halls.js'
import { TROPHY_NICHE } from '../data/trophies.js'

const FLOOR_GUIDE_TEXTURE_VERSION = '2026-08-13-floor-guides-v4'

function toCanvas(size, width, depth, x, z) {
  return [((x / width) + 0.5) * size, (0.5 - z / depth) * size]
}

function drawFlowLine(ctx, size, width, depth, points, color, glow, lineWidth) {
  const mapped = points.map(([x, z]) => toCanvas(size, width, depth, x, z))
  const gap = lineWidth * 0.9 // 双线间距（铜条镶嵌）

  // 沿路径法向偏移，得到两条平行的极细线
  const offsetPath = (offset) => {
    const out = []
    for (let i = 0; i < mapped.length; i += 1) {
      const prev = mapped[Math.max(0, i - 1)]
      const next = mapped[Math.min(mapped.length - 1, i + 1)]
      let nx = next[0] - prev[0]
      let ny = next[1] - prev[1]
      const len = Math.hypot(nx, ny) || 1
      out.push([mapped[i][0] + (-ny / len) * offset, mapped[i][1] + (nx / len) * offset])
    }
    return out
  }

  const strokePath = (pts) => {
    if (pts.length < 2) return
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [x0, y0] = pts[i]
      const [x1, y1] = pts[i + 1]
      const midX = (x0 + x1) / 2
      const midY = (y0 + y1) / 2
      ctx.quadraticCurveTo(x0, y0, midX, midY)
    }
    const [lastX, lastY] = pts[pts.length - 1]
    ctx.lineTo(lastX, lastY)
    ctx.stroke()
  }

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.3, lineWidth * 0.22) // 极细铜线
  strokePath(offsetPath(gap / 2))
  strokePath(offsetPath(-gap / 2))
  ctx.restore()
}

function drawArrow(ctx, size, width, depth, x, z, angle, color, arrowSize = 28) {
  const [px, py] = toCanvas(size, width, depth, x, z)
  const s = arrowSize

  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(angle)
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(1.6, s * 0.1)
  ctx.beginPath()
  ctx.moveTo(-s * 0.5, -s * 0.42)
  ctx.lineTo(s * 0.5, 0)
  ctx.lineTo(-s * 0.5, s * 0.42)
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

function drawSoftClouds(ctx, size, { count, colors, alpha, radius, margin = 0 }) {
  for (let i = 0; i < count; i += 1) {
    const color = colors[i % colors.length]
    const opacity = randomBetween(alpha[0], alpha[1])
    const r = randomBetween(radius[0], radius[1])
    const x = randomBetween(margin, size - margin)
    const y = randomBetween(margin, size - margin)
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r)

    gradient.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${opacity})`)
    gradient.addColorStop(0.45, `rgba(${color[0]},${color[1]},${color[2]},${opacity * 0.42})`)
    gradient.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`)

    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawSoftPasses(
  ctx,
  size,
  { count, colors, alpha, radiusX, radiusY, rotation = [-0.08, 0.08], margin = 0 },
) {
  for (let i = 0; i < count; i += 1) {
    const color = colors[i % colors.length]
    const opacity = randomBetween(alpha[0], alpha[1])
    const rx = randomBetween(radiusX[0], radiusX[1])
    const ry = randomBetween(radiusY[0], radiusY[1])

    ctx.save()
    ctx.translate(randomBetween(margin, size - margin), randomBetween(margin, size - margin))
    ctx.rotate(randomBetween(rotation[0], rotation[1]))
    ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${opacity})`
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
      'rgba(180,138,82,0.8)',
      'rgba(180,138,82,0.28)',
      5,
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
      'rgba(180,138,82,0.8)',
      'rgba(180,138,82,0.28)',
      5,
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
      'rgba(180,138,82,0.8)',
      'rgba(180,138,82,0.28)',
      4,
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
      'rgba(180,138,82,0.72)',
      'rgba(180,138,82,0.24)',
      3.5,
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
      'rgba(180,138,82,0.72)',
      'rgba(180,138,82,0.24)',
      3.5,
    )

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

    colorCtx.fillStyle = '#f3ede5'
    colorCtx.fillRect(0, 0, size, size)
    const colorWash = colorCtx.createLinearGradient(0, 0, size, size)
    colorWash.addColorStop(0, 'rgba(255,255,255,0.22)')
    colorWash.addColorStop(0.46, 'rgba(248,242,236,0.05)')
    colorWash.addColorStop(1, 'rgba(220,227,233,0.16)')
    colorCtx.fillStyle = colorWash
    colorCtx.fillRect(0, 0, size, size)

    const topCoolShade = colorCtx.createLinearGradient(0, 0, 0, size * 0.38)
    topCoolShade.addColorStop(0, 'rgba(218,224,230,0.12)')
    topCoolShade.addColorStop(0.32, 'rgba(218,224,230,0.05)')
    topCoolShade.addColorStop(1, 'rgba(214,223,232,0)')
    colorCtx.fillStyle = topCoolShade
    colorCtx.fillRect(0, 0, size, size * 0.42)

    const bottomWarmShade = colorCtx.createLinearGradient(0, size, 0, size * 0.56)
    bottomWarmShade.addColorStop(0, 'rgba(223,216,208,0.1)')
    bottomWarmShade.addColorStop(0.28, 'rgba(223,216,208,0.045)')
    bottomWarmShade.addColorStop(1, 'rgba(223,216,208,0)')
    colorCtx.fillStyle = bottomWarmShade
    colorCtx.fillRect(0, size * 0.5, size, size * 0.5)

    const sideShade = colorCtx.createLinearGradient(0, 0, size, 0)
    sideShade.addColorStop(0, 'rgba(124,130,138,0.045)')
    sideShade.addColorStop(0.08, 'rgba(124,130,138,0)')
    sideShade.addColorStop(0.92, 'rgba(124,130,138,0)')
    sideShade.addColorStop(1, 'rgba(124,130,138,0.045)')
    colorCtx.fillStyle = sideShade
    colorCtx.fillRect(0, 0, size, size)

    drawSoftClouds(colorCtx, size, {
      count: 34,
      colors: [
        [255, 255, 255],
        [241, 236, 229],
        [229, 233, 237],
        [234, 227, 218],
      ],
      alpha: [0.024, 0.068],
      radius: [170, 580],
      margin: edgeMargin,
    })
    drawSoftPasses(colorCtx, size, {
      count: 96,
      colors: [
        [245, 240, 234],
        [233, 236, 239],
        [255, 255, 255],
        [231, 224, 216],
      ],
      alpha: [0.006, 0.018],
      radiusX: [12, 30],
      radiusY: [220, 760],
      rotation: [-0.08, 0.08],
      margin: edgeMargin,
    })
    drawFineEllipses(colorCtx, size, {
      count: 1200,
      tone: [230, 242],
      alpha: [0.002, 0.008],
      radius: [0.4, 1.35],
      stretch: [0.45, 1.6],
      margin: edgeMargin,
    })
    drawFineEllipses(colorCtx, size, {
      count: 640,
      tone: [216, 228],
      alpha: [0.002, 0.006],
      radius: [0.5, 1.8],
      stretch: [0.5, 1.45],
      margin: edgeMargin,
    })

    const bumpCanvas = document.createElement('canvas')
    bumpCanvas.width = size
    bumpCanvas.height = size
    const bumpCtx = bumpCanvas.getContext('2d')

    bumpCtx.fillStyle = '#808080'
    bumpCtx.fillRect(0, 0, size, size)

    const bumpTopShade = bumpCtx.createLinearGradient(0, 0, 0, size * 0.34)
    bumpTopShade.addColorStop(0, 'rgba(131,131,131,0.12)')
    bumpTopShade.addColorStop(1, 'rgba(131,131,131,0)')
    bumpCtx.fillStyle = bumpTopShade
    bumpCtx.fillRect(0, 0, size, size * 0.36)

    const bumpBottomShade = bumpCtx.createLinearGradient(0, size, 0, size * 0.62)
    bumpBottomShade.addColorStop(0, 'rgba(123,123,123,0.12)')
    bumpBottomShade.addColorStop(1, 'rgba(123,123,123,0)')
    bumpCtx.fillStyle = bumpBottomShade
    bumpCtx.fillRect(0, size * 0.58, size, size * 0.42)

    drawSoftClouds(bumpCtx, size, {
      count: 26,
      colors: [
        [135, 135, 135],
        [124, 124, 124],
        [130, 130, 130],
      ],
      alpha: [0.028, 0.075],
      radius: [140, 420],
      margin: edgeMargin,
    })
    drawSoftPasses(bumpCtx, size, {
      count: 68,
      colors: [
        [122, 122, 122],
        [134, 134, 134],
      ],
      alpha: [0.008, 0.03],
      radiusX: [10, 26],
      radiusY: [170, 640],
      rotation: [-0.05, 0.05],
      margin: edgeMargin,
    })
    drawFineEllipses(bumpCtx, size, {
      count: 1800,
      tone: [123, 133],
      alpha: [0.003, 0.01],
      radius: [0.32, 0.95],
      stretch: [0.45, 1.4],
      margin: edgeMargin,
    })
    drawFineEllipses(bumpCtx, size, {
      count: 780,
      tone: [120, 136],
      alpha: [0.003, 0.008],
      radius: [0.65, 1.7],
      stretch: [0.5, 1.5],
      margin: edgeMargin,
    })

    const roughnessCanvas = document.createElement('canvas')
    roughnessCanvas.width = size
    roughnessCanvas.height = size
    const roughnessCtx = roughnessCanvas.getContext('2d')

    roughnessCtx.fillStyle = '#ece9e4'
    roughnessCtx.fillRect(0, 0, size, size)
    const roughnessWash = roughnessCtx.createLinearGradient(size, 0, 0, size)
    roughnessWash.addColorStop(0, 'rgba(255,255,255,0.12)')
    roughnessWash.addColorStop(1, 'rgba(214,214,214,0.14)')
    roughnessCtx.fillStyle = roughnessWash
    roughnessCtx.fillRect(0, 0, size, size)

    const roughnessTop = roughnessCtx.createLinearGradient(0, 0, 0, size * 0.34)
    roughnessTop.addColorStop(0, 'rgba(242,242,242,0.13)')
    roughnessTop.addColorStop(1, 'rgba(244,244,244,0)')
    roughnessCtx.fillStyle = roughnessTop
    roughnessCtx.fillRect(0, 0, size, size * 0.36)

    const roughnessBottom = roughnessCtx.createLinearGradient(0, size, 0, size * 0.58)
    roughnessBottom.addColorStop(0, 'rgba(236,235,232,0.11)')
    roughnessBottom.addColorStop(1, 'rgba(240,238,234,0)')
    roughnessCtx.fillStyle = roughnessBottom
    roughnessCtx.fillRect(0, size * 0.54, size, size * 0.46)

    const roughnessSides = roughnessCtx.createLinearGradient(0, 0, size, 0)
    roughnessSides.addColorStop(0, 'rgba(244,244,244,0.075)')
    roughnessSides.addColorStop(0.1, 'rgba(244,244,244,0)')
    roughnessSides.addColorStop(0.9, 'rgba(244,244,244,0)')
    roughnessSides.addColorStop(1, 'rgba(244,244,244,0.075)')
    roughnessCtx.fillStyle = roughnessSides
    roughnessCtx.fillRect(0, 0, size, size)

    drawSoftClouds(roughnessCtx, size, {
      count: 30,
      colors: [
        [238, 236, 232],
        [222, 222, 222],
        [229, 231, 234],
        [234, 228, 221],
      ],
      alpha: [0.024, 0.068],
      radius: [180, 500],
      margin: edgeMargin,
    })
    drawSoftPasses(roughnessCtx, size, {
      count: 72,
      colors: [
        [214, 214, 214],
        [236, 236, 236],
      ],
      alpha: [0.008, 0.024],
      radiusX: [12, 30],
      radiusY: [200, 720],
      rotation: [-0.05, 0.05],
      margin: edgeMargin,
    })
    drawFineEllipses(roughnessCtx, size, {
      count: 1500,
      tone: [214, 230],
      alpha: [0.003, 0.01],
      radius: [0.35, 1.15],
      stretch: [0.45, 1.4],
      margin: edgeMargin,
    })
    drawFineEllipses(roughnessCtx, size, {
      count: 620,
      tone: [198, 214],
      alpha: [0.002, 0.007],
      radius: [0.55, 1.5],
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

// 基座前缘灯带的扩散光晕贴图（无 bloom 下用渐变 + Additive 叠加模拟漏光扩散）。
function useBaseGlowTextures() {
  return useMemo(() => {
    // 竖直光晕：沿高度方向中间亮、上下淡出（贴基座前面，向屏幕底部 / 基座下沿扩散）。
    const frontCanvas = document.createElement('canvas')
    frontCanvas.width = 32
    frontCanvas.height = 256
    const fctx = frontCanvas.getContext('2d')
    const fg = fctx.createLinearGradient(0, 0, 0, frontCanvas.height)
    fg.addColorStop(0, 'rgba(255,196,102,0)')
    fg.addColorStop(0.5, 'rgba(255,196,102,0.4)')
    fg.addColorStop(1, 'rgba(255,196,102,0)')
    fctx.fillStyle = fg
    fctx.fillRect(0, 0, frontCanvas.width, frontCanvas.height)
    const front = new THREE.CanvasTexture(frontCanvas)
    front.colorSpace = THREE.SRGBColorSpace

    // 地面光晕：沿宽度方向近基座亮、远端淡出（向前扩散成光毯）。
    const floorCanvas = document.createElement('canvas')
    floorCanvas.width = 256
    floorCanvas.height = 32
    const dctx = floorCanvas.getContext('2d')
    const dg = dctx.createLinearGradient(0, 0, floorCanvas.width, 0)
    dg.addColorStop(0, 'rgba(255,184,77,0.3)')
    dg.addColorStop(1, 'rgba(255,184,77,0)')
    dctx.fillStyle = dg
    dctx.fillRect(0, 0, floorCanvas.width, floorCanvas.height)
    const floor = new THREE.CanvasTexture(floorCanvas)
    floor.colorSpace = THREE.SRGBColorSpace

    return { front, floor }
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

function useWallFaceShadowTexture() {
  return useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 512
    const ctx = canvas.getContext('2d')

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const top = ctx.createLinearGradient(0, 0, 0, canvas.height * 0.2)
    top.addColorStop(0, 'rgba(108,118,132,0.12)')
    top.addColorStop(0.58, 'rgba(108,118,132,0.04)')
    top.addColorStop(1, 'rgba(108,118,132,0)')
    ctx.fillStyle = top
    ctx.fillRect(0, 0, canvas.width, canvas.height * 0.22)

    const bottom = ctx.createLinearGradient(0, canvas.height, 0, canvas.height * 0.82)
    bottom.addColorStop(0, 'rgba(114,98,84,0.13)')
    bottom.addColorStop(0.52, 'rgba(114,98,84,0.045)')
    bottom.addColorStop(1, 'rgba(114,98,84,0)')
    ctx.fillStyle = bottom
    ctx.fillRect(0, canvas.height * 0.79, canvas.width, canvas.height * 0.21)

    const left = ctx.createLinearGradient(0, 0, canvas.width * 0.14, 0)
    left.addColorStop(0, 'rgba(92,98,108,0.08)')
    left.addColorStop(0.62, 'rgba(92,98,108,0.025)')
    left.addColorStop(1, 'rgba(92,98,108,0)')
    ctx.fillStyle = left
    ctx.fillRect(0, 0, canvas.width * 0.14, canvas.height)

    const right = ctx.createLinearGradient(canvas.width, 0, canvas.width * 0.86, 0)
    right.addColorStop(0, 'rgba(92,98,108,0.08)')
    right.addColorStop(0.62, 'rgba(92,98,108,0.025)')
    right.addColorStop(1, 'rgba(92,98,108,0)')
    ctx.fillStyle = right
    ctx.fillRect(canvas.width * 0.86, 0, canvas.width * 0.14, canvas.height)

    ;[
      [0, 0],
      [canvas.width, 0],
      [0, canvas.height],
      [canvas.width, canvas.height],
    ].forEach(([x, y], index) => {
      const radius = index < 2 ? canvas.width * 0.18 : canvas.width * 0.15
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
      const color = index < 2 ? 'rgba(94,104,116,0.06)' : 'rgba(108,94,82,0.05)'
      gradient.addColorStop(0, color)
      gradient.addColorStop(0.55, color.replace(/0\.\d+\)$/, '0.016)'))
      gradient.addColorStop(1, color.replace(/0\.\d+\)$/, '0)'))
      ctx.fillStyle = gradient
      ctx.beginPath()
      ctx.rect(
        x === 0 ? 0 : canvas.width - radius,
        y === 0 ? 0 : canvas.height - radius,
        radius,
        radius,
      )
      ctx.fill()
    })

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
    texture.anisotropy = 4
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

const WALL_SURFACE_COLOR = '#f2eeea'
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
    <meshStandardMaterial
      color={color}
      map={wallMaps.colorMap}
      bumpMap={wallMaps.bumpMap}
      bumpScale={0.0021}
      roughnessMap={wallMaps.roughnessMap}
      roughness={0.97}
      metalness={0}
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

function WallFaceShadowLayer({ shadowTexture, size, position = [0, 0, 0], rotation = [0, 0, 0], opacity = 1 }) {
  return (
    <mesh position={position} rotation={rotation} renderOrder={3}>
      <planeGeometry args={size} />
      <meshBasicMaterial
        map={shadowTexture}
        transparent
        opacity={opacity}
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function FloorContactShadow({ position = [0, 0, 0], rotation = [0, 0, 0], size = [1, 1], opacity = 0.1 }) {
  return (
    <mesh position={position} rotation={rotation} renderOrder={2}>
      <planeGeometry args={size} />
      <meshBasicMaterial color="#5b5d63" transparent opacity={opacity} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

function WallPanel({
  args,
  position,
  rotation = [0, 0, 0],
  wallMaps,
  shadowTexture,
  shadowFaces = [],
  shadowOpacity = 0.72,
  castShadow = true,
  receiveShadow = true,
}) {
  const [sx, sy, sz] = args
  const faceOffset = 0.005
  const overlays = shadowFaces
    .flatMap((face) => {
    if (face === 'front') {
      return [{ key: 'front', size: [sx, sy], position: [0, 0, sz / 2 + faceOffset], rotation: [0, 0, 0] }]
    }
    if (face === 'back') {
      return [{ key: 'back', size: [sx, sy], position: [0, 0, -(sz / 2 + faceOffset)], rotation: [0, Math.PI, 0] }]
    }
    if (face === 'left') {
      return [{ key: 'left', size: [sz, sy], position: [-(sx / 2 + faceOffset), 0, 0], rotation: [0, -Math.PI / 2, 0] }]
    }
    if (face === 'right') {
      return [{ key: 'right', size: [sz, sy], position: [sx / 2 + faceOffset, 0, 0], rotation: [0, Math.PI / 2, 0] }]
    }
    return []
    })
    .map((overlay) => {
      const [ow, oh] = overlay.size

      if (ow < 0.32 || oh < 0.72) return null

      let opacity = shadowOpacity
      if (ow < 0.9) opacity *= 0.56
      else if (ow < 1.8) opacity *= 0.74
      else if (ow > 5) opacity *= 0.9

      if (oh < 1.6) opacity *= 0.78

      return {
        ...overlay,
        opacity,
      }
    })
    .filter(Boolean)

  return (
    <group position={position} rotation={rotation}>
      <mesh castShadow={castShadow} receiveShadow={receiveShadow}>
        <boxGeometry args={args} />
        <WallSurfaceMaterial wallMaps={wallMaps} />
      </mesh>
      {shadowTexture
        ? overlays.map((overlay) => (
            <WallFaceShadowLayer
              key={overlay.key}
              shadowTexture={shadowTexture}
              size={overlay.size}
              position={overlay.position}
              rotation={overlay.rotation}
              opacity={overlay.opacity}
            />
          ))
        : null}
    </group>
  )
}

function CorridorWallWashLight({ xMin, xMax, z, wallDepth = 0.22, baseGlow }) {
  const length = xMax - xMin
  const x = (xMin + xMax) / 2
  const direction = -Math.sign(z || 1)
  const stripHeight = 0.022
  const stripDepth = 0.014
  const stripY = 0.135
  const stripZ = z + direction * (wallDepth / 2 + stripDepth / 2 - 0.003)

  return (
    <group>
      <mesh position={[x, stripY, stripZ]}>
        <boxGeometry args={[Math.max(0.3, length - 0.06), stripHeight, stripDepth]} />
        <meshStandardMaterial
          color="#ffe09a"
          emissive="#ffc466"
          emissiveIntensity={1}
          toneMapped={false}
        />
      </mesh>

      <mesh position={[x, stripY, stripZ + direction * 0.004]} renderOrder={2}>
        <planeGeometry args={[Math.max(0.3, length - 0.08), 0.2]} />
        <meshBasicMaterial
          map={baseGlow.front}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

function CorridorPortalWalls({ z, wallMaps, baseGlow, shadowTexture }) {
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
        <group key={`solid-${z}-${index}`}>
          <WallPanel
            args={[xMax - xMin, height, 0.22]}
            position={[(xMin + xMax) / 2, height / 2, z]}
            wallMaps={wallMaps}
            shadowTexture={shadowTexture}
            shadowFaces={z > 0 ? ['back'] : ['front']}
          />
          <CorridorWallWashLight xMin={xMin} xMax={xMax} z={z} baseGlow={baseGlow} />
        </group>
      ))}

      {doorCenters.map((center) => (
        <WallPanel
          key={`lintel-${z}-${center}`}
          args={[DOOR_HALF * 2, height - DOOR_HEIGHT, 0.22]}
          position={[center, (DOOR_HEIGHT + height) / 2, z]}
          wallMaps={wallMaps}
          shadowTexture={shadowTexture}
          shadowFaces={z > 0 ? ['back'] : ['front']}
        />
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

function CentralLedStage({ baseGlow }) {
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

  // 中央大屏正面（朝入口 +x 侧）的灯光层次：基座前缘通长暖黄线性灯带 +
  // 顶部金属边框定点漫射高光，向上烘托屏幕、向下洗亮地面，营造悬浮感。
  const baseStripY = 0.036
  const baseStripH = 0.022
  const baseStripT = 0.014
  const baseFaceOut = 0.006 // 略外凸于基座前面，便于漏光
  const baseFrontX = footprintX / 2 + baseFaceOut

  const ctl = {
    glowH: 0.38,
    floorW: 0.3,
    floorOut: 0.05,
    stripInt: 1.75,
    topInt: 2.15,
    stripColor: '#ffc466',
  }

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

      {/* 基座前缘（+x 正面）通长隐藏式暖黄线性灯带（亮核） */}
      <mesh position={[baseFrontX, baseStripY, 0]}>
        <boxGeometry args={[baseStripT, baseStripH, footprintZ]} />
        <meshStandardMaterial
          color="#ffe09a"
          emissive={ctl.stripColor}
          emissiveIntensity={ctl.stripInt}
          toneMapped={false}
        />
      </mesh>

      {/* 灯带向上下扩散的暖黄光晕：烘托屏幕底部、柔化基座下沿 */}
      <mesh position={[baseFrontX + 0.004, baseStripY, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[footprintZ, ctl.glowH]} />
        <meshBasicMaterial
          map={baseGlow.front}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* 灯带向地面扩散的暖黄光毯 */}
      <mesh position={[baseFrontX + ctl.floorOut, 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ctl.floorW, footprintZ]} />
        <meshBasicMaterial
          map={baseGlow.floor}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      {/* 大屏金属上边框顶部定点漫射高光 */}
      <pointLight position={[0.45, 3.2, 0]} intensity={ctl.topInt} distance={3.2} decay={2} color="#eaf1fb" />

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

function Room({ hall, wallMaps, shadowTexture }) {
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
      <WallPanel
        args={[width, height, 0.2]}
        position={[0, height / 2, depth - 0.1]}
        wallMaps={wallMaps}
        shadowTexture={shadowTexture}
        shadowFaces={['back']}
      />

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
  const baseGlow = useBaseGlowTextures()
  const wallShadowTexture = useWallFaceShadowTexture()
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
      <FloorContactShadow position={[-halfWidth + 0.02, 0.012, (-halfDepth + TROPHY_NICHE.zMin) / 2]} rotation={[-Math.PI / 2, 0, 0]} size={[0.18, TROPHY_NICHE.zMin + halfDepth]} opacity={0.06} />
      <FloorContactShadow position={[-halfWidth + 0.02, 0.012, (halfDepth + TROPHY_NICHE.zMax) / 2]} rotation={[-Math.PI / 2, 0, 0]} size={[0.18, halfDepth - TROPHY_NICHE.zMax]} opacity={0.06} />
      <FloorContactShadow position={[halfWidth - 0.02, 0.012, (3 + halfDepth) / 2]} rotation={[-Math.PI / 2, 0, 0]} size={[0.18, halfDepth - 3]} opacity={0.06} />
      <FloorContactShadow position={[halfWidth - 0.02, 0.012, -(3 + halfDepth) / 2]} rotation={[-Math.PI / 2, 0, 0]} size={[0.18, halfDepth - 3]} opacity={0.06} />
      <FloorContactShadow position={[halfWidth + 0.18, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} size={[0.24, 6]} opacity={0.05} />
      <FloorContactShadow position={[0, 0.012, corridorHalf - 0.02]} rotation={[-Math.PI / 2, 0, 0]} size={[width, 0.18]} opacity={0.045} />
      <FloorContactShadow position={[0, 0.012, -corridorHalf + 0.02]} rotation={[-Math.PI / 2, 0, 0]} size={[width, 0.18]} opacity={0.045} />
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
      <WallPanel
        args={[wallThickness, height, TROPHY_NICHE.zMin + halfDepth]}
        position={[-halfWidth, height / 2, (-halfDepth + TROPHY_NICHE.zMin) / 2]}
        wallMaps={wallMaps}
        shadowTexture={wallShadowTexture}
        shadowFaces={['right']}
      />
      <WallPanel
        args={[wallThickness, height, halfDepth - TROPHY_NICHE.zMax]}
        position={[-halfWidth, height / 2, (halfDepth + TROPHY_NICHE.zMax) / 2]}
        wallMaps={wallMaps}
        shadowTexture={wallShadowTexture}
        shadowFaces={['right']}
      />
      <WallPanel
        args={[wallThickness, height - TROPHY_NICHE.yTop, TROPHY_NICHE.zMax - TROPHY_NICHE.zMin]}
        position={[-halfWidth, (TROPHY_NICHE.yTop + height) / 2, 0]}
        wallMaps={wallMaps}
        shadowTexture={wallShadowTexture}
        shadowFaces={['right']}
      />
      <WallPanel
        args={[wallThickness, TROPHY_NICHE.yBottom, TROPHY_NICHE.zMax - TROPHY_NICHE.zMin]}
        position={[-halfWidth, TROPHY_NICHE.yBottom / 2, 0]}
        wallMaps={wallMaps}
        shadowTexture={wallShadowTexture}
        shadowFaces={['right']}
      />
      <WallPanel
        args={[wallThickness, height, halfDepth - 3]}
        position={[halfWidth, height / 2, (3 + halfDepth) / 2]}
        wallMaps={wallMaps}
        shadowTexture={wallShadowTexture}
        shadowFaces={['left']}
      />
      <WallPanel
        args={[wallThickness, height, halfDepth - 3]}
        position={[halfWidth, height / 2, -(3 + halfDepth) / 2]}
        wallMaps={wallMaps}
        shadowTexture={wallShadowTexture}
        shadowFaces={['left']}
      />
      <WallPanel
        args={[wallThickness, height - 3.5, 6]}
        position={[halfWidth, (3.5 + height) / 2, 0]}
        wallMaps={wallMaps}
        shadowTexture={wallShadowTexture}
        shadowFaces={['left']}
      />

      <WallPanel
        args={[0.6, 3.5, 0.22]}
        position={[halfWidth + 0.3, 1.75, -3]}
        wallMaps={wallMaps}
        shadowTexture={wallShadowTexture}
        shadowFaces={['left']}
      />
      <WallPanel
        args={[0.6, 3.5, 0.22]}
        position={[halfWidth + 0.3, 1.75, 3]}
        wallMaps={wallMaps}
        shadowTexture={wallShadowTexture}
        shadowFaces={['left']}
      />
      <WallPanel
        args={[0.6, 0.5, 6]}
        position={[halfWidth + 0.3, 3.75, 0]}
        wallMaps={wallMaps}
        shadowTexture={wallShadowTexture}
        shadowFaces={['left']}
      />

      <DoorFrame
        width={6}
        height={3.5}
        depth={0.36}
        frameThickness={0.16}
        position={[halfWidth + 0.32, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
      />

      {[-dividerX, dividerX].map((x) => (
        <WallPanel
          key={`front-${x}`}
          position={[x, height / 2, corridorHalf + roomDepth / 2]}
          args={[0.22, height, roomDepth]}
          wallMaps={wallMaps}
          shadowTexture={wallShadowTexture}
          shadowFaces={['left', 'right']}
        />
      ))}
      {[-dividerX, dividerX].map((x) => (
        <WallPanel
          key={`back-${x}`}
          position={[x, height / 2, -(corridorHalf + roomDepth / 2)]}
          args={[0.22, height, roomDepth]}
          wallMaps={wallMaps}
          shadowTexture={wallShadowTexture}
          shadowFaces={['left', 'right']}
        />
      ))}

      <CorridorPortalWalls z={corridorHalf} wallMaps={wallMaps} baseGlow={baseGlow} shadowTexture={wallShadowTexture} />
      <CorridorPortalWalls z={-corridorHalf} wallMaps={wallMaps} baseGlow={baseGlow} shadowTexture={wallShadowTexture} />

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

      <CentralLedStage baseGlow={baseGlow} />
      <SandTable />

      {HALLS.map((hall) => (
        <Room key={hall.id} hall={hall} wallMaps={wallMaps} shadowTexture={wallShadowTexture} />
      ))}
    </group>
  )
}
