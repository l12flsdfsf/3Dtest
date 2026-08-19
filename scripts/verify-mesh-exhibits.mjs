// 验证按 mesh 名接入的展品：四方向 × 屏幕网格扫描，找到能直击目标的像素并点击
import { chromium } from 'playwright-core'

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['mesh_rep_0_ori_repair_quad', 'Box003', 'pCube229']
const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (error) => console.log('[pageerror]', String(error?.message || error).slice(0, 200)))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__teleport && window.__THREE, null, { timeout: 120000 })

for (const [index, meshName] of targets.entries()) {
  const setup = await page.evaluate((meshName) => {
    const THREE = window.__THREE
    const target = window.__gltfScene.getObjectByName(meshName)
    if (!target || !target.isMesh) return { found: false }

    target.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(target)
    const center = box.getCenter(new THREE.Vector3())
    const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z)

    const hitMaterial = (h) => {
      const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material]
      const idx = h.face?.materialIndex
      return Number.isInteger(idx) && mats[idx] ? mats[idx] : mats[0]
    }
    const firstSolid = (raycaster) =>
      raycaster.intersectObject(window.__gltfScene, true).find((h) => {
        const m = hitMaterial(h)
        return !(m?.name?.includes('玻璃') || (m?.transparent && m.opacity <= 0.6))
      })

    const raycaster = new THREE.Raycaster()
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    for (const [dx, dz] of dirs) {
      const dist = Math.max(1.2, span * 1.9)
      window.__teleport(
        { x: center.x + dx * dist, y: 1.72, z: center.z + dz * dist },
        { x: center.x, y: center.y, z: center.z },
      )
      window.__camera.updateMatrixWorld()

      // 屏幕网格扫描：找首个实体命中 == 目标网格的像素
      for (let nx = -0.5; nx <= 0.5; nx += 0.125) {
        for (let ny = -0.4; ny <= 0.4; ny += 0.1) {
          raycaster.setFromCamera(new THREE.Vector2(nx, ny), window.__camera)
          const solid = firstSolid(raycaster)
          if (solid && solid.object.name === meshName) {
            return {
              found: true,
              ok: true,
              px: Math.round(((nx + 1) / 2) * window.innerWidth),
              py: Math.round(((1 - ny) / 2) * window.innerHeight),
            }
          }
        }
      }
    }
    return { found: true, ok: false }
  }, meshName)

  if (!setup.found) {
    console.log(`[${meshName}] FAIL: 场景里没找到`)
    continue
  }
  if (!setup.ok) {
    console.log(`[${meshName}] SKIP: 四方向扫描均无法直击`)
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
      text: el?.textContent?.slice(0, 40) ?? '',
    }
  })
  const pass = state.open && state.canvases >= 1
  console.log(`[${meshName}] ${pass ? 'PASS' : 'FAIL'} -> ${JSON.stringify(state.text)}`)
  if (pass && index === 0) {
    await page.screenshot({ path: '.tmp-ktx/scan-exhibit.png', timeout: 90000 })
    console.log('  已截图 scan-exhibit.png')
  }
  if (state.open) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }
}
await browser.close()
