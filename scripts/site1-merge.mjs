// 8 个中间 GLB → 单场景合并（替代 gltf-transform CLI merge：实测其会丢第一个文件的节点）
// 原语：copyToDocument（依赖闭包整体拷贝，场景不自动并轨→手动把各源场景的子节点接到基准场景）
// 顺带做材质重名唯一化（compress 扩展还原要求）+ prune/dedup
// 用法: node scripts/site1-merge.mjs --out models-src/site1-migration/scene-site1.raw.glb <输入1.glb> ...
import { NodeIO, PropertyType } from '@gltf-transform/core'
import { copyToDocument, dedup, prune, unpartition } from '@gltf-transform/functions'
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
import { MeshoptDecoder } from 'meshoptimizer'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '..')
const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const OUT = path.resolve(ROOT, args[outIdx + 1])
const files = args.filter((_, i) => i !== outIdx && i !== outIdx + 1).map((f) => path.resolve(ROOT, f))
if (files.length < 2) {
  console.error('用法: node scripts/site1-merge.mjs --out <输出.glb> <输入1.glb> <输入2.glb> ...')
  process.exit(1)
}

const io = new NodeIO()
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
  .registerExtensions([
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

const base = await io.read(files[0])
const baseRoot = base.getRoot()
const baseScene = baseRoot.listScenes()[0]
console.log(`基准 ${path.basename(files[0])}: 节点 ${baseRoot.listNodes().length}`)

for (const file of files.slice(1)) {
  const src = await io.read(file)
  // 扩展先注册，copyToDocument 要求
  for (const ext of src.getRoot().listExtensionsUsed()) base.createExtension(ext.constructor)
  const srcScene = src.getRoot().listScenes()[0]
  const map = copyToDocument(base, src, [srcScene])
  const copiedScene = map.get(srcScene)
  let moved = 0
  for (const child of [...copiedScene.listChildren()]) {
    copiedScene.removeChild(child)
    baseScene.addChild(child)
    moved += 1
  }
  copiedScene.dispose()
  console.log(`并入 ${path.basename(file)}: 移入 ${moved} 根节点 → 总节点 ${baseRoot.listNodes().length}`)
}

// 锚点补丁：新交付的材质名没有「奖杯」（只有奖状系），应用的 trophyArea 锚点
// 靠名称匹配——补一个 1cm 隐形立方体节点名为「奖杯」，位置取现模型实测值
{
  const anchor = base
    .createNode('奖杯')
    .setTranslation([0.4258242702672419, 2.7520434829885128, -17.47966700239198])
  const pos = base.createAccessor().setType('VEC3').setArray(
    new Float32Array([
      -0.005, -0.005, -0.005, 0.005, -0.005, -0.005, -0.005, 0.005, -0.005, 0.005, 0.005, -0.005,
      -0.005, -0.005, 0.005, 0.005, -0.005, 0.005, -0.005, 0.005, 0.005, 0.005, 0.005, 0.005,
    ]),
  )
  const idx = base.createAccessor().setType('SCALAR').setArray(new Uint16Array([0, 1, 2, 1, 3, 2, 4, 5, 6, 5, 7, 6]))
  const prim = base.createPrimitive().setAttribute('POSITION', pos).setIndices(idx)
  const mat = base
    .createMaterial('奖杯锚点')
    .setAlphaMode('BLEND')
    .setBaseColorFactor([0, 0, 0, 0])
  prim.setMaterial(mat)
  const anchorMesh = base.createMesh('奖杯锚点').addPrimitive(prim)
  anchor.setMesh(anchorMesh)
  baseScene.addChild(anchor)
  console.log('锚点补丁: 奖杯(隐形 1cm) @', anchor.getTranslation())
}

// 设备点击接入：恢复旧模型的 baseColor 贴图名（中文名_basecolor）。
// 应用的展品识别按 material.map.name 匹配「中文名_basecolor」（src/data/exhibits.js
// EXHIBIT_INFO + GltfModel.findHitExhibit）；转换时贴图以 uuid 命名会断掉这条路径。
const nameMapPath = path.join(ROOT, 'models-src/site1-migration/old-texture-names.json')
if (fs.existsSync(nameMapPath)) {
  const nameMap = JSON.parse(fs.readFileSync(nameMapPath, 'utf8'))
  let renamedTex = 0
  const texDone = new Set()
  for (const node of baseRoot.listNodes()) {
    const target = nameMap[node.getName()]
    if (!target || !node.getMesh()) continue
    for (const prim of node.getMesh().listPrimitives()) {
      const mat = prim.getMaterial()
      const tex = mat?.getBaseColorTexture()
      if (!tex || texDone.has(tex)) continue
      texDone.add(tex)
      tex.setName(target)
      renamedTex += 1
    }
  }
  console.log(`贴图名恢复: ${renamedTex} 张（设备/照片中文名，点击识别用）`)
}

// 落座修正：设备贴回新场地柜面/落地（site1-reseat.mjs 生成的修正表）
const reseatPath = path.join(ROOT, 'models-src/site1-migration/reseat.json')
if (fs.existsSync(reseatPath)) {
  const fixes = JSON.parse(fs.readFileSync(reseatPath, 'utf8'))
  let applied = 0
  for (const f of fixes) {
    for (const node of baseRoot.listNodes()) {
      if (node.getName() !== f.node) continue
      const t = node.getTranslation()
      node.setTranslation([t[0] + f.dx, t[1] + f.dy, t[2] + f.dz])
      applied += 1
      break
    }
  }
  console.log(`落座修正: 应用 ${applied}/${fixes.length}（${fixes.filter((f) => f.type === 'floor').length} 落地 ${fixes.filter((f) => f.type === 'snap').length} 贴柜）`)
}

// 材质重名唯一化
const seen = new Map()
let renamed = 0
for (const mat of baseRoot.listMaterials()) {
  const name = mat.getName() || '(未命名)'
  const count = (seen.get(name) ?? 0) + 1
  seen.set(name, count)
  if (count > 1) {
    mat.setName(`${name}#${count}`)
    renamed += 1
  }
}

const before = baseRoot.listNodes().length
// 各源 GLB 自带 Buffer，unpartition 归并为单 Buffer（GLB 只允许 0-1 个）
await base.transform(unpartition())
// 只 prune + 贴图去重：几何已 meshopt 压缩，不做几何级 dedup（需解码且无必要）
await base.transform(prune(), dedup({ propertyTypes: [PropertyType.TEXTURE] }))
console.log(`prune/dedup: 节点 ${before} → ${baseRoot.listNodes().length} | 材质重名改名 ${renamed}`)

// 大厅存活自检（荣誉篇章/polySurface195 是大厅特有节点名）
const names = new Set(baseRoot.listNodes().map((n) => n.getName()))
const markers = ['荣誉篇章', 'polySurface195', 'tripo_node', 'JiangBei', 'shu', '关怀厅', '展望厅']
const census = markers.map((m) => `${m}:${[...names].filter((n) => n.startsWith(m)).length}`).join(' ')
console.log(`存活自检: ${census}`)

fs.mkdirSync(path.dirname(OUT), { recursive: true })
await io.write(OUT, base)
console.log(`输出 ${OUT} ${(fs.statSync(OUT).size / 1048576).toFixed(1)}MB`)
