// 诊断 Box003（留声机组）：悬停提示 + 点击分发
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('console', (msg) => {
  const text = msg.text()
  if (text.includes('error') || text.includes('Error') || text.includes('失败')) console.log('[页面]', text.slice(0, 160))
})
page.on('pageerror', (error) => console.log('[pageerror]', String(error?.message || error).slice(0, 300)))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__teleport && window.__THREE, null, { timeout: 120000 })

const setup = await page.evaluate(() => {
  const THREE = window.__THREE
  const target = window.__gltfScene.getObjectByName('Box003')
  if (!target) return { found: false }
  target.updateWorldMatrix(true, false)
  const box = new THREE.Box3().setFromObject(target)
  const center = box.getCenter(new THREE.Vector3())

  const hitMaterial = (h) => {
    const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material]
    const idx = h.face?.materialIndex
    return Number.isInteger(idx) && mats[idx] ? mats[idx] : mats[0]
  }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    window.__teleport(
      { x: center.x + dx * 1.3, y: Math.max(1.1, center.y + 0.3), z: center.z + dz * 1.3 },
      { x: center.x, y: center.y, z: center.z },
    )
    window.__camera.updateMatrixWorld()
    const v = new THREE.Vector3(center.x, center.y, center.z).project(window.__camera)
    const raycaster = new THREE.Raycaster()
    raycaster.setFromCamera(new THREE.Vector2(v.x, v.y), window.__camera)
    const hits = raycaster.intersectObject(window.__gltfScene, true).slice(0, 6)
    const solid = hits.find((h) => {
      const m = hitMaterial(h)
      return !(m?.name?.includes('玻璃') || (m?.transparent && m.opacity <= 0.6))
    })
    if (solid?.object.name === 'Box003') {
      return {
        found: true,
        px: Math.round(((v.x + 1) / 2) * window.innerWidth),
        py: Math.round(((1 - v.y) / 2) * window.innerHeight),
        allHits: hits.map((h) => `${h.object.name}|${hitMaterial(h)?.name}|${hitMaterial(h)?.map?.name || ''}`),
      }
    }
    // 记录首个可用方向的所有命中，便于诊断
    if (dx === 1) window.__firstDirHits = hits.map((h) => `${h.object.name}|${hitMaterial(h)?.name}|${hitMaterial(h)?.map?.name || ''}`)
  }
  return { found: true, ok: false, firstDirHits: window.__firstDirHits }
})
console.log('Box003 setup:', JSON.stringify(setup).slice(0, 600))

if (setup.ok !== false) {
  // 悬停
  await page.mouse.move(setup.px, setup.py)
  await page.waitForTimeout(800)
  const hover = await page.evaluate(() => ({
    cursor: document.body.style.cursor,
    tipVisible: (() => {
      const el = document.querySelector('.hover-tip')
      if (!el) return null
      return el.style.opacity !== '0' ? el.textContent : null
    })(),
  }))
  console.log('悬停状态:', JSON.stringify(hover))
  // 点击
  await page.mouse.click(setup.px, setup.py)
  await page.waitForTimeout(1200)
  const modal = await page.evaluate(() => {
    const el = document.querySelector('.exhibit-modal')
    return { text: el ? el.textContent?.slice(0, 40) : null, dispatches: window.__clickDbg ?? null, debug: window.__exhibitDebug ?? null }
  })
  console.log('点击后弹窗:', JSON.stringify(modal))
}
await browser.close()
