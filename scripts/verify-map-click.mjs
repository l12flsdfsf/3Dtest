// 验证地图点击：1) 点厅名文字可传送 2) 点「展馆大厅」文字传送到走廊中心
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (error) => console.log('[pageerror]', String(error?.message || error).slice(0, 200)))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__teleport && window.__playerDebug?.collision === true, null, { timeout: 120000 })

const playerPos = () => page.evaluate(() => ({ x: +window.__camera.position.x.toFixed(2), z: +window.__camera.position.z.toFixed(2) }))
const clickMapText = async (label) => {
  const box = await page.evaluate((label) => {
    const texts = [...document.querySelectorAll('svg text')]
    const el = texts.find((t) => t.textContent === label)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, label)
  if (!box) {
    console.log(`没找到地图文字「${label}」`)
    return false
  }
  await page.mouse.click(box.x, box.y)
  return true
}

// 1) 点「电视厅」文字
const before = await playerPos()
await page.click('button[aria-label="展厅地图"]', { force: true })
await page.waitForTimeout(800)
if (await clickMapText('电视厅')) {
  await page.waitForTimeout(1200)
  const after = await playerPos()
  const mapClosed = await page.evaluate(() => !document.querySelector('.ant-modal-root') || true) // MapOverlay 非 antd，直接看面板
  const moved = Math.hypot(after.x - before.x, after.z - before.z)
  console.log(`点「电视厅」文字: ${before.x},${before.z} -> ${after.x},${after.z} 位移=${moved.toFixed(1)}m ${moved > 2 ? 'PASS 已传送' : 'FAIL 未传送'}`)
}

// 2) 点「展馆大厅」文字
const before2 = await playerPos()
await page.click('button[aria-label="展厅地图"]', { force: true })
await page.waitForTimeout(800)
if (await clickMapText('展馆大厅')) {
  await page.waitForTimeout(1200)
  const after2 = await playerPos()
  // 预期：走廊中心 = canonical(0,0) 的世界坐标
  const expected = await page.evaluate(() => {
    const t = window.__worldLayout.transform
    const [a, b, e] = t.x, [c, d, f] = t.z
    const det = a * d - b * c
    return { x: +((-e * d + b * -f * -1) / det).toFixed(2), z: 0 }
  })
  const moved2 = Math.hypot(after2.x - before2.x, after2.z - before2.z)
  console.log(`点「展馆大厅」文字: ${before2.x},${before2.z} -> ${after2.x},${after2.z} 位移=${moved2.toFixed(1)}m ${moved2 > 2 ? 'PASS 已传送' : 'FAIL 未传送'}`)
}
await browser.close()
