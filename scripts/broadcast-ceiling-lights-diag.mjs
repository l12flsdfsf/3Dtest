// 诊断5:俯视地板机位(隔离地板响应) + 常规站立视角,@160 on/off 对比。
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const CHROME = 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__broadcastCeilingLights && window.__teleport,
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

const setIntensity = (value) =>
  page.evaluate((value) => {
    let root = window.__gltfScene
    while (root.parent) root = root.parent
    root.traverse((o) => {
      if (o.isSpotLight && o.color.getHexString() === 'fbfcf8') o.intensity = value
    })
  }, value)

const settle = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let left = 4
        const tick = () => { if (--left <= 0) resolve(); else requestAnimationFrame(tick) }
        requestAnimationFrame(tick)
      }),
  )

const diffB64 = (aB64, bB64) =>
  page.evaluate(async ([aB64, bB64]) => {
    const load = (b64) => new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.src = 'data:image/png;base64,' + b64
    })
    const a = await load(aB64)
    const b = await load(bB64)
    const w = a.width, h = a.height
    const ca = new OffscreenCanvas(w, h), cb = new OffscreenCanvas(w, h)
    ca.getContext('2d').drawImage(a, 0, 0)
    cb.getContext('2d').drawImage(b, 0, 0)
    const da = ca.getContext('2d').getImageData(0, 0, w, h).data
    const db = cb.getContext('2d').getImageData(0, 0, w, h).data
    let bright = 0, sum = 0, max = 0, n = 0
    for (let k = 0; k < da.length; k += 4) {
      const ga = 0.299 * da[k] + 0.587 * da[k + 1] + 0.114 * da[k + 2]
      const gb = 0.299 * db[k] + 0.587 * db[k + 1] + 0.114 * db[k + 2]
      const d = gb - ga
      n++
      if (d > max) max = d
      if (d > 3) { bright++; sum += d }
    }
    return { brightPct: +((bright / n) * 100).toFixed(1), avg: bright ? +(sum / bright).toFixed(1) : 0, max: Math.round(max) }
  }, [aB64, bB64])

const views = [
  { name: 'topdown', eye: { x: -15.68, y: 2.3, z: 3.43 }, look: { x: -15.68, y: 0, z: 3.43 } },
  { name: 'stand', eye: { x: -16.4, y: 1.72, z: 7.6 }, look: { x: -15.4, y: 1.0, z: 0.5 } },
]

for (const view of views) {
  await setIntensity(160)
  await page.evaluate(({ eye, look }) => window.__teleport(eye, look), view)
  await settle()
  const onPath = `.tmp-bcl-td-${view.name}-on.png`
  await page.screenshot({ path: onPath, timeout: 120000 })
  await setIntensity(0)
  await settle()
  const offPath = `.tmp-bcl-td-${view.name}-off.png`
  await page.screenshot({ path: offPath, timeout: 120000 })
  console.log(`${view.name} @160 on-vs-off:`, JSON.stringify(await diffB64(readFileSync(offPath).toString('base64'), readFileSync(onPath).toString('base64'))))
}
await browser.close()
