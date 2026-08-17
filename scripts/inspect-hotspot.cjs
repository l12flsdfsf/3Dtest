const { chromium } = require('playwright-core')

async function dumpDrawer(page, label) {
  const text = await page.evaluate(() => {
    const drawer = document.querySelector('.fixed.inset-0.z-[1000]')
    if (!drawer) return null
    return drawer.innerText
  })
  console.log('\n=== ' + label + ' drawer text ===')
  console.log(text ? text.slice(0, 1500) : '(no drawer visible)')
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
  })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  page.on('console', (msg) => {
    const t = msg.type()
    if (t === 'error' || t === 'warning' || t === 'log') {
      console.log('[browser:' + t + ']', msg.text())
    }
  })
  page.on('pageerror', (err) => console.log('[pageerror]', err.message))

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 30000 })
  await page.waitForTimeout(3000)

  const canvasInfo = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    if (!c) return null
    const r = c.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  console.log('canvas rect:', canvasInfo)

  if (canvasInfo) {
    await page.mouse.click(canvasInfo.x + canvasInfo.w * 0.18, canvasInfo.y + canvasInfo.h * 0.55)
    await page.waitForTimeout(700)
    await dumpDrawer(page, 'after click #1 (left wall area)')
    await page.screenshot({ path: 'D:/tmp/wallhot-after-click-1.png', fullPage: false })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    await page.mouse.click(canvasInfo.x + canvasInfo.w * 0.50, canvasInfo.y + canvasInfo.h * 0.55)
    await page.waitForTimeout(700)
    await dumpDrawer(page, 'after click #2 (back wall area)')
    await page.screenshot({ path: 'D:/tmp/wallhot-after-click-2.png', fullPage: false })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    await page.mouse.click(canvasInfo.x + canvasInfo.w * 0.82, canvasInfo.y + canvasInfo.h * 0.55)
    await page.waitForTimeout(700)
    await dumpDrawer(page, 'after click #3 (right wall area)')
    await page.screenshot({ path: 'D:/tmp/wallhot-after-click-3.png', fullPage: false })
  }

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})