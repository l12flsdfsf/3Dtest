// 海报亮度扫参:运行时改 unlit 海报材质的 color 标量,同机位截图算指标,
// 目标 = 基线(海报走原 PBR):高亮>230 占比 2.4%,std 25.2
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
await page.evaluate(() => {
  const care = window.__worldLayout.halls.find((h) => h.id === 'care')
  const cx = (care.worldMinX + care.worldMaxX) / 2
  const cz = (care.worldMinZ + care.worldMaxZ) / 2
  window.__teleport({ x: cx, y: 1.6, z: cz }, { x: cx, y: 1.7, z: care.worldMaxZ - 1 })
})
const settle = (n) => page.evaluate(
  (n) => new Promise((r) => { let l = n; const t = () => (--l <= 0 ? r() : requestAnimationFrame(t)); requestAnimationFrame(t) }),
  n,
)
await settle(3)

const setPosterScale = (c) => page.evaluate((c) => {
  const seen = new Set()
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    const ms = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of ms) {
      if (!m?.userData?.unlitPicturePanel || seen.has(m.uuid)) continue
      seen.add(m.uuid)
      m.color.setScalar(c)
    }
  })
  return seen.size
}, c)

const SHOTS = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5]
for (const c of SHOTS) {
  const n = await setPosterScale(c)
  await settle(2)
  await page.screenshot({ path: `${OUT_DIR}sweep-${c.toFixed(2)}.png`, timeout: 120000 })
  console.log(`c=${c.toFixed(2)} materials=${n}`)
}
await browser.close()

const sharp = (await import('sharp')).default
async function stats(f) {
  const { data, info } = await sharp(f).greyscale().raw().toBuffer({ resolveWithObject: true })
  const n = info.width * info.height
  let sum = 0, bright = 0
  for (const v of data) { sum += v; if (v > 230) bright++ }
  const mean = sum / n
  let vs = 0
  for (const v of data) vs += (v - mean) ** 2
  return { mean: mean.toFixed(1), bright: (bright / n * 100).toFixed(1), std: Math.sqrt(vs / n).toFixed(1) }
}
console.log('\n目标(基线 PBR 海报): bright=2.4% std=25.2 mean=189.9')
console.log('reference baseline-N:', JSON.stringify(await stats(OUT_DIR + 'baseline-N.png')))
for (const c of SHOTS) {
  console.log(`sweep c=${c.toFixed(2)}:`, JSON.stringify(await stats(`${OUT_DIR}sweep-${c.toFixed(2)}.png`)))
}
