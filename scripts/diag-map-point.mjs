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
await page.waitForTimeout(800)
const info = await page.evaluate(() => {
  const texts = [...document.querySelectorAll('svg text')]
  const el = texts.find((t) => t.textContent === '展馆大厅')
  if (!el) return { found: false }
  const r = el.getBoundingClientRect()
  const x = r.x + r.width / 2, y = r.y + r.height / 2
  const top = document.elementFromPoint(x, y)
  return {
    found: true,
    point: { x: Math.round(x), y: Math.round(y) },
    topElement: top ? `${top.tagName}.${(top.getAttribute('class') || '').slice(0, 30)}` : null,
    topIsSvgChild: top?.ownerSVGElement ? 'svg内部' : '非svg',
    pointerEvents: top ? getComputedStyle(top).pointerEvents : null,
  }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
