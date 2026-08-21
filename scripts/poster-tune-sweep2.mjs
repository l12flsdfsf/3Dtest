// 海报调参第二轮:两条路线找 (bright≈2.4%, std≈25.2)
// A: toneMapped=true(海报回 AgX 曲线)× color 增益
// B: toneMapped=false × 对比度 k × 亮度 c
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

const applyVariant = (v) => page.evaluate((v) => {
  const seen = new Set()
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    const ms = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of ms) {
      if (!m?.userData?.unlitPicturePanel || seen.has(m.uuid)) continue
      seen.add(m.uuid)
      m.color.setScalar(v.c)
      m.toneMapped = v.toneMapped
      if (v.k !== 1) {
        const K = v.k.toFixed(3)
        m.onBeforeCompile = (shader) => {
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>\n diffuseColor.rgb = clamp((diffuseColor.rgb - 0.5) * ${K} + 0.5, 0.0, 1.0);`,
          )
        }
        m.customProgramCacheKey = () => 'posterContrast' + K
      } else {
        m.onBeforeCompile = () => {}
        m.customProgramCacheKey = () => 'posterNoContrast'
      }
      m.needsUpdate = true
    }
  })
  return seen.size
}, v)

const VARIANTS = [
  { tag: 'A-agx-c100', toneMapped: true, c: 1.0, k: 1 },
  { tag: 'A-agx-c115', toneMapped: true, c: 1.15, k: 1 },
  { tag: 'A-agx-c130', toneMapped: true, c: 1.3, k: 1 },
  { tag: 'A-agx-c150', toneMapped: true, c: 1.5, k: 1 },
  { tag: 'B-k085-c085', toneMapped: false, c: 0.85, k: 0.85 },
  { tag: 'B-k085-c080', toneMapped: false, c: 0.8, k: 0.85 },
  { tag: 'B-k075-c085', toneMapped: false, c: 0.85, k: 0.75 },
  { tag: 'B-k075-c080', toneMapped: false, c: 0.8, k: 0.75 },
]
for (const v of VARIANTS) {
  await applyVariant(v)
  await settle(4)
  await page.screenshot({ path: OUT_DIR + 'v-' + v.tag + '.png', timeout: 120000 })
  console.log('shot', v.tag)
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
  return { mean: +mean.toFixed(1), bright: +(bright / n * 100).toFixed(1), std: +Math.sqrt(vs / n).toFixed(1) }
}
console.log('\n目标: bright=2.4 std=25.2 (基线 mean=189.9)')
for (const v of VARIANTS) {
  console.log(v.tag.padEnd(14), JSON.stringify(await stats(OUT_DIR + 'v-' + v.tag + '.png')))
}
