// 光晕定位实验：1) 初始视角（面对大屏） 2) 转身 150°（背对大屏）
// 同时记录视频播放状态，判断光晕来自大屏还是屏幕空间效果
import { chromium } from 'playwright-core'
import fs from 'node:fs'

fs.mkdirSync('.tmp-ktx', { recursive: true })
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true })
await page.waitForFunction(() => window.__gltfScene && window.__camera && window.__screenVideo, null, { timeout: 120000 })
await page.waitForTimeout(5000)

const videoState = await page.evaluate(() => {
  const v = window.__screenVideo
  return { paused: v?.paused, time: +(v?.currentTime ?? 0).toFixed(1), w: v?.videoWidth, h: v?.videoHeight }
})
console.log('视频状态:', JSON.stringify(videoState))
await page.screenshot({ path: '.tmp-ktx/halo-facing.png', timeout: 90000 })
console.log('面对大屏截图完成')

// 拖拽转身约 150°：向一个方向大幅拖动
await page.mouse.move(640, 360)
await page.mouse.down()
await page.mouse.move(60, 360, { steps: 30 })
await page.mouse.up()
await page.waitForTimeout(2500)
await page.screenshot({ path: '.tmp-ktx/halo-turned.png', timeout: 90000 })
console.log('转身截图完成')
await browser.close()
