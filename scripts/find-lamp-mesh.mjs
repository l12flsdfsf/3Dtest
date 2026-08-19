// 定位进门右侧染白门框的灯：从初始视角转身后的机位，对画面右侧中上部
// 光晕区域做射线探测，找出灯具网格/材质；同时全场景找"小的圆形自发光"网格
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true })
await page.waitForFunction(() => window.__gltfScene && window.__camera, null, { timeout: 120000 })
await page.waitForTimeout(4000)

// 复现左转B机位：拖拽 640→1200 再 1200→80（与 halo-entrance 相同路径）
await page.mouse.move(640, 360)
await page.mouse.down()
await page.mouse.move(1200, 360, { steps: 25 })
await page.mouse.up()
await page.waitForTimeout(1500)
await page.mouse.move(1200, 360)
await page.mouse.down()
await page.mouse.move(80, 360, { steps: 25 })
await page.mouse.up()
await page.waitForTimeout(2000)

const result = await page.evaluate(() => {
  const { Raycaster, Vector2, Box3, Vector3 } = window.__THREE
  // 光晕在画面 (0.7~0.8, 0.2~0.3) → NDC
  const probes = []
  for (const [nx, ny] of [[0.72, 0.28], [0.76, 0.24], [0.7, 0.32], [0.8, 0.28], [0.74, 0.2]]) {
    const raycaster = new Raycaster()
    raycaster.setFromCamera(new Vector2(nx, ny), window.__camera)
    const hits = raycaster.intersectObject(window.__gltfScene, true)
    if (!hits.length) { probes.push({ nx, ny, hit: null }); continue }
    const h = hits[0]
    const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material]
    const mat = mats[h.face?.materialIndex ?? 0] ?? mats[0]
    probes.push({
      nx, ny,
      mesh: h.object.name,
      material: mat?.name ?? '',
      emissive: mat?.emissive ? `#${mat.emissive.getHexString()}` : '',
      emissiveMap: !!mat?.emissiveMap,
      map: mat?.map?.name ?? '',
      distance: +h.distance.toFixed(2),
      point: h.point.toArray().map((v) => +v.toFixed(1)),
    })
  }
  // 找小尺寸高自发光网格（灯具）
  const lamps = []
  window.__gltfScene.traverse((object) => {
    if (!object.isMesh) return
    const mats = Array.isArray(object.material) ? object.material : [object.material]
    const mat = mats[0]
    if (!mat?.emissive) return
    const e = mat.emissive
    if ((e.r + e.g + e.b) / 3 < 0.75) return
    const box = new Box3().setFromObject(object)
    if (box.isEmpty()) return
    const size = box.getSize(new Vector3())
    const maxSpan = Math.max(size.x, size.y, size.z)
    if (maxSpan > 1.2) return // 小于 1.2m 的发光体才算灯具
    const center = box.getCenter(new Vector3())
    // 只要进门区域附近的（z > 8，玩家从 z≈22 进来）
    if (center.z < 8) return
    lamps.push({
      mesh: object.name, material: mat.name,
      emissive: `#${e.getHexString()}`, intensity: mat.emissiveIntensity,
      center: center.toArray().map((v) => +v.toFixed(1)),
      span: +maxSpan.toFixed(2),
    })
  })
  return { camera: { pos: window.__camera.position.toArray().map((v) => +v.toFixed(1)) }, probes, lamps: lamps.slice(0, 20) }
})
console.log('相机:', JSON.stringify(result.camera))
console.log('=== 光晕区域射线命中 ===')
for (const p of result.probes) console.log(p.hit === null ? `(${p.nx},${p.ny}) 未命中` : JSON.stringify(p))
console.log('\n=== 进门区域小灯具（高自发光） ===')
for (const l of result.lamps) console.log(JSON.stringify(l))
await browser.close()
