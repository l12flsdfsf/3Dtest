// 关怀厅书桌探针 v2：关怀厅世界侧 = back 墙（canonical z<0），传送 + 环视 + 列低矮网格
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__teleport && window.__worldLayout && window.__playerDebug?.collision === true, null, { timeout: 120000 })

// 打印 transform + 六厅世界中心（front 数据厅 → 世界 back：z=-8.4；back 数据厅 → 世界 front：z=+8.4）
const info = await page.evaluate(() => {
  const layout = window.__worldLayout
  const t = layout.transform
  const project = (cx, cz) => ({ x: +(t.x[0] * cx + t.x[1] * cz + t.x[2]).toFixed(2), z: +(t.z[0] * cx + t.z[1] * cz + t.z[2]).toFixed(2) })
  const halls = [
    ['care 关怀厅', 8, -8.4],
    ['broadcast 广播厅', 0, -8.4],
    ['tv 电视厅', -8, -8.4],
    ['cinema 电影厅', -8, 8.4],
    ['tech 技术设备厅', 0, 8.4],
    ['future 展望厅', 8, 8.4],
  ].map(([n, x, z]) => ({ n, world: project(x, z) }))
  return { transform: t, halls }
})
console.log('transform:', JSON.stringify(info.transform))
for (const h of info.halls) console.log(`  ${h.n} -> world(${h.world.x}, ${h.world.z})`)

// 关怀厅网格清单：canonical x∈[4.4,11.6], z∈[-12.4,-4.4]
const hallMeshes = await page.evaluate(() => {
  const t = window.__worldLayout.transform
  const [a, b, e] = t.x, [c, d, f] = t.z
  const det = a * d - b * c
  const inv = (wx, wz) => ({ x: (d * (wx - e) - b * (wz - f)) / det, z: (-c * (wx - e) + a * (wz - f)) / det })
  const meshes = []
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    o.updateWorldMatrix(true, false)
    const g = o.geometry
    if (!g?.attributes?.position) return
    g.computeBoundingBox()
    const wb = g.boundingBox.clone().applyMatrix4(o.matrixWorld)
    const c0 = inv((wb.min.x + wb.max.x) / 2, (wb.min.z + wb.max.z) / 2)
    if (c0.x < 4.4 || c0.x > 11.6 || c0.z < -12.4 || c0.z > -4.4) return
    const mat = Array.isArray(o.material) ? o.material[0] : o.material
    meshes.push({
      name: o.name,
      mat: mat?.name || '',
      yMin: +wb.min.y.toFixed(2),
      yMax: +wb.max.y.toFixed(2),
      sizeX: +(wb.max.x - wb.min.x).toFixed(2),
      sizeZ: +(wb.max.z - wb.min.z).toFixed(2),
      cx: +c0.x.toFixed(1),
      cz: +c0.cz?.toFixed?.(1) ?? +c0.z.toFixed(1),
      color: mat?.color ? `#${mat.color.getHexString()}` : '',
      map: mat?.map?.name || (mat?.map ? '(has map)' : ''),
      alphaMode: mat?.alphaMode || '',
      transparent: !!mat?.transparent,
      opacity: mat?.opacity,
    })
  })
  return meshes
})
console.log(`\n关怀厅内网格 ${hallMeshes.length} 个`)
for (const m of hallMeshes.sort((p, q) => p.yMax - q.yMax)) {
  console.log(`  ${m.name} [${m.mat}] y=${m.yMin}~${m.yMax} size=${m.sizeX}x${m.sizeZ} at(${m.cx},${m.cz}) color=${m.color} map=${m.map} alpha=${m.alphaMode}/${m.transparent}/${m.opacity}`)
}

// 传送：站厅入口 canonical (8, -3.3)，先看厅中心
const shots = [
  ['in-back', 8, -11.5],  // 从入口看后墙
  ['in-left', 4.6, -8.4], // 站厅中心看 -x
  ['in-right', 11.4, -8.4],
  ['in-entry', 8, -4.0],
]
for (const [name, tx, tz] of shots) {
  await page.evaluate(([tx, tz]) => {
    const t = window.__worldLayout.transform
    const proj = (cx, cz) => ({ x: t.x[0] * cx + t.x[1] * cz + t.x[2], z: t.z[0] * cx + t.z[1] * cz + t.z[2] })
    const standCz = Math.abs(tz) > 10 ? -5.2 : -8.4 // 第一张站门口，其余站厅中心
    const eye = proj(8, standCz)
    const target = proj(tx, tz)
    window.__teleport({ x: eye.x, y: 1.72, z: eye.z }, { x: target.x, y: 1.15, z: target.z })
  }, [tx, tz])
  await page.waitForTimeout(2500)
  const dbg = await page.evaluate(() => window.__playerDebug)
  console.log(`care-${name}: player at (${dbg.x}, ${dbg.z})`)
  await page.screenshot({ path: `.tmp-ktx/care-${name}.png` })
  console.log(`已截图 care-${name}.png`)
}
await browser.close()
