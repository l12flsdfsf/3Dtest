import * as THREE from 'three'

// 从外部 gltf 模型的网格材质中识别并导出可点击查看的「图片」。
// 两类：
// 1. 墙上照片：独立的高清竖版贴图（材质.001~材质.095），走 emissiveMap，整张即所见；
// 2. 展板/屏幕：拼贴板/海报板/屏幕的整张贴图。拼贴板上印有多张图，
//    导出时按点击位置向四周找白色框线/留白，裁出被点击的那一张。
//    厅内墙面/地板的平铺纹理与展柜/展台纯色材质不属于图片。

const MIN_PHOTO_WIDTH = 512
const MIN_PHOTO_HEIGHT = 1024
const MIN_PHOTO_NAME_SIZE = 256
const MIN_BOARD_SIZE = 512
// 本模型的墙上照片统一命名为 材质 / 材质.001~材质.095（竖版横版均有），按命名识别最可靠
const PHOTO_MATERIAL_RE = /^材质(?:\.\d+)?$/
// 材质名含这些字的视为展板/屏幕（本模型命名规律：大厅白板、电视厅海报版、2屏…）
const BOARD_NAME_HINTS = ['板', '屏', '海报']
// 「地板」也含「板」字，但它是平铺地面材质，需排除
const BOARD_NAME_EXCLUDES = ['地板']

// 拼贴裁剪参数（在缩到最大 1024px 的位图上扫描）
const SCAN_MAX_SIZE = 1024
const SCAN_WINDOW = 110 // 统计条纹时的窗口半宽/半高（像素）
const EDGE_DELTA = 26 // 条纹均值相对内部均值的偏离阈值
const EDGE_RUN = 5 // 连续偏离多少条纹才认定边界
const LOCAL_STD_MIN = 10 // 点击处局部波动低于此值视为点到留白
const CROP_MIN_RATIO = 0.08 // 扫描边界合理的最小占比
const CROP_MAX_RATIO = 0.45 // 扫描边界合理的最大占比，超出回退为窗口裁剪
const FALLBACK_WINDOW = 0.4 // 边界不可信时以点击点为中心的窗口大小占比

function getTextureImageSize(texture) {
  const image = texture?.image
  if (!image) return null

  const width = Number(image.width) || 0
  const height = Number(image.height) || 0
  if (!width || !height) return null

  return { width, height }
}

// 竖版、高分辨率且未设置平铺的贴图视为照片
export function isPictureTexture(texture) {
  if (!texture?.isTexture) return false

  const size = getTextureImageSize(texture)
  if (!size) return false
  if (size.width < MIN_PHOTO_WIDTH || size.height < MIN_PHOTO_HEIGHT) return false
  if (size.height <= size.width) return false

  const { repeat } = texture
  if (repeat && (Math.abs(repeat.x - 1) > 0.01 || Math.abs(repeat.y - 1) > 0.01)) return false

  return true
}

function isBoardMaterialName(name) {
  return (
    BOARD_NAME_HINTS.some((hint) => name.includes(hint)) &&
    !BOARD_NAME_EXCLUDES.some((exclude) => name.includes(exclude))
  )
}

// 取材质上承载图片的贴图：照片/展板走 emissiveMap（自发光贴图），兼容 map
function findMaterialPicture(material) {
  if (!material) return null

  const name = typeof material.name === 'string' ? material.name : ''
  const map = material.emissiveMap || material.map
  const size = map ? getTextureImageSize(map) : null
  const minSide = size ? Math.min(size.width, size.height) : 0

  // 1. 材质.NNN 系列照片：横竖版都有，整张贴图即一张照片
  if (PHOTO_MATERIAL_RE.test(name) && minSide >= MIN_PHOTO_NAME_SIZE) {
    return { texture: map, name, board: false }
  }
  // 2. 未命名材质的竖版高清贴图视为照片
  if (isPictureTexture(material.emissiveMap)) {
    return { texture: material.emissiveMap, name, board: false }
  }
  if (isPictureTexture(material.map)) {
    return { texture: material.map, name, board: false }
  }
  // 3. 展板/屏幕
  if (isBoardMaterialName(name) && minSide >= MIN_BOARD_SIZE) {
    // 拼贴板按点击位置裁出单张；屏幕本身就是整幅画面，不裁剪
    return { texture: map, name, board: !name.includes('屏') }
  }
  // 注：厅名材质（关怀厅/大厅…）的墙面纹理虽烘焙了照片，但其 UV 与渲染
  // 采样不一致（射线交点处的贴图像素是纯色），无法可靠定位到单张，故不纳入。

  return null
}

// 命中面带 materialIndex 时优先取对应材质，否则遍历材质找第一张图片贴图
export function findPictureTexture(object, face) {
  if (!object?.material) return null

  const materials = Array.isArray(object.material) ? object.material : [object.material]
  const hitIndex = face?.materialIndex
  const ordered =
    Number.isInteger(hitIndex) && materials[hitIndex] ? [materials[hitIndex], ...materials] : materials

  for (const material of ordered) {
    const picture = findMaterialPicture(material)
    if (picture?.texture) return picture
  }

  return null
}

// 把贴图位图绘制到（可能缩放过的）canvas 并返回像素数据
function readTexturePixels(texture) {
  const image = texture.image
  const scale = Math.min(1, SCAN_MAX_SIZE / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(image, 0, 0, width, height)
  return { data: ctx.getImageData(0, 0, width, height).data, width, height, scale }
}

function stripeMean(pixels, width, vertical, fixed, from, to) {
  // 一条竖直/水平条纹在 [from,to] 区间内的亮度均值
  let sum = 0
  let n = 0
  for (let i = from; i <= to; i += 2) {
    const x = vertical ? fixed : i
    const y = vertical ? i : fixed
    const idx = (y * width + x) * 4
    sum += 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2]
    n += 1
  }
  return sum / n
}

// 过点击点的整条行/列的条纹均值序列
function lineMeans(pixels, width, height, vertical, fixed, center) {
  const count = vertical ? width : height
  const from = Math.max(0, center - SCAN_WINDOW)
  const to = Math.min((vertical ? height : width) - 1, center + SCAN_WINDOW)
  const means = new Array(count)
  for (let i = 0; i < count; i += 1) {
    means[i] = stripeMean(pixels, width, vertical, i, from, to)
  }
  return means
}

// 从 start 沿 step 方向找边界：条纹均值持续偏离已走过区域的运行均值则认定到达图片边缘
function scanEdge(means, start, step) {
  const count = means.length
  let base = 0
  let baseN = 0
  for (let k = 0; k < 3; k += 1) {
    const i = start - step * k
    if (i < 0 || i >= count) break
    base += means[i]
    baseN += 1
  }
  if (!baseN) return -1
  let runMean = base / baseN

  let run = 0
  let i = start + step
  while (i >= 0 && i < count) {
    if (Math.abs(means[i] - runMean) > EDGE_DELTA) {
      run += 1
      if (run >= EDGE_RUN) return i - step * (run - 1)
    } else {
      runMean = (runMean * baseN + means[i]) / (baseN + 1)
      baseN += 1
      run = 0
    }
    i += step
  }
  return step > 0 ? count - 1 : 0 // 没有明显边界则该侧取贴图边缘
}

function localStd(pixels, width, x, y, radius) {
  let sum = 0
  let sum2 = 0
  let n = 0
  for (let yy = Math.max(0, y - radius); yy <= y + radius; yy += 1) {
    if (yy * width * 4 >= pixels.length) break
    for (let xx = Math.max(0, x - radius); xx <= x + radius && xx < width; xx += 1) {
      const idx = (yy * width + xx) * 4
      const gray = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2]
      sum += gray
      sum2 += gray * gray
      n += 1
    }
  }
  const mean = sum / n
  return Math.sqrt(Math.max(0, sum2 / n - mean * mean))
}

// 某一轴的扫描边界是否可信（图片不会太窄也不会横跨大半张贴图）
function axisBounds(start, low, high, size) {
  const span = high - low
  if (span >= size * CROP_MIN_RATIO && span <= size * CROP_MAX_RATIO) return [low, high]

  // 不可信：以点击点为中心取窗口（贴边时向内收）
  const half = Math.round((size * FALLBACK_WINDOW) / 2)
  return [
    THREE.MathUtils.clamp(start - half, 0, Math.max(0, size - half * 2)),
    THREE.MathUtils.clamp(start + half, Math.min(size, half * 2), size),
  ]
}

// 拼贴板按点击位置裁出单张图：先按明暗边界探测，不可信的轴回退为居中窗口
function computeBoardCrop(texture, uv) {
  if (!uv) return null

  try {
    const { data, width, height, scale } = readTexturePixels(texture)
    const px = THREE.MathUtils.clamp(Math.round(uv.x * width), 0, width - 1)
    const py = THREE.MathUtils.clamp(
      Math.round((texture.flipY ? 1 - uv.y : uv.y) * height),
      0,
      height - 1,
    )

    if (localStd(data, width, px, py, 12) < LOCAL_STD_MIN) return null // 点到留白/标题区，看整张

    const rowMeans = lineMeans(data, width, height, false, py, px)
    const colMeans = lineMeans(data, width, height, true, px, py)
    const [x0, x1] = axisBounds(px, scanEdge(rowMeans, px, -1), scanEdge(rowMeans, px, 1), width)
    const [y0, y1] = axisBounds(py, scanEdge(colMeans, py, -1), scanEdge(colMeans, py, 1), height)

    return {
      sx: Math.round(x0 / scale),
      sy: Math.round(y0 / scale),
      sw: Math.max(1, Math.round((x1 - x0) / scale)),
      sh: Math.max(1, Math.round((y1 - y0) / scale)),
    }
  } catch (error) {
    console.error('拼贴板裁剪失败', error)
    return null
  }
}

// 把贴图原图导出为可展示的 blob URL。
// board 类（拼贴板/烘焙墙）按点击 uv 裁出单张：点击处是纯色留白时返回 null（交还调用方继续尝试更远的命中）。
// 其余导出整张，无画质损失。
export async function textureToPhoto(texture, name, options = {}) {
  const image = texture?.image
  if (!image) throw new Error('texture has no image')

  if (options.board) {
    const crop = computeBoardCrop(texture, options.uv)
    if (!crop) return null

    const canvas = document.createElement('canvas')
    canvas.width = crop.sw
    canvas.height = crop.sh
    canvas.getContext('2d').drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh)

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('toBlob failed'))), 'image/png')
    })
    return { name: name || '', url: URL.createObjectURL(blob), width: crop.sw, height: crop.sh }
  }

  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  canvas.getContext('2d').drawImage(image, 0, 0)

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('toBlob failed'))), 'image/png')
  })

  return {
    name: name || '',
    url: URL.createObjectURL(blob),
    width: canvas.width,
    height: canvas.height,
  }
}
