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
  const readWorldVertex = (position, index, object) =>
    new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(object.matrixWorld)
  const mergeFootprints = (boxes, gap = 0.04) => {
    const merged = boxes.map((box) => ({ ...box }))
    let changed = true
    while (changed) {
      changed = false
      outer: for (let i = 0; i < merged.length; i += 1) {
        for (let j = i + 1; j < merged.length; j += 1) {
          const a = merged[i]
          const b = merged[j]
          if (
            a.maxX < b.minX - gap ||
            b.maxX < a.minX - gap ||
            a.maxZ < b.minZ - gap ||
            b.maxZ < a.minZ - gap
          ) continue
          a.minX = Math.min(a.minX, b.minX)
          a.maxX = Math.max(a.maxX, b.maxX)
          a.minZ = Math.min(a.minZ, b.minZ)
          a.maxZ = Math.max(a.maxZ, b.maxZ)
          merged.splice(j, 1)
          changed = true
          break outer
        }
      }
    }
    return merged
  }
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
    const position = o.geometry?.attributes?.position
    const index = o.geometry?.index
    const footprints = []
    if (position) {
      const triangleCount = index ? index.count / 3 : position.count / 3
      for (let triangle = 0; triangle < triangleCount; triangle += 1) {
        const ia = index ? index.getX(triangle * 3) : triangle * 3
        const ib = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1
        const ic = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2
        const points = [
          readWorldVertex(position, ia, o),
          readWorldVertex(position, ib, o),
          readWorldVertex(position, ic, o),
        ]
        if (Math.max(...points.map((point) => point.y)) < 5.2) continue
        footprints.push({
          minX: Math.min(...points.map((point) => point.x)),
          maxX: Math.max(...points.map((point) => point.x)),
          minZ: Math.min(...points.map((point) => point.z)),
          maxZ: Math.max(...points.map((point) => point.z)),
        })
      }
    }
    out.push({
      mesh: o.name.slice(0, 30),
      mat: mats.map((m) => m?.name).join('|'),
      pos: [center.x, center.y, center.z].map((v) => +v.toFixed(2)),
      size: [size.x, size.y, size.z].map((v) => +v.toFixed(2)),
      footprints: mergeFootprints(footprints).map((footprint) => [
        footprint.minX,
        footprint.maxX,
        footprint.minZ,
        footprint.maxZ,
      ].map((v) => +v.toFixed(2))),
    })
  })
  return out
})
for (const r of rows) {
  console.log(`${r.mesh} [${r.mat}] pos=${r.pos.join(',')} size=${r.size.join(',')}`)
  r.footprints.forEach((box) => console.log(`  footprint x[${box[0]},${box[1]}] z[${box[2]},${box[3]}]`))
}
console.log('total', rows.length)
await browser.close()
