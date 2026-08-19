// 验证展品 3D 查看器：点击采访机 → 独立 Canvas 显示模型 → 拖拽旋转 → 关闭
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__teleport && window.__THREE, null, { timeout: 120000 })

// 对准采访机点击
await page.evaluate(() => {
  const THREE = window.__THREE
  let target = null
  window.__gltfScene.traverse((o) => {
    if (target || !o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    if (mats.some((m) => m?.map?.name === '采访机_basecolor')) target = o
  })
  target.updateWorldMatrix(true, false)
  const box = new THREE.Box3().setFromObject(target)
  const c = box.getCenter(new THREE.Vector3())
  window.__teleport({ x: c.x + 1.8, y: 1.55, z: c.z }, { x: c.x, y: c.y, z: c.z })
  window.__camera.updateMatrixWorld()
  const v = new THREE.Vector3(c.x, c.y, c.z).project(window.__camera)
  window.__aim = { px: Math.round(((v.x + 1) / 2) * window.innerWidth), py: Math.round(((1 - v.y) / 2) * window.innerHeight) }
})
await page.waitForTimeout(700)
await page.mouse.click(await page.evaluate(() => window.__aim.px), await page.evaluate(() => window.__aim.py))
await page.waitForTimeout(1500)

const state1 = await page.evaluate(() => {
  const modal = document.querySelector('.exhibit-modal')
  const canvases = modal ? modal.querySelectorAll('canvas').length : 0
  const text = modal?.textContent?.slice(0, 40)
  return { hasModal: Boolean(modal), canvases, text }
})
console.log(`弹窗: ${state1.hasModal} 弹窗内canvas数: ${state1.canvases} 文本: ${state1.text}`)
await page.screenshot({ path: '.tmp-ktx/exhibit-3d-a.png', timeout: 90000 })
console.log('已截图 exhibit-3d-a.png')

// 在弹窗画布上拖拽旋转（从画布中心向右下拖）
const canvasBox = await page.evaluate(() => {
  const c = document.querySelector('.exhibit-modal canvas')
  if (!c) return null
  const r = c.getBoundingClientRect()
  return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
})
if (canvasBox) {
  await page.mouse.move(canvasBox.cx - 80, canvasBox.cy - 50)
  await page.mouse.down()
  await page.mouse.move(canvasBox.cx + 60, canvasBox.cy + 40, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(1200)
  await page.screenshot({ path: '.tmp-ktx/exhibit-3d-b.png', timeout: 90000 })
  console.log('已截图 exhibit-3d-b.png（拖拽后）')
}

// 关闭（全屏查看器的「返回」按钮）
await page.click('.exhibit-modal button:has-text("返回")', { force: true })
await page.waitForTimeout(600)
const closed = await page.evaluate(() => !document.querySelector('.exhibit-modal'))
console.log(closed ? '查看器已关闭' : 'FAIL: 查看器未关闭')
await browser.close()
