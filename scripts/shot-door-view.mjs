import { chromium } from 'playwright-core'
const browser = await chromium.launch({
  executablePath: 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__playerDebug?.collision === true, null, { timeout: 120000 })
await page.click('button[aria-label="展厅地图"]', { force: true })
await page.waitForTimeout(700)
const box = await page.evaluate(() => {
  const el = [...document.querySelectorAll('svg text')].find((t) => t.textContent === '广播厅')
  const r = el.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
await page.mouse.click(box.x, box.y)
await page.waitForTimeout(1500)
await page.screenshot({ path: '.tmp-ktx/door-center.png', timeout: 90000 })
console.log('已截图 door-center.png')
await browser.close()
