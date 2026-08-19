// 新模型(0817)预览截图：初始视角 + 前行 + 漫游 + 照片查看器
import { chromium } from 'playwright-core'

const MODEL = process.argv[2] || 'preview-0817.glb'
const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text().slice(0, 160)))
page.on('pageerror', (error) => errors.push(String(error).slice(0, 160)))

const started = Date.now()
await page.goto(`http://localhost:5173/?model=/models/${MODEL}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
try {
  await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
  console.log(`加载就绪: ${((Date.now() - started) / 1000).toFixed(1)}s`)
  await page.click('button[aria-label="关闭"]')
} catch {
  console.log('帮助浮层未出现（可能场景加载失败）')
}
await page.waitForTimeout(3000)
await page.screenshot({ path: '.tmp-ktx/preview-1.png' })

// 直行看中央
await page.keyboard.down('KeyW')
await page.waitForTimeout(5000)
await page.keyboard.up('KeyW')
await page.waitForTimeout(2000)
await page.screenshot({ path: '.tmp-ktx/preview-2.png' })

// 漫游两帧
const roamButton = page.locator('button', { hasText: '自主漫游' }).first()
if (await roamButton.count()) {
  await roamButton.click()
  await page.waitForTimeout(30000)
  await page.screenshot({ path: '.tmp-ktx/preview-3.png' })
  await page.waitForTimeout(30000)
  await page.screenshot({ path: '.tmp-ktx/preview-4.png' })
}

// 照片查看器盲点测试
let opened = false
for (let round = 0; round < 6 && !opened; round += 1) {
  await page.waitForTimeout(4000)
  for (const [x, y] of [[640, 250], [500, 280], [780, 280]]) {
    await page.mouse.click(x, y)
    await page.waitForTimeout(1200)
    if (await page.locator('.ant-image-preview img').first().count()) {
      opened = true
      break
    }
  }
}
if (opened) {
  const natural = await page.locator('.ant-image-preview img').first().evaluate((img) => `${img.naturalWidth}x${img.naturalHeight}`)
  console.log(`照片查看器: 打开成功 (${natural})`)
  await page.screenshot({ path: '.tmp-ktx/preview-5.png' })
} else {
  console.log('照片查看器: 本轮漫游未命中可点照片')
}

console.log(errors.length ? `异常 ${errors.length} 条:\n  ${errors.slice(0, 4).join('\n  ')}` : '无控制台错误')
await browser.close()
