// 看技术设备厅门口：相机放走廊侧，朝厅中心拍
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } })
await page.goto('http://localhost:5173/?model=/models/preview-0817-compat.glb', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__playerDebug?.collision === true, null, { timeout: 90000 })

// 走廊侧 (cz=-3) → 厅中心 (cz=-8.4)，canonical x=0；用应用自己的 transform 投影
const cam = await page.evaluate(() => {
  const layout = window.__worldLayout
  const t = layout.transform
  const project = (cx, cz) => ({ x: t.x[0] * cx + t.x[1] * cz + t.x[2], z: t.z[0] * cx + t.z[1] * cz + t.z[2] })
  const corridor = project(0, -3.2)
  const center = project(0, -8.4)
  const camera = window.__camera
  camera.position.set(corridor.x, 1.7, corridor.z)
  camera.lookAt(center.x, 1.4, center.z)
  camera.updateMatrixWorld()
  return { corridor, center }
})
console.log('相机位置:', JSON.stringify(cam))
await page.waitForTimeout(3000)
await page.screenshot({ path: '.tmp-ktx/tech-door.png' })
console.log('已截图 tech-door.png')
await browser.close()
