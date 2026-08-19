// 诊断新模型加载：抓 console/网络进度，不截图（防渲染进程假死拖垮脚本）
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } })
page.on('console', (msg) => {
  const text = msg.text().slice(0, 180)
  if (!/PCFSoftShadowMap|Warning: \[antd/.test(text)) console.log(`[${msg.type()}] ${text}`)
})
page.on('pageerror', (error) => console.log('[pageerror]', String(error).slice(0, 200)))
page.on('response', (res) => {
  if (res.url().includes('preview-0817')) console.log(`[net] ${res.url().split('/').pop()} ${res.status()}`)
})

console.log('开始加载 preview-0817.glb ...')
await page.goto('http://localhost:5173/?model=/models/preview-0817.glb', { waitUntil: 'domcontentloaded', timeout: 60000 })

for (let second = 0; second <= 90; second += 15) {
  await page.waitForTimeout(second === 0 ? 15000 : 15000)
  const state = await page.evaluate(() => ({
    overlay: document.querySelector('[class*=loading]') ? '加载中' : '无加载层',
    hasClose: Boolean(document.querySelector('button[aria-label="关闭"]')),
  })).catch(() => '页面无响应')
  console.log(`t=${second + 15}s`, JSON.stringify(state))
}
await browser.close()
