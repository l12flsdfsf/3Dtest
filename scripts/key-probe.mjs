// 键盘事件链路探测：合成事件 vs Playwright 真实事件
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('console', (msg) => {
  const text = msg.text()
  if (text.includes('[key]') || text.includes('[perf]')) console.log('   ', text)
})
await page.goto('http://localhost:5173/?model=/models/preview-0817-compat.glb', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]')
await page.waitForFunction(() => window.__playerDebug?.collision === true, null, { timeout: 60000 })

// 1. 页面内合成事件
const synthetic = await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }))
  const s1 = window.__playerDebug ? { ...window.__playerDebug } : null
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }))
  return s1
})
console.log('合成keydown后:', JSON.stringify(synthetic))
await page.waitForTimeout(300)

// 2. 全局监听计数器（下一个key事件能否到window）
await page.evaluate(() => {
  window.__keyCount = 0
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyW') window.__keyCount += 1
  }, { capture: true, once: false })
})
await page.keyboard.down('KeyW')
await page.waitForTimeout(400)
const real = await page.evaluate(() => ({ count: window.__keyCount, debug: window.__playerDebug }))
await page.keyboard.up('KeyW')
console.log('Playwright真实keydown:', JSON.stringify(real))

// 3. 当前焦点元素
const focus = await page.evaluate(() => ({
  tag: document.activeElement?.tagName,
  cls: String(document.activeElement?.className).slice(0, 60),
}))
console.log('焦点元素:', JSON.stringify(focus))
await browser.close()
