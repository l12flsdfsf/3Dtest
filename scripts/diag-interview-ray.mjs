// 诊断：采访机机位 → 点击点射线命中的对象序列
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__teleport && window.__THREE, null, { timeout: 120000 })

const result = await page.evaluate(() => {
  const THREE = window.__THREE
  let target = null
  window.__gltfScene.traverse((o) => {
    if (target || !o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    if (mats.some((m) => m?.map?.name === '采访机_basecolor')) target = o
  })
  if (!target) return { found: false }

  target.updateWorldMatrix(true, false)
  const box = new THREE.Box3().setFromObject(target)
  const c = box.getCenter(new THREE.Vector3())
  window.__teleport({ x: c.x + 1.8, y: 1.55, z: c.z }, { x: c.x, y: c.y, z: c.z })
  window.__camera.updateMatrixWorld()

  const v = new THREE.Vector3(c.x, c.y, c.z).project(window.__camera)
  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(new THREE.Vector2(v.x, v.y), window.__camera)
  const hits = raycaster.intersectObject(window.__gltfScene, true).slice(0, 10)
  return {
    found: true,
    cam: { x: +window.__camera.position.x.toFixed(2), y: +window.__camera.position.y.toFixed(2), z: +window.__camera.position.z.toFixed(2) },
    screen: { x: +v.x.toFixed(3), y: +v.y.toFixed(3) },
    hits: hits.map((h) => {
      const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material]
      const m = Number.isInteger(h.face?.materialIndex) && mats[h.face.materialIndex] ? mats[h.face.materialIndex] : mats[0]
      return {
        mesh: h.object.name,
        mat: m?.name || '',
        map: m?.map?.name || '',
        transparent: !!m?.transparent,
        opacity: m?.opacity,
        dist: +h.distance.toFixed(2),
      }
    }),
  }
})
console.log(JSON.stringify(result, null, 1))
await browser.close()
