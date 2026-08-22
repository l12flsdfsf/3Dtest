// 探测荣誉墙(西墙前段 x-9.74, z19.09~24.7)与关怀厅门口交界(z~18.3)的几何 + 截图
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
  () => window.__gltfScene && window.__camera && window.__THREE
    && window.__mainHallCornerShadows && window.__mainHallCeilingShadows,
  null, { timeout: 180000 },
)
await page.waitForTimeout(2500)

// 1) 交界区网格清单（小件也要）：x -10.8~-9.0, z 17.4~19.6
const rows = await page.evaluate(() => {
  const THREE = window.__THREE
  const out = []
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    o.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(o)
    if (box.isEmpty()) return
    if (box.max.x < -9.0 || box.min.x > -8.4) return
    if (box.max.z < 17.4 || box.min.z > 19.8) return
    const size = box.getSize(new THREE.Vector3())
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    out.push({
      mesh: o.name.slice(0, 36),
      mat: mats.map((m) => m?.name).filter(Boolean).slice(0, 3).join('|'),
      sz: [+size.x.toFixed(2), +size.y.toFixed(2), +size.z.toFixed(2)],
      box: [
        +box.min.x.toFixed(2), +box.min.y.toFixed(2), +box.min.z.toFixed(2),
        +box.max.x.toFixed(2), +box.max.y.toFixed(2), +box.max.z.toFixed(2),
      ],
    })
  })
  return out
})
console.log('== 交界区网格（box 与 x-10.8~-9.0/z17.4~19.8 相交）==')
rows.sort((a, b) => a.box[2] - b.box[2] || a.box[0] - b.box[0]).forEach((r) =>
  console.log(r.mesh.padEnd(36), ('[' + r.mat + ']').padEnd(26), `size=${r.sz.join(',')}`, `box=${r.box.join(',')}`))

// 2) 现状 junctions
const j = await page.evaluate(() =>
  window.__mainHallCornerShadows.junctions.map((v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2), +v.w.toFixed(2)]))
console.log('== junctions =='); j.forEach((r) => console.log(' ', r.join(', ')))

// 3) 交界处截图：站在厅内看荣誉墙北端与关怀厅门口
const shots = [
  { name: 'junction-close', pos: [-6.5, 1.7, 20.5], look: [-9.7, 2.2, 18.6] },
  { name: 'junction-wide', pos: [-6, 1.7, 16.5], look: [-9.6, 2.0, 19] },
  { name: 'junction-from-corridor', pos: [-2, 1.7, 19.5], look: [-9.6, 1.8, 18.8] },
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
  await page.screenshot({ path: `.tmp-ktx/${s.name}.png`, timeout: 90000 })
  console.log('shot', s.name)
}
await browser.close()
