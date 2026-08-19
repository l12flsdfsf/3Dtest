// 网格扫描开阔度：z=28→-28 剖面 × 7 个 x 位置，四方向最小开阔度（用应用暴露的 __clearance）
import { chromium } from 'playwright-core'

const MODEL = process.argv[2] || 'preview-0817-compat.glb'
const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } })
await page.goto(`http://localhost:5173/?model=/models/${MODEL}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__clearance && window.__playerDebug?.collision === true, null, { timeout: 60000 })

const profile = await page.evaluate(() => {
  const clear = window.__clearance
  const rows = []
  for (let z = 28; z >= -28; z -= 2) {
    const cells = {}
    for (const x of [-20, -10, -3, 0, 3, 10, 20]) {
      const c = Math.min(
        clear(x, 1.2, z, 0, 1),
        clear(x, 1.2, z, 0, -1),
        clear(x, 1.2, z, 1, 0),
        clear(x, 1.2, z, -1, 0),
      )
      cells[x] = Math.round(Math.min(c, 30))
    }
    rows.push({ z, cells })
  }
  return rows
})
for (const row of profile) {
  const cells = [-20, -10, -3, 0, 3, 10, 20].map((x) => String(row.cells[x]).padStart(3))
  console.log(`z=${String(row.z).padStart(4)} | ${cells.join(' ')}`)
}
await browser.close()
