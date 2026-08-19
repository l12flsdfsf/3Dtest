// 用真实 GPU 的无头浏览器预览（不走 swiftshader）
import { chromium } from 'playwright-core'

const MODEL = process.argv[2] || 'preview-0817.glb'
const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader'], // d3d11 优先真卡，失败回落
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('console', (msg) => {
  const text = msg.text().slice(0, 160)
  if (/PCFSoftShadowMap|Warning: \[antd|React DevTools/.test(text)) return
  if (msg.type() === 'error') errors.push(text)
})
page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)))

const started = Date.now()
await page.goto(`http://localhost:5173/?model=/models/${MODEL}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
try {
  await page.waitForSelector('button[aria-label="关闭"]', { timeout: 240000 })
  console.log(`加载就绪: ${((Date.now() - started) / 1000).toFixed(1)}s`)
  await page.click('button[aria-label="关闭"]')
} catch {
  console.log('帮助浮层未出现（加载失败）')
}
await page.waitForTimeout(3000)
await page.screenshot({ path: '.tmp-ktx/gpu-1.png' })

await page.keyboard.down('KeyW')
await page.waitForTimeout(5000)
await page.keyboard.up('KeyW')
await page.waitForTimeout(2000)
await page.screenshot({ path: '.tmp-ktx/gpu-2.png' })

const roamButton = page.locator('button', { hasText: '自主漫游' }).first()
if (await roamButton.count()) {
  await roamButton.click()
  await page.waitForTimeout(25000)
  await page.screenshot({ path: '.tmp-ktx/gpu-3.png' })
}
console.log(errors.length ? `异常 ${errors.length} 条:\n  ${errors.slice(0, 4).join('\n  ')}` : '无控制台错误')
await browser.close()
