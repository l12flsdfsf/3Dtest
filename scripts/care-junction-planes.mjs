// 交界区墙体平面全扫描（含 0.02m 短面）+ 角落阴影 A/B 差分
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
  () => window.__gltfScene && window.__camera && window.__THREE && window.__mainHallCornerShadows,
  null, { timeout: 180000 },
)
await page.waitForTimeout(2500)

// 复刻 collectWallPlanes 逻辑，低阈值扫 x -10.8~-9.0 / z 17.2~19.8 区域的面
const planes = await page.evaluate(() => {
  const THREE = window.__THREE
  const MATS = ['大厅', '白墙', '金属', '大厅顶部蓝', '大厅白板']
  const meshes = []
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    if (!mats.some((m) => MATS.includes(m?.name))) return
    meshes.push(o)
  })

  const xPlanes = []
  const zPlanes = []
  const addPlane = (list, p) => {
    const ex = list.find((c) => c.sign === p.sign && Math.abs(c.coord - p.coord) <= 0.16)
    if (!ex) { list.push({ ...p, n: 1 }); return }
    ex.coord = (ex.coord * ex.n + p.coord) / (ex.n + 1)
    ex.spanMin = Math.min(ex.spanMin, p.spanMin)
    ex.spanMax = Math.max(ex.spanMax, p.spanMax)
    ex.yMin = Math.min(ex.yMin, p.yMin)
    ex.yMax = Math.max(ex.yMax, p.yMax)
    ex.n++
  }

  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), nrm = new THREE.Vector3()
  for (const o of meshes) {
    const pos = o.geometry?.attributes?.position
    if (!pos) continue
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
      // 交界区包围盒过滤（xz 放宽 1m）
      if (xMax < -11.8 || xMin > -8.0 || zMax < 16.2 || zMin > 20.8) continue
      if (yMax - yMin < 0.25) continue
      if (xMax - xMin <= 0.1 && zMax - zMin >= 0.02 && Math.abs(nrm.x) > 0.55) {
        addPlane(xPlanes, { coord: (xMin + xMax) / 2, spanMin: zMin, spanMax: zMax, yMin, yMax, sign: Math.sign(nrm.x) })
      } else if (zMax - zMin <= 0.1 && xMax - xMin >= 0.02 && Math.abs(nrm.z) > 0.55) {
        addPlane(zPlanes, { coord: (zMin + zMax) / 2, spanMin: xMin, spanMax: xMax, yMin, yMax, sign: Math.sign(nrm.z) })
      }
    }
  }
  const fmt = (p) => `coord=${p.coord.toFixed(2)} span=[${p.spanMin.toFixed(2)},${p.spanMax.toFixed(2)}] y=[${p.yMin.toFixed(2)},${p.yMax.toFixed(2)}] sign=${p.sign} n=${p.n}`
  return { x: xPlanes.map(fmt), z: zPlanes.map(fmt) }
})
console.log('== X 面列表 =='); planes.x.forEach((r) => console.log(' ', r))
console.log('== Z 面列表 =='); planes.z.forEach((r) => console.log(' ', r))

// A/B：corner shadows on/off 差分（看现系统在交界处的贡献）
const pose = { pos: [-6.5, 1.7, 20.5], look: [-9.7, 2.2, 18.6] }
await page.evaluate((s) => {
  const THREE = window.__THREE
  const cam = window.__camera
  cam.up.set(0, 1, 0)
  cam.position.set(s.pos[0], s.pos[1], s.pos[2])
  cam.lookAt(new THREE.Vector3(s.look[0], s.look[1], s.look[2]))
  cam.updateMatrixWorld()
}, pose)
await page.waitForTimeout(400)
await page.screenshot({ path: '.tmp-ktx/junction-ab-on.png', timeout: 90000 })
await page.evaluate(() => window.__mainHallCornerShadows.toggle())
await page.waitForTimeout(300)
await page.screenshot({ path: '.tmp-ktx/junction-ab-off.png', timeout: 90000 })
await page.evaluate(() => window.__mainHallCornerShadows.toggle())
console.log('A/B shots done')

const diffPage = await browser.newPage({ viewport: { width: 400, height: 300 } })
const { readFile } = await import('node:fs/promises')
const a64 = (await readFile('.tmp-ktx/junction-ab-on.png')).toString('base64')
const b64 = (await readFile('.tmp-ktx/junction-ab-off.png')).toString('base64')
const stats = await diffPage.evaluate(async ([a64, b64]) => {
  const load = async (b64) => {
    const bin = atob(b64)
    const buf = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
    const bmp = await createImageBitmap(new Blob([buf]))
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bmp, 0, 0)
    return ctx.getImageData(0, 0, bmp.width, bmp.height)
  }
  const a = await load(a64), b = await load(b64)
  const grid = 8
  const cells = Array.from({ length: grid * grid }, () => 0)
  let changed = 0
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const i = (y * a.width + x) * 4
    const d = Math.max(Math.abs(a.data[i]-b.data[i]), Math.abs(a.data[i+1]-b.data[i+1]), Math.abs(a.data[i+2]-b.data[i+2]))
    if (d > 2) { changed++; cells[Math.min(grid-1,Math.floor(y/a.height*grid))*grid+Math.min(grid-1,Math.floor(x/a.width*grid))]++ }
  }
  const rows = []
  for (let r = 0; r < grid; r++) rows.push(cells.slice(r*grid, r*grid+grid).map((v)=>String(v).padStart(6)).join(' '))
  return { changed, rows }
}, [a64, b64])
console.log('corner-shadow A/B diff changed px:', stats.changed)
console.log(stats.rows.join('\n'))
await browser.close()
