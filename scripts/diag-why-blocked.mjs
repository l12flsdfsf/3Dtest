// 诊断：录像机/奖杯1 的网格材质结构 + 各方向射线首个实体命中
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

const out = await page.evaluate(() => {
  const THREE = window.__THREE
  const report = {}

  for (const mapName of ['录像机_basecolor', '奖杯1_basecolor']) {
    // 所有含此贴图的网格及其材质列表
    const meshes = []
    window.__gltfScene.traverse((o) => {
      if (!o.isMesh) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      if (mats.some((m) => m?.map?.name === mapName)) {
        o.updateWorldMatrix(true, false)
        const box = new THREE.Box3().setFromObject(o)
        const c = box.getCenter(new THREE.Vector3())
        meshes.push({
          name: o.name,
          matCount: mats.length,
          mats: mats.map((m) => `${m?.name}|${m?.map?.name || ''}`),
          center: { x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2) },
        })
      }
    })

    // 对第一个网格做 4 方向射线探测
    const target = window.__gltfScene.getObjectByName(meshes[0]?.name)
    const box = new THREE.Box3().setFromObject(target)
    const center = box.getCenter(new THREE.Vector3())
    const dirs = {}
    for (const [label, dx, dz] of [['+x', 1, 0], ['-x', -1, 0], ['+z', 0, 1], ['-z', 0, -1]]) {
      const camPos = new THREE.Vector3(center.x + dx * 1.9, Math.max(1.1, center.y + 0.35), center.z + dz * 1.9)
      window.__teleport({ x: camPos.x, y: camPos.y, z: camPos.z }, { x: center.x, y: center.y, z: center.z })
      window.__camera.updateMatrixWorld()
      const v = new THREE.Vector3(center.x, center.y, center.z).project(window.__camera)
      const cam = window.__camera.position.clone()
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(v.x, v.y), window.__camera)
      const hits = raycaster.intersectObject(window.__gltfScene, true).slice(0, 4)
      dirs[label] = {
        cam: `${+cam.x.toFixed(1)},${+cam.y.toFixed(1)},${+cam.z.toFixed(1)}`,
        hits: hits.map((h) => {
          const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material]
          const m = Number.isInteger(h.face?.materialIndex) ? h.object.material[h.face.materialIndex] : mats[0]
          return `${h.object.name.slice(0, 22)}|${m?.name || ''}|${m?.map?.name || ''}`
        }),
      }
    }
    report[mapName] = { meshes, dirs }
  }
  return report
})
console.log(JSON.stringify(out, null, 1).slice(0, 4000))
await browser.close()
