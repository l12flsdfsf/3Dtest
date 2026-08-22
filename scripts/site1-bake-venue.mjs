// 场地 GLB + 材质.json → 应用材质的中间 GLB（供 compress-ktx2.mjs 压缩）
// 按技术交付流程：GLB 提供几何，材质.json 提供最终视觉（materialsMap 网格名→材质）。
//
// 三阶段（单文件单次运行）：
//   ① 流式提取：材质.json 的 images dataURL 落盘（避免 JSON.parse 数百 MB），
//      头部解析 materials/textures，尾部解析 materialsMap
//   ② 法线贴图 G 通道反转：normalScale[1,-1]（Tripo 约定）在 glTF 里表达不了，
//      烘进贴图像素；spawn 独立进程跑 sharp（主进程内必崩，同 compress-ktx2 的坑）
//   ③ NodeIO 读 GLB，three.js 材质 → glTF 材质（含透射/体积/IOR/高光/清漆/织物/自发光强度），
//      按 materialsMap 替换网格材质，未匹配网格保留 GLB 原材质
//
// 用法: node scripts/site1-bake-venue.mjs --glb "D:/场地1/大厅.glb" --json "D:/场地1/大厅材质.json" --out models-src/site1-migration/大厅.materials.glb
import { NodeIO } from '@gltf-transform/core'
import { dedup, prune } from '@gltf-transform/functions'
import {
  EXTMeshoptCompression,
  KHRMaterialsClearcoat,
  KHRMaterialsEmissiveStrength,
  KHRMaterialsIOR,
  KHRMaterialsSheen,
  KHRMaterialsSpecular,
  KHRMaterialsTransmission,
  KHRMaterialsVolume,
  KHRMeshQuantization,
  KHRTextureBasisu,
} from '@gltf-transform/extensions'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '..')
const args = process.argv.slice(2)
const argOf = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const GLB = argOf('--glb')
const MAT_JSON = argOf('--json')
const OUT = argOf('--out')
if (!GLB || !MAT_JSON || !OUT) {
  console.error('用法: node scripts/site1-bake-venue.mjs --glb <场地.glb> --json <材质.json> --out <输出.glb>')
  process.exit(1)
}
const WORK = path.join(ROOT, '.tmp-site1', path.basename(MAT_JSON).replace(/\.json$/, ''))
fs.mkdirSync(path.join(WORK, 'images'), { recursive: true })
fs.mkdirSync(path.dirname(path.resolve(ROOT, OUT)), { recursive: true })

// ---------------- 阶段①：流式提取 ----------------
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
const intToLinearRGB = (hex) => [
  srgbToLinear(((hex >> 16) & 255) / 255),
  srgbToLinear(((hex >> 8) & 255) / 255),
  srgbToLinear((hex & 255) / 255),
]

async function extractImages() {
  const fd = fs.openSync(MAT_JSON, 'r')
  const CH = 8 * 1024 * 1024
  const buf = Buffer.alloc(CH)
  const imageFile = new Map() // uuid -> 文件路径
  let pending = '' // 跨块携带的文本（含未闭合 dataURL）
  let state = 'seek'
  let urlStart = 0
  let currentUuid = null
  let window4k = ''
  const t0 = Date.now()

  while (true) {
    const n = fs.readSync(fd, buf, 0, CH, null)
    if (n <= 0) break
    const text = pending + buf.subarray(0, n).toString('latin1')
    let ptr = 0
    while (ptr < text.length) {
      if (state === 'seek') {
        const i = text.indexOf('"url":"data:image/', ptr)
        if (i === -1) break
        // uuid 必须在起始时就地捕获（跨块后回看不到）
        const before = (window4k + text.slice(ptr, i)).slice(-300)
        const um = before.match(/"uuid":"([0-9a-f-]{36})",$/)
        if (!um) throw new Error(`dataURL 前找不到 uuid（上下文 ...${before.slice(-80)}）`)
        currentUuid = um[1]
        urlStart = i + 7 // 指向 data: 开头
        state = 'inurl'
        ptr = urlStart
      } else {
        const end = text.indexOf('"', ptr)
        if (end === -1) {
          ptr = text.length
          break
        }
        const dataUrl = text.slice(urlStart, end)
        const m = dataUrl.match(/^data:image\/(png|jpeg);base64,/)
        if (!m) throw new Error(`未知 dataURL 前缀: ${dataUrl.slice(0, 40)}`)
        const file = path.join(WORK, 'images', `${currentUuid}.${m[1] === 'jpeg' ? 'jpg' : 'png'}`)
        const bytes = Buffer.from(dataUrl.slice(m[0].length), 'base64')
        fs.writeFileSync(file, bytes)
        imageFile.set(currentUuid, file)
        state = 'seek'
        ptr = end + 1
        window4k = ''
      }
    }
    if (state === 'seek') {
      pending = ''
      window4k = text.slice(-4096)
    } else {
      // inurl 未闭合：保留从 urlStart 起的文本
      pending = text.slice(urlStart)
      urlStart = 0
      window4k = ''
    }
  }
  fs.closeSync(fd)

  // 头部（materials + textures 在 images 之前）——只读前 8MB，不整读大文件
  const headFd = fs.openSync(MAT_JSON, 'r')
  const headRaw = Buffer.alloc(8 * 1024 * 1024)
  const headLen = fs.readSync(headFd, headRaw, 0, headRaw.length, 0)
  fs.closeSync(headFd)
  const headText = headRaw.subarray(0, headLen).toString('utf8')
  const imagesAt = headText.indexOf('"images":')
  if (imagesAt === -1) throw new Error('前 8MB 找不到 "images":')
  const head = JSON.parse(headText.slice(0, imagesAt).replace(/,\s*$/, '') + '}')

  // 尾部（materialsMap）：从后往前找，向后括号配平；值不足时继续向前读
  const st = fs.statSync(MAT_JSON)
  const tailFd = fs.openSync(MAT_JSON, 'r')
  let tail = ''
  let mapAt = -1
  for (let end = st.size; end > 0; end -= 4 * 1024 * 1024) {
    const n = Math.min(4 * 1024 * 1024, end)
    const b = Buffer.alloc(n)
    fs.readSync(tailFd, b, 0, n, end - n)
    tail = b.toString('utf8') + tail
    mapAt = tail.indexOf('"materialsMap":')
    if (mapAt !== -1) break
  }
  if (mapAt === -1) throw new Error('找不到 materialsMap')
  const valueStart = mapAt + 15
  let depth = 0
  let stop = -1
  for (let k = valueStart; k < tail.length; k += 1) {
    const c = tail[k]
    if (c === '{' || c === '[') depth += 1
    else if (c === '}' || c === ']') {
      depth -= 1
      if (depth === 0) {
        stop = k
        break
      }
    }
  }
  if (stop === -1) throw new Error('materialsMap 值超出已读窗口（>4MB），需加大回读')
  fs.closeSync(tailFd)
  console.log(
    `[①] 提取 ${imageFile.size} 张图片(${((Date.now() - t0) / 1000).toFixed(0)}s)，materials=${head.materials?.length} textures=${head.textures?.length}`,
  )
  return { head, materialsMap: JSON.parse(tail.slice(valueStart, stop + 1)), imageFile }
}

// ---------------- 阶段②：法线 G 反转 ----------------
async function invertNormals({ head, imageFile }) {
  const need = new Set()
  let negScale = 0
  for (const mat of head.materials ?? []) {
    if (!mat.normalMap) continue
    const ns = Array.isArray(mat.normalScale) ? mat.normalScale : [1, 1]
    if (ns[0] < 0 || ns[1] < 0) {
      negScale += 1
      const tex = (head.textures ?? []).find((t) => t.uuid === mat.normalMap)
      if (tex?.image && imageFile.has(tex.image)) need.add(imageFile.get(tex.image))
    }
  }
  if (!need.size) return { inverted: [], negScale }
  console.log(`[②] ${negScale} 个材质 normalScale 含负值，反转 ${need.size} 张法线贴图 G 通道`)
  const files = [...need]
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts/site1-invert-g.cjs'), ...files], {
      stdio: 'inherit',
    })
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error('G 反转失败'))))
  })
  // 反转产物是 .ginv.png，替换映射
  for (const f of files) {
    const inv = f.replace(/\.(jpe?g|png)$/i, '.ginv.png')
    if (fs.existsSync(inv)) {
      const uuid = path.basename(f).replace(/\.[^.]+$/, '')
      imageFile.set(uuid, inv)
    }
  }
  return { inverted: files, negScale }
}

// ---------------- 阶段③：应用材质 ----------------
async function applyMaterials({ head, materialsMap, imageFile }) {
  const io = new NodeIO().registerDependencies({}).registerExtensions([
    EXTMeshoptCompression,
    KHRMeshQuantization,
    KHRTextureBasisu,
    KHRMaterialsClearcoat,
    KHRMaterialsEmissiveStrength,
    KHRMaterialsIOR,
    KHRMaterialsSheen,
    KHRMaterialsSpecular,
    KHRMaterialsTransmission,
    KHRMaterialsVolume,
  ])
  const doc = await io.read(GLB)
  const root = doc.getRoot()

  const texByUuid = new Map() // json texture uuid -> gltf Texture
  const texJsonByUuid = new Map((head.textures ?? []).map((t) => [t.uuid, t]))
  let nonUnityUv = 0
  const getTexture = (uuid) => {
    if (texByUuid.has(uuid)) return texByUuid.get(uuid)
    const tj = texJsonByUuid.get(uuid)
    const file = tj && imageFile.get(tj.image)
    if (!file) return null
    const bytes = fs.readFileSync(file)
    const tex = doc
      .createTexture(path.basename(file))
      .setImage(new Uint8Array(bytes))
      .setMimeType(file.endsWith('.png') ? 'image/png' : 'image/jpeg')
    texByUuid.set(uuid, tex)
    const rep = tj.repeat ?? [1, 1]
    const off = tj.offset ?? [0, 0]
    if (rep[0] !== 1 || rep[1] !== 1 || off[0] !== 0 || off[1] !== 0) nonUnityUv += 1
    return tex
  }

  // 扩展实例（懒建）。缓存键用类本身：Cls.extensionName 是实例属性、在类上取是
  // undefined，会让所有扩展共享同一个缓存槽（值互相写错）
  const extOf = (Cls) => {
    if (!extCache.has(Cls)) extCache.set(Cls, doc.createExtension(Cls))
    return extCache.get(Cls)
  }
  const extCache = new Map()

  const stats = { created: 0, envSkipped: 0, backSide: 0, mrSplit: 0 }
  const matByUuid = new Map()
  for (const mj of head.materials ?? []) {
    const mat = doc.createMaterial(String(mj.name ?? mj.uuid))
    stats.created += 1
    matByUuid.set(mj.uuid, mat)
    if (mj.side === 2) mat.setDoubleSided(true)
    if (mj.side === 1) stats.backSide += 1
    if (mj.transparent === true || (mj.opacity ?? 1) < 1) mat.setAlphaMode('BLEND')
    if (mj.alphaTest > 0) mat.setAlphaMode('MASK').setAlphaCutoff(mj.alphaTest)

    const pbr = [1, 1, 1, mj.opacity ?? 1]
    if (typeof mj.color === 'number') {
      const [r, g, b] = intToLinearRGB(mj.color)
      pbr[0] = r
      pbr[1] = g
      pbr[2] = b
    }
    mat.setBaseColorFactor(pbr)
    mat.setMetallicFactor(mj.metalness ?? 1)
    mat.setRoughnessFactor(mj.roughness ?? 1)
    if (mj.map) mat.setBaseColorTexture(getTexture(mj.map))

    // ORM：G=roughness B=metallic；roughnessMap===metalnessMap（Tripo 惯例）直接用
    if (mj.roughnessMap && mj.roughnessMap === mj.metalnessMap) {
      mat.setMetallicRoughnessTexture(getTexture(mj.roughnessMap))
    } else if (mj.roughnessMap || mj.metalnessMap) {
      stats.mrSplit += 1
      if (mj.roughnessMap) mat.setMetallicRoughnessTexture(getTexture(mj.roughnessMap))
    }
    if (mj.metalnessMap && !mj.roughnessMap) {
      mat.setMetallicRoughnessTexture(getTexture(mj.metalnessMap))
    }

    if (mj.normalMap) {
      const ns = Array.isArray(mj.normalScale) ? Math.abs(mj.normalScale[0] || 1) : 1
      mat.setNormalTexture(getTexture(mj.normalMap), { scale: ns })
    }
    if (mj.aoMap) mat.setOcclusionTexture(getTexture(mj.aoMap))
    if (typeof mj.emissive === 'number' && mj.emissive !== 0) {
      mat.setEmissiveFactor(intToLinearRGB(mj.emissive))
    }
    if (mj.emissiveMap) mat.setEmissiveTexture(getTexture(mj.emissiveMap))
    if ((mj.emissiveIntensity ?? 1) > 1) {
      mat.setExtension(
        'KHR_materials_emissive_strength',
        extOf(KHRMaterialsEmissiveStrength).createEmissiveStrength().setEmissiveStrength(mj.emissiveIntensity),
      )
    }
    if (mj.transmission > 0) {
      mat.setExtension(
        'KHR_materials_transmission',
        extOf(KHRMaterialsTransmission).createTransmission().setTransmissionFactor(mj.transmission),
      )
    }
    if ((mj.thickness ?? 0) > 0 || (mj.transmission ?? 0) > 0) {
      const vol = extOf(KHRMaterialsVolume).createVolume()
      vol.setThicknessFactor(mj.thickness ?? 0)
      if (mj.attenuationDistance) vol.setAttenuationDistance(mj.attenuationDistance)
      if (typeof mj.attenuationColor === 'number') vol.setAttenuationColor(intToLinearRGB(mj.attenuationColor))
      mat.setExtension('KHR_materials_volume', vol)
    }
    if (typeof mj.ior === 'number' && mj.ior !== 1.5) {
      mat.setExtension('KHR_materials_ior', extOf(KHRMaterialsIOR).createIOR().setIOR(mj.ior))
    }
    if (typeof mj.specularIntensity === 'number' && mj.specularIntensity !== 1) {
      mat.setExtension(
        'KHR_materials_specular',
        extOf(KHRMaterialsSpecular).createSpecular().setSpecularFactor(mj.specularIntensity),
      )
    }
    if (typeof mj.specularColor === 'number' && mj.specularColor !== 16777215) {
      const spec = mat.getExtension('KHR_materials_specular') ?? extOf(KHRMaterialsSpecular).createSpecular()
      spec.setSpecularColorFactor(intToLinearRGB(mj.specularColor))
      mat.setExtension('KHR_materials_specular', spec)
    }
    if ((mj.clearcoat ?? 0) > 0) {
      mat.setExtension(
        'KHR_materials_clearcoat',
        extOf(KHRMaterialsClearcoat)
          .createClearcoat()
          .setClearcoatFactor(mj.clearcoat)
          .setClearcoatRoughnessFactor(mj.clearcoatRoughness ?? 0),
      )
    }
    if ((mj.sheen ?? 0) > 0 || (mj.sheenColor ?? 0) > 0) {
      const sheen = extOf(KHRMaterialsSheen).createSheen()
      if (typeof mj.sheenColor === 'number') sheen.setSheenColorFactor(intToLinearRGB(mj.sheenColor))
      sheen.setSheenRoughnessFactor(mj.sheenRoughness ?? 1)
      mat.setExtension('KHR_materials_sheen', sheen)
    }
    if (typeof mj.envMapIntensity === 'number' && mj.envMapIntensity !== 1) stats.envSkipped += 1
  }

  // materialsMap：对象名(去点) → 材质。他们的工具按 GLB 的 mesh 名（网格.NNN）建对象，
  // 也有少量节点名键（polySurface*/pCube*）。基准名=primitive 0，_N 从 1 起。
  const normKey = (s) => String(s ?? '').replace(/[.\s]/g, '')
  const mapByNorm = new Map()
  for (const [k, v] of Object.entries(materialsMap)) mapByNorm.set(normKey(k), v)
  const applyKey = (label, prims) => {
    let hits = 0
    for (let i = 0; i < prims.length; i += 1) {
      const key = i === 0 ? label : `${label}_${i}`
      const entry = mapByNorm.get(key) ?? (i === 0 ? null : mapByNorm.get(label))
      if (!entry) continue
      const mat = matByUuid.get(entry.materialUuid)
      if (!mat) continue
      prims[i].setMaterial(mat)
      matchedPrims += 1
      hits += 1
      mapUnused.delete(key)
    }
    return hits
  }
  let matchedNodes = 0
  let matchedPrims = 0
  const unmatchedNodes = []
  const mapUnused = new Set(mapByNorm.keys())
  for (const mesh of root.listMeshes()) {
    const prims = mesh.listPrimitives()
    // 先按 mesh 名（网格.NNN），再回退到引用节点名（polySurface* 等）
    const keys = [normKey(mesh.getName())]
    for (const node of root.listNodes()) {
      if (node.getMesh() === mesh) keys.push(normKey(node.getName()))
    }
    const hit = keys.some((key) => key && applyKey(key, prims) > 0)
    if (hit) matchedNodes += 1
    else unmatchedNodes.push(`${mesh.getName()}`)
  }

  // 清掉被替换下来的孤立材质/贴图，再去重，避免旧贴图白白进压缩管线
  await doc.transform(prune(), dedup())
  await io.write(OUT, doc)
  const sizeMB = (fs.statSync(OUT).size / 1048576).toFixed(1)
  console.log(
    `[③] 材质 ${stats.created} 个(BackSide ${stats.backSide}, MR分离 ${stats.mrSplit}, envMapIntensity跳过 ${stats.envSkipped}) | ` +
      `网格命中 ${matchedNodes} 节点/${matchedPrims} primitive | 未匹配网格 ${unmatchedNodes.length} 个 | map 空余键 ${mapUnused.size} | ` +
      `非单位UV ${nonUnityUv} | 输出 ${OUT} ${sizeMB}MB`,
  )
  if (unmatchedNodes.length) console.log(`    未匹配: ${unmatchedNodes.slice(0, 20).join(' | ')}${unmatchedNodes.length > 20 ? ' ...' : ''}`)
  if (mapUnused.size) console.log(`    map 空余键: ${[...mapUnused].slice(0, 20).join(' | ')}${mapUnused.size > 20 ? ' ...' : ''}`)
}

const extracted = await extractImages()
await invertNormals(extracted)
await applyMaterials(extracted)
