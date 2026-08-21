// 关怀厅「整体发蒙」排查:厅内多机位截图 + 关怀厅材质/贴图信息 dump + 角阴影 on/off A/B
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const CHROME = 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = 'http://localhost:5173'
const OUT_DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') + '../.tmp-careblur/'
mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)))
page.on('console', (m) => {
  const t = m.type()
  if (t === 'error' || t === 'warning') console.log(`[${t}]`, m.text().slice(0, 200))
})

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

// 关怀厅材质/贴图信息
const matInfo = await page.evaluate(() => {
  const scene = window.__gltfScene
  const rows = []
  scene.traverse((o) => {
    if (!o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      if (!m) continue
      if (!['关怀厅', '关怀厅板', '白墙'].includes(m.name)) continue
      rows.push({
        mesh: o.name,
        mat: m.name,
        type: m.type,
        map: m.map ? `${m.map.image?.width ?? '?'}x${m.map.image?.height ?? '?'}` : null,
        mapFormat: m.map?.format ?? null,
        lightMap: !!m.lightMap,
        aoMap: !!m.aoMap,
        envInt: m.envMapIntensity,
      })
    }
  })
  const seen = new Set()
  return rows.filter((r) => {
    const k = r.mesh + r.mat
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
})
console.log('care materials:', JSON.stringify(matInfo, null, 1).slice(0, 2000))

const junctions = await page.evaluate(() => window.__careCornerShadows?.junctions?.map((v) => [v.x, v.y, v.z, v.w]))
console.log('junctions:', JSON.stringify(junctions))

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

// 机位:厅中心看四面墙 + 一个角 + 贴墙近观
const shots = [
  { tag: 'center-N', pos: (c) => [c.cx, 1.6, c.cz], look: (c) => [c.cx, 1.7, c.z1] },
  { tag: 'center-S', pos: (c) => [c.cx, 1.6, c.cz], look: (c) => [c.cx, 1.7, c.z0] },
  { tag: 'center-W', pos: (c) => [c.cx, 1.6, c.cz], look: (c) => [c.x0, 1.7, c.cz] },
  { tag: 'corner-SW', pos: (c) => [(c.cx + c.x0) / 2, 1.6, (c.cz + c.z0) / 2], look: (c) => [c.x0, 1.7, c.z0] },
]
const c = await page.evaluate(() => {
  const care = window.__worldLayout.halls.find((h) => h.id === 'care')
  return {
    cx: (care.worldMinX + care.worldMaxX) / 2,
    cz: (care.worldMinZ + care.worldMaxZ) / 2,
    x0: care.worldMinX + 1, x1: care.worldMaxX - 1,
    z0: care.worldMinZ + 1, z1: care.worldMaxZ - 1,
  }
})

for (const s of shots) {
  await page.evaluate((arg) => {
    window.__teleport({ x: arg.pos[0], y: arg.pos[1], z: arg.pos[2] }, { x: arg.look[0], y: arg.look[1], z: arg.look[2] })
  }, { pos: s.pos(c), look: s.look(c) })
  await settleFrames(3)
  await page.screenshot({ path: OUT_DIR + 'on-' + s.tag + '.png', timeout: 120000 })
  console.log('shot on-' + s.tag)
}

const toggled = await page.evaluate(() => window.__careCornerShadows?.toggle?.())
console.log('corner shadows toggled ->', toggled)
for (const s of shots) {
  await page.evaluate((arg) => {
    window.__teleport({ x: arg.pos[0], y: arg.pos[1], z: arg.pos[2] }, { x: arg.look[0], y: arg.look[1], z: arg.look[2] })
  }, { pos: s.pos(c), look: s.look(c) })
  await settleFrames(2)
  await page.screenshot({ path: OUT_DIR + 'off-' + s.tag + '.png', timeout: 120000 })
  console.log('shot off-' + s.tag)
}

await browser.close()
console.log('done ->', OUT_DIR)
