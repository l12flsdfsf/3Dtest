// 广播厅四设备就位状态截图:西墙柜员视角逐台拍 + 全墙全景
// 用法: node scripts/site1-device-shots.mjs
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const VIEWS = [
  { key: 'amp', pos: [-18.6, 1.6, -1.5], look: [-21.89, 1.2, -1.51] }, // 声频功率放大器
  { key: 'fm', pos: [-18.6, 1.6, 0.66], look: [-21.83, 1.2, 0.66] }, // 调频收转机
  { key: 'radio', pos: [-18.6, 1.6, 6.62], look: [-21.77, 1.15, 6.62] }, // 晶体管收音机
  { key: 'haiyan8', pos: [-18.6, 1.6, 8.71], look: [-21.8, 1.2, 8.71] }, // 海燕8
  { key: 'wall-wide', pos: [-16, 1.8, 3.5], look: [-22.2, 1.1, 3.5] }, // 西墙全景(南向北)
  { key: 'wall-wide2', pos: [-16, 1.8, 8.5], look: [-22.2, 1.1, 5.0] }, // 西墙中北段
]

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('[页面异常]', String(e).slice(0, 200)))
await page.goto('http://localhost:5173/?model=%2Fmodels%2Fsite1%2Fscene-site1.glb', {
  waitUntil: 'domcontentloaded',
  timeout: 60000,
})
await page.waitForFunction(() => document.querySelector('button[aria-label="关闭"]'), null, { timeout: 300000 })
await page.evaluate(() => {
  document.querySelectorAll('button[aria-label="关闭"]').forEach((b) => b.click())
})
await page.waitForFunction(() => window.__gltfScene && window.__camera, null, { timeout: 300000 })

fs.mkdirSync('.tmp-site1', { recursive: true })
for (const view of VIEWS) {
  await page.evaluate(([pos, look]) => {
    const camera = window.__camera
    camera.position.set(...pos)
    camera.lookAt(...look)
    camera.updateMatrixWorld()
    if (window.__THREE) window.__THREE.MathUtils // 保持引用
  }, [view.pos, view.look])
  await page.waitForTimeout(1200)
  // 再压一次防自动漫游抢镜(踩坑记录)
  await page.evaluate(([pos, look]) => {
    const camera = window.__camera
    camera.position.set(...pos)
    camera.lookAt(...look)
    camera.updateMatrixWorld()
  }, [view.pos, view.look])
  await page.waitForTimeout(1800)
  // playwright screenshot 会挂在 waiting for fonts(已知坑),走 CDP 直拍
  const cdp = await page.context().newCDPSession(page)
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(`.tmp-site1/dev-${view.key}.png`, Buffer.from(shot.data, 'base64'))
  await cdp.detach()
  console.log(view.key, '✓')
}
await browser.close()
