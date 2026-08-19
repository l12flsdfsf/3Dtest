// 最终验证：去掉 DOM 光晕遮罩后，两个朝向的屏幕顶部区域不再有白色亮斑，
// 且大厅墙面亮度恢复（假自发光已还原）
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true })
await page.waitForFunction(() => window.__gltfScene && window.__camera, null, { timeout: 120000 })
await page.waitForTimeout(4000)
await page.screenshot({ path: '.tmp-ktx/final-facing.png', timeout: 90000 })
console.log('朝向1完成')

await page.mouse.move(640, 360)
await page.mouse.down()
await page.mouse.move(200, 360, { steps: 25 })
await page.mouse.up()
await page.waitForTimeout(2500)
await page.screenshot({ path: '.tmp-ktx/final-turned.png', timeout: 90000 })
console.log('朝向2完成')
await browser.close()
