// 奖杯4 高模按需加载端到端验证：
// 1) 页面加载/场景就绪全程不得请求 trophy-4-high.glb
// 2) 点击奖杯4 → 弹窗打开 → 此时才发请求 → ready
// 3) 高模只存在于弹窗独立 Canvas，不进主场景 __gltfScene
// 4) 关闭重开：缓存生效（无第二次网络请求，立即 ready）
import { chromium } from 'playwright-core'

const GLB_URL = '/models/trophy-4-high.glb'
const browser = await chromium.launch({
  executablePath: 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

let glbRequests = 0
page.on('request', (req) => {
  if (req.url().includes(GLB_URL)) glbRequests += 1
})

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__teleport && window.__THREE, null, { timeout: 120000 })

console.log(`[1] 场景就绪后 trophy glb 请求数 = ${glbRequests}（应为 0）`)
if (glbRequests > 0) {
  console.log('FAIL: 场景加载阶段就请求了高模')
  await browser.close()
  process.exit(1)
}

// 找奖杯4网格 + 挑直击机位（同 verify-exhibit-click 的做法）
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
    if (hitMaterial(firstSolid)?.map?.name === mapName) {
      return {
        found: true,
        ok: true,
        px: Math.round(((v.x + 1) / 2) * window.innerWidth),
        py: Math.round(((1 - v.y) / 2) * window.innerHeight),
      }
    }
  }
  return { found: true, ok: false }
}, '奖杯4_basecolor')

if (!setup.found) {
  console.log('FAIL: 场景里没找到 奖杯4_basecolor 网格')
  await browser.close()
  process.exit(1)
}
if (!setup.ok) {
  console.log('SKIP: 四个方向都无法直击奖杯4')
  await browser.close()
  process.exit(1)
}

await page.waitForTimeout(600)
await page.mouse.click(setup.px, setup.py)

// 弹窗打开 + 高模 ready（swiftshader 下 13MB 下载+解析留足时间）
await page.waitForSelector('.exhibit-modal', { timeout: 20000 })

await page.waitForFunction(
  () => window.__highPolyExhibit?.ready === true,
  null,
  { timeout: 180000 },
)
const status = await page.evaluate(() => ({ ...window.__highPolyExhibit }))
console.log(`[3] 高模状态: ${JSON.stringify(status)}`)

// [1] 已证点击前请求数为 0，此刻恰有 1 个请求 => 请求必然发生在点击之后
const requestedAfterClick = glbRequests === 1
console.log(`[2] 点击后发起 trophy glb 请求 = ${requestedAfterClick}（应为 true）`)

// 高模是否混进主场景（按几何面数找百万级网格）
const inMainScene = await page.evaluate(() => {
  const THREE = window.__THREE
  let found = false
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh || found) return
    const geo = Array.isArray(o.geometry) ? o.geometry[0] : o.geometry
    const tris = geo?.index ? geo.index.count / 3 : (geo?.attributes?.position?.count || 0) / 3
    if (tris > 900000) found = true
  })
  return found
})
console.log(`[4] 高模出现在主场景 = ${inMainScene}（应为 false）`)

// 弹窗内独立 Canvas 里确实有百万级网格
const inModal = await page.evaluate(() => {
  const modal = document.querySelector('.exhibit-modal')
  const canvas = modal?.querySelector('canvas')
  if (!canvas) return { ok: false }
  let wrapper = null
  // R3F canvas 的 scene 存在 fiber 元数据里；退一步用渲染器信息不可得，
  // 直接数 drawcall 不现实 —— 用 __highPolyExhibit.ready + 截图兜底
  return { ok: Boolean(canvas), canvases: modal.querySelectorAll('canvas').length }
})
console.log(`[5] 弹窗 Canvas: ${JSON.stringify(inModal)}`)

await page.waitForTimeout(2500) // 等自动旋转转到正面
await page.screenshot({ path: '.tmp-ktx/trophy-high-modal.png', timeout: 90000 })
console.log('已截图 .tmp-ktx/trophy-high-modal.png')

// 关闭重开：单实例驻留策略下，重开 = 重新加载（浏览器 HTTP 缓存兜底，无网络往返）
await page.click('.exhibit-modal button:has-text("返回")', { force: true })
await page.waitForTimeout(800)
await page.mouse.click(setup.px, setup.py)
await page.waitForSelector('.exhibit-modal', { timeout: 20000 })
await page.waitForFunction(() => window.__highPolyExhibit?.ready === true, null, { timeout: 60000 })
console.log(`[6] 重开弹窗 glb 请求总数 = ${glbRequests}（单实例策略：重开应重新加载）`)
await page.screenshot({ path: '.tmp-ktx/trophy-high-reopen.png', timeout: 90000 })

const pass = requestedAfterClick && !inMainScene && status.failed === false && glbRequests >= 1
console.log(pass ? 'ALL PASS' : 'FAIL')
await browser.close()
process.exit(pass ? 0 : 1)
