// 关怀厅四角扫拍：站厅中心朝四个墙角看，找红展板下方的书桌
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

const corners = [
  ['c2', 11.4, -11.9], // +x 后角
  ['c3', 4.6, -4.9],   // -x 入口角
  ['c4', 11.4, -4.9],  // +x 入口角
]
for (const [name, tx, tz] of corners) {
  await page.evaluate(([tx, tz]) => {
    const t = window.__worldLayout.transform
    const proj = (cx, cz) => ({ x: t.x[0] * cx + t.x[1] * cz + t.x[2], z: t.z[0] * cx + t.z[1] * cz + t.z[2] })
    const eye = proj(8, -8.4)
    const target = proj(tx, tz)
    window.__teleport({ x: eye.x, y: 1.6, z: eye.z }, { x: target.x, y: 1.0, z: target.z })
  }, [tx, tz])
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `.tmp-ktx/care-corner-${name}.png`, timeout: 90000 })
  console.log(`已截图 care-corner-${name}.png`)
}
await browser.close()
