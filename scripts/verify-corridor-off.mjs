import { chromium } from 'playwright-core'
const browser = await chromium.launch({
  executablePath: 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (error) => console.log('[pageerror]', String(error?.message || error).slice(0, 200)))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__playerDebug?.collision === true, null, { timeout: 120000 })

const pos = () => page.evaluate(() => ({ x: +window.__camera.position.x.toFixed(2), z: +window.__camera.position.z.toFixed(2) }))
const clickText = async (label) => {
  const box = await page.evaluate((label) => {
    const el = [...document.querySelectorAll('svg text')].find((t) => t.textContent === label)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, label)
  if (!box) return false
  await page.mouse.click(box.x, box.y)
  return true
}

// 1) 点大厅文字：不应传送
const before = await pos()
await page.click('button[aria-label="展厅地图"]', { force: true })
await page.waitForTimeout(700)
await clickText('展馆大厅')
await page.waitForTimeout(1200)
const after = await pos()
const moved = Math.hypot(after.x - before.x, after.z - before.z)
console.log(`点「展馆大厅」: 位移=${moved.toFixed(1)}m ${moved < 0.5 ? 'PASS 不传送（功能已取消）' : 'FAIL 仍传送'}`)

// 2) 点分厅文字：仍应传送
const before2 = await pos()
await page.click('button[aria-label="展厅地图"]', { force: true })
await page.waitForTimeout(700)
await clickText('电视厅')
await page.waitForTimeout(1200)
const after2 = await pos()
const moved2 = Math.hypot(after2.x - before2.x, after2.z - before2.z)
console.log(`点「电视厅」: 位移=${moved2.toFixed(1)}m ${moved2 > 2 ? 'PASS 分厅传送正常' : 'FAIL 分厅传送失效'}`)
await browser.close()
