// 其余四厅(广播/电视/电影/展望)角落阴影 A/B:打印各厅量出的缝坐标,
// 每厅两个机位(外墙角 + 门墙角)on/off 截图,末尾 OffscreenCanvas 像素差分
// (项目未装 sharp;rAF 双帧同步同 tech-corner-diag)。
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const CHROME = 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = 'http://localhost:5173'
const OUT_DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') + '../.tmp-rect/'
mkdirSync(OUT_DIR, { recursive: true })

const HALLS = [
  { id: 'broadcast', hook: '__broadcastCornerShadows' },
  { id: 'tv', hook: '__tvCornerShadows' },
  { id: 'cinema', hook: '__cinemaCornerShadows' },
  { id: 'future', hook: '__futureCornerShadows' },
]

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)))
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 160)) })

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(
  () =>
    window.__gltfScene &&
    window.__worldLayout?.halls &&
    window.__broadcastCornerShadows?.junctions &&
    window.__tvCornerShadows?.junctions &&
    window.__cinemaCornerShadows?.junctions &&
    window.__futureCornerShadows?.junctions &&
    window.__teleport,
  null,
  { timeout: 300000, polling: 2000 },
)
// 开头一次性抓各厅中心(HMR 全页重载会让 window.__worldLayout 短暂为 null,
// 拍照中途现取会踩空;机位计算改用这份快照)
const CENTERS = await page.evaluate(() =>
  Object.fromEntries(
    window.__worldLayout.halls.map((h) => [
      h.id,
      {
        cx: (h.worldMinX + h.worldMaxX) / 2,
        cz: (h.worldMinZ + h.worldMaxZ) / 2,
      },
    ]),
  ),
)
// 帮助浮层:等它弹出、关闭、确认消失
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 60000 })
for (let attempt = 0; attempt < 5; attempt++) {
  await page.evaluate(() => document.querySelector('button[aria-label="关闭"]')?.click())
  const gone = await page.evaluate(() => !document.querySelector('button[aria-label="关闭"]'))
  if (gone) break
  await page.waitForTimeout(1500)
}
await page.waitForFunction(() => !document.querySelector('button[aria-label="关闭"]'), null, { timeout: 30000 })

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

// 机位:缝坐标朝房内侧内收 0.9m 为注视点,眼位取厅中心与注视点的中点
const gotoCorner = async (hallId, junction) => {
  await page.evaluate(({ hallId, j, center }) => {
    const look = { x: j.x + j.fx * 0.9, y: 1.8, z: j.z + j.fz * 0.9 }
    window.__teleport({ x: (center.cx + look.x) / 2, y: 1.55, z: (center.cz + look.z) / 2 }, look)
  }, { hallId, j: junction, center: CENTERS[hallId] })
}

// HMR 重载后钩子会短暂消失,每轮拍照前确认
const ensureReady = async (hook) => {
  await page.waitForFunction(
    (hook) => window[hook]?.junctions && window.__teleport,
    hook,
    { timeout: 300000, polling: 2000 },
  )
}

const shots = []
for (const hall of HALLS) {
  await ensureReady(hall.hook)
  const junctions = await page.evaluate((hook) => window[hook].junctions.map((v) => ({ x: v.x, z: v.y, fx: v.z, fz: v.w })), hall.hook)
  console.log(hall.id + ' junctions:', JSON.stringify(junctions.map((j) => [j.x, j.z, j.fx, j.fz].map((n) => +n.toFixed(2)))))
  // [0]=外墙×南墙 [3]=门墙×北墙
  for (const junction of [junctions[0], junctions[3]]) {
    await gotoCorner(hall.id, junction)
    await settleFrames(3)
    const name = hall.id + (junction === junctions[0] ? '-SW' : '-NE')
    await page.screenshot({ path: OUT_DIR + 'on-' + name + '.png', timeout: 120000 })
    shots.push(name)
    console.log('shot on-' + name)
  }
}
for (const hall of HALLS) {
  await ensureReady(hall.hook)
  const off = await page.evaluate((hook) => window[hook].toggle(), hall.hook)
  console.log(hall.id, 'toggle:', off)
  const junctions = await page.evaluate((hook) => window[hook].junctions.map((v) => ({ x: v.x, z: v.y, fx: v.z, fz: v.w })), hall.hook)
  for (const junction of [junctions[0], junctions[3]]) {
    await gotoCorner(hall.id, junction)
    await settleFrames(2)
    const name = hall.id + (junction === junctions[0] ? '-SW' : '-NE')
    await page.screenshot({ path: OUT_DIR + 'off-' + name + '.png', timeout: 120000 })
    console.log('shot off-' + name)
  }
}
await browser.close()

// 像素差分(轻量 chromium,不用 swiftshader)
const diffBrowser = await chromium.launch({ executablePath: CHROME })
const diffPage = await diffBrowser.newPage({ viewport: { width: 640, height: 360 } })
await diffPage.goto('about:blank')
for (const name of shots) {
  const stats = await diffPage.evaluate(async ([onB64, offB64]) => {
    const load = (b64) => new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.src = 'data:image/png;base64,' + b64
    })
    const a = await load(onB64)
    const b = await load(offB64)
    const w = a.width, h = a.height
    const ca = new OffscreenCanvas(w, h), cb = new OffscreenCanvas(w, h)
    ca.getContext('2d').drawImage(a, 0, 0)
    cb.getContext('2d').drawImage(b, 0, 0)
    const da = ca.getContext('2d').getImageData(0, 0, w, h).data
    const db = cb.getContext('2d').getImageData(0, 0, w, h).data
    let dark = 0, n = 0, darkSum = 0, max = 0
    for (let k = 0; k < da.length; k += 4) {
      const ga = 0.299 * da[k] + 0.587 * da[k + 1] + 0.114 * da[k + 2]
      const gb = 0.299 * db[k] + 0.587 * db[k + 1] + 0.114 * db[k + 2]
      const d = gb - ga
      n++
      if (d > max) max = d
      if (d > 3) { dark++; darkSum += d }
    }
    return { darkPct: +((dark / n) * 100).toFixed(1), avg: dark ? +(darkSum / dark).toFixed(1) : 0, max }
  }, [readFileSync(OUT_DIR + 'on-' + name + '.png').toString('base64'), readFileSync(OUT_DIR + 'off-' + name + '.png').toString('base64')])
  console.log(name + ': darkened%=' + stats.darkPct + ' avgDrop=' + stats.avg + ' maxDrop=' + stats.max)
}
await diffBrowser.close()
