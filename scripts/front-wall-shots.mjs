// 前墙西段（奖状区/荣誉墙）+ 东段对照截图
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__gltfScene && window.__camera && window.__THREE, null, { timeout: 180000 })
await page.waitForTimeout(2000)

const shots = [
  // 正对前墙西段奖状区
  { name: 'front-west', pos: [-6, 1.7, 19.5], look: [-6.2, 4.3, 24.7] },
  // 前墙全景（从厅内斜看）
  { name: 'front-wide', pos: [0, 1.7, 17], look: [0, 4.2, 24.7] },
]
for (const s of shots) {
  await page.evaluate((shot) => {
    const THREE = window.__THREE
    const cam = window.__camera
    cam.up.set(0, 1, 0)
    cam.position.set(shot.pos[0], shot.pos[1], shot.pos[2])
    cam.lookAt(new THREE.Vector3(shot.look[0], shot.look[1], shot.look[2]))
    cam.updateMatrixWorld()
  }, s)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `.tmp-ktx/${s.name}.png`, timeout: 90000 })
  console.log('shot', s.name)
}
await browser.close()
