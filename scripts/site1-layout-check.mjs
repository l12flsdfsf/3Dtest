// 导出指定模型的 worldLayout 六厅边界（node scripts/site1-layout-check.mjs [模型URL]）
import { chromium } from 'playwright-core'
const model = encodeURIComponent(process.argv[2] ?? '/models/site1/scene-site1.glb')
const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
await page.goto(`http://localhost:5173/?model=${model}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => document.querySelector('button[aria-label="关闭"]'), null, { timeout: 300000 })
await page.evaluate(() => document.querySelectorAll('button[aria-label="关闭"]').forEach((b) => b.click()))
await page.waitForFunction(() => window.__worldLayout?.halls?.length, null, { timeout: 300000 })
const layout = await page.evaluate(() => JSON.parse(JSON.stringify(window.__worldLayout)))
for (const h of layout.halls ?? []) {
  console.log(
    `${h.name.padEnd(6)} x[${h.worldMinX.toFixed(1)}, ${h.worldMaxX.toFixed(1)}] z[${h.worldMinZ.toFixed(1)}, ${h.worldMaxZ.toFixed(1)}]`,
  )
}
console.log('anchors:', JSON.stringify(layout.anchors))
await browser.close()
