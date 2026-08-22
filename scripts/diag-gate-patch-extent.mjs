// 量亮斑的世界范围与贴图表现：
// 1) 把 大厅地板 换成 MeshBasicMaterial(map)（unlit 直出 albedo）
// 2) 相机吊在入口地板上方朝下拍 → 贴图里的烘焙亮斑原样可见
// 3) 用亮度阈值找亮斑的屏幕 bbox → 反投影到世界坐标（y=0 平面）
import { readFileSync } from 'node:fs'
import fs from 'node:fs'
import { chromium } from 'playwright-core'

const OUT = '.tmp-gate-floor'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)))
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__teleport && window.__worldLayout,
  null,
  { timeout: 300000, polling: 2000 },
)
for (let attempt = 0; attempt < 5; attempt++) {
  await page.evaluate(() => document.querySelector('button[aria-label="关闭"]')?.click())
  const gone = await page.evaluate(() => !document.querySelector('button[aria-label="关闭"]'))
  if (gone) break
  await page.waitForTimeout(1500)
}
await page.waitForFunction(() => window.__playerDebug?.collision === true, null, { timeout: 120000 })
await page.waitForTimeout(2000)
const spawn = await page.evaluate(() => window.__camera.position.toArray().map((v) => +v.toFixed(2)))
console.log('出生点:', JSON.stringify(spawn))

await page.click('button[aria-label="切换到自动漫游"]', { force: true })
await page.waitForTimeout(1200)
await page.click('button[aria-label="切换到自主漫游"]', { force: true })
await page.waitForTimeout(1200)

const settle = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let left = 4
        const tick = () => { if (--left <= 0) resolve(); else requestAnimationFrame(tick) }
        requestAnimationFrame(tick)
      }),
  )

// 地板换 unlit + 环境置空（消除一切光照影响，直出 albedo）
await page.evaluate(() => {
  const mesh = window.__gltfScene.getObjectByName('网格209_2')
  const orig = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  const THREE = window.__THREE
  const basic = new THREE.MeshBasicMaterial({ map: orig.map, color: 0xffffff, toneMapped: false })
  window.__unlitState = { mesh, orig }
  mesh.material = basic
  const root = window.__gltfScene.parent
  window.__savedEnv2 = root.environment
  root.environment = null
})

// 吊在入口地板上方 8m 朝下（覆盖出生点前方到大门整片）
await page.evaluate(({ eye, look }) => window.__teleport(eye, look), {
  eye: { x: spawn[0] - 1, y: 9, z: spawn[2] - 1.5 },
  look: { x: spawn[0] - 1, y: 0, z: spawn[2] - 1.5 },
})
await settle()
await page.screenshot({ path: `${OUT}/unlit-topdown.png`, timeout: 120000 })
console.log('unlit 俯视截图完成')

// 亮斑 bbox + 反投影世界坐标
const result = await page.evaluate(async (b64) => {
  const img = new Image()
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = 'data:image/png;base64,' + b64 })
  const c = new OffscreenCanvas(img.width, img.height)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, img.width, img.height).data
  const w = img.width, h = img.height
  // 亮度>240 的像素：屏幕 bbox + 质心
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, count = 0, sx = 0, sy = 0
  const { Raycaster, Vector2, Plane, Vector3 } = window.__THREE
  const rc = new Raycaster()
  const plane = new Plane(new Vector3(0, 1, 0), 0)
  const hit = new Vector3()
  const toWorld = (px, py) => {
    rc.setFromCamera(new Vector2((px / w) * 2 - 1, -(py / h) * 2 + 1), window.__camera)
    if (!rc.ray.intersectPlane(plane, hit)) return null
    return [+hit.x.toFixed(2), +hit.z.toFixed(2)]
  }
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const k = (y * w + x) * 4
      const l = 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]
      if (l > 240) {
        count++
        sx += x; sy += y
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (!count) return { count: 0 }
  const cx = sx / count, cy = sy / count
  return {
    count,
    bbox: { minX, minY, maxX, maxY },
    centroid: { cx: +cx.toFixed(0), cy: +cy.toFixed(0) },
    worldCenter: toWorld(cx, cy),
    worldCorners: {
      tl: toWorld(minX, minY),
      br: toWorld(maxX, maxY),
      tr: toWorld(maxX, minY),
      bl: toWorld(minX, maxY),
    },
  }
}, readFileSync(`${OUT}/unlit-topdown.png`).toString('base64'))
console.log('亮斑(>240):', JSON.stringify(result))

// 恢复
await page.evaluate(() => {
  window.__unlitState.mesh.material = window.__unlitState.orig
  window.__gltfScene.parent.environment = window.__savedEnv2
})
await browser.close()
