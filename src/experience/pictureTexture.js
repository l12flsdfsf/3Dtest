import * as THREE from 'three'

// 从外部 gltf 模型的网格材质中识别并导出可点击查看的「图片」。
// 只开放墙上单张老照片：独立的高清贴图（材质 / 材质.001~材质.NNN 系列），
// 走 emissiveMap，整张即所见。
// 厅内的拼贴展板/背景墙（板/屏/海报命名，如 大厅白板、技术展厅海报背板）、
// 竖版证书贴图（奖状/奖牌）、墙面/地板的平铺纹理与展柜/展台纯色材质
// 都不属于「图片」，不参与点击与悬停提示。

const MIN_PHOTO_NAME_SIZE = 256
// 本模型的墙上照片统一命名为 材质 / 材质.001~材质.095（竖版横版均有），按命名识别最可靠
const PHOTO_MATERIAL_RE = /^材质(?:\.\d+)?$/

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

  // KTX2 等压缩纹理的 image 是各级 mipmap 描述符的数组，取第 0 级
  const source = Array.isArray(image) ? image[0] : image
  const width = Number(source?.width) || 0
  const height = Number(source?.height) || 0
  if (!width || !height) return null

  return { width, height }
}

// ---------------------------------------------------------------------------
// 压缩纹理（KTX2/Basis）解码：canvas 的 drawImage 画不了 GPU 压缩纹理，
// 用一个离屏 WebGLRenderer 把整张贴图渲成 1:1 像素再回读，等效于拿到解码后的原图。
let gpuDecodeRenderer = null

function getGpuDecodeRenderer() {
  if (gpuDecodeRenderer) return gpuDecodeRenderer
  gpuDecodeRenderer = new THREE.WebGLRenderer({
    canvas: document.createElement('canvas'),
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: true,
  })
  gpuDecodeRenderer.setSize(4, 4)
  return gpuDecodeRenderer
}

// 把（压缩）贴图整幅解码为指定尺寸的 2D canvas。
// 返回的 canvas 与「原图片文件」同方向同色彩（sRGB），可直接当 image 用。
function decodeTextureToCanvas(texture, width, height) {
  const renderer = getGpuDecodeRenderer()
  const previousTarget = renderer.getRenderTarget()

  const material = new THREE.MeshBasicMaterial({ map: texture })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  const scene = new THREE.Scene()
  scene.add(quad)
  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0, 1)

  const target = new THREE.WebGLRenderTarget(width, height, {
    depthBuffer: false,
    stencilBuffer: false,
  })
  // 按纹理自身的色彩空间写出（照片为 sRGB），保证解码后颜色与原图一致
  target.texture.colorSpace = THREE.SRGBColorSpace

  renderer.setRenderTarget(target)
  renderer.render(scene, camera)

  const buffer = new Uint8Array(width * height * 4)
  renderer.readRenderTargetPixels(target, 0, 0, width, height, buffer)
  renderer.setRenderTarget(previousTarget)

  quad.geometry.dispose()
  material.dispose()
  target.dispose()

  // 回读缓冲第 0 行对应贴图数据第 0 行（压缩纹理 flipY 恒为 false），
  // 与 ImageData 的行序一致，直接拷贝即可；flipY 纹理才需要翻转。
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const imageData = ctx.createImageData(width, height)
  if (texture.flipY) {
    const rowSize = width * 4
    for (let y = 0; y < height; y += 1) {
      imageData.data.set(buffer.subarray((height - 1 - y) * rowSize, (height - y) * rowSize), y * rowSize)
    }
  } else {
    imageData.data.set(buffer)
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

// 统一的「贴图 → 可绘制 canvas」入口：普通贴图直接画，压缩贴图走 GPU 解码
function textureToCanvas(texture, width, height) {
  if (!isCompressedTexture(texture)) {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d').drawImage(texture.image, 0, 0, width, height)
    return canvas
  }
  return decodeTextureToCanvas(texture, width, height)
}

// KTX2/Basis 压缩纹理：CompressedTexture.image 只是 {width,height} 描述符，
// 真正的压缩数据在 texture.mipmaps，无法用 canvas drawImage 绘制
function isCompressedTexture(texture) {
  return texture?.isCompressedTexture === true || Array.isArray(texture?.image)
}

// 竖版、高分辨率且未设置平铺的贴图视为照片（当前未启用：证书/奖状类贴图
// 不参与点击；如需放开未命名的竖版照片贴图，在 findMaterialPicture 里恢复调用）
export function isPictureTexture(texture) {
  if (!texture?.isTexture) return false

  const size = getTextureImageSize(texture)
  if (!size) return false
  if (size.width < 512 || size.height < 1024) return false
  if (size.height <= size.width) return false

  const { repeat } = texture
  if (repeat && (Math.abs(repeat.x - 1) > 0.01 || Math.abs(repeat.y - 1) > 0.01)) return false

  return true
}

// 取材质上承载图片的贴图：照片走 emissiveMap（自发光贴图），兼容 map。
// 只认 材质 / 材质.NNN 命名的照片系列；拼贴展板/背景墙、屏幕、竖版证书
// 一律不纳入（判定见文件头注释），后续要放开某类时在此按名单补充。
function findMaterialPicture(material) {
  if (!material) return null

  const name = typeof material.name === 'string' ? material.name : ''
  const map = material.emissiveMap || material.map
  const size = map ? getTextureImageSize(map) : null
  const minSide = size ? Math.min(size.width, size.height) : 0

  // 材质.NNN 系列照片：横竖版都有，整张贴图即一张照片
  if (PHOTO_MATERIAL_RE.test(name) && minSide >= MIN_PHOTO_NAME_SIZE) {
    return { texture: map, name, board: false }
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
  const size = getTextureImageSize(texture)
  const scale = Math.min(1, SCAN_MAX_SIZE / Math.max(size.width, size.height))
  const width = Math.max(1, Math.round(size.width * scale))
  const height = Math.max(1, Math.round(size.height * scale))

  const canvas = textureToCanvas(texture, width, height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
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
  const size = getTextureImageSize(texture)
  if (!size) throw new Error('texture has no image')

  // 压缩贴图先解码成原尺寸 canvas，后续裁剪/导出与普通图片同路
  const source = isCompressedTexture(texture) ? textureToCanvas(texture, size.width, size.height) : texture.image

  if (options.board) {
    const crop = computeBoardCrop(texture, options.uv)
    if (!crop) return null

    const canvas = document.createElement('canvas')
    canvas.width = crop.sw
    canvas.height = crop.sh
    canvas.getContext('2d').drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, crop.sw, crop.sh)

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('toBlob failed'))), 'image/png')
    })
    return { name: name || '', url: URL.createObjectURL(blob), width: crop.sw, height: crop.sh }
  }

  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  canvas.getContext('2d').drawImage(source, 0, 0)

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
