// 稳妥版：__teleport 定机位 + 角落阴影 A/B 行分布（对比台阶 vs 南角样式）
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
  () => window.__gltfScene && window.__camera && window.__THREE
    && window.__mainHallCornerShadows && window.__teleport,
  null, { timeout: 180000 },
)
await page.waitForTimeout(2500)

const shots = [
  { name: 'ab-step', pos: [-7.2, 1.7, 21.5], look: [-9.5, 2.4, 18.9] },
  { name: 'ab-step-front', pos: [-8.8, 1.7, 21.6], look: [-9.6, 2.8, 19.09] },
  { name: 'ab-south', pos: [-7.2, 1.7, 22.2], look: [-9.5, 2.4, 24.5] },
]
for (const s of shots) {
  await page.evaluate((shot) => {
    window.__teleport(
      { x: shot.pos[0], y: shot.pos[1], z: shot.pos[2] },
      { x: shot.look[0], y: shot.look[1], z: shot.look[2] },
    )
    window.__camera.updateMatrixWorld()
  }, s)
  // swiftshader rAF 节流：必须用双 rAF 驱动渲染帧，否则截图是旧帧缓冲
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))))
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))))
  await page.screenshot({ path: `.tmp-ktx/${s.name}-on.png`, timeout: 90000 })
  await page.evaluate(() => window.__mainHallCornerShadows.toggle())
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))))
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 50)))))
  await page.screenshot({ path: `.tmp-ktx/${s.name}-off.png`, timeout: 90000 })
  await page.evaluate(() => window.__mainHallCornerShadows.toggle())
  console.log('A/B done', s.name)
}

const diffPage = await browser.newPage({ viewport: { width: 400, height: 300 } })
for (const s of shots) {
  const a64 = (await readFile(`.tmp-ktx/${s.name}-on.png`)).toString('base64')
  const b64 = (await readFile(`.tmp-ktx/${s.name}-off.png`)).toString('base64')
  const prof = await diffPage.evaluate(async ([a64, b64]) => {
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
    const rowBands = []
    const colBuckets = Array.from({ length: 8 }, () => ({ n: 0, sum: 0 }))
    let total = 0
    for (let y = 0; y < a.height; y++) {
      let n = 0, sum = 0
      for (let x = 0; x < a.width; x++) {
        const i = (y * a.width + x) * 4
        const d = (a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3 - (b.data[i] + b.data[i + 1] + b.data[i + 2]) / 3
        if (d > 2) {
          n++; sum += d; total++
          const c = Math.min(7, Math.floor(x / a.width * 8)); colBuckets[c].n++; colBuckets[c].sum += d
        }
      }
      if (n > 0) rowBands.push(`y${String(y).padStart(3)}: n=${String(n).padStart(4)} avg=${(sum / n).toFixed(1)}`)
    }
    return { total, rowCount: rowBands.length, rows: rowBands.filter((_, i) => i % 4 === 0).join(' | '), cols: colBuckets.map((c) => `${c.n ? (c.sum / c.n).toFixed(0) : '-'}(${c.n})`).join(' ') }
  }, [a64, b64])
  console.log(`== ${s.name} total=${prof.total} 有变化行数=${prof.rowCount}`)
  console.log('  行采样:', prof.rows)
  console.log('  列桶(avgD(n)):', prof.cols)
}
await browser.close()
