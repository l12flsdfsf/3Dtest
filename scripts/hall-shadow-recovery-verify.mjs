// 验证技术设备厅/关怀厅暗角恢复 + rect fallback 仍有效 + 主厅不受影响
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
    && window.__broadcastCornerShadows && window.__mainHallCornerShadows,
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
    main: { j: window.__mainHallCornerShadows.junctions.length },
  }
})
console.log(JSON.stringify(report))

// 技术设备厅角缝 A/B（凹墙角 22.58×-1.97 附近）
const abAt = async (name, key, junction, eyeOffset) => {
  await page.evaluate(([jj, off]) => {
    const THREE = window.__THREE
    const cam = window.__camera
    cam.up.set(0, 1, 0)
    cam.position.set(jj[0] + off[0], 1.7, jj[1] + off[1])
    cam.lookAt(new THREE.Vector3(jj[0], 2.0, jj[1]))
    cam.updateMatrixWorld()
  }, [junction, eyeOffset])
  await page.waitForTimeout(500)
  await page.screenshot({ path: `.tmp-ktx/${name}-on.png`, timeout: 90000 })
  await page.evaluate((k) => window[k].toggle(), key)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `.tmp-ktx/${name}-off.png`, timeout: 90000 })
  await page.evaluate((k) => window[k].toggle(), key)
}

const techJ = await page.evaluate(() => {
  const v = window.__techCornerShadows.junctions[0]
  return [+v.x.toFixed(2), +v.y.toFixed(2)]
})
console.log('tech junction[0]:', techJ.join(', '))
await abAt('tech', '__techCornerShadows', techJ, [-4, -4])

const careJ = await page.evaluate(() => {
  const v = window.__careCornerShadows.junctions[0]
  return [+v.x.toFixed(2), +v.y.toFixed(2)]
})
console.log('care junction[0]:', careJ.join(', '))
await abAt('care', '__careCornerShadows', careJ, [4, 4])

const bcastJ = await page.evaluate(() => {
  const v = window.__broadcastCornerShadows.junctions[0]
  return [+v.x.toFixed(2), +v.y.toFixed(2)]
})
await abAt('bcast2', '__broadcastCornerShadows', bcastJ, [4.5, 4.5])

const diffPage = await browser.newPage({ viewport: { width: 400, height: 300 } })
for (const name of ['tech', 'care', 'bcast2']) {
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
  console.log(`A/B ${name}: changed=${changed} px`)
}
console.log('pageerrors:', errors.length ? errors : '无')
await browser.close()
