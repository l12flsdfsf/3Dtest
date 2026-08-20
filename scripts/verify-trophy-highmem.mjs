// 高模内存单实例驻留验证：
// 基线 → 开奖杯4（堆上升）→ 关闭（堆回落基线附近）→ 开奖杯3（堆≈开奖杯4水平，不叠加）
// → 关闭（回落）。heap 用 --enable-precise-memory-info + --expose-gc 强制 GC 后采样。
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
  args: [
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--enable-precise-memory-info',
    '--js-flags=--expose-gc',
  ],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 300)))

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__teleport && window.__THREE, null, { timeout: 120000 })

const heapMB = async () => {
  await page.evaluate(() => {
    for (let i = 0; i < 3; i += 1) window.gc?.()
  })
  await page.waitForTimeout(250)
  const bytes = await page.evaluate(() => performance.memory.usedJSHeapSize)
  return +(bytes / 1048576).toFixed(1)
}

// 找展品贴图的可直击机位（同 verify-exhibit-click 做法）
async function aimAt(mapName) {
  return page.evaluate((mapName) => {
    const THREE = window.__THREE
    let target = null
    window.__gltfScene.traverse((o) => {
      if (target || !o.isMesh) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      if (mats.some((m) => m?.map?.name === mapName)) target = o
    })
    if (!target) return null
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
        return !(m?.name.includes('玻璃') || (m?.transparent && m.opacity <= 0.6))
      })
      if (hitMaterial(firstSolid)?.map?.name === mapName) {
        return {
          px: Math.round(((v.x + 1) / 2) * window.innerWidth),
          py: Math.round(((1 - v.y) / 2) * window.innerHeight),
        }
      }
    }
    return null
  }, mapName)
}

// 瞄准→点击→等该 url 的高模 ready→断言挂载（aim 会瞬移相机，必须紧挨着点击；
// 按 url 匹配避免读到上一个奖杯的陈旧 ready 状态）
async function openTrophy(mapName, expectedUrl) {
  const aim = await aimAt(mapName)
  if (!aim) throw new Error(`找不到 ${mapName} 的直击机位`)
  await page.waitForTimeout(500)
  await page.mouse.click(aim.px, aim.py)
  await page.waitForSelector('.exhibit-modal', { timeout: 20000 })
  await page.waitForFunction(
    (url) => window.__highPolyExhibit?.url === url && window.__highPolyExhibit?.ready === true,
    expectedUrl,
    { timeout: 180000 },
  )
  await page.waitForTimeout(600) // 等 React 提交 + primitive 挂进场景
  const status = await page.evaluate(() => ({
    status: { ...window.__highPolyExhibit },
    debug: window.__highPolyDebug ? { meshCount: window.__highPolyDebug.meshCount, wrapperAttached: Boolean(window.__highPolyDebug.wrapper?.parent) } : null,
  }))
  if (status.status.failed) throw new Error(`高模加载失败: ${JSON.stringify(status)}`)
  if (!status.debug?.wrapperAttached) throw new Error(`高模未挂载: ${JSON.stringify(status)}`)
  console.log(`  [open] ${mapName} -> ${status.status.url} meshCount=${status.debug.meshCount} attached=true`)
  await page.waitForTimeout(2000) // 等贴图解码上传稳定
}

async function closeTrophy() {
  await page.click('.exhibit-modal button:has-text("返回")', { force: true })
  await page.waitForTimeout(400)
  // 等 dispose 定时器 + Canvas 卸载跑完
  await page.waitForFunction(() => !document.querySelector('.exhibit-modal'), null, { timeout: 10000 })
  await page.waitForTimeout(600)
}

const base = await heapMB()
await openTrophy('奖杯4_basecolor', '/models/trophy-4-high.glb')
const t4Open = await heapMB()
await page.screenshot({ path: '.tmp-ktx/mem-t4-open.png', timeout: 90000 })
await closeTrophy()
const afterClose1 = await heapMB()
await openTrophy('奖杯3_basecolor', '/models/trophy-3-high.glb')
const t3Open = await heapMB()
await page.screenshot({ path: '.tmp-ktx/mem-t3-open.png', timeout: 90000 })
await closeTrophy()
const afterClose2 = await heapMB()

const dT4 = t4Open - base
const dT3 = t3Open - base
const r1 = afterClose1 - base
const r2 = afterClose2 - base
console.log(`基线           ${base} MB`)
console.log(`开奖杯4        ${t4Open} MB  (Δ ${dT4.toFixed(1)})`)
console.log(`关奖杯4        ${afterClose1} MB  (残 ${r1.toFixed(1)})`)
console.log(`开奖杯3        ${t3Open} MB  (Δ ${dT3.toFixed(1)})`)
console.log(`关奖杯3        ${afterClose2} MB  (残 ${r2.toFixed(1)})`)

// 判定：关闭后残留远小于打开增量；两个 Δ 同量级且不叠加（T3 打开时 T4 已释放）
const releaseOk = r1 < dT4 * 0.4 && r2 < Math.max(dT4, dT3) * 0.4
const stackOk = t3Open < base + Math.max(dT4, dT3) * 1.6
console.log(`释放判定 ${releaseOk ? 'PASS' : 'FAIL'}（残 < 40% 增量） / 叠加判定 ${stackOk ? 'PASS' : 'FAIL'}（T3 开时不超过单高模水平）`)
console.log(releaseOk && stackOk ? 'ALL PASS' : 'FAIL')
await browser.close()
process.exit(releaseOk && stackOk ? 0 : 1)
