// 内部观光：把相机搬到厅内多个位置各拍一张，看模型内部到底是什么
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
await page.waitForFunction(() => window.__camera && window.__playerDebug?.collision === true, null, { timeout: 60000 })

const spots = [
  { label: '中心', x: 0, z: 0, look: [0, 1.7, -10] },
  { label: '中心北', x: 0, z: -12, look: [0, 1.7, -25] },
  { label: '东侧厅', x: 12, z: 8, look: [20, 1.7, 8] },
  { label: '西侧厅', x: -12, z: -8, look: [-20, 1.7, -8] },
  { label: '入口内侧', x: 0, z: 20, look: [0, 1.7, 0] },
]
let index = 0
for (const spot of spots) {
  await page.evaluate((s) => {
    const camera = window.__camera
    camera.position.set(s.x, 1.7, s.z)
    camera.lookAt(s.look[0], s.look[1], s.look[2])
    camera.updateMatrixWorld()
  }, spot)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `.tmp-ktx/interior-${index}-${spot.label}.png` })
  console.log(`已拍 ${spot.label} (${spot.x},${spot.z})`)
  index += 1
}
await browser.close()
