// A/B 对比截图：原版 scene.gltf vs 压缩版 scene.ktx2.glb
//
// 用法：node scripts/ab-screenshot.mjs [模型名1] [模型名2]
// 默认对比 scene.gltf 与 scene.ktx2.glb，各截初始视角 + 转身视角两张。
// 产物：.tmp-ktx/ab-<模型>-<序号>.png

import { chromium } from 'playwright-core'

const MODELS = process.argv.slice(2).length ? process.argv.slice(2) : ['scene.gltf', 'scene.ktx2.glb']
const BASE = 'http://localhost:5173'
const OUT_DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') + '../.tmp-ktx/'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})

for (const model of MODELS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 200))
  })
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)))

  const label = model.replace(/\./g, '-')
  const started = Date.now()
  await page.goto(`${BASE}/?model=/models/${model}`, { waitUntil: 'domcontentloaded', timeout: 60000 })

  // 场景就绪信号：帮助浮层自动打开（出现关闭按钮）
  await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
  await page.click('button[aria-label="关闭"]')
  await page.waitForTimeout(3000)
  console.log(`${model}: 加载+就绪 ${((Date.now() - started) / 1000).toFixed(1)}s`)

  await page.screenshot({ path: `${OUT_DIR}ab-${label}-1.png` })

  // 转身看另一侧：拖拽鼠标旋转视角
  await page.mouse.move(640, 360)
  await page.mouse.down()
  await page.mouse.move(940, 360, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT_DIR}ab-${label}-2.png` })

  // 开启自主漫游，让相机沿导览路径经过照片墙，途中再取两帧
  const roamButton = page.locator('button', { hasText: '自主漫游' }).first()
  if (await roamButton.count()) {
    await roamButton.click()
    await page.waitForTimeout(35000)
    await page.screenshot({ path: `${OUT_DIR}ab-${label}-3.png` })
    await page.waitForTimeout(35000)
    await page.screenshot({ path: `${OUT_DIR}ab-${label}-4.png` })
  }

  if (errors.length) {
    console.log(`${model} 控制台错误(${errors.length}):`)
    for (const error of errors.slice(0, 5)) console.log('  ' + error)
  } else {
    console.log(`${model}: 无控制台错误`)
  }
  await page.close()
}

await browser.close()
console.log('完成')
