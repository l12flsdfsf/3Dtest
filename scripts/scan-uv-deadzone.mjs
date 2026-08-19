// 扫描哪些网格的 UV 采样落在图集右上白色死区 (u 0.80-1.0, v 0.88-1.0)
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true })
await page.waitForFunction(() => window.__gltfScene, null, { timeout: 120000 })
await page.waitForTimeout(2500)

const result = await page.evaluate(() => {
  const IN_DEADZONE = (u, v) => u >= 0.8 && u <= 1.0 && v >= 0.88 && v <= 1.0
  const rows = []
  window.__gltfScene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    if (!materials.some((m) => m?.name === '大厅')) return
    const geometry = object.geometry
    const uv = geometry.attributes?.uv
    if (!uv) return
    let inZone = 0
    let vMin = 1
    let vMax = 0
    let uMin = 1
    let uMax = 0
    for (let i = 0; i < uv.count; i += 1) {
      const u = uv.getX(i)
      const v = uv.getY(i)
      if (IN_DEADZONE(u, v)) {
        inZone += 1
        vMin = Math.min(vMin, v)
        vMax = Math.max(vMax, v)
        uMin = Math.min(uMin, u)
        uMax = Math.max(uMax, u)
      }
    }
    if (inZone > 0) {
      rows.push({ mesh: object.name, uvCount: uv.count, inZone, uRange: [+uMin.toFixed(3), +uMax.toFixed(3)], vRange: [+vMin.toFixed(3), +vMax.toFixed(3)] })
    }
  })
  // 顺带查 v 0.80-0.88 的青绿区被谁用
  const teal = []
  window.__gltfScene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    if (!materials.some((m) => m?.name === '大厅')) return
    const uv = object.geometry?.attributes?.uv
    if (!uv) return
    let count = 0
    for (let i = 0; i < uv.count; i += 1) {
      const u = uv.getX(i)
      const v = uv.getY(i)
      if (u >= 0.8 && v >= 0.8 && v < 0.88) count += 1
    }
    if (count > 0) teal.push({ mesh: object.name, count })
  })
  return { deadzone: rows, tealZone: teal }
})
console.log('=== UV 落在白色死区的网格（材质=大厅） ===')
for (const r of result.deadzone) console.log(JSON.stringify(r))
console.log('=== UV 落在下方青绿区 (v 0.80-0.88) 的网格 ===')
for (const r of result.tealZone) console.log(JSON.stringify(r))
await browser.close()
