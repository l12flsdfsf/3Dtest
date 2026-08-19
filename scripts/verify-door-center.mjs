// 验证：6 厅地图传送后，门洞中心投影在画面正中（NDC.x ≈ 0）
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__playerDebug?.collision === true, null, { timeout: 120000 })

const DOORS = { care: 7.9, broadcast: 0.55, tv: -7.5, cinema: -7.5, tech: 0.55, future: 7.9 }
const NAMES = { care: '关怀厅', broadcast: '广播厅', tv: '电视厅', cinema: '电影厅', tech: '技术设备厅', future: '展望厅' }

for (const [hallId, doorX] of Object.entries(DOORS)) {
  await page.click('button[aria-label="展厅地图"]', { force: true })
  await page.waitForTimeout(700)
  const box = await page.evaluate((name) => {
    const el = [...document.querySelectorAll('svg text')].find((t) => t.textContent === name)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, NAMES[hallId])
  await page.mouse.click(box.x, box.y)
  await page.waitForTimeout(1000)

  const ndc = await page.evaluate(([doorX, sign]) => {
    const THREE = window.__THREE
    const t = window.__worldLayout.transform
    const [a, b, e] = t.x, [c, d, f] = t.z
    const det = a * d - b * c
    const cx = doorX, cz = sign * 4.8
    const dx = cx - e, dz = cz - f
    const world = { x: (d * dx - b * dz) / det, z: (-c * dx + a * dz) / det }
    const v = new THREE.Vector3(world.x, 1.6, world.z)
    window.__camera.updateMatrixWorld()
    v.project(window.__camera)
    return { x: +v.x.toFixed(3), y: +v.y.toFixed(3) }
  }, [doorX, ['care', 'broadcast', 'tv'].includes(hallId) ? -1 : 1])

  const pass = Math.abs(ndc.x) < 0.06
  console.log(`${NAMES[hallId]}: 门洞投影 NDC=(${ndc.x}, ${ndc.y}) ${pass ? 'PASS 居中' : 'FAIL 偏移'}`)
}
await browser.close()
