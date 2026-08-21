// 探广播厅天花(第三轮):
// 1) 站厅中心抬头截图,确认肉眼所见 3 个圆形灯;
// 2) 从 y=4.5 向上 0.1m 网格密集射线打 天花灯网格(网格071/071_1/076/076_1),
//    命中点做连通域聚类 → 圆盘/条带的世界位置与半径。
import { chromium } from 'playwright-core'

const CHROME = 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)))
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__THREE && window.__worldLayout?.halls?.length && window.__teleport,
  null,
  { timeout: 300000, polling: 2000 },
)

// 关帮助浮层
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 60000 })
for (let attempt = 0; attempt < 5; attempt++) {
  await page.evaluate(() => document.querySelector('button[aria-label="关闭"]')?.click())
  const gone = await page.evaluate(() => !document.querySelector('button[aria-label="关闭"]'))
  if (gone) break
  await page.waitForTimeout(1500)
}
await page.waitForFunction(() => !document.querySelector('button[aria-label="关闭"]'), null, { timeout: 30000 })

// 站厅中心抬头看天花
await page.evaluate(() => {
  const hall = window.__worldLayout.halls.find((h) => h.id === 'broadcast')
  const cx = (hall.worldMinX + hall.worldMaxX) / 2
  const cz = (hall.worldMinZ + hall.worldMaxZ) / 2
  window.__teleport({ x: cx, y: 1.55, z: cz }, { x: cx, y: 5.2, z: cz - 0.01 })
})
await page.evaluate(
  () => new Promise((resolve) => {
    let left = 4
    const tick = () => { if (--left <= 0) resolve(); else requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  }),
)
await page.screenshot({ path: '.tmp-broadcast-ceiling-look.png', timeout: 120000 })
console.log('screenshot: .tmp-broadcast-ceiling-look.png')

// 密集射线聚类
const clusters = await page.evaluate(() => {
  const THREE = window.__THREE
  const hall = window.__worldLayout.halls.find((h) => h.id === 'broadcast')
  const targets = []
  const byName = {}
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    if (['网格071', '网格071_1', '网格076', '网格076_1'].includes(o.name)) {
      targets.push(o)
      ;(byName[o.name] ??= []).push(o)
    }
  })

  const raycaster = new THREE.Raycaster()
  const up = new THREE.Vector3(0, 1, 0)
  const results = {}
  const pad = 0.6
  const step = 0.1
  const x0 = hall.worldMinX - pad
  const x1 = hall.worldMaxX + pad
  const z0 = hall.worldMinZ - pad
  const z1 = hall.worldMaxZ + pad

  for (const name of Object.keys(byName)) {
    const meshes = byName[name]
    const pts = []
    for (let x = x0; x <= x1; x += step) {
      for (let z = z0; z <= z1; z += step) {
        raycaster.set(new THREE.Vector3(x, 4.55, z), up)
        raycaster.far = 2.0
        const hits = raycaster.intersectObjects(meshes, false)
        if (hits.length) pts.push([hits[0].point.x, hits[0].point.z, hits[0].point.y])
      }
    }
    // 连通域:网格哈希 + 0.25m 邻接
    const cell = 0.25
    const key = (x, z) => Math.round(x / cell) + ':' + Math.round(z / cell)
    const grid = new Map()
    pts.forEach((p, i) => {
      const k = key(p[0], p[1])
      if (!grid.has(k)) grid.set(k, [])
      grid.get(k).push(i)
    })
    const seen = new Array(pts.length).fill(false)
    const found = []
    for (let i = 0; i < pts.length; i++) {
      if (seen[i]) continue
      const stack = [i]
      seen[i] = true
      const comp = []
      while (stack.length) {
        const j = stack.pop()
        comp.push(j)
        const [px, pz] = pts[j]
        for (let dx = -1; dx <= 1; dx++) {
          for (let dz = -1; dz <= 1; dz++) {
            const k = Math.round(px / cell) + dx + ':' + (Math.round(pz / cell) + dz)
            for (const n of grid.get(k) ?? []) {
              if (!seen[n] && Math.hypot(pts[n][0] - px, pts[n][1] - pz) <= cell * 1.5) {
                seen[n] = true
                stack.push(n)
              }
            }
          }
        }
      }
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, ySum = 0
      for (const j of comp) {
        minX = Math.min(minX, pts[j][0]); maxX = Math.max(maxX, pts[j][0])
        minZ = Math.min(minZ, pts[j][1]); maxZ = Math.max(maxZ, pts[j][1])
        ySum += pts[j][2]
      }
      found.push({
        n: comp.length,
        cx: +((minX + maxX) / 2).toFixed(2),
        cz: +((minZ + maxZ) / 2).toFixed(2),
        y: +(ySum / comp.length).toFixed(2),
        spanX: +(maxX - minX).toFixed(2),
        spanZ: +(maxZ - minZ).toFixed(2),
      })
    }
    found.sort((a, b) => b.n - a.n)
    results[name] = found.slice(0, 12)
  }
  return results
})
console.log(JSON.stringify(clusters, null, 1))
await browser.close()
