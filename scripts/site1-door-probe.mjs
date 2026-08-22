// 门洞通行探针：六个厅的门口三点（走廊侧/门中/厅内侧）做胶囊碰撞检测
// 新旧模型各跑一遍对比，定位"进不去"的厅是哪个门被堵
// 用法: node scripts/site1-door-probe.mjs [模型URL] [标签]
import { chromium } from 'playwright-core'

const MODEL = encodeURIComponent(process.argv[2] ?? '/models/site1/scene-site1.glb')
const TAG = process.argv[3] ?? 'new'
// canonical 门位（src/data/halls.js HALL_DOOR_CANONICAL_X），corridorHalf=4.8
const DOORS = {
  care: 7.9, broadcast: 0.55, tv: -7.5, cinema: -7.5, tech: 0.55, future: 7.9,
}
const NAMES = { care: '关怀厅', broadcast: '广播厅', tv: '电视厅', cinema: '电影厅', tech: '技术设备厅', future: '展望厅' }

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
page.on('pageerror', (e) => console.log('[页面异常]', String(e).slice(0, 150)))
await page.goto(`http://localhost:5173/?model=${MODEL}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => document.querySelector('button[aria-label="关闭"]'), null, { timeout: 300000 })
await page.evaluate(() => document.querySelectorAll('button[aria-label="关闭"]').forEach((b) => b.click()))
await page.waitForFunction(() => window.__worldLayout?.halls?.length >= 4, null, { timeout: 300000 })
// 碰撞钩子可能晚于布局出现（碰撞树构建异步），轮询 60s；缺失则打印状态辅助定位
try {
  await page.waitForFunction(() => typeof window.__capsuleBlocked === 'function', null, { timeout: 60000 })
} catch {
  const state = await page.evaluate(() => ({
    halls: window.__worldLayout?.halls?.length,
    capsule: typeof window.__capsuleBlocked,
    clearance: typeof window.__clearance,
    collision: typeof window.__collisionWorld,
  }))
  console.log(`  [诊断] 碰撞钩子缺失: ${JSON.stringify(state)}`)
  throw new Error('碰撞钩子未出现')
}

const result = await page.evaluate((DOORS) => {
  const layout = window.__worldLayout
  // canonical -> 模型世界（halls.js projectHallLayoutToWorldPosition 的逆变换实现）
  const xc = layout.transform?.x
  const zc = layout.transform?.z
  const det = xc && zc ? xc[0] * zc[1] - xc[1] * zc[0] : 0
  const project = (cx, cz) => {
    if (Math.abs(det) > 1e-8) {
      const dx = cx - xc[2]
      const dz = cz - zc[2]
      return { x: (zc[1] * dx - xc[1] * dz) / det, z: (-zc[0] * dx + xc[0] * dz) / det }
    }
    return { x: cx, z: cz }
  }
  const out = {}
  for (const [id, doorX] of Object.entries(DOORS)) {
    const sideZ = id === 'care' || id === 'broadcast' || id === 'tv' ? 1 : -1 // 前厅在 +z
    const pts = {
      走廊侧: project(doorX, sideZ * 3.6),
      门中: project(doorX, sideZ * 4.8),
      厅内侧: project(doorX, sideZ * 6.2),
    }
    out[id] = Object.fromEntries(
      Object.entries(pts).map(([k, p]) => [k, window.__capsuleBlocked(p.x, p.z)]),
    )
  }
  return out
}, DOORS)

console.log(`[${TAG}]`)
for (const [id, doors] of Object.entries(result)) {
  const flags = Object.entries(doors).map(([k, v]) => `${k}:${v ? '堵' : '通'}`).join(' ')
  const blocked = Object.values(doors).some(Boolean)
  console.log(`  ${NAMES[id].padEnd(6)} ${flags}${blocked ? '  ⚠️' : ''}`)
}
await browser.close()
