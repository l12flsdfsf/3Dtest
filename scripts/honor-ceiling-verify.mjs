// 验证：1) junctions/lines 数据 2) 同机位 before/after 像素差分
import { chromium } from 'playwright-core'
import { readFile } from 'node:fs/promises'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__camera && window.__THREE
    && window.__mainHallCornerShadows && window.__mainHallCeilingShadows,
  null,
  { timeout: 180000 },
)
await page.waitForTimeout(2500)

const state = await page.evaluate(() => {
  const fmt = (v) => +v.toFixed(2)
  return {
    topX: window.__mainHallCeilingShadows.lines.topX,
    topZ: window.__mainHallCeilingShadows.lines.topZ,
    junctions: window.__mainHallCornerShadows.junctions.map((j) => [fmt(j.x), fmt(j.y), fmt(j.z), fmt(j.w)]),
  }
})
console.log('== topX =='); state.topX.forEach((l) => console.log(` coord=${l.coord} span=[${l.span.join(',')}] sign=${l.sign}`))
console.log('== topZ =='); state.topZ.forEach((l) => console.log(` coord=${l.coord} span=[${l.span.join(',')}] sign=${l.sign}`))
console.log('== junctions =='); state.junctions.forEach((j) => console.log(' ', j.join(', ')))

const setPose = (shot) => page.evaluate((s) => {
  const THREE = window.__THREE
  const cam = window.__camera
  cam.up.set(0, 1, 0)
  cam.position.set(s.pos[0], s.pos[1], s.pos[2])
  cam.lookAt(new THREE.Vector3(s.look[0], s.look[1], s.look[2]))
  cam.updateMatrixWorld()
}, shot)

const shots = [
  { name: 'honor-wall', pos: [0, 1.7, -10], look: [0, 4.9, -17] },
  { name: 'honor-wall-left', pos: [-7, 1.7, -11], look: [-8.5, 4.9, -17] },
  { name: 'honor-chapter', pos: [4, 1.7, 16], look: [9.7, 4.4, 22] },
  { name: 'honor-chapter-wide', pos: [2, 1.7, 13], look: [9.7, 4.2, 22] },
  { name: 'entrance', pos: [0, 1.7, 20], look: [0, 2.2, 25] },
  { name: 'entrance-wide', pos: [0, 1.7, 16], look: [0, 2.0, 24.7] },
]
for (const s of shots) {
  await setPose(s)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `.tmp-ktx/honor-after-${s.name}.png`, timeout: 90000 })
}

// 像素差分（OffscreenCanvas，项目无 sharp；buffer 由 Node 读好传入）
const diffPage = await browser.newPage()
for (const s of shots) {
  const beforeB64 = (await readFile(`.tmp-ktx/honor-${s.name}.png`)).toString('base64')
  const afterB64 = (await readFile(`.tmp-ktx/honor-after-${s.name}.png`)).toString('base64')
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
    const a = await load(a64)
    const b = await load(b64)
    if (!a || !b) return { error: 'load failed' }
    let changed = 0, sum = 0, maxD = 0
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const i = (y * a.width + x) * 4
        const d = Math.max(
          Math.abs(a.data[i] - b.data[i]),
          Math.abs(a.data[i + 1] - b.data[i + 1]),
          Math.abs(a.data[i + 2] - b.data[i + 2]),
        )
        if (d > 2) {
          changed++
          sum += d
          if (d > maxD) maxD = d
          if (x < minX) minX = x; if (x > maxX) maxX = x
          if (y < minY) minY = y; if (y > maxY) maxY = y
        }
      }
    }
    return { changed, pct: +(100 * changed / (a.width * a.height)).toFixed(2), avgD: changed ? +(sum / changed).toFixed(1) : 0, maxD, bbox: changed ? [minX, minY, maxX, maxY] : null }
  }, [beforeB64, afterB64])
  console.log(`diff ${s.name}:`, JSON.stringify(stats))
}

await browser.close()
