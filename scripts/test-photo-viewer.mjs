// 照片查看器功能测试 v3：自主漫游巡馆，途中对画面上部多个位置盲点，
// 每次点击后检测 antd 预览是否打开（照片 mesh 的 R3F onClick 不需要悬停光标）
import { chromium } from 'playwright-core'

const MODEL = process.argv[2] || 'scene.ktx2.glb'
const OUT_DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') + '../.tmp-ktx/'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
const errors = []
page.on('console', (msg) => msg.type() === 'error' && errors.push(msg.text().slice(0, 200)))
page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)))

await page.goto(`http://localhost:5173/?model=/models/${MODEL}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]')
await page.waitForTimeout(1500)

// 开启自主漫游
const roamButton = page.locator('button', { hasText: '自主漫游' }).first()
await roamButton.click()
await page.waitForTimeout(2000)

let opened = false
for (let round = 0; round < 8 && !opened; round += 1) {
  await page.waitForTimeout(4500)
  for (const [x, y] of [
    [640, 250],
    [500, 280],
    [780, 280],
    [640, 380],
  ]) {
    await page.mouse.click(x, y)
    await page.waitForTimeout(1400)
    if (await page.locator('.ant-image-preview img').first().count()) {
      opened = true
      break
    }
  }
}

if (opened) {
  const img = page.locator('.ant-image-preview img').first()
  const natural = await img.evaluate((el) => `${el.naturalWidth}x${el.naturalHeight}`)
  console.log(`预览已打开，原图分辨率: ${natural}`)
  await page.screenshot({ path: `${OUT_DIR}photo-${MODEL.replace(/\./g, '-')}-1.png` })
  await page.mouse.move(640, 360)
  await page.mouse.wheel(0, -800)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT_DIR}photo-${MODEL.replace(/\./g, '-')}-2.png` })
  console.log('缩放截图完成')
} else {
  console.log('漫游盲点未能打开预览')
  await page.screenshot({ path: `${OUT_DIR}photo-${MODEL.replace(/\./g, '-')}-fail.png` })
}

if (errors.length) {
  console.log(`控制台错误(${errors.length}):`)
  for (const error of errors.slice(0, 5)) console.log('  ' + error)
} else {
  console.log('无控制台错误')
}
await browser.close()
