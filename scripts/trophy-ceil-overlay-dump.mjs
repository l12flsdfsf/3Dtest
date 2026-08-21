// 列出主厅边缘覆盖条（renderOrder 15~18）的位置与尺寸，检查奖杯墙是否被覆盖
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
  const scene = window.__gltfScene.parent
  const out = []
  scene.traverse((o) => {
    if (!o.isMesh || o.renderOrder < 15 || o.renderOrder > 18) return
    o.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(o)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    out.push({
      order: o.renderOrder,
      pos: [center.x, center.y, center.z].map((v) => +v.toFixed(2)),
      size: [size.x, size.y, size.z].map((v) => +v.toFixed(2)),
    })
  })
  return out
})
const label = { 15: 'floor', 16: 'ceil', 17: 'vbot', 18: 'vtop' }
for (const r of rows.sort((a, b) => a.order - b.order || a.pos[1] - b.pos[1])) {
  console.log(`${label[r.order]} pos=${r.pos.join(',')} size=${r.size.join(',')}`)
}
console.log('total', rows.length)
await browser.close()
