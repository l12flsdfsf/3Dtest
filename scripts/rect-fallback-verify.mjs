// 验证 RectHalls fallback 移植：四厅 debug 钩子新字段 + 主厅不受影响 + 无页面错误
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', (err) => errors.push(String(err).slice(0, 300)))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__camera && window.__THREE
    && window.__mainHallCornerShadows && window.__mainHallCeilingShadows
    && window.__broadcastCornerShadows && window.__tvCornerShadows
    && window.__cinemaCornerShadows && window.__futureCornerShadows,
  null, { timeout: 180000 },
)
await page.waitForTimeout(2500)

const report = await page.evaluate(() => {
  const pick = (key) => {
    const h = window[key]
    if (!h) return { missing: true }
    return {
      junctions: h.junctions.length,
      meshCount: h.meshCount,
      materialMeshCount: h.materialMeshCount,
      fallbackMeshCount: h.fallbackMeshCount,
      mode: h.mode,
    }
  }
  return {
    broadcast: pick('__broadcastCornerShadows'),
    tv: pick('__tvCornerShadows'),
    cinema: pick('__cinemaCornerShadows'),
    future: pick('__futureCornerShadows'),
    mainJunctions: window.__mainHallCornerShadows.junctions.length,
    topZLines: window.__mainHallCeilingShadows.lines.topZ.length,
    topXLines: window.__mainHallCeilingShadows.lines.topX.length,
  }
})
console.log(JSON.stringify(report, null, 2))
console.log('pageerrors:', errors.length ? errors : '无')
await browser.close()
