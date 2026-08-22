// 盘点 场地1 的 Object3D.toJSON 文件（设备0822/*、奖杯.json）
// 用法: node scripts/site1-objectjson-inventory.mjs <json> [...]
// 大文件：JSON.parse 后立刻抽干几何数组只留清单，内存给足 8GB
import { readFileSync } from 'node:fs'

const fmt = (n) => (Array.isArray(n) ? n.map((v) => Math.round(v * 100) / 100) : n)

for (const path of process.argv.slice(2)) {
  const t0 = Date.now()
  const raw = readFileSync(path, 'utf8')
  const doc = JSON.parse(raw)
  const meta = doc.metadata ?? {}
  const geoms = doc.geometries ?? []
  const mats = doc.materials ?? []
  const images = doc.images ?? []
  const textures = doc.textures ?? []

  const stats = {
    objects: 0,
    meshes: 0,
    named: new Map(),
    box: null,
    maxDepth: 0,
  }
  const geomIndexByUuid = new Map(geoms.map((g, i) => [g.uuid, i]))
  // 几何自带 boundingBox 就用;没有的从顶点数组现算,然后抽掉数值释放内存
  const geomBox = new Map()
  for (const g of geoms) {
    if (g.data?.attributes) {
      for (const key of Object.keys(g.data.attributes)) {
        const attr = g.data.attributes[key]
        if (Array.isArray(attr.array)) {
          stats[`attr_${key}`] = (stats[`attr_${key}`] ?? 0) + attr.array.length / attr.itemSize
          if (key === 'position') {
            let mn = [Infinity, Infinity, Infinity]
            let mx = [-Infinity, -Infinity, -Infinity]
            for (let i = 0; i < attr.array.length; i += attr.itemSize) {
              for (let k = 0; k < 3; k++) {
                if (attr.array[i + k] < mn[k]) mn[k] = attr.array[i + k]
                if (attr.array[i + k] > mx[k]) mx[k] = attr.array[i + k]
              }
            }
            if (Number.isFinite(mn[0])) geomBox.set(g.uuid, { min: mn, max: mx })
          }
          attr.array = null
        }
      }
    }
    if (Array.isArray(g.data?.index?.array)) g.data.index.array = null
  }
  for (const im of images) if (typeof im.url === 'string' && im.url.length > 1000) im.url = `<${im.url.length}B dataURL>`

  const expand = (obj, depth, matrix) => {
    stats.objects += 1
    stats.maxDepth = Math.max(stats.maxDepth, depth)
    const name = obj.name ?? ''
    if (name) stats.named.set(name, (stats.named.get(name) ?? 0) + 1)
    if (obj.geometry) {
      stats.meshes += 1
      const bb = geomBox.get(obj.geometry)
      if (bb) {
        // 累计父链 position(忽略旋转/缩放,展品通常无)
        const p = obj.position ?? [0, 0, 0]
        const min = [bb.min[0] + p[0], bb.min[1] + p[1], bb.min[2] + p[2]]
        const max = [bb.max[0] + p[0], bb.max[1] + p[1], bb.max[2] + p[2]]
        stats.box = stats.box
          ? {
              min: min.map((v, i) => Math.min(v, stats.box.min[i])),
              max: max.map((v, i) => Math.max(v, stats.box.max[i])),
            }
          : { min, max }
      }
    }
    for (const child of obj.children ?? []) expand(child, depth + 1)
  }
  if (doc.object) expand(doc.object, 0)

  console.log('='.repeat(70))
  console.log(path)
  console.log(`  type:${meta.type} generator:${meta.generator} 解析耗时${((Date.now() - t0) / 1000).toFixed(0)}s`)
  console.log(`  几何:${geoms.length} (顶点 ${Math.round((stats.attr_position ?? 0) / 1000)}k) 材质:${mats.length} 贴图:${textures.length} 图片:${images.length}`)
  console.log(`  对象树:${stats.objects} 个(网格 ${stats.meshes}, 深度 ${stats.maxDepth})`)
  if (stats.box) console.log(`  世界包围盒(近似,仅根级position平移): min[${fmt(stats.box.min)}] max[${fmt(stats.box.max)}]`)
  const names = [...stats.named.entries()].sort((a, b) => b[1] - a[1])
  console.log(`  名称 ${names.length} 种,前 30: ${names.slice(0, 30).map(([n, c]) => `${n}×${c}`).join(' | ')}`)
  const matNames = mats.map((m) => m.name).filter(Boolean)
  console.log(`  材质名前 20: ${matNames.slice(0, 20).join(' | ')}`)
}
