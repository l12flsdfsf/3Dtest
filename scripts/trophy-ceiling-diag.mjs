// 诊断奖杯墙与天花交界的角落阴影：探测奖杯墙网格 + 多机位截图
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__gltfScene && window.__camera && window.__THREE, null, { timeout: 180000 })
await page.waitForTimeout(2000)

// 1) 探测奖杯墙区域的大网格：找墙体/天花及其材质名、包围盒
const probe = await page.evaluate(() => {
  const THREE = window.__THREE
  const rows = []
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    o.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(o)
    if (box.isEmpty()) return
    const center = box.getCenter(new THREE.Vector3())
    if (center.x < -6 || center.x > 9 || center.z < -22 || center.z > -12) return
    const size = box.getSize(new THREE.Vector3())
    if (Math.max(size.x, size.y, size.z) < 2.5) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    rows.push({
      mesh: o.name.slice(0, 36),
      mat: mats.map((m) => m?.name).filter(Boolean).slice(0, 4).join('|'),
      box: [
        +box.min.x.toFixed(2), +box.min.y.toFixed(2), +box.min.z.toFixed(2),
        +box.max.x.toFixed(2), +box.max.y.toFixed(2), +box.max.z.toFixed(2),
      ],
    })
  })
  return rows
})
for (const r of probe) console.log(`${r.mesh} [${r.mat}] box=${r.box.join(',')}`)

// 2) 天花板高度 + 大厅包围盒（MainHallCornerShadows 的口径）
const hallInfo = await page.evaluate(() => {
  const THREE = window.__THREE
  const ceilRows = []
  const box = new THREE.Box3()
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    o.updateWorldMatrix(true, false)
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    if (!mats.some((m) => m?.name === '大厅')) return
    const b = new THREE.Box3().setFromObject(o)
    if (b.isEmpty()) return
    const size = b.getSize(new THREE.Vector3())
    if (size.y >= 2.2 && b.min.y < 1.2 && b.max.y > 3.0 && Math.max(size.x, size.z) >= 2.5) {
      box.union(b)
      ceilRows.push(`${o.name} y:${b.min.y.toFixed(2)}~${b.max.y.toFixed(2)}`)
    }
  })
  // 天花面（法朝下的水平大面）
  let ceilingY = null
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh || ceilingY !== null) return
    const b = new THREE.Box3().setFromObject(o)
    if (b.isEmpty()) return
    if (b.min.y > 4.5 && (b.max.x - b.min.x) > 15 && (b.max.z - b.min.z) > 15) {
      ceilingY = b.min.y
      ceilRows.push(`CEIL? ${o.name} [${Array.isArray(o.material) ? o.material.map((m) => m?.name).join('|') : o.material?.name}] y:${b.min.y.toFixed(2)}~${b.max.y.toFixed(2)}`)
    }
  })
  return { hallBox: [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].map((v) => +v.toFixed(2)), ceilRows, ceilingY }
})
console.log('hallBox(大厅 tall walls)=', hallInfo.hallBox.join(','))
hallInfo.ceilRows.forEach((r) => console.log(' ', r))

// 3) 多机位截图：正对奖杯墙、抬头看墙-天花交界
const shots = [
  { name: 'front-wide', pos: [-1, 1.72, -13.2], look: [-1, 4.4, -17] },
  { name: 'front-left-corner', pos: [-8.5, 1.72, -13.5], look: [-9.4, 4.8, -17] },
  { name: 'front-right-corner', pos: [7, 1.72, -13.5], look: [9.8, 4.8, -17] },
  { name: 'up-close', pos: [-1, 1.5, -14.6], look: [-1, 5.1, -17] },
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
  await page.screenshot({ path: `.tmp-ktx/trophy-ceil-${s.name}.png`, timeout: 90000 })
  console.log('shot', s.name)
}
await browser.close()
