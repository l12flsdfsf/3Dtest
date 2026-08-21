// 验证天花 shader 压暗：无编译错误、无残留贴片、连续性、贴合度、灯带不受影响
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', (err) => errors.push(String(err).slice(0, 300)))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text().slice(0, 300))
})
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__camera && window.__THREE && window.__mainHallCeilingShadows,
  null,
  { timeout: 180000 },
)
await page.waitForTimeout(2500)
console.log('shader patch ready:', Boolean(await page.evaluate(() => window.__mainHallCeilingShadows)))

// 残留的天花贴片（renderOrder 16）应为 0
const leftover = await page.evaluate(() => {
  let count = 0
  window.__gltfScene.parent.traverse((o) => {
    if (o.isMesh && o.renderOrder === 16) count += 1
  })
  return count
})
console.log('leftover ceiling overlay strips (want 0):', leftover)

// 被换装的天花网格
const patched = await page.evaluate(() => {
  const THREE = window.__THREE
  const rows = []
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    if (!mats.some((m) => m?.onBeforeCompile && m.customProgramCacheKey?.() === 'main-hall-ceiling-edge-v1')) return
    o.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(o)
    rows.push(`${o.name} y:${box.min.y.toFixed(2)}~${box.max.y.toFixed(2)} x:${box.min.x.toFixed(1)}~${box.max.x.toFixed(1)} z:${box.min.z.toFixed(1)}~${box.max.z.toFixed(1)}`)
  })
  return rows
})
patched.forEach((r) => console.log('patched ceiling:', r))

const shots = [
  { name: 'mid', pos: [-0.4, 1.72, -14.2], look: [-0.4, 4.9, -17] },
  { name: 'seam-left', pos: [-7.6, 1.72, -13.4], look: [-6.4, 4.9, -17] },
  { name: 'graze', pos: [-8.8, 1.6, -13.2], look: [4, 5.2, -16.9] },
  { name: 'corner', pos: [-8.2, 1.72, -13.6], look: [-9.3, 4.9, -16.9] },
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
  await page.screenshot({ path: `.tmp-ktx/ceilshader-${s.name}-on.png`, timeout: 90000 })
  await page.evaluate(() => window.__mainHallCeilingShadows.toggle())
  await page.waitForTimeout(250)
  await page.screenshot({ path: `.tmp-ktx/ceilshader-${s.name}-off.png`, timeout: 90000 })
  await page.evaluate(() => window.__mainHallCeilingShadows.toggle())
  console.log('shot', s.name)
}

console.log('errors:', errors.length ? errors.slice(0, 5) : 'none')
await browser.close()
