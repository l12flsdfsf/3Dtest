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

// 先传送到电视厅
await page.click('button[aria-label="展厅地图"]', { force: true })
await page.waitForTimeout(800)
const tvBox = await page.evaluate(() => {
  const el = [...document.querySelectorAll('svg text')].find((t) => t.textContent === '电视厅')
  const r = el.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
await page.mouse.click(tvBox.x, tvBox.y)
await page.waitForTimeout(1200)

// 重开地图，检查展馆大厅点位
await page.click('button[aria-label="展厅地图"]', { force: true })
await page.waitForTimeout(800)
const info = await page.evaluate(() => {
  const el = [...document.querySelectorAll('svg text')].find((t) => t.textContent === '展馆大厅')
  const r = el.getBoundingClientRect()
  const x = r.x + r.width / 2, y = r.y + r.height / 2
  const top = document.elementFromPoint(x, y)
  const svg = el.ownerSVGElement
  // 数一下透明点击矩形数量
  const transparentRects = [...svg.querySelectorAll('rect[fill="transparent"]')].length
  return {
    top: `${top?.tagName} fill=${top?.getAttribute('fill')} cursor=${top?.style?.cursor || getComputedStyle(top).cursor}`,
    transparentRects,
    mapHallLabel: document.body.textContent.includes('当前位置'),
  }
})
console.log('人在电视厅时:', JSON.stringify(info))

// 点击展馆大厅
await page.evaluate(() => {
  const el = [...document.querySelectorAll('svg text')].find((t) => t.textContent === '展馆大厅')
  const r = el.getBoundingClientRect()
  window.__aim = { x: r.x + r.width / 2, y: r.y + r.height / 2 }
})
const before = await page.evaluate(() => ({ x: +window.__camera.position.x.toFixed(2), z: +window.__camera.position.z.toFixed(2) }))
await page.mouse.click(await page.evaluate(() => window.__aim.x), await page.evaluate(() => window.__aim.y))
await page.waitForTimeout(1200)
const after = await page.evaluate(() => ({ x: +window.__camera.position.x.toFixed(2), z: +window.__camera.position.z.toFixed(2) }))
console.log(`点击展馆大厅: ${before.x},${before.z} -> ${after.x},${after.z} 位移=${Math.hypot(after.x - before.x, after.z - before.z).toFixed(1)}m`)
await browser.close()
