// 定位"进大厅右侧门框被染白"的光晕：从初始视角分别向右/向左转约 90°，
// 截图 + 对光晕区域做射线探测（找门框网格与附近光源）
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
await page.waitForFunction(() => window.__gltfScene && window.__camera, null, { timeout: 120000 })
await page.waitForTimeout(4000)

const drag = async (fromX, toX) => {
  await page.mouse.move(640, 360)
  await page.mouse.down()
  await page.mouse.move(toX, 360, { steps: 25 })
  await page.mouse.up()
  await page.waitForTimeout(2000)
}

// 向右看（拖拽方向与视角转向相反，两种都试）
await drag(640, 1200)
await page.screenshot({ path: '.tmp-ktx/halo-right-a.png', timeout: 90000 })
console.log('右转A完成')

// 回中再向另一侧
await drag(1200, 80)
await page.screenshot({ path: '.tmp-ktx/halo-right-b.png', timeout: 90000 })
console.log('左转B完成')

// 记录当前相机位姿与朝向
const pose = await page.evaluate(() => {
  const dir = window.__camera.getWorldDirection(new window.__THREE.Vector3())
  return { pos: window.__camera.position.toArray().map((v) => +v.toFixed(1)), dir: dir.toArray().map((v) => +v.toFixed(2)) }
})
console.log('当前相机:', JSON.stringify(pose))
await browser.close()
