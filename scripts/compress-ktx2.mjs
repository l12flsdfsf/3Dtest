// glb → KTX2(UASTC) glb 三段式压缩脚本
//
// 背景：gltf-transform CLI 的 uastc 命令与进程内 sharp 在本机（Windows）都会触发
// libvips "colourspace: parameter space not set" 崩溃；因此把 预处理、ktx 编码、
// glb 组装拆开执行：尺寸用纯 JS 解析图片头、缩放 spawn 独立进程做（scripts/sharp-resize.cjs）、
// ktx 子进程编码，全部环节可重试。
//
// 用法：node scripts/compress-ktx2.mjs [--input models-src/scene.glb] [--out public/models/x.glb]
//       [--level 3] [--jobs 8] [--max-edge 2048] [--rdo-l 4]
// 依赖：PATH 里有 ktx（KTX-Software 4.4+），node_modules 里有 @gltf-transform 与 sharp。

import { NodeIO } from '@gltf-transform/core'
import { KHRTextureBasisu } from '@gltf-transform/extensions'
import { listTextureSlots } from '@gltf-transform/functions'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '..')

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const INPUT = path.join(ROOT, argOf('--input', 'models-src/scene.glb'))
const OUTPUT = path.join(ROOT, argOf('--out', 'public/models/scene.ktx2.glb'))
const WORK = path.join(ROOT, '.tmp-ktx/pipeline')

const LEVEL = Number(argOf('--level', 3))
const JOBS = Number(argOf('--jobs', 8))
// 限制纹理最大边长（0 = 不限制）。缩放用 lanczos3，与 gltf-transform 默认一致。
const MAX_EDGE = Number(argOf('--max-edge', 0))
// UASTC RDO 强度（0-10）：越大文件越小、画质略降。1 = 保守，4 = 均衡
const RDO_L = Number(argOf('--rdo-l', 1))
// --plain：不做 KTX2 编码，纹理只缩放（PNG/JPEG 原样），配合 --max-edge 限尺寸。
// 用于不支持 BC7/ASTC 压缩纹理的环境（KTX2 在那些机器上会解压成 RGBA32 爆内存）。
const PLAIN = args.includes('--plain')
// --compat：弱显卡（如 512MB 显存）专用。照片也用 ETC1S（GPU 端 0.5B/px，
// 全时代显卡含集显都支持），法线/数据贴图上限降到 512。显存占用约为 UASTC 方案的 1/3。
const COMPAT = args.includes('--compat')

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

// 纯 JS 图片头解析（PNG IHDR / JPEG SOF），避免在本进程使用 sharp
function readImageSize(source, isPng) {
  // getImage() 返回的 Uint8Array 无 Buffer 方法，转零拷贝 Buffer 视图
  const bytes = Buffer.isBuffer(source)
    ? source
    : Buffer.from(source.buffer, source.byteOffset, source.byteLength)
  if (!bytes || bytes.length < 32) return null
  if (isPng) {
    if (bytes[0] !== 0x89 || bytes.toString('ascii', 1, 4) !== 'PNG') return null
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let offset = 2
  while (offset < bytes.length - 9) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1]
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) {
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) }
    }
    offset += 2 + bytes.readUInt16BE(offset + 2)
  }
  return null
}

async function main() {
  await fs.mkdir(WORK, { recursive: true })

  // ---------------------------------------------------------------- 读取源模型
  const io = new NodeIO()
  io.registerExtensions([KHRTextureBasisu])
  const doc = await io.read(INPUT)
  const textures = doc.getRoot().listTextures()
  console.log(`模型纹理数：${textures.length}`)

  // ------------------------------------------- 阶段①：预处理
  // 注意：sharp 在本脚本进程内 100% 触发 libvips colourspace 崩溃（与脚本 import 的某个
  // 模块互踩，独立进程中从未复现），因此：尺寸用纯 JS 解析图片头，缩放 spawn 独立进程做。
  const prepared = []
  let resized = 0
  for (let i = 0; i < textures.length; i += 1) {
    const texture = textures[i]
    const isPng = texture.getMimeType() === 'image/png'
    const ext = isPng ? 'png' : 'jpg'
    const rawPath = path.join(WORK, `src_${i}.${ext}`)

    let bytes = texture.getImage()
    const size = readImageSize(bytes, isPng)
    if (!size) throw new Error(`纹理 #${i} 无法解析尺寸`)

    // 按贴图槽位分类（决定编码方式与尺寸上限）：
    //   photo    emissive 槽位（照片墙/展板/屏幕，要支持放大查看）→ UASTC 高质量
    //   material 其余颜色贴图（展品/墙面 baseColor）→ ETC1S（体积 1/4，观展距离无感）
    //   normal   法线贴图 → UASTC linear+UNORM 无 RDO，上限 1024
    //   data     粗糙度金属度/遮蔽 → 同 normal
    const slots = listTextureSlots(texture)
    const kind = slots.some((slot) => /normal/i.test(slot))
      ? 'normal'
      : slots.some((slot) => /metallicRoughness|occlusion/i.test(slot))
        ? 'data'
        : slots.some((slot) => /emissive/i.test(slot))
          ? 'photo'
          : 'material'
    const edgeCap =
      kind === 'normal' || kind === 'data'
        ? Math.min(MAX_EDGE || 1024, COMPAT ? 512 : 1024)
        : MAX_EDGE

    // KTX/Basis 要求边长为 4 的倍数；edgeCap 限制最大边长以压缩磁盘体积
    let targetW = size.width
    let targetH = size.height
    if (edgeCap > 0 && Math.max(size.width, size.height) > edgeCap) {
      const scale = edgeCap / Math.max(size.width, size.height)
      targetW = Math.round(size.width * scale)
      targetH = Math.round(size.height * scale)
    }
    if (targetW % 4 || targetH % 4) {
      targetW = Math.ceil(targetW / 4) * 4
      targetH = Math.ceil(targetH / 4) * 4
    }
    await fs.writeFile(rawPath, bytes)
    if (targetW !== size.width || targetH !== size.height) {
      // plain 模式下缩放结果直接作为最终纹理：颜色类出 JPEG（体积可控），
      // 法线/数据类出 PNG（不能有损）；KTX2 模式统一 PNG（无损送编码器）
      const isColorKind = kind === 'photo' || kind === 'material'
      const outFormat = PLAIN && isColorKind && !isPng ? 'jpg' : 'png'
      const resizedPath = path.join(WORK, `resized_${i}.${outFormat}`)
      const { code, stderr } = await run(process.execPath, [
        path.join(ROOT, 'scripts/sharp-resize.cjs'),
        rawPath,
        resizedPath,
        String(targetW),
        String(targetH),
        outFormat,
        '88',
      ])
      if (code !== 0) throw new Error(`纹理 #${i} 缩放失败: ${stderr.split('\n')[0]}`)
      prepared.push({ index: i, rawPath: resizedPath, size, kind })
      resized += 1
    } else {
      prepared.push({ index: i, rawPath, size, kind })
    }
    if ((i + 1) % 25 === 0) console.log(`  预处理 ${i + 1}/${textures.length}`)
  }
  console.log(`预处理完成，其中 ${resized} 张做了缩放/补齐`)

  // ------------------------------------------- 阶段②：ktx 并行编码（失败自动重试一次）
  // --plain 模式跳过本阶段，纹理保持 PNG/JPEG 由阶段③直接写回
  let done = 0
  const failures = []
  const queue = PLAIN ? [] : [...prepared]
  const workers = Array.from({ length: Math.min(JOBS, queue.length) }, async () => {
    for (;;) {
      const item = queue.shift()
      if (!item) return
      const outPath = path.join(WORK, `out_${item.index}.ktx2`)

      // photo:    UASTC sRGB + RDO（照片墙，保放大查看质量）；--compat 时降为 ETC1S
      // material: ETC1S(basis-lz) sRGB（观展距离无感，体积约 1/4）
      // normal/data: UASTC linear+UNORM 无 RDO（保数值精度，RDO 会导致光影锯齿/材质参数失真）
      const isEtc1s = item.kind === 'material' || (COMPAT && item.kind === 'photo')
      const codec = isEtc1s
        ? ['--encode', 'basis-lz', '--qlevel', item.kind === 'photo' ? '192' : '128']
        : [
            '--encode', 'uastc',
            '--uastc-quality', String(LEVEL),
            ...(item.kind === 'photo' ? ['--uastc-rdo', '--uastc-rdo-l', String(RDO_L)] : []),
          ]
      const isSrgb = item.kind === 'photo' || isEtc1s
      const params = [
        'create',
        '--generate-mipmap',
        '--mipmap-filter', 'lanczos4',
        ...codec,
        // ETC1S(basis-lz) 自身即压缩格式，不允许再叠加 zstd
        ...(isEtc1s ? [] : ['--zstd', '18']),
        '--assign-tf', isSrgb ? 'srgb' : 'linear',
        '--assign-primaries', isSrgb ? 'bt709' : 'none',
        '--format', isSrgb ? 'R8G8B8A8_SRGB' : 'R8G8B8A8_UNORM',
        '--threads', '2',
        item.rawPath,
        outPath,
      ]

      let attempt = 0
      for (;;) {
        const { code, stderr } = await run('ktx', params)
        if (code === 0 && existsSync(outPath)) break
        attempt += 1
        if (attempt > 2) {
          failures.push({ index: item.index, stderr: stderr.split('\n').slice(-4).join(' ') })
          break
        }
        console.log(`  纹理 #${item.index} 第 ${attempt} 次失败，重试…`)
      }
      done += 1
      if (done % 25 === 0) console.log(`  编码 ${done}/${prepared.length}`)
    }
  })
  await Promise.all(workers)

  if (failures.length) {
    console.error(`有 ${failures.length} 张纹理编码失败：`)
    for (const failure of failures) console.error(`  #${failure.index}: ${failure.stderr}`)
    process.exit(1)
  }
  console.log('编码全部成功')

  // ------------------------------------------- 阶段③：写回 glb
  if (PLAIN) {
    for (const item of prepared) {
      const bytes = await fs.readFile(item.rawPath)
      const mime = item.rawPath.endsWith('.png')
        ? 'image/png'
        : item.rawPath.endsWith('.jpg')
          ? 'image/jpeg'
          : 'image/ktx2'
      textures[item.index].setImage(bytes).setMimeType(mime)
    }
  } else {
    for (const item of prepared) {
      const ktxBytes = await fs.readFile(path.join(WORK, `out_${item.index}.ktx2`))
      textures[item.index].setImage(ktxBytes).setMimeType('image/ktx2')
    }
    doc.createExtension(KHRTextureBasisu).setRequired(true)
  }
  await io.write(OUTPUT, doc)

  const outStat = await fs.stat(OUTPUT)
  console.log(`完成：${OUTPUT}（${(outStat.size / 1048576).toFixed(1)}MB）`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
