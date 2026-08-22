// 追踪 toggle 行为：teleport vs 直接设机位；材质名/钩子状态前后对比
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__camera && window.__THREE && window.__mainHallCornerShadows && window.__teleport,
  null, { timeout: 180000 },
)
await page.waitForTimeout(2500)

const probeMat = () => page.evaluate(() => {
  // 找主厅大墙网格209 的当前材质 onBeforeCompile 状态
  let row = null
  window.__gltfScene.traverse((o) => {
    if (row || !o.isMesh || o.name !== '网格209') return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    row = mats.map((m) => `${m?.name}${m?.onBeforeCompile ? '+patched' : ''}`).join('|')
  })
  return row
})

console.log('初始 网格209 材质:', await probeMat())

// A) 直接设机位（care-junction-planes 模式）
await page.evaluate(() => {
  const THREE = window.__THREE
  const cam = window.__camera
  cam.up.set(0, 1, 0)
  cam.position.set(-7.2, 1.7, 22.2)
  cam.lookAt(new THREE.Vector3(-9.5, 2.4, 24.5))
  cam.updateMatrixWorld()
})
console.log('直接设机位后 toggle 返回:', await page.evaluate(() => window.__mainHallCornerShadows.toggle()))
console.log('  网格209 材质:', await probeMat())
console.log('toggle 回:', await page.evaluate(() => window.__mainHallCornerShadows.toggle()))
console.log('  网格209 材质:', await probeMat())

// B) teleport
await page.evaluate(() => {
  window.__teleport({ x: -7.2, y: 1.7, z: 22.2 }, { x: -9.5, y: 2.4, z: 24.5 })
  window.__camera.updateMatrixWorld()
})
await page.waitForTimeout(300)
console.log('teleport 后 toggle 返回:', await page.evaluate(() => window.__mainHallCornerShadows.toggle()))
console.log('  网格209 材质:', await probeMat())
console.log('toggle 回:', await page.evaluate(() => window.__mainHallCornerShadows.toggle()))
console.log('  网格209 材质:', await probeMat())

// C) teleport 后再等更久，看钩子是否被重挂
await page.evaluate(() => {
  window.__teleport({ x: -6.5, y: 1.7, z: 20.5 }, { x: -9.7, y: 2.2, z: 18.6 })
})
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30)))))
}
const hookInfo = await page.evaluate(() => {
  const h = window.__mainHallCornerShadows
  return { hasToggle: typeof h?.toggle === 'function', junctionCount: h?.junctions?.length }
})
console.log('teleport+rAF 后钩子:', JSON.stringify(hookInfo))
console.log('  网格209 材质:', await probeMat())
console.log('toggle 返回:', await page.evaluate(() => window.__mainHallCornerShadows.toggle()))
console.log('  网格209 材质:', await probeMat())
console.log('toggle 回:', await page.evaluate(() => window.__mainHallCornerShadows.toggle()))
console.log('  网格209 材质:', await probeMat())
await browser.close()
