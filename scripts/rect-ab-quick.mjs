// 广播厅角落暗角 toggle A/B：验证 fallback 网格真的出暗带
import { chromium } from 'playwright-core'
import { readFile } from 'node:fs/promises'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__camera && window.__THREE && window.__broadcastCornerShadows,
  null, { timeout: 180000 },
)
await page.waitForTimeout(2500)

// 广播厅西北角（厅 x -22~-10, z -3~10.3，缝取 worldMin 附近）
const j = await page.evaluate(() => {
  const v = window.__broadcastCornerShadows.junctions[0]
  return [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2), +v.w.toFixed(2)]
})
console.log('broadcast junction[0]:', j.join(', '))

await page.evaluate((jj) => {
  const THREE = window.__THREE
  const cam = window.__camera
  cam.up.set(0, 1, 0)
  // 站厅内看向该角缝
  cam.position.set(jj[0] + 4.5, 1.7, jj[1] + 4.5)
  cam.lookAt(new THREE.Vector3(jj[0], 2.0, jj[1]))
  cam.updateMatrixWorld()
}, j)
await page.waitForTimeout(500)
await page.screenshot({ path: '.tmp-ktx/bcast-on.png', timeout: 90000 })
await page.evaluate(() => window.__broadcastCornerShadows.toggle())
await page.waitForTimeout(400)
await page.screenshot({ path: '.tmp-ktx/bcast-off.png', timeout: 90000 })
await page.evaluate(() => window.__broadcastCornerShadows.toggle())

const diffPage = await browser.newPage({ viewport: { width: 400, height: 300 } })
const a64 = (await readFile('.tmp-ktx/bcast-on.png')).toString('base64')
const b64 = (await readFile('.tmp-ktx/bcast-off.png')).toString('base64')
const stats = await diffPage.evaluate(async ([a64, b64]) => {
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
  const grid = 8; const cells = Array.from({ length: grid * grid }, () => 0)
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const i = (y * a.width + x) * 4
    const d = Math.max(Math.abs(a.data[i]-b.data[i]), Math.abs(a.data[i+1]-b.data[i+1]), Math.abs(a.data[i+2]-b.data[i+2]))
    if (d > 2) { changed++; cells[Math.min(grid-1,Math.floor(y/a.height*grid))*grid+Math.min(grid-1,Math.floor(x/a.width*grid))]++ }
  }
  const rows = []
  for (let r = 0; r < grid; r++) rows.push(cells.slice(r*grid, r*grid+grid).map((v)=>String(v).padStart(6)).join(' '))
  return { changed, rows }
}, [a64, b64])
console.log('broadcast A/B changed:', stats.changed)
console.log(stats.rows.join('\n'))
await browser.close()
