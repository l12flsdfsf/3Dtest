// 电视厅（世界 x∈[-22.5,-10.5], z∈[-16.4,-3.6]）内展品清单：
// 列出 *_basecolor 命名贴图的网格，按离门口（x 最大侧）排序，标注 z 侧（进门左手 = +z）
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
  const TV = { minX: -22.5, maxX: -10.5, minZ: -16.4, maxZ: -3.6 }
  const seen = new Map()
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      const mapName = typeof m?.map?.name === 'string' ? m.map.name : ''
      const match = mapName.match(/^(.+)_basecolor$/i)
      if (!match || !/[一-鿿]/.test(match[1])) continue

      o.updateWorldMatrix(true, false)
      const box = new THREE.Box3().setFromObject(o)
      const c = box.getCenter(new THREE.Vector3())
      if (c.x < TV.minX || c.x > TV.maxX || c.z < TV.minZ || c.z > TV.maxZ) continue

      const prev = seen.get(match[1])
      if (!prev || prev.x < c.x) seen.set(match[1], { x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2) })
    }
  })
  return [...seen.entries()]
    .map(([name, c]) => ({ name, ...c, side: c.z > -10 ? '进门左(+z)' : '进门右(-z)' }))
    .sort((a, b) => b.x - a.x)
})
console.log('电视厅展品（按离门口 x 从近到远）:')
for (const r of result) console.log(`  ${r.name}  world(${r.x}, ${r.z})  [${r.side}]`)
await browser.close()
