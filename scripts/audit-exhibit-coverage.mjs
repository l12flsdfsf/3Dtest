// 覆盖对账：全场景展品类网格 vs 当前可点名单（CLICKABLE_EXHIBITS/EXHIBIT_INFO）
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__gltfScene && window.__THREE, null, { timeout: 120000 })

const result = await page.evaluate(() => {
  const THREE = window.__THREE
  const rows = []
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    o.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(o)
    if (box.isEmpty()) return
    const size = box.getSize(new THREE.Vector3())
    const maxSpan = Math.max(size.x, size.y, size.z)
    // 展品类：tripo 生成物 / 修复扫描件 / 小尺寸独立物件（非建筑、非展板）
    const isProp =
      o.name.startsWith('tripo_node_') ||
      o.name.startsWith('mesh_rep_') ||
      (maxSpan < 1.2 && box.min.y > 0.25 && box.max.y < 1.9 && !/墙|板|屏|柜|台|地|顶|灯|网格2\d\d/.test(o.name))
    if (!isProp) return

    const mats = Array.isArray(o.material) ? o.material : [o.material]
    const mapNames = [...new Set(mats.map((m) => m?.map?.name || '').filter(Boolean))]
    rows.push({
      mesh: o.name.slice(0, 34),
      maps: mapNames.join(','),
      span: +maxSpan.toFixed(2),
      x: +((box.min.x + box.max.x) / 2).toFixed(1),
      y: +box.min.y.toFixed(1),
      z: +((box.min.z + box.max.z) / 2).toFixed(1),
    })
  })
  return rows
})

const coveredRe = /^[一-鿿].*_basecolor$/i
const covered = []
const uncovered = []
for (const row of result) {
  const maps = row.maps.split(',').filter(Boolean)
  if (maps.some((m) => coveredRe.test(m))) covered.push(row)
  else uncovered.push(row)
}
console.log(`展品类网格共 ${result.length}，命名贴图覆盖 ${covered.length}，未覆盖 ${uncovered.length}：`)
for (const row of uncovered) {
  console.log(`  ${row.mesh}  maps=[${row.maps || '无map'}] span=${row.span} at(${row.x}, ${row.y}, ${row.z})`)
}
await browser.close()
