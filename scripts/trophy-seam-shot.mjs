// 奖杯墙顶部条带断缝特写（before/after 共用）：正对 x=±6.4 断缝处与墙中央
import { chromium } from 'playwright-core'

const tag = process.argv[2] ?? 'before'
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
  { name: 'seam-left', pos: [-7.6, 1.72, -13.4], look: [-6.4, 4.9, -17] },
  { name: 'seam-right', pos: [4.9, 1.72, -13.4], look: [6.4, 4.9, -17] },
  { name: 'mid', pos: [-0.4, 1.72, -14.2], look: [-0.4, 4.9, -17] },
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
  await page.screenshot({ path: `.tmp-ktx/seam-${tag}-${s.name}.png`, timeout: 90000 })
  console.log('shot', s.name)
}
await browser.close()
