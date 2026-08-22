// 诊断：页面加载 site1 模型时的 DOM/控制台/网络状态
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:5173/?model=/models/site1/%E5%A4%A7%E5%8E%85.glb'
const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
page.on('console', (m) => console.log('[console]', m.text().slice(0, 160)))
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 250)))
page.on('requestfailed', (r) => console.log('[请求失败]', r.url().slice(-70), r.failure()?.errorText))
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(Number(process.argv[3] ?? 20000))
const state = await page.evaluate(() => ({
  overlayButton: !!document.querySelector('button[aria-label="关闭"]'),
  bodyText: (document.body.innerText || '').slice(0, 200),
  gltfScene: !!window.__gltfScene,
  worldLayout: !!window.__worldLayout,
}))
console.log('[状态]', JSON.stringify(state))
await page.screenshot({ path: '.tmp-site1/diag.png' })
console.log('[截图] .tmp-site1/diag.png')
await browser.close()
