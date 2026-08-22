// 对比 /d/场地1 的新 GLB 与当前 scene-0817.glb 的结构
// 用法: node scripts/site1-dump.mjs <glb路径> [...]
import { readFileSync } from 'node:fs'

const HALL_NAMES = ['关怀厅', '广播厅', '电视厅', '电影厅', '技术设备厅', '展望厅']

function parseGlb(path) {
  const buf = readFileSync(path)
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`not a GLB: ${path}`)
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'))
  return { json, binLen: buf.length - 20 - jsonLen }
}

const fmt = (n) => (typeof n === 'number' ? Math.round(n * 100) / 100 : n)

for (const path of process.argv.slice(2)) {
  const { json, binLen } = parseGlb(path)
  const meshes = json.meshes ?? []
  const nodes = json.nodes ?? []
  const mats = json.materials ?? []
  const imgs = json.images ?? []
  const accessors = json.accessors ?? []

  const meshNodes = nodes.filter((n) => n.mesh !== undefined)
  const totalPrims = meshNodes.reduce(
    (s, n) => s + (meshes[n.mesh]?.primitives?.length ?? 0),
    0,
  )

  // 用 POSITION accessor 求整体包围盒
  let box = null
  for (const n of meshNodes) {
    for (const p of meshes[n.mesh]?.primitives ?? []) {
      const pos = accessors[p.attributes?.POSITION]
      if (!pos) continue
      const [mn, mx] = [pos.min, pos.max]
      if (!mn || !mx) continue
      // 不做节点矩阵变换，仅粗略看原始几何范围
      box = box
        ? {
            min: box.min.map((v, i) => Math.min(v, mn[i])),
            max: box.max.map((v, i) => Math.max(v, mx[i])),
          }
        : { min: [...mn], max: [...mx] }
    }
  }

  const nameHit = {}
  for (const hall of HALL_NAMES) {
    nameHit[hall] = {
      node: nodes.filter((n) => (n.name ?? '').includes(hall)).length,
      material: mats.filter((m) => (m.name ?? '').includes(hall)).length,
      mesh: meshes.filter((m) => (m.name ?? '').includes(hall)).length,
    }
  }

  const rootNodes = (json.scenes?.[json.scene ?? 0]?.nodes ?? []).map((i) => nodes[i])
  const anon = nodes.filter((n) => !n.name).length

  console.log('='.repeat(72))
  console.log(path)
  console.log(`  generator: ${json.asset?.generator ?? '?'} | version ${json.asset?.version}`)
  console.log(`  BIN chunk: ${(binLen / 1048576).toFixed(1)}MB`)
  console.log(`  nodes:${nodes.length} (匿名 ${anon}, 带mesh ${meshNodes.length}) meshes:${meshes.length} prims:${totalPrims}`)
  console.log(`  materials:${mats.length} images:${imgs.length} textures:${json.textures?.length ?? 0}`)
  console.log(`  extensionsUsed: ${JSON.stringify(json.extensionsUsed ?? [])}`)
  console.log(`  根节点: ${rootNodes.map((n) => `"${n.name ?? '?'}"${n.mesh !== undefined ? '[mesh]' : ''}`).join(', ')}`)
  if (box) {
    console.log(`  原始几何包围盒(未乘节点变换): min [${box.min.map(fmt)}] max [${box.max.map(fmt)}]`)
  }
  console.log(`  六厅名称命中 (node/material/mesh):`)
  for (const [hall, hit] of Object.entries(nameHit)) {
    console.log(`    ${hall}: ${hit.node}/${hit.material}/${hit.mesh}`)
  }
  const meshNames = meshes.map((m) => m.name).filter(Boolean)
  console.log(`  前 40 个 mesh 名: ${meshNames.slice(0, 40).join(' | ')}`)
  const matNames = mats.map((m) => m.name).filter(Boolean)
  console.log(`  前 40 个材质名: ${matNames.slice(0, 40).join(' | ')}`)
  const imgTypes = {}
  for (const im of imgs) imgTypes[im.mimeType ?? (im.uri ? 'uri' : 'bin')] = (imgTypes[im.mimeType ?? (im.uri ? 'uri' : 'bin')] ?? 0) + 1
  console.log(`  图片类型: ${JSON.stringify(imgTypes)}`)
}
