// A/B 基线(海报走原 PBR 材质 + env 0.18):厅中心看北墙截图
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const CHROME = 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const OUT_DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') + '../.tmp-careblur/'
mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__worldLayout?.halls?.some((h) => h.id === 'care') && window.__teleport,
  null,
  { timeout: 300000, polling: 2000 },
)
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 60000 })
for (let attempt = 0; attempt < 5; attempt++) {
  await page.evaluate(() => document.querySelector('button[aria-label="关闭"]')?.click())
  if (await page.evaluate(() => !document.querySelector('button[aria-label="关闭"]'))) break
  await page.waitForTimeout(1500)
}
await page.evaluate(() => {
  const care = window.__worldLayout.halls.find((h) => h.id === 'care')
  const cx = (care.worldMinX + care.worldMaxX) / 2
  const cz = (care.worldMinZ + care.worldMaxZ) / 2
  window.__teleport({ x: cx, y: 1.6, z: cz }, { x: cx, y: 1.7, z: care.worldMaxZ - 1 })
})
await page.evaluate(
  (n) => new Promise((r) => { let l = n; const t = () => (--l <= 0 ? r() : requestAnimationFrame(t)); requestAnimationFrame(t) }),
  3,
)
await page.screenshot({ path: OUT_DIR + 'baseline-N.png', timeout: 120000 })
console.log('shot baseline-N')

const unlitCount = await page.evaluate(() => {
  let n = 0
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    const ms = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of ms) if (m?.userData?.unlitPicturePanel) n++
  })
  return n
})
console.log('unlit panels in scene (should be 0 after disable):', unlitCount)
await browser.close()
