// 诊断：点击书本位置时，射线（过滤玻璃后）依次命中什么
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
  let book = null
  window.__gltfScene.traverse((o) => {
    if (book || !o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    if (mats.some((m) => m?.map?.name === 'IMG_8092')) book = o
  })
  if (!book) return { found: false }

  book.updateWorldMatrix(true, false)
  const box = new THREE.Box3().setFromObject(book)
  const center = box.getCenter(new THREE.Vector3())
  window.__teleport({ x: center.x - 1.6, y: 1.6, z: center.z }, { x: center.x, y: center.y, z: center.z })
  window.__camera.updateMatrixWorld()

  const raycaster = new THREE.Raycaster()
  const v = new THREE.Vector3(center.x, center.y, center.z).project(window.__camera)
  raycaster.setFromCamera(new THREE.Vector2(v.x, v.y), window.__camera)
  const hits = raycaster.intersectObject(window.__gltfScene, true).slice(0, 8)
  return {
    found: true,
    bookMesh: book.name,
    hits: hits.map((h) => {
      const mats = Array.isArray(h.object.material) ? h.object.material : [h.object]
      const m = Number.isInteger(h.face?.materialIndex) && h.object.material?.[h.face.materialIndex]
        ? h.object.material[h.face.materialIndex]
        : mats[0]
      return { mesh: h.object.name, mat: m?.name || '', map: m?.map?.name || '', dist: +h.distance.toFixed(2) }
    }),
  }
})
console.log(JSON.stringify(result, null, 1))
await browser.close()
