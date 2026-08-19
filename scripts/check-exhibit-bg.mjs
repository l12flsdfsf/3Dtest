import { chromium } from 'playwright-core'
const browser = await chromium.launch({
  executablePath: 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__teleport && window.__THREE, null, { timeout: 120000 })
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
const imgState = await page.evaluate(() => {
  const img = document.querySelector('.exhibit-modal img')
  if (!img) return { exists: false }
  const cs = getComputedStyle(img)
  return { exists: true, src: img.getAttribute('src'), natural: `${img.naturalWidth}x${img.naturalHeight}`, complete: img.complete, displayed: `${cs.width}x${cs.height}`, opacity: cs.opacity, z: cs.zIndex }
})
console.log('背景图状态:', JSON.stringify(imgState))
await browser.close()
