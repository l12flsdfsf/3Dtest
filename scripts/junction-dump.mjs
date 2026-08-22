// dump 实际 junctions + 复刻 measure 通道的 fine 扫描（大厅材质 + isMainHallWallMesh）
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 400, height: 300 } })
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__gltfScene && window.__THREE && window.__mainHallCornerShadows, null, { timeout: 180000 })
await page.waitForTimeout(2000)

const out = await page.evaluate(() => {
  const THREE = window.__THREE
  const res = { junctions: window.__mainHallCornerShadows.junctions.map((v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2), +v.w.toFixed(2)]) }

  // 复刻 measure 通道: findWallMeshes(['大厅'], isMainHallWallMesh)
  const isMainHallWallMesh = (o) => {
    const box = new THREE.Box3().setFromObject(o)
    if (box.isEmpty()) return false
    const size = box.getSize(new THREE.Vector3())
    return size.y >= 2.2 && box.min.y < 1.2 && box.max.y > 3.0 && Math.max(size.x, size.z) >= 2.5
  }
  const meshes = []
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    if (!mats.some((m) => m?.name === '大厅')) return
    if (!isMainHallWallMesh(o)) return
    meshes.push({ name: o.name })
  })
  res.meshes = meshes.map((m) => m.name)

  // fine 扫描 z 面 (0.3~1.5m, vSpan>=1.2)
  const zPlanes = []
  const addPlane = (p) => {
    const ex = zPlanes.find((c) => c.sign === p.sign && Math.abs(c.coord - p.coord) <= 0.16)
    if (!ex) { zPlanes.push({ ...p, n: 1 }); return }
    ex.coord = (ex.coord * ex.n + p.coord) / (ex.n + 1)
    ex.spanMin = Math.min(ex.spanMin, p.spanMin); ex.spanMax = Math.max(ex.spanMax, p.spanMax)
    ex.yMin = Math.min(ex.yMin, p.yMin); ex.yMax = Math.max(ex.yMax, p.yMax); ex.n++
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nrm = new THREE.Vector3()
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    if (!mats.some((m) => m?.name === '大厅')) return
    if (!isMainHallWallMesh(o)) return
    const pos = o.geometry?.attributes?.position
    if (!pos) return
    o.updateWorldMatrix(true, false)
    const idx = o.geometry.index
    const triCount = idx ? idx.count / 3 : pos.count / 3
    for (let t = 0; t < triCount; t++) {
      const ia = idx ? idx.getX(t * 3) : t * 3
      const ib = idx ? idx.getX(t * 3 + 1) : t * 3 + 1
      const ic = idx ? idx.getX(t * 3 + 2) : t * 3 + 2
      a.fromBufferAttribute(pos, ia).applyMatrix4(o.matrixWorld)
      b.fromBufferAttribute(pos, ib).applyMatrix4(o.matrixWorld)
      c.fromBufferAttribute(pos, ic).applyMatrix4(o.matrixWorld)
      ab.subVectors(b, a); ac.subVectors(c, a)
      nrm.crossVectors(ab, ac)
      const len = nrm.length()
      if (len < 1e-6) continue
      nrm.divideScalar(len)
      if (Math.abs(nrm.y) > 0.28) continue
      const xMin = Math.min(a.x, b.x, c.x), xMax = Math.max(a.x, b.x, c.x)
      const yMin = Math.min(a.y, b.y, c.y), yMax = Math.max(a.y, b.y, c.y)
      const zMin = Math.min(a.z, b.z, c.z), zMax = Math.max(a.z, b.z, c.z)
      if (yMax - yMin < 1.2 || yMax < 0.1) continue
      if (zMax - zMin <= 0.08 && xMax - xMin >= 0.3 && Math.abs(nrm.z) > 0.55) {
        addPlane({ coord: (zMin + zMax) / 2, spanMin: xMin, spanMax: xMax, yMin, yMax, sign: Math.sign(nrm.z) })
      }
    }
  })
  res.fineZ = zPlanes.map((p) => `coord=${p.coord.toFixed(2)} span=[${p.spanMin.toFixed(2)},${p.spanMax.toFixed(2)}] y=[${p.yMin.toFixed(2)},${p.yMax.toFixed(2)}] sign=${p.sign} n=${p.n}`)
  return res
})
console.log('== meshes =='); out.meshes.forEach((m) => console.log(' ', m))
console.log('== junctions =='); out.junctions.forEach((j) => console.log(' ', j.join(', ')))
console.log('== fine z-planes (大厅 only, 0.3m+) =='); out.fineZ.forEach((r) => console.log(' ', r))
await browser.close()
