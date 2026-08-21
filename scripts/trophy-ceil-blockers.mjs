// 查清奖杯墙上方把顶部条带切掉的「灯」网格：列出大厅盒内 y>4.5 的 白灯/灯/大厅顶部蓝 材质网格
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__gltfScene && window.__THREE, null, { timeout: 180000 })
await page.waitForTimeout(2500)

const rows = await page.evaluate(() => {
  const THREE = window.__THREE
  const out = []
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    if (!mats.some((m) => /白灯|灯|大厅顶部蓝/.test(m?.name ?? ''))) return
    o.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(o)
    if (box.isEmpty() || box.max.y < 5.2) return
    if (box.min.z > -14) return // 只要北墙附近
    const center = box.getCenter(new THREE.Vector3())
    const size = box.getSize(new THREE.Vector3())
    out.push({
      mesh: o.name.slice(0, 30),
      mat: mats.map((m) => m?.name).join('|'),
      pos: [center.x, center.y, center.z].map((v) => +v.toFixed(2)),
      size: [size.x, size.y, size.z].map((v) => +v.toFixed(2)),
    })
  })
  return out
})
for (const r of rows) console.log(`${r.mesh} [${r.mat}] pos=${r.pos.join(',')} size=${r.size.join(',')}`)
console.log('total', rows.length)
await browser.close()
