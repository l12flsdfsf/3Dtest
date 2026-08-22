// 验证西墙荣誉墙：lines 数据 + before/after 像素差分（west-wall.png 为改前）
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
  () => window.__gltfScene && window.__camera && window.__THREE && window.__mainHallCeilingShadows,
  null, { timeout: 180000 },
)
await page.waitForTimeout(2500)

const state = await page.evaluate(() => ({
  topX: window.__mainHallCeilingShadows.lines.topX,
  topZ: window.__mainHallCeilingShadows.lines.topZ,
}))
console.log('== topX =='); state.topX.forEach((l) => console.log(` coord=${l.coord} span=[${l.span.join(',')}] sign=${l.sign}`))
console.log('== topZ =='); state.topZ.forEach((l) => console.log(` coord=${l.coord} span=[${l.span.join(',')}] sign=${l.sign}`))

await page.evaluate(() => {
  const THREE = window.__THREE
  const cam = window.__camera
  cam.up.set(0, 1, 0)
  cam.position.set(-4, 1.7, 16)
  cam.lookAt(new THREE.Vector3(-9.7, 4.4, 22))
  cam.updateMatrixWorld()
})
await page.waitForTimeout(400)
await page.screenshot({ path: '.tmp-ktx/west-wall-after.png', timeout: 90000 })
console.log('shot west-wall-after')

const diffPage = await browser.newPage({ viewport: { width: 400, height: 300 } })
const a64 = (await readFile('.tmp-ktx/west-wall.png')).toString('base64')
const b64 = (await readFile('.tmp-ktx/west-wall-after.png')).toString('base64')
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
  let changed = 0, sum = 0, maxD = 0, minX = 1e9, minY = 1e9, maxX = -1, maxY = -1
  const grid = 8
  const cells = Array.from({ length: grid * grid }, () => 0)
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const i = (y * a.width + x) * 4
    const d = Math.max(Math.abs(a.data[i]-b.data[i]), Math.abs(a.data[i+1]-b.data[i+1]), Math.abs(a.data[i+2]-b.data[i+2]))
    if (d > 2) { changed++; sum += d; if (d > maxD) maxD = d; if (x<minX)minX=x; if (x>maxX)maxX=x; if (y<minY)minY=y; if (y>maxY)maxY=y; cells[Math.min(grid-1,Math.floor(y/a.height*grid))*grid+Math.min(grid-1,Math.floor(x/a.width*grid))]++ }
  }
  const rows = []
  for (let r = 0; r < grid; r++) rows.push(cells.slice(r*grid, r*grid+grid).map((v)=>String(v).padStart(6)).join(' '))
  return { pct: +(100*changed/(a.width*a.height)).toFixed(2), avgD: changed?+(sum/changed).toFixed(1):0, maxD, bbox: changed?[minX,minY,maxX,maxY]:null, rows }
}, [a64, b64])
console.log('diff west-wall:', JSON.stringify({ pct: stats.pct, avgD: stats.avgD, maxD: stats.maxD, bbox: stats.bbox }))
console.log(stats.rows.join('\n'))
await browser.close()
