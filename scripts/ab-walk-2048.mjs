// 2048 版与原版的确定性机位截图对比
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
for (const model of ['scene.gltf', 'scene.2048.ktx2.glb']) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(`http://localhost:5173/?model=/models/${model}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
  await page.click('button[aria-label="关闭"]')
  await page.waitForTimeout(2000)
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(6000)
  await page.keyboard.up('KeyW')
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `.tmp-ktx/w2048-${model.replace(/\./g, '-')}-a.png` })
  await page.mouse.move(640, 360)
  await page.mouse.down()
  await page.mouse.move(240, 360, { steps: 16 })
  await page.mouse.up()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `.tmp-ktx/w2048-${model.replace(/\./g, '-')}-b.png` })
  console.log(model, '完成')
  await page.close()
}
await browser.close()
