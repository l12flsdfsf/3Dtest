// 探测西墙前段（x≈-9.7, z 19~24.7）的网格：确认是否荣誉墙 + 网格名
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

const rows = await page.evaluate(() => {
  const THREE = window.__THREE
  const out = []
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    o.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(o)
    if (box.isEmpty()) return
    // 西墙前段附近的网格：x -11~-8.8, z 18~25.5
    if (box.max.x < -8.8 || box.min.x > -5 || box.max.z < 18 || box.min.z > 25.5) return
    const size = box.getSize(new THREE.Vector3())
    if (Math.max(size.x, size.y, size.z) < 1.2) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    out.push({
      mesh: o.name.slice(0, 40),
      mat: mats.map((m) => m?.name).filter(Boolean).slice(0, 3).join('|'),
      box: [
        +box.min.x.toFixed(2), +box.min.y.toFixed(2), +box.min.z.toFixed(2),
        +box.max.x.toFixed(2), +box.max.y.toFixed(2), +box.max.z.toFixed(2),
      ],
    })
  })
  return out
})
rows.forEach((r) => console.log(`${r.mesh} [${r.mat}] box=${r.box.join(',')}`))

// 顺带：东墙前段对照（荣誉篇章所在）
const east = await page.evaluate(() => {
  const THREE = window.__THREE
  const out = []
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    o.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(o)
    if (box.isEmpty()) return
    if (box.min.x > 8.8 || box.max.x < 5 || box.max.z < 18 || box.min.z > 25.5) return
    const size = box.getSize(new THREE.Vector3())
    if (Math.max(size.x, size.y, size.z) < 1.2) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    out.push({ mesh: o.name.slice(0, 40), mat: mats.map((m) => m?.name).filter(Boolean).slice(0, 3).join('|'), box: [ +box.min.x.toFixed(2), +box.min.y.toFixed(2), +box.min.z.toFixed(2), +box.max.x.toFixed(2), +box.max.y.toFixed(2), +box.max.z.toFixed(2) ] })
  })
  return out
})
console.log('--- east section (对照) ---')
east.forEach((r) => console.log(`${r.mesh} [${r.mat}] box=${r.box.join(',')}`))

// 截图西墙前段
await page.evaluate(() => {
  const THREE = window.__THREE
  const cam = window.__camera
  cam.up.set(0, 1, 0)
  cam.position.set(-4, 1.7, 16)
  cam.lookAt(new THREE.Vector3(-9.7, 4.4, 22))
  cam.updateMatrixWorld()
})
await page.waitForTimeout(400)
await page.screenshot({ path: '.tmp-ktx/west-wall.png', timeout: 90000 })
console.log('shot west-wall')
await browser.close()
