// 奖杯高模 → 展厅按需加载版 glb 压缩脚本
//
// 输入是 60MB 的单网格扫描奖杯（100 万三角 + 3 张 4096 PNG），点击展品时才拉取，
// 体积直接决定等待时间。本脚本与 compress-ktx2.mjs 同套路：sharp 必须隔离在
// 子进程跑（进程内 libvips 崩溃），几何走 meshopt（运行端 useGLTF 已带 MeshoptDecoder）。
//
// 纹理策略：4096→2048；baseColor 出 JPEG（颜色可容忍有损），normal / metallicRoughness
// 出 PNG（数值贴图不做有损压缩，避免金属度粗糙度漂移与光影锯齿）。
//
// 用法：node scripts/compress-trophy-high.mjs [--input models-src/trophy-4-high-source.glb]
//       [--out public/models/trophy-4-high.glb] [--max-edge 2048] [--jpeg-q 88]

import { NodeIO } from '@gltf-transform/core'
import {
  EXTMeshoptCompression,
  KHRMaterialsSpecular,
  KHRMeshQuantization,
} from '@gltf-transform/extensions'
import { listTextureSlots, meshopt } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '..')

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const INPUT = path.join(ROOT, argOf('--input', 'models-src/trophy-4-high-source.glb'))
const OUTPUT = path.join(ROOT, argOf('--out', 'public/models/trophy-4-high.glb'))
const MAX_EDGE = Number(argOf('--max-edge', 2048))
const JPEG_Q = Number(argOf('--jpeg-q', 88))
const WORK = path.join(ROOT, '.tmp-ktx/trophy-high')

function run(command, cmdArgs) {
  return new Promise((resolve) => {
    const child = spawn(command, cmdArgs, { shell: false })
    let stderr = ''
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()))
    child.stdout.on('data', () => {})
    child.on('error', (error) => resolve({ code: 1, stderr: String(error) }))
    child.on('close', (code) => resolve({ code: code ?? 1, stderr }))
  })
}

// PNG IHDR 尺寸解析（纯 JS，不用 sharp）
function readPngSize(bytes) {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes.toString('ascii', 1, 4) !== 'PNG') return null
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

async function main() {
  await fs.mkdir(WORK, { recursive: true })

  const io = new NodeIO().registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  // 源模型带 KHR_materials_specular：读入前注册才能在写出时保留
  io.registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRMaterialsSpecular])
  const doc = await io.read(INPUT)
  const textures = doc.getRoot().listTextures()
  console.log(`纹理数：${textures.length}`)

  for (let i = 0; i < textures.length; i += 1) {
    const texture = textures[i]
    const bytes = Buffer.from(texture.getImage())
    const size = readPngSize(bytes)
    if (!size) throw new Error(`纹理 #${i} 不是 PNG，无法解析尺寸`)

    const scale = Math.min(1, MAX_EDGE / Math.max(size.width, size.height))
    const targetW = Math.round(size.width * scale)
    const targetH = Math.round(size.height * scale)

    const rawPath = path.join(WORK, `src_${i}.png`)
    await fs.writeFile(rawPath, bytes)

    // 颜色贴图出 JPEG，数值贴图（法线/金属度粗糙度）保持 PNG
    const slots = listTextureSlots(texture)
    const isColor = slots.includes('baseColorTexture') || slots.includes('emissiveTexture')
    const outExt = isColor ? 'jpg' : 'png'
    const outPath = path.join(WORK, `out_${i}.${outExt}`)
    const { code, stderr } = await run(process.execPath, [
      path.join(ROOT, 'scripts/sharp-resize.cjs'),
      rawPath,
      outPath,
      String(targetW),
      String(targetH),
      outExt,
      String(JPEG_Q),
    ])
    if (code !== 0) throw new Error(`纹理 #${i}（${slots.join('/')}）处理失败: ${stderr.split('\n')[0]}`)

    const outBytes = await fs.readFile(outPath)
    texture.setImage(outBytes).setMimeType(outExt === 'jpg' ? 'image/jpeg' : 'image/png')
    console.log(
      `  #${i} ${slots.join('/') || '?'} ${size.width}x${size.height} -> ${targetW}x${targetH} ${outExt}` +
        ` ${(bytes.length / 1048576).toFixed(1)}MB -> ${(outBytes.length / 1048576).toFixed(2)}MB`,
    )
  }

  // 几何 meshopt 压缩（量化 + EXT_meshopt_compression，与主场景 glb 同一路径）
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))

  await io.write(OUTPUT, doc)
  const outStat = await fs.stat(OUTPUT)
  const inStat = await fs.stat(INPUT)
  console.log(`完成：${(inStat.size / 1048576).toFixed(1)}MB -> ${(outStat.size / 1048576).toFixed(1)}MB`)
  console.log(OUTPUT)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
