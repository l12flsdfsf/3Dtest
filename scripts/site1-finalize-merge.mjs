// 合并产物收尾：材质重名唯一化（compress 的扩展还原按名匹配且要求唯一）+ prune/dedup
// 用法: node scripts/site1-finalize-merge.mjs --input scene-site1.merge.glb --out scene-site1.raw.glb
import { NodeIO } from '@gltf-transform/core'
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
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '..')
const argOf = (name) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const INPUT = argOf('--input')
const OUT = argOf('--out')
if (!INPUT || !OUT) {
  console.error('用法: node scripts/site1-finalize-merge.mjs --input <合并.glb> --out <收尾.glb>')
  process.exit(1)
}

const io = new NodeIO().registerExtensions([
  KHRMaterialsClearcoat,
  KHRMaterialsEmissiveStrength,
  KHRMaterialsIOR,
  KHRMaterialsSheen,
  KHRMaterialsSpecular,
  KHRMaterialsTransmission,
  KHRMaterialsVolume,
])
const doc = await io.read(INPUT)
const root = doc.getRoot()

// 材质重名 → 追加序号（compress-ktx2 的 restoreMaterialExtensions 要求源材质名唯一）
const seen = new Map()
let renamed = 0
for (const mat of root.listMaterials()) {
  const name = mat.getName() || '(未命名)'
  const count = (seen.get(name) ?? 0) + 1
  seen.set(name, count)
  if (count > 1) {
    mat.setName(`${name}#${count}`)
    renamed += 1
  }
}

const sceneCount = root.listScenes().length
const nodeCount = root.listNodes().length
const meshCount = root.listMeshes().length
await doc.transform(prune(), dedup())
await io.write(OUT, doc)
console.log(
  `场景 ${sceneCount} → ${doc.getRoot().listScenes().length} | 节点 ${nodeCount} | 网格 ${meshCount} | 材质重名改名 ${renamed} | 输出 ${OUT} ${(fs.statSync(OUT).size / 1048576).toFixed(1)}MB`,
)
