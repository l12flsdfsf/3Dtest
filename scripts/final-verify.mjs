// 最终验证：默认配置（无 ?model 参数）加载 + 照片查看器 + 截图
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text().slice(0, 200)))
page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)))
page.on('response', (res) => res.status() === 404 && errors.push(`404: ${res.url().slice(-60)}`))

const started = Date.now()
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
console.log(`默认模型加载就绪: ${((Date.now() - started) / 1000).toFixed(1)}s`)
await page.click('button[aria-label="关闭"]')
await page.waitForTimeout(2000)
await page.screenshot({ path: '.tmp-ktx/final-1.png' })

// 漫游 + 盲点开照片查看器
const roamButton = page.locator('button', { hasText: '自主漫游' }).first()
await roamButton.click()
let opened = false
for (let round = 0; round < 8 && !opened; round += 1) {
  await page.waitForTimeout(4500)
  for (const [x, y] of [[640, 250], [500, 280], [780, 280], [640, 380]]) {
    await page.mouse.click(x, y)
    await page.waitForTimeout(1400)
    if (await page.locator('.ant-image-preview img').first().count()) {
      opened = true
      break
    }
  }
}
console.log(`照片查看器: ${opened ? '正常打开' : '未打开(漫游路线未命中可点照片)'}`)
if (opened) {
  const natural = await page.locator('.ant-image-preview img').first().evaluate((img) => `${img.naturalWidth}x${img.naturalHeight}`)
  console.log(`查看原图分辨率: ${natural}`)
  await page.screenshot({ path: '.tmp-ktx/final-2.png' })
}
console.log(errors.length ? `异常 ${errors.length} 条:\n  ${errors.slice(0, 5).join('\n  ')}` : '无控制台错误/404')
await browser.close()
