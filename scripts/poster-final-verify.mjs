// 终验:代码改动后整页加载,厅中心看北墙,确认指标落到目标区间
import { chromium } from 'playwright-core'

const CHROME = 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const OUT_DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') + '../.tmp-careblur/'

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
const toneMappedCount = await page.evaluate(() => {
  let n = 0
  const seen = new Set()
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    const ms = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of ms) {
      if (!m?.userData?.unlitPicturePanel || seen.has(m.uuid)) continue
      seen.add(m.uuid)
      if (m.toneMapped) n++
    }
  })
  return `${n}/${seen.size}`
})
console.log('unlit 海报材质 toneMapped=true 数量:', toneMappedCount)

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
await page.screenshot({ path: OUT_DIR + 'final-N.png', timeout: 120000 })
await browser.close()

const sharp = (await import('sharp')).default
const { data, info } = await sharp(OUT_DIR + 'final-N.png').greyscale().raw().toBuffer({ resolveWithObject: true })
const n = info.width * info.height
let sum = 0, bright = 0
for (const v of data) { sum += v; if (v > 230) bright++ }
const mean = sum / n
let vs = 0
for (const v of data) vs += (v - mean) ** 2
console.log(`final-N: mean=${mean.toFixed(1)} bright=${(bright / n * 100).toFixed(1)}% std=${Math.sqrt(vs / n).toFixed(1)}`)
console.log('目标:    bright=2.4% std=25.2 (基线 mean=189.9)')
