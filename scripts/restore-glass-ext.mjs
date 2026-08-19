// 修复 scene-0817.glb 丢材质扩展的问题：
// 旧版压缩脚本写出时被 NodeIO 丢弃了全部 KHR_materials_* 扩展
// （transmission/volume/ior/...），展柜玻璃 transmissionFactor=1 丢失后
// 变成 alpha=1 的不透明深灰面板。本脚本从原版 展厅.gltf 把这些
// 材质级扩展按名字拷回压缩 GLB，只重写 JSON chunk，纹理不动。
//
// 用法：node scripts/restore-glass-ext.mjs
import fs from 'node:fs/promises'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const OUTPUT = `${ROOT}/public/models/scene-0817.glb`
const SOURCE = `${ROOT}/public/models/0817/展厅.gltf`
const BACKUP = `${OUTPUT}.pre-restore.bak`
const MATERIAL_EXTENSION_NAMES = [
  'KHR_materials_clearcoat',
  'KHR_materials_emissive_strength',
  'KHR_materials_ior',
  'KHR_materials_sheen',
  'KHR_materials_specular',
  'KHR_materials_transmission',
  'KHR_materials_volume',
]

async function readGLTFJSON(filePath) {
  const bytes = await fs.readFile(filePath)
  if (filePath.endsWith('.gltf')) return JSON.parse(bytes.toString('utf8'))
  if (bytes.readUInt32LE(16) !== 0x4e4f534a) {
    throw new Error(`Expected a GLB JSON chunk: ${filePath}`)
  }
  const jsonLength = bytes.readUInt32LE(12)
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim())
}

async function main() {
  const [outputBytes, sourceJSON] = await Promise.all([fs.readFile(OUTPUT), readGLTFJSON(SOURCE)])
  const jsonLength = outputBytes.readUInt32LE(12)
  const outputJSON = JSON.parse(outputBytes.subarray(20, 20 + jsonLength).toString('utf8').trim())
  const sourceMaterials = sourceJSON.materials || []
  const outputMaterials = outputJSON.materials || []

  if (sourceMaterials.length !== outputMaterials.length) {
    throw new Error(`material counts differ: ${sourceMaterials.length} vs ${outputMaterials.length}`)
  }
  const sourceByName = new Map(sourceMaterials.map((m) => [m.name, m]))
  if (sourceByName.size !== sourceMaterials.length) {
    throw new Error('source material names are not unique')
  }

  let restored = 0
  for (let index = 0; index < outputMaterials.length; index += 1) {
    const outputMaterial = outputMaterials[index]
    const sourceMaterial = sourceByName.get(outputMaterial.name)
    if (!sourceMaterial) throw new Error(`material #${index} (${outputMaterial.name}) has no source match`)

    const sourceExtensions = sourceMaterial.extensions || {}
    const outputExtensions = outputMaterial.extensions || {}
    for (const extensionName of MATERIAL_EXTENSION_NAMES) {
      if (sourceExtensions[extensionName] !== undefined) {
        outputExtensions[extensionName] = sourceExtensions[extensionName]
        restored += 1
      } else {
        delete outputExtensions[extensionName]
      }
    }
    if (Object.keys(outputExtensions).length) {
      outputMaterial.extensions = outputExtensions
    } else {
      delete outputMaterial.extensions
    }
  }

  const used = new Set(outputJSON.extensionsUsed || [])
  for (const extensionName of MATERIAL_EXTENSION_NAMES) {
    if ((sourceJSON.extensionsUsed || []).includes(extensionName)) used.add(extensionName)
  }
  outputJSON.extensionsUsed = [...used]

  const jsonBytes = Buffer.from(JSON.stringify(outputJSON), 'utf8')
  const paddedLength = Math.ceil(jsonBytes.length / 4) * 4
  const remainingChunks = outputBytes.subarray(20 + jsonLength)
  const rebuilt = Buffer.alloc(20 + paddedLength + remainingChunks.length)
  outputBytes.copy(rebuilt, 0, 0, 12)
  rebuilt.writeUInt32LE(rebuilt.length, 8)
  rebuilt.writeUInt32LE(paddedLength, 12)
  outputBytes.copy(rebuilt, 16, 16, 20)
  jsonBytes.copy(rebuilt, 20)
  rebuilt.fill(0x20, 20 + jsonBytes.length, 20 + paddedLength)
  remainingChunks.copy(rebuilt, 20 + paddedLength)

  await fs.copyFile(OUTPUT, BACKUP).catch((error) => {
    if (error.code !== 'EEXIST') throw error
  })
  await fs.writeFile(OUTPUT, rebuilt)
  const stat = await fs.stat(OUTPUT)
  console.log(`恢复完成：拷回 ${restored} 个材质扩展，extensionsUsed=[${outputJSON.extensionsUsed.join(', ')}]`)
  console.log(`文件：${OUTPUT}（${(stat.size / 1048576).toFixed(1)}MB，备份在 ${BACKUP}）`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
