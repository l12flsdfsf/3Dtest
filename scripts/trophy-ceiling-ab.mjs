// A/B 对比：主厅角落阴影开/关、边缘覆盖条隐藏/显示，看奖杯墙-天花交界各自贡献
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__gltfScene && window.__camera && window.__THREE && window.__mainHallCornerShadows, null, { timeout: 180000 })
await page.waitForTimeout(2500)

const setPose = (shot) => page.evaluate((s) => {
  const THREE = window.__THREE
  const cam = window.__camera
  cam.up.set(0, 1, 0)
  cam.position.set(s.pos[0], s.pos[1], s.pos[2])
  cam.lookAt(new THREE.Vector3(s.look[0], s.look[1], s.look[2]))
  cam.updateMatrixWorld()
}, shot)

// 隐藏/恢复边缘覆盖条（renderOrder 15~18 的透明 ShaderMaterial 平面）
const setOverlays = (visible) => page.evaluate((v) => {
  const scene = window.__gltfScene.parent
  if (!scene) return
  scene.traverse((o) => {
    if (!o.isMesh) return
    if (o.renderOrder >= 15 && o.renderOrder <= 18) o.visible = v
  })
}, visible)

const shots = [
  { name: 'up-close', pos: [-1, 1.5, -14.6], look: [-1, 5.1, -17] },
  { name: 'left-corner', pos: [-8.5, 1.72, -13.5], look: [-9.4, 4.8, -17] },
  { name: 'right-corner', pos: [7, 1.72, -13.5], look: [9.8, 4.8, -17] },
]

for (const s of shots) {
  await setPose(s)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `.tmp-ktx/ab-${s.name}-on.png`, timeout: 90000 })

  await setOverlays(false)
  await page.waitForTimeout(200)
  await page.screenshot({ path: `.tmp-ktx/ab-${s.name}-noover.png`, timeout: 90000 })

  await page.evaluate(() => window.__mainHallCornerShadows.toggle())
  await page.waitForTimeout(200)
  await page.screenshot({ path: `.tmp-ktx/ab-${s.name}-off.png`, timeout: 90000 })

  await page.evaluate(() => window.__mainHallCornerShadows.toggle())
  await setOverlays(true)
  console.log('done', s.name)
}
await browser.close()
