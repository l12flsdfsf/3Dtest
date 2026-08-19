// 通用展品点击验证：对给定贴图名的展品，自动挑选能直击它的机位，点击并检查查看器
import { chromium } from 'playwright-core'

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['录像机_basecolor', '奖杯1_basecolor', '手摇式录音机_basecolor']
const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__teleport && window.__THREE, null, { timeout: 120000 })

for (const [index, mapName] of targets.entries()) {
  // 找网格 + 挑一个能直击的方向
  const setup = await page.evaluate((mapName) => {
    const THREE = window.__THREE
    let target = null
    window.__gltfScene.traverse((o) => {
      if (target || !o.isMesh) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      if (mats.some((m) => m?.map?.name === mapName)) target = o
    })
    if (!target) return { found: false }

    target.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(target)
    const center = box.getCenter(new THREE.Vector3())

    // 从 4 个水平方向试：射线（滤玻璃后）首个命中的材质贴图 == 目标贴图才算直击
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const camPos = new THREE.Vector3(center.x + dx * 1.9, Math.max(1.1, center.y + 0.35), center.z + dz * 1.9)
      window.__teleport({ x: camPos.x, y: camPos.y, z: camPos.z }, { x: center.x, y: center.y, z: center.z })
      window.__camera.updateMatrixWorld()
      const v = new THREE.Vector3(center.x, center.y, center.z).project(window.__camera)
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(v.x, v.y), window.__camera)
      const hits = raycaster.intersectObject(window.__gltfScene, true)
      const hitMaterial = (h) => {
        const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material]
        const idx = h.face?.materialIndex
        return Number.isInteger(idx) && mats[idx] ? mats[idx] : mats[0]
      }
      const firstSolid = hits.find((h) => {
        const m = hitMaterial(h)
        const name = m?.name || ''
        return !(name.includes('玻璃') || (m?.transparent && m.opacity <= 0.6))
      })
      const fm = firstSolid ? hitMaterial(firstSolid) : null
      if (fm?.map?.name === mapName) {
        return {
          found: true,
          ok: true,
          px: Math.round(((v.x + 1) / 2) * window.innerWidth),
          py: Math.round(((1 - v.y) / 2) * window.innerHeight),
        }
      }
    }
    return { found: true, ok: false }
  }, mapName)

  if (!setup.found) {
    console.log(`[${mapName}] FAIL: 场景里没找到网格`)
    continue
  }
  if (!setup.ok) {
    console.log(`[${mapName}] SKIP: 四个方向都无法直击（被遮挡）`)
    continue
  }

  await page.waitForTimeout(600)
  await page.mouse.click(setup.px, setup.py)
  await page.waitForTimeout(1300)
  const state = await page.evaluate(() => {
    const el = document.querySelector('.exhibit-modal')
    return {
      open: Boolean(el),
      canvases: el ? el.querySelectorAll('canvas').length : 0,
      text: el?.textContent?.slice(0, 46) ?? '',
    }
  })
  const pass = state.open && state.canvases >= 1
  console.log(`[${mapName}] ${pass ? 'PASS' : 'FAIL'} -> ${JSON.stringify(state.text)}`)
  if (pass && index === 1) {
    await page.screenshot({ path: `.tmp-ktx/exhibit-all-${index}.png`, timeout: 90000 })
    console.log(`  已截图 exhibit-all-${index}.png`)
  }
  if (state.open) {
    await page.click('.exhibit-modal button:has-text("返回")', { force: true })
    await page.waitForTimeout(500)
  }
}
await browser.close()
