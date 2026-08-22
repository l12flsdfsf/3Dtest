// 验证：荣誉墙/荣誉篇章天花恢复干净（对照第一轮修复后的基线），台阶顶仍修复
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

const shots = [
  { name: 'honor-wall', pos: [0, 1.7, -10], look: [0, 4.9, -17] },
  { name: 'honor-chapter', pos: [4, 1.7, 16], look: [9.7, 4.4, 22] },
  { name: 'west-wall', pos: [-4, 1.7, 16], look: [-9.7, 4.4, 22] },
]
for (const s of shots) {
  await page.evaluate((shot) => {
    const THREE = window.__THREE
    const cam = window.__camera
    cam.up.set(0, 1, 0)
    cam.position.set(shot.pos[0], shot.pos[1], shot.pos[2])
    cam.lookAt(new THREE.Vector3(shot.look[0], shot.look[1], shot.look[2]))
    cam.updateMatrixWorld()
  }, s)
  await page.waitForTimeout(450)
  await page.screenshot({ path: `.tmp-ktx/honor-recheck-${s.name}.png`, timeout: 90000 })
  console.log('shot', s.name)
}

const diffPage = await browser.newPage({ viewport: { width: 400, height: 300 } })
const pairs = [
  ['honor-wall', 'honor-after-honor-wall.png'],
  ['honor-chapter', 'honor-after-honor-chapter.png'],
]
for (const [name, base] of pairs) {
  const a64 = (await readFile(`.tmp-ktx/${base}`)).toString('base64')
  const b64 = (await readFile(`.tmp-ktx/honor-recheck-${name}.png`)).toString('base64')
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
    let changed = 0
    for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4
      const d = Math.max(Math.abs(a.data[i]-b.data[i]), Math.abs(a.data[i+1]-b.data[i+1]), Math.abs(a.data[i+2]-b.data[i+2]))
      if (d > 2) changed++
    }
    return changed
  }, [a64, b64])
  console.log(`diff vs 第一轮基线 ${name}: changed=${stats} px`)
}
await browser.close()
