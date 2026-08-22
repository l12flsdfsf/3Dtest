// 设备/奖杯 Object3D.toJSON → GLB（含摆位烘焙）
// 输入: 场地1/设备0822/X.json 或 奖杯.json（three.js 完整序列化：几何明文+材质+base64贴图，
//       全部无摆位）+ models-src/site1-migration/placements.json（现模型导出的世界摆位）
// 输出: 中间 GLB，节点带世界 translation/rotation/scale，供 compress-ktx2.mjs 压缩
//
// 名称匹配规则：双方去点规范化（网格.028→网格028，pCube20.001→pCube20001）后精确匹配；
// 失败再退化为去尾数字的基础名。逐条消费摆位避免重名误用。
//
// 用法: node scripts/site1-object-to-glb.mjs --json "D:/场地1/奖杯.json" --placements models-src/site1-migration/placements.json --out models-src/site1-migration/奖杯.glb
import { Document, NodeIO } from '@gltf-transform/core'
import { dedup, prune } from '@gltf-transform/functions'
import {
  KHRMaterialsClearcoat,
  KHRMaterialsEmissiveStrength,
  KHRMaterialsIOR,
  KHRMaterialsSheen,
  KHRMaterialsSpecular,
  KHRMaterialsTransmission,
  KHRMaterialsVolume,
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
const INPUT = argOf('--json')
const PLACEMENTS = argOf('--placements') ?? path.join(ROOT, 'models-src/site1-migration/placements.json')
const OUT = argOf('--out')
if (!INPUT || !OUT) {
  console.error('用法: node scripts/site1-object-to-glb.mjs --json <Object.json> [--placements p.json] --out <输出.glb>')
  process.exit(1)
}
const WORK = path.join(ROOT, '.tmp-site1', path.basename(INPUT).replace(/\.json$/, ''))
fs.mkdirSync(path.join(WORK, 'images'), { recursive: true })
fs.mkdirSync(path.dirname(path.resolve(ROOT, OUT)), { recursive: true })

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}
const intToLinearRGB = (hex) => [
  srgbToLinear(((hex >> 16) & 255) / 255),
  srgbToLinear(((hex >> 8) & 255) / 255),
  srgbToLinear((hex & 255) / 255),
]
const normKey = (s) => String(s ?? '').replace(/[.\s]/g, '')

console.log(`[1] 解析 ${INPUT} (${(fs.statSync(INPUT).size / 1048576).toFixed(0)}MB) ...`)
const t0 = Date.now()
const doc0 = JSON.parse(fs.readFileSync(INPUT, 'utf8'))
console.log(`    ${((Date.now() - t0) / 1000).toFixed(0)}s | 几何 ${doc0.geometries.length} 材质 ${doc0.materials.length} 贴图 ${doc0.textures.length} 图片 ${doc0.images.length}`)

// ---------------- 图片落盘 + 法线 G 反转 ----------------
const imageFile = new Map()
for (const im of doc0.images ?? []) {
  const m = /^data:image\/(png|jpeg);base64,/.exec(im.url ?? '')
  if (!m) continue
  const file = path.join(WORK, 'images', `${im.uuid}.${m[1] === 'jpeg' ? 'jpg' : 'png'}`)
  fs.writeFileSync(file, Buffer.from(im.url.slice(m[0].length), 'base64'))
  imageFile.set(im.uuid, file)
  im.url = null // 释放内存
}
doc0.images = null

const needInvert = new Set()
for (const mj of doc0.materials ?? []) {
  if (!mj.normalMap) continue
  const ns = Array.isArray(mj.normalScale) ? mj.normalScale : [1, 1]
  if (ns[0] < 0 || ns[1] < 0) {
    const tex = (doc0.textures ?? []).find((t) => t.uuid === mj.normalMap)
    if (tex?.image && imageFile.has(tex.image)) needInvert.add(tex.image)
  }
}
if (needInvert.size) {
  console.log(`[2] normalScale 负值 → 反转 ${needInvert.size} 张法线贴图 G 通道`)
  const files = [...needInvert].map((uuid) => imageFile.get(uuid))
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts/site1-invert-g.cjs'), ...files], {
      stdio: 'inherit',
    })
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error('G 反转失败'))))
  })
  for (const uuid of needInvert) {
    const inv = imageFile.get(uuid).replace(/\.(jpe?g|png)$/i, '.ginv.png')
    if (fs.existsSync(inv)) imageFile.set(uuid, inv)
  }
} else {
  console.log('[2] 无法线反转需求')
}

// ---------------- 构建 glTF 文档 ----------------
const io = new NodeIO().registerExtensions([
  KHRMaterialsClearcoat,
  KHRMaterialsEmissiveStrength,
  KHRMaterialsIOR,
  KHRMaterialsSheen,
  KHRMaterialsSpecular,
  KHRMaterialsTransmission,
  KHRMaterialsVolume,
])
const doc = new Document()
doc.createBuffer('default') // GLB 写出需要唯一 Buffer 容纳 accessor/贴图数据
const root = doc.getRoot()
const scene = doc.createScene('Scene')

// —— 材质（three.js → glTF，与 site1-bake-venue.mjs 同规则）——
const texJsonByUuid = new Map((doc0.textures ?? []).map((t) => [t.uuid, t]))
const texByUuid = new Map()
const getTexture = (uuid) => {
  if (texByUuid.has(uuid)) return texByUuid.get(uuid)
  const tj = texJsonByUuid.get(uuid)
  const file = tj && imageFile.get(tj.image)
  if (!file) return null
  const tex = doc
    .createTexture(path.basename(file))
    .setImage(new Uint8Array(fs.readFileSync(file)))
    .setMimeType(file.endsWith('.png') ? 'image/png' : 'image/jpeg')
  texByUuid.set(uuid, tex)
  return tex
}
const extCache = new Map()
const extOf = (Cls) => {
  // 缓存键必须用类本身：Cls.extensionName 是实例属性、在类上取是 undefined，
  // 会让所有扩展共享同一个缓存槽（值互相写错）
  if (!extCache.has(Cls)) extCache.set(Cls, doc.createExtension(Cls))
  return extCache.get(Cls)
}
const matByUuid = new Map()
for (const mj of doc0.materials ?? []) {
  const mat = doc.createMaterial(String(mj.name ?? mj.uuid))
  matByUuid.set(mj.uuid, mat)
  if (mj.side === 2) mat.setDoubleSided(true)
  if (mj.transparent === true || (mj.opacity ?? 1) < 1) mat.setAlphaMode('BLEND')
  if (mj.alphaTest > 0) mat.setAlphaMode('MASK').setAlphaCutoff(mj.alphaTest)
  const pbr = [1, 1, 1, mj.opacity ?? 1]
  if (typeof mj.color === 'number') {
    const [r, g, b] = intToLinearRGB(mj.color)
    pbr[0] = r
    pbr[1] = g
    pbr[2] = b
  }
  mat.setBaseColorFactor(pbr).setMetallicFactor(mj.metalness ?? 1).setRoughnessFactor(mj.roughness ?? 1)
  if (mj.map) mat.setBaseColorTexture(getTexture(mj.map))
  if (mj.roughnessMap && mj.roughnessMap === mj.metalnessMap) {
    mat.setMetallicRoughnessTexture(getTexture(mj.roughnessMap))
  } else if (mj.roughnessMap) {
    mat.setMetallicRoughnessTexture(getTexture(mj.roughnessMap))
  } else if (mj.metalnessMap) {
    mat.setMetallicRoughnessTexture(getTexture(mj.metalnessMap))
  }
  if (mj.normalMap) {
    const ns = Array.isArray(mj.normalScale) ? Math.abs(mj.normalScale[0] || 1) : 1
    mat.setNormalTexture(getTexture(mj.normalMap), { scale: ns })
  }
  if (mj.aoMap) mat.setOcclusionTexture(getTexture(mj.aoMap))
  if (typeof mj.emissive === 'number' && mj.emissive !== 0) mat.setEmissiveFactor(intToLinearRGB(mj.emissive))
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
  if ((mj.thickness ?? 0) > 0) {
    const vol = extOf(KHRMaterialsVolume).createVolume().setThicknessFactor(mj.thickness)
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
}

// —— 几何（明文数组 → accessor）——
const geomByUuid = new Map()
const geomBox = new Map()
for (const g of doc0.geometries ?? []) {
  const attrs = g.data?.attributes ?? {}
  const prim = {}
  let box = null
  for (const [key, attr] of Object.entries(attrs)) {
    if (!Array.isArray(attr.array)) continue
    if (key === 'position') {
      const acc = doc.createAccessor().setType('VEC3').setArray(new Float32Array(attr.array))
      acc.min = attr.min
      acc.max = attr.max
      prim.POSITION = acc
      // 现算包围盒（用于摆位验证；attr.min/max 可能缺失）
      let mn = [Infinity, Infinity, Infinity]
      let mx = [-Infinity, -Infinity, -Infinity]
      const arr = attr.array
      for (let i = 0; i < arr.length; i += attr.itemSize ?? 3) {
        for (let k = 0; k < 3; k++) {
          if (arr[i + k] < mn[k]) mn[k] = arr[i + k]
          if (arr[i + k] > mx[k]) mx[k] = arr[i + k]
        }
      }
      box = { min: mn, max: mx }
    } else if (key === 'normal') {
      prim.NORMAL = doc.createAccessor().setType('VEC3').setArray(new Float32Array(attr.array))
    } else if (key === 'uv') {
      prim.TEXCOORD_0 = doc.createAccessor().setType('VEC2').setArray(new Float32Array(attr.array))
    } else if (key !== 'uv1' && key !== 'uv2' && key !== 'color') {
      // 其余通道暂不迁移
    }
  }
  if (!prim.POSITION) continue
  const mesh = doc.createMesh(g.name ?? '')
  const material = undefined
  const primObj = doc.createPrimitive().setAttribute('POSITION', prim.POSITION)
  if (prim.NORMAL) primObj.setAttribute('NORMAL', prim.NORMAL)
  if (prim.TEXCOORD_0) primObj.setAttribute('TEXCOORD_0', prim.TEXCOORD_0)
  if (Array.isArray(g.data?.index?.array)) {
    const idx = g.data.index.array
    // 注意不能 Math.max(...idx)：百万级索引会爆调用栈
    let maxIdx = 0
    for (let i = 0; i < idx.length; i += 1) if (idx[i] > maxIdx) maxIdx = idx[i]
    const arr = maxIdx < 65536 ? new Uint16Array(idx) : new Uint32Array(idx)
    primObj.setIndices(doc.createAccessor().setType('SCALAR').setArray(arr))
  }
  mesh.addPrimitive(primObj)
  geomByUuid.set(g.uuid, { mesh, primObj, materialUuid: null })
  geomBox.set(g.uuid, box)
  g.data = null // 释放
}

// —— 节点树 + 摆位 ——
const placements = JSON.parse(fs.readFileSync(PLACEMENTS, 'utf8'))
const byExact = new Map()
const byBase = new Map()
for (const p of placements) {
  byExact.set(normKey(p.name), p)
  const base = normKey(p.name).replace(/\d+$/, '')
  if (!byBase.has(base)) byBase.set(base, p)
}
const used = new Set()
const eulerToQuat = ([x, y, z]) => {
  // XYZ 欧拉角 → 四元数
  const cx = Math.cos(x / 2)
  const sx = Math.sin(x / 2)
  const cy = Math.cos(y / 2)
  const sy = Math.sin(y / 2)
  const cz = Math.cos(z / 2)
  const sz = Math.sin(z / 2)
  return [
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz,
  ]
}
const stats = { nodes: 0, placed: 0, noPlacement: [], boxDeltaMax: 0, corrected: 0, sizeFixed: 0 }
const buildNode = (obj, parent, isTopLevel) => {
  if (obj.type === 'Scene' || obj.type === 'Group') {
    for (const child of obj.children ?? []) buildNode(child, parent, isTopLevel || obj.type !== 'Scene')
    return
  }
  const node = doc.createNode(obj.name ?? '')
  parent.addChild(node)
  stats.nodes += 1
  const geom = obj.geometry ? geomByUuid.get(obj.geometry) : null
  if (geom) {
    node.setMesh(geom.mesh)
    if (obj.material && matByUuid.has(obj.material)) geom.primObj.setMaterial(matByUuid.get(obj.material))
  }
  // 摆位：先查自身 TRS，再按名称套现模型摆位（仅顶层）
  let placed = false
  if (isTopLevel) {
    const key = normKey(obj.name)
    let p = byExact.get(key)
    if (p && used.has(p.name)) p = null
    if (!p) {
      const base = key.replace(/\d+$/, '')
      const cand = byBase.get(base)
      if (cand && !used.has(cand.name)) p = cand
    }
    if (p) {
      used.add(p.name)
      placed = true
      stats.placed += 1
      // 包围盒验证 + 中心对齐修正：局部盒 × 摆位（8 角全变换）vs 现模型世界盒，
      // 中心残差通常是交付方重定心局部原点造成的（如 tripo 系统一 +0.25m Y），
      // 直接从平移里扣掉（每轴限幅 ±0.5m，防止几何版本不同时大幅错位）
      // 子树联合盒（子节点在交付里均为单位变换，父级缩放会放大子级网格——
      // 只看自身几何会漏掉被放大的刻字/底座子件，JiangBei_14 的 83m 巨字就是这么来的）
      const subtreeBoxOf = (o) => {
        const own = geomBox.get(o.geometry)
        let box = own ? { min: [...own.min], max: [...own.max] } : null
        for (const child of o.children ?? []) {
          if (child.type === 'Mesh' || (child.children?.length ?? 0) > 0) {
            const sub = subtreeBoxOf(child)
            if (!sub) continue
            if (!box) box = { min: [...sub.min], max: [...sub.max] }
            else
              for (let k = 0; k < 3; k += 1) {
                box.min[k] = Math.min(box.min[k], sub.min[k])
                box.max[k] = Math.max(box.max[k], sub.max[k])
              }
          }
        }
        return box
      }
      const box = subtreeBoxOf(obj)
      let translation = p.position
      let scale = p.scale
      if (box) {
        const [qx, qy, qz, qw] = p.quaternion
        const rot = (v) => {
          const [vx, vy, vz] = v
          return [
            vx * (1 - 2 * (qy * qy + qz * qz)) + vy * 2 * (qx * qy - qz * qw) + vz * 2 * (qx * qz + qy * qw),
            vx * 2 * (qx * qy + qz * qw) + vy * (1 - 2 * (qx * qx + qz * qz)) + vz * 2 * (qy * qz - qx * qw),
            vx * 2 * (qx * qz - qy * qw) + vy * 2 * (qy * qz + qx * qw) + vz * (1 - 2 * (qx * qx + qy * qy)),
          ]
        }
        const worldBox = (scl) => {
          const mn = [Infinity, Infinity, Infinity]
          const mx = [-Infinity, -Infinity, -Infinity]
          for (const x of [box.min[0], box.max[0]])
            for (const y of [box.min[1], box.max[1]])
              for (const z of [box.min[2], box.max[2]]) {
                const w = rot([x * scl[0], y * scl[1], z * scl[2]]).map((c, i) => c + p.position[i])
                for (let k = 0; k < 3; k += 1) {
                  mn[k] = Math.min(mn[k], w[k])
                  mx[k] = Math.max(mx[k], w[k])
                }
              }
          return { mn, mx }
        }
        let { mn, mx } = worldBox(scale)
        // 尺寸匹配：交付几何整体被归一化（tripo 系实测统一半幅，JiangBei 系差 ~300 倍），
        // 阈值 1.3 倍即触发；按「最大边之比」统一回缩保形，限幅 0.005~200
        const oldSize = [0, 1, 2].map((i) => p.boxMax[i] - p.boxMin[i])
        const newSize = [0, 1, 2].map((i) => mx[i] - mn[i])
        const oldMax = Math.max(...oldSize)
        const newMax = Math.max(...newSize)
        if (newMax > 0.01 && (newMax > oldMax * 1.3 || newMax * 1.3 < oldMax)) {
          const fix = Math.max(0.005, Math.min(200, oldMax / newMax))
          scale = scale.map((s) => s * fix)
          ;({ mn, mx } = worldBox(scale))
          stats.sizeFixed += 1
          console.log(
            `    尺寸修正 ${obj.name}: max ${newMax.toFixed(2)} -> ${oldMax.toFixed(2)} (统一比例 ${fix.toFixed(4)})`,
          )
        }
        // 对齐：XZ 按盒中心、Y 按**底面**（中心对齐会让缩放过的物体悬空/入地）
        const dxCx = (mn[0] + mx[0]) / 2 - (p.boxMin[0] + p.boxMax[0]) / 2
        const dzCz = (mn[2] + mx[2]) / 2 - (p.boxMin[2] + p.boxMax[2]) / 2
        const dyBottom = mn[1] - p.boxMin[1]
        const delta = [dxCx, dyBottom, dzCz]
        stats.boxDeltaMax = Math.max(stats.boxDeltaMax, ...delta.map(Math.abs))
        if (delta.some((d) => Math.abs(d) > 0.02)) {
          const fix = delta.map((d) => Math.max(-0.5, Math.min(0.5, d)))
          translation = p.position.map((c, i) => c - fix[i])
          stats.corrected += 1
        }
      }
      node.setTranslation(translation)
      node.setRotation(p.quaternion)
      node.setScale(scale)
    }
  }
  if (!placed && !obj.position && !obj.rotation && !obj.scale && isTopLevel) stats.noPlacement.push(obj.name)
  for (const child of obj.children ?? []) buildNode(child, node, false)
}
buildNode(doc0.object, scene, false)

// —— 收尾 ——
await doc.transform(prune(), dedup())
await io.write(OUT, doc)
console.log(
  `[3] 节点 ${stats.nodes}（摆位命中 ${stats.placed}，未摆位 ${stats.noPlacement.length}）| 对齐前中心残差最大 ${stats.boxDeltaMax.toFixed(2)}m（已修正 ${stats.corrected} 个节点）| 输出 ${OUT} ${(fs.statSync(OUT).size / 1048576).toFixed(1)}MB`,
)
if (stats.noPlacement.length) {
  console.log(`    未摆位: ${stats.noPlacement.join(' | ')}`)
  console.log(`    （这些节点会落在原点，需人工确认摆位）`)
}
