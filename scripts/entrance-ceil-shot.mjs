// 入口（南墙）顶部条带检查：修复后新增的 vtop 条是否自然
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
await page.waitForTimeout(2500)

const shots = [
  { name: 'south-wide', pos: [0, 1.72, 20], look: [0, 5, 24.7] },
  { name: 'south-east-seg', pos: [4.5, 1.72, 17.5], look: [9.7, 5, 21.9] },
  { name: 'east-wall-top', pos: [3, 1.72, 12], look: [9.4, 5, 14] },
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
  await page.screenshot({ path: `.tmp-ktx/south-${s.name}.png`, timeout: 90000 })
  console.log('shot', s.name)
}
await browser.close()
