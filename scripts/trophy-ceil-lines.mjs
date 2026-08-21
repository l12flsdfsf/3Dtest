// 打印天花压暗实际拿到的墙顶线，检查奖杯墙（z≈-17）是否在内
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__mainHallCeilingShadows?.lines, null, { timeout: 180000 })
await page.waitForTimeout(1500)
const lines = await page.evaluate(() => window.__mainHallCeilingShadows.lines)
console.log('topX (墙面法向±x，span 沿 z):')
lines.topX.forEach((l) => console.log(` coord=${l.coord} span=[${l.span.join(', ')}] sign=${l.sign}`))
console.log('topZ (墙面法向±z，span 沿 x):')
lines.topZ.forEach((l) => console.log(` coord=${l.coord} span=[${l.span.join(', ')}] sign=${l.sign}`))
await browser.close()
