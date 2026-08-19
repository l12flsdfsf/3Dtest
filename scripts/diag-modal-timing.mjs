// 监听 exhibit modal 的出现/消失时序 + antd 版本
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

const antdVersion = await page.evaluate(() => {
  const el = document.querySelector('.ant-modal-root')
  return { hasRoot: Boolean(el), antBtn: Boolean(document.querySelector('.ant-btn')) }
})

await page.evaluate(() => {
  window.__modalLog = []
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType === 1) {
          if (n.classList?.contains('ant-modal-content') || n.querySelector?.('.ant-modal-content')) {
            window.__modalLog.push({ t: performance.now() | 0, ev: 'content-added', cls: n.className?.toString().slice(0, 40) })
          }
        }
      }
      for (const n of r.removedNodes) {
        if (n.nodeType === 1 && (n.classList?.contains('ant-modal-content') || n.querySelector?.('.ant-modal-content'))) {
          window.__modalLog.push({ t: performance.now() | 0, ev: 'content-removed' })
        }
      }
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
})

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
})
await page.waitForTimeout(600)
await page.mouse.click(640, 360)
await page.waitForTimeout(2500)

const result = await page.evaluate(() => ({
  openCalls: window.__openExhibitCalls ?? 0,
  modalName: window.__exhibitModalName ?? null,
  contentNow: Boolean(document.querySelector('.ant-modal-content')),
  modalText: document.querySelector('.ant-modal-content')?.textContent?.slice(0, 30) ?? null,
}))
console.log(JSON.stringify(result, null, 1))
await browser.close()
