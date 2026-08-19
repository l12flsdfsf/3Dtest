// 确定性近景对比：加载后关帮助 → 按 W 直行 6 秒 → 截图（两张机位）
// 用法：node scripts/ab-walk.mjs
import { chromium } from 'playwright-core'

const MODELS = ['scene.gltf', 'scene.ktx2.glb']
const OUT_DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') + '../.tmp-ktx/'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})

for (const model of MODELS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(`http://localhost:5173/?model=/models/${model}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
  await page.click('button[aria-label="关闭"]')
  await page.waitForTimeout(2000)

  // 直行：按住 W 6 秒（步进模拟真实按键时长，dt 驱动位移）
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(6000)
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT_DIR}walk-${model.replace(/\./g, '-')}-a.png` })

  // 再左转视角看侧墙：拖拽
  await page.mouse.move(640, 360)
  await page.mouse.down()
  await page.mouse.move(240, 360, { steps: 16 })
  await page.mouse.up()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT_DIR}walk-${model.replace(/\./g, '-')}-b.png` })

  console.log(`${model} 完成`)
  await page.close()
}
await browser.close()
