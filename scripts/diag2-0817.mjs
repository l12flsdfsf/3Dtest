// 聚焦诊断：加载 ktx2 版 0817，抓 console/网络，看卡在 0% 的原因
import { chromium } from 'playwright-core'

const MODEL = process.argv[2] || 'preview-0817-ktx2.glb'
const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } })
page.on('console', (msg) => {
  const text = msg.text().slice(0, 250)
  if (!/PCFSoftShadowMap|Warning: \[antd/.test(text)) console.log(`[${msg.type()}] ${text}`)
})
page.on('pageerror', (error) => console.log('[pageerror]', String(error).slice(0, 300)))
page.on('response', async (res) => {
  if (res.url().endsWith('.glb') || res.url().includes('basis')) {
    console.log(`[net] ${res.url().split('/').pop()} -> ${res.status()}`)
  }
})
page.on('requestfailed', (req) => console.log('[reqfail]', req.url().split('/').pop(), req.failure()?.errorText))

await page.goto(`http://localhost:5173/?model=/models/${MODEL}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
console.log('--- 监听中 ---')

for (let tick = 0; tick < 10; tick += 1) {
  await page.waitForTimeout(15000)
  const state = await page
    .evaluate(() => document.body.innerText.match(/展馆加载中[^\n]*|(\d+%)/)?.[0] || document.body.innerText.slice(0, 60))
    .catch(() => '页面无响应')
  console.log(`t=${(tick + 1) * 15}s 状态: ${state}`)
}
await browser.close()
