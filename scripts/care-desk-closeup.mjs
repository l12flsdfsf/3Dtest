// 关怀厅书桌探针 v3：正确的世界坐标（transform 是模型→canonical，不能直接当 canonical→模型用）
// 关怀厅世界区域: x∈[-22.5,-12.2], z∈[10.5,22.9]，中心 (-17.3, 16.7)
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__teleport && window.__THREE && window.__playerDebug?.collision === true, null, { timeout: 120000 })

// 厅中心 8 方向环视（45° 步进），记录每方向画面中心偏下的射线拾取
const results = []
for (let i = 0; i < 8; i += 1) {
  const angle = (i * Math.PI) / 4
  const tx = -17.3 + 6 * Math.cos(angle)
  const tz = 16.7 + 6 * Math.sin(angle)
  await page.evaluate(([tx, tz]) => {
    window.__teleport({ x: -17.3, y: 1.6, z: 16.7 }, { x: tx, y: 1.0, z: tz })
  }, [tx, tz])
  await page.waitForTimeout(2200)
  const hit = await page.evaluate(() => {
    const { Raycaster, Vector2 } = window.__THREE
    const raycaster = new Raycaster()
    raycaster.setFromCamera(new Vector2(0, -0.2), window.__camera)
    const hits = raycaster.intersectObject(window.__gltfScene, true)
    if (!hits.length) return null
    const h = hits[0]
    const mat = Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex ?? 0] : h.object.material
    return {
      mesh: h.object.name,
      mat: mat?.name || '',
      y: +h.point.y.toFixed(2),
      map: mat?.map?.name || (mat?.map ? '(map)' : ''),
    }
  })
  await page.screenshot({ path: `.tmp-ktx/care3-dir${i}.png`, timeout: 90000 })
  results.push({ dir: i, angleDeg: Math.round((angle * 180) / Math.PI), hit })
  console.log(`dir${i} (${Math.round((angle * 180) / Math.PI)}°) hit=${JSON.stringify(hit)}`)
}
await browser.close()
