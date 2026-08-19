// 快速探测：页面加载到什么状态、控制台说了什么
import { chromium } from 'playwright-core'

const MODEL = process.argv[2] || 'preview-0817-compat.glb'
const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } })
page.on('console', (msg) => {
  const text = msg.text().slice(0, 200)
  if (!/PCFSoftShadowMap|Warning: \[antd|React DevTools|THREE.Clock/.test(text)) console.log(`[${msg.type()}] ${text}`)
})
page.on('pageerror', (error) => console.log('[pageerror]', String(error).slice(0, 300)))
page.on('requestfailed', (req) => console.log('[reqfail]', req.url().split('/').pop(), req.failure()?.errorText))

await page.goto(`http://localhost:5175/?model=/models/${MODEL}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
for (let i = 0; i < 8; i += 1) {
  await page.waitForTimeout(10000)
  const state = await page
    .evaluate(() => ({
      overlay: document.body.innerText.match(/(\d+%|正在进入展厅)/)?.[0] || '已就绪',
      close: !!document.querySelector('button[aria-label="关闭"]'),
      player: window.__playerDebug || null,
    }))
    .catch(() => '页面无响应')
  console.log(`t=${(i + 1) * 10}s`, JSON.stringify(state))
}
await browser.close()
