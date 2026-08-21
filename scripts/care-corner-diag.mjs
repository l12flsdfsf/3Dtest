// 关怀厅角落阴影 A/B：四角机位 on/off 对照 + 像素统计
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const CHROME = 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = 'http://localhost:5173'
const OUT_DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') + '../.tmp-care/'
mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)))
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 160)) })

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__worldLayout?.halls?.some((h) => h.id === 'care') && window.__teleport,
  null,
  { timeout: 300000, polling: 2000 },
)
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 60000 })
for (let attempt = 0; attempt < 5; attempt++) {
  await page.evaluate(() => document.querySelector('button[aria-label="关闭"]')?.click())
  const gone = await page.evaluate(() => !document.querySelector('button[aria-label="关闭"]'))
  if (gone) break
  await page.waitForTimeout(1500)
}

async function settleFrames(n) {
  await page.evaluate(
    (n) =>
      new Promise((resolve) => {
        let left = n
        const tick = () => { if (--left <= 0) resolve(); else requestAnimationFrame(tick) }
        requestAnimationFrame(tick)
      }),
    n,
    { timeout: 300000 },
  )
}

const goto = async (tag) => {
  await page.evaluate((t) => {
    const care = window.__worldLayout.halls.find((h) => h.id === 'care')
    const cx = (care.worldMinX + care.worldMaxX) / 2
    const cz = (care.worldMinZ + care.worldMaxZ) / 2
    // 量出的缝：外墙 x=-22.58 / 门墙 x=-10.27 / 南 z=10.44 / 北 z=23.01
    const seams = { W: -22.5, E: -10.35, S: 10.6, N: 22.85 }
    const corner =
      t === 'SW' ? { x: seams.W, z: seams.S } :
      t === 'SE' ? { x: seams.E, z: seams.S } :
      t === 'NE' ? { x: seams.E, z: seams.N } : { x: seams.W, z: seams.N }
    window.__teleport(
      { x: (cx + corner.x) / 2, y: 1.9, z: (cz + corner.z) / 2 },
      { x: corner.x, y: 2.0, z: corner.z },
    )
  }, tag)
}

const TAGS = ['SW', 'SE', 'NE', 'NW']
for (const tag of TAGS) {
  await goto(tag)
  await settleFrames(3)
  await page.screenshot({ path: OUT_DIR + 'ab-on-' + tag + '.png', timeout: 120000 })
  console.log('shot ab-on-' + tag)
}
const toggled = await page.evaluate(() => {
  if (typeof window.__careCornerShadows?.toggle !== 'function') return 'no-hook'
  return window.__careCornerShadows.toggle()
})
console.log('toggle:', toggled)
for (const tag of TAGS) {
  await goto(tag)
  await settleFrames(2)
  await page.screenshot({ path: OUT_DIR + 'ab-off-' + tag + '.png', timeout: 120000 })
  console.log('shot ab-off-' + tag)
}
await browser.close()

try {
  const { default: sharpModule } = await import('sharp')
  const sharp = sharpModule.default ?? sharpModule
  for (const c of TAGS) {
    const a = await sharp(OUT_DIR + 'ab-on-' + c + '.png').greyscale().raw().toBuffer({ resolveWithObject: true })
    const b = await sharp(OUT_DIR + 'ab-off-' + c + '.png').greyscale().raw().toBuffer({ resolveWithObject: true })
    let sum = 0, n = 0, max = 0, dark = 0, darkSum = 0
    for (let k = 0; k < a.data.length; k++) {
      const d = b.data[k] - a.data[k]
      n++; sum += Math.abs(d)
      if (d > max) max = d
      if (d > 3) { dark++; darkSum += d }
    }
    console.log(c + ': meanAbs=' + (sum / n).toFixed(2), 'maxDrop=' + max, 'darkened%=' + ((dark / n) * 100).toFixed(1), 'avgDrop=' + (dark ? (darkSum / dark).toFixed(1) : 0))
  }
} catch {
  console.log('(sharp 不可用)')
}
