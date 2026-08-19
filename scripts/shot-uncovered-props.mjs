// 给未覆盖的展品类网格逐个拍照：mesh_rep 扫描件 + JiangBei 奖章组 + CD + 无贴图小件
import { chromium } from 'playwright-core'

const NAMES = process.argv.slice(2)

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__teleport && window.__THREE, null, { timeout: 120000 })

for (const [index, meshName] of NAMES.entries()) {
  const shot = await page.evaluate((meshName) => {
    const THREE = window.__THREE
    const target = window.__gltfScene.getObjectByName(meshName)
    if (!target || !target.isMesh) return { ok: false, meshName }
    target.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(target)
    const center = box.getCenter(new THREE.Vector3())
    const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z)

    const hitMaterial = (h) => {
      const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material]
      const idx = h.face?.materialIndex
      return Number.isInteger(idx) && mats[idx] ? mats[idx] : mats[0]
    }

    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const dist = Math.max(1.0, span * 2.2)
      window.__teleport(
        { x: center.x + dx * dist, y: Math.max(1.0, center.y + 0.25), z: center.z + dz * dist },
        { x: center.x, y: center.y, z: center.z },
      )
      window.__camera.updateMatrixWorld()
      const v = new THREE.Vector3(center.x, center.y, center.z).project(window.__camera)
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(v.x, v.y), window.__camera)
      const hits = raycaster.intersectObject(window.__gltfScene, true)
      const firstSolid = hits.find((h) => {
        const m = hitMaterial(h)
        return !(m?.name?.includes('玻璃') || (m?.transparent && m.opacity <= 0.6))
      })
      if (firstSolid && (firstSolid.object === target || firstSolid.object.name === meshName)) {
        return { ok: true, px: Math.round(((v.x + 1) / 2) * window.innerWidth), py: Math.round(((1 - v.y) / 2) * window.innerHeight) }
      }
    }
    return { ok: false, meshName }
  }, meshName)

  if (!shot.ok) {
    console.log(`${index}: ${meshName} -> 无法直击，跳过`)
    continue
  }
  await page.waitForTimeout(600)
  await page.screenshot({ path: `.tmp-ktx/id-${String(index).padStart(2, '0')}.png`, timeout: 60000 })
  console.log(`${index}: ${meshName} -> id-${String(index).padStart(2, '0')}.png`)
}
await browser.close()
