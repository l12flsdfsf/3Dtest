// 差分热力图：红=变化大，黄=轻微，黑=未变。定位 entrance 视图变化区域
import { chromium } from 'playwright-core'
import { readFile, writeFile } from 'node:fs/promises'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 400, height: 300 } })

for (const name of ['entrance', 'entrance-wide', 'honor-chapter']) {
  const a64 = (await readFile(`.tmp-ktx/honor-${name}.png`)).toString('base64')
  const b64 = (await readFile(`.tmp-ktx/honor-after-${name}.png`)).toString('base64')
  const out = await page.evaluate(async ([a64, b64]) => {
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
    const c = new OffscreenCanvas(a.width, a.height)
    const ctx = c.getContext('2d')
    const img = ctx.createImageData(a.width, a.height)
    const grid = 8
    const cells = Array.from({ length: grid * grid }, () => 0)
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const i = (y * a.width + x) * 4
        const d = Math.max(
          Math.abs(a.data[i] - b.data[i]),
          Math.abs(a.data[i + 1] - b.data[i + 1]),
          Math.abs(a.data[i + 2] - b.data[i + 2]),
        )
        if (d > 2) {
          const t = Math.min(1, d / 40)
          img.data[i] = 255
          img.data[i + 1] = Math.round(255 * (1 - t))
          img.data[i + 2] = 0
          img.data[i + 3] = 255
          cells[Math.min(grid - 1, Math.floor((y / a.height) * grid)) * grid + Math.min(grid - 1, Math.floor((x / a.width) * grid))]++
        }
      }
    }
    ctx.putImageData(img, 0, 0)
    const blob = await c.convertToBlob({ type: 'image/png' })
    const buf = new Uint8Array(await blob.arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
    const rows = []
    for (let r = 0; r < grid; r++) rows.push(cells.slice(r * grid, r * grid + grid).map((v) => String(v).padStart(6)).join(' '))
    return { b64: bin, rows }
  }, [a64, b64])
  await writeFile(`.tmp-ktx/honor-diff-${name}.png`, Buffer.from(out.b64, 'base64'))
  console.log(`== ${name} change counts (8x8 grid, rows top->bottom) ==`)
  console.log(out.rows.join('\n'))
}
await browser.close()
