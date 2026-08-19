// 诊断点击链路：DOM elementFromPoint + canvas 事件监听 + 点击后检查
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('console', (msg) => console.log('[页面]', msg.text().slice(0, 150)))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__teleport && window.__THREE, null, { timeout: 120000 })

const prep = await page.evaluate(() => {
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

  const canvas = document.querySelector('canvas')
  const log = []
  for (const type of ['pointerdown', 'pointerup', 'click']) {
    canvas.addEventListener(type, (e) => log.push(`${type}@${e.clientX},${e.clientY}`))
  }
  window.__clickLog = log

  const el = document.elementFromPoint(640, 360)
  return {
    element: el ? `${el.tagName}.${el.className?.toString().slice(0, 40)}` : null,
    canvasRect: canvas.getBoundingClientRect().toJSON(),
  }
})
console.log('屏幕中心元素:', JSON.stringify(prep))
await page.waitForTimeout(600)
await page.mouse.move(640, 360)
await page.mouse.down()
await page.waitForTimeout(80)
await page.mouse.up()
await page.waitForTimeout(1500)
const after = await page.evaluate(() => ({
  events: window.__clickLog,
  modalRoots: document.querySelectorAll('.ant-modal-root').length,
  exhibitEl: Boolean(document.querySelector('.exhibit-modal')),
  exhibitContent: Boolean(document.querySelector('.exhibit-modal .ant-modal-content')),
  bodyTailClass: document.body.lastElementChild?.className?.toString().slice(0, 60) ?? null,
  dispatches: window.__clickDispatches ?? null,
}))
console.log('canvas 收到的事件:', JSON.stringify(after.events))
console.log(`modal roots=${after.modalRoots} exhibit-root=${after.exhibitEl} content=${after.exhibitContent} body尾节点=${after.bodyTailClass}`)
console.log('R3F 分发:', JSON.stringify(after.dispatches))
await browser.close()
