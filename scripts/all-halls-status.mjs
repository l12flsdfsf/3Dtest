// 全厅状态：各钩子数据 + 主厅台阶/天花 A/B
import { chromium } from 'playwright-core'
import { readFile } from 'node:fs/promises'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('pageerror', (err) => errors.push(String(err).slice(0, 300)))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__camera && window.__THREE
    && window.__techCornerShadows && window.__careCornerShadows
    && window.__broadcastCornerShadows && window.__mainHallCornerShadows
    && window.__mainHallCeilingShadows,
  null, { timeout: 180000 },
)
await page.waitForTimeout(2500)

const report = await page.evaluate(() => {
  const pick = (key) => window[key] && {
    j: window[key].junctions.length,
    mesh: window[key].meshCount,
    fb: window[key].fallbackMeshCount,
    mode: window[key].mode,
  }
  return {
    tech: pick('__techCornerShadows'),
    care: pick('__careCornerShadows'),
    broadcast: pick('__broadcastCornerShadows'),
    tv: pick('__tvCornerShadows'),
    cinema: pick('__cinemaCornerShadows'),
    future: pick('__futureCornerShadows'),
    mainJ: window.__mainHallCornerShadows.junctions.map((v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2), +v.w.toFixed(2)]),
    topZ: window.__mainHallCeilingShadows.lines.topZ.map((l) => `${l.coord}[${l.span.join(',')}]`),
    topX: window.__mainHallCeilingShadows.lines.topX.map((l) => `${l.coord}[${l.span.join(',')}]`),
  }
})
console.log('tech:', JSON.stringify(report.tech), ' care:', JSON.stringify(report.care))
console.log('broadcast:', JSON.stringify(report.broadcast), ' tv:', JSON.stringify(report.tv))
console.log('cinema:', JSON.stringify(report.cinema), ' future:', JSON.stringify(report.future))
console.log('main junctions:', JSON.stringify(report.mainJ))
console.log('topZ:', report.topZ.join(' | '))
console.log('topX:', report.topX.join(' | '))

// 主厅台阶 A/B（关怀厅门口台阶视角）
const shot = async (toggleKey, name, pose) => {
  await page.evaluate((p) => {
    const THREE = window.__THREE
    const cam = window.__camera
    cam.up.set(0, 1, 0)
    cam.position.set(p.pos[0], p.pos[1], p.pos[2])
    cam.lookAt(new THREE.Vector3(p.look[0], p.look[1], p.look[2]))
    cam.updateMatrixWorld()
  }, pose)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `.tmp-ktx/${name}-on.png`, timeout: 90000 })
  await page.evaluate((k) => window[k].toggle(), toggleKey)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `.tmp-ktx/${name}-off.png`, timeout: 90000 })
  await page.evaluate((k) => window[k].toggle(), toggleKey)
}
await shot('__mainHallCornerShadows', 'mainstep', { pos: [-6.5, 1.7, 20.5], look: [-9.7, 2.2, 18.6] })
await shot('__mainHallCornerShadows', 'mainceil', { pos: [0, 1.7, -10], look: [0, 4.9, -17] })

const diffPage = await browser.newPage({ viewport: { width: 400, height: 300 } })
for (const name of ['mainstep', 'mainceil']) {
  const a64 = (await readFile(`.tmp-ktx/${name}-on.png`)).toString('base64')
  const b64 = (await readFile(`.tmp-ktx/${name}-off.png`)).toString('base64')
  const changed = await diffPage.evaluate(async ([a64, b64]) => {
    const load = async (b64) => {
      const bin = atob(b64); const buf = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
      const bmp = await createImageBitmap(new Blob([buf]))
      const c = new OffscreenCanvas(bmp.width, bmp.height)
      const ctx = c.getContext('2d', { willReadFrequently: true })
      ctx.drawImage(bmp, 0, 0)
      return ctx.getImageData(0, 0, bmp.width, bmp.height)
    }
    const a = await load(a64), b = await load(b64)
    let changed = 0
    for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4
      const d = Math.max(Math.abs(a.data[i]-b.data[i]), Math.abs(a.data[i+1]-b.data[i+1]), Math.abs(a.data[i+2]-b.data[i+2]))
      if (d > 2) changed++
    }
    return changed
  }, [a64, b64])
  console.log(`main A/B ${name}: changed=${changed} px`)
}
console.log('pageerrors:', errors.length ? errors : '无')
await browser.close()
