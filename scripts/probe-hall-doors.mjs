// 探测 6 个厅朝走廊一侧的门洞位置：沿墙扫射线（进门方向），找无墙命中区间 -> 门的 canonical x
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__gltfScene && window.__THREE && window.__worldLayout, null, { timeout: 120000 })

const doors = await page.evaluate(() => {
  const THREE = window.__THREE
  const t = window.__worldLayout.transform
  const toModel = (cx, cz) => {
    const [a, b, e] = t.x, [c, d, f] = t.z
    const det = a * d - b * c
    const dx = cx - e, dz = cz - f
    return { x: (d * dx - b * dz) / det, z: (-c * dx + a * dz) / det }
  }

  const HALL_CENTERS = {
    care: 8, broadcast: 0, tv: -8,        // canonical z -8.4 侧（世界 wall front 翻转后）
    cinema: -8, tech: 0, future: 8,       // canonical z +8.4 侧
  }
  const result = {}
  const raycaster = new THREE.Raycaster()
  raycaster.far = 2.5

  for (const [hallId, centerX] of Object.entries(HALL_CENTERS)) {
    const sign = ['care', 'broadcast', 'tv'].includes(hallId) ? -1 : 1
    const edgeZ = sign * 4.8 // 走廊边界（canonical）
    const open = []
    for (let cx = centerX - 4.2; cx <= centerX + 4.21; cx += 0.1) {
      const o = toModel(cx, edgeZ - sign * 0.25)
      const d1 = toModel(cx, edgeZ)
      const d2 = toModel(cx, edgeZ + sign * 1.5)
      const dir = new THREE.Vector3(d2.x - d1.x, 0, d2.z - d1.z).normalize()
      raycaster.set(new THREE.Vector3(o.x, 1.5, o.z), dir)
      const hits = raycaster.intersectObject(window.__gltfScene, true)
      const blocked = hits.some((h) => h.distance < 1.6)
      open.push({ cx: +cx.toFixed(2), open: !blocked })
    }
    // 找最长连续开区段
    let best = null, run = []
    for (const item of [...open, { cx: 999, open: false }]) {
      if (item.open) { run.push(item.cx); continue }
      if (run.length && (!best || run.length > best.length)) best = run
      run = []
    }
    result[hallId] = best ? { centerX: +(best.reduce((s, v) => s + v, 0) / best.length).toFixed(2), width: +(best.length * 0.1).toFixed(2) } : null
  }
  return result
})
console.log(JSON.stringify(doors, null, 1))
await browser.close()
