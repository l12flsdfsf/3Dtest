// 诊断「朝大门方向看时地面一大片反光」（出生点背后就是大门）：
// 1) 切到自主漫游模式（避免 inspect 模式 OrbitControls 每帧把相机拉回大屏）
// 2) 站出生点/出生点内侧 5m，转身朝大门(+z)截图（基线）
// 3) 射线探测亮斑所在地板网格/材质（含 uuid/emissiveMap/envMapIntensity）
// 4) A/B：关 scene.environment → 截图差分 + 空间定位（变暗区域的包围盒）
// 5) A/B：关全部点光/聚光灯 → 差分
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

// 出生点位姿（位置可信；朝向在 inspect 模式会被 OrbitControls 改写，只作参考）
const spawn = await page.evaluate(() => window.__camera.position.toArray().map((v) => +v.toFixed(2)))
console.log('出生点:', JSON.stringify(spawn))

// 切到自主漫游：inspect → (点1) auto → (点2) roam
await page.click('button[aria-label="切换到自动漫游"]', { force: true })
await page.waitForTimeout(1200)
await page.click('button[aria-label="切换到自主漫游"]', { force: true })
await page.waitForTimeout(1200)
const roamState = await page.evaluate(() => ({
  roaming: window.__playerDebug?.roaming,
  pose: window.__camera.position.toArray().map((v) => +v.toFixed(1)),
}))
console.log('漫游模式状态:', JSON.stringify(roamState))

const settle = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        let left = 4
        const tick = () => { if (--left <= 0) resolve(); else requestAnimationFrame(tick) }
        requestAnimationFrame(tick)
      }),
  )

const readImg = (b64) =>
  page.evaluate(async (b64) => {
    const img = new Image()
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
      img.src = 'data:image/png;base64,' + b64
    })
    const c = new OffscreenCanvas(img.width, img.height)
    const ctx = c.getContext('2d')
    ctx.drawImage(img, 0, 0)
    return ctx.getImageData(0, 0, img.width, img.height).data
  }, b64)

const lum = (d, k) => 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]

// 差分 + 空间定位：返回变暗(基线更亮)统计与强变暗像素的包围盒（画面分区占比）
const diffSpatial = async (baseB64, offB64) => {
  const [da, db] = [await readImg(baseB64), await readImg(offB64)]
  const w = 1280, h = 720
  let bright = 0, sum = 0, max = 0
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const grid = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => 0))
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const k = (y * w + x) * 4
      const d = lum(da, k) - lum(db, k) // 基线比关掉后亮多少
      if (d > 3) {
        bright++
        sum += d
        if (d > 25) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x)
          minY = Math.min(minY, y); maxY = Math.max(maxY, y)
          grid[Math.min(5, Math.floor((y / h) * 6))][Math.min(5, Math.floor((x / w) * 6))]++
        }
      }
      if (d > max) max = d
    }
  }
  return {
    darkenedPct: +((bright / ((w / 2) * (h / 2))) * 100).toFixed(1),
    avg: bright ? +(sum / bright).toFixed(1) : 0,
    max: Math.round(max),
    strongBBox: maxX < 0 ? null : { x0: minX, y0: minY, x1: maxX, y1: maxY },
    gridRows: grid.map((row) => row.join(',')),
  }
}

// 视角：出生点在入口(+z 侧)，大门在出生点背后(再 +z)
const views = [
  { name: 'gate-at-spawn', eye: { x: spawn[0], y: 1.72, z: spawn[2] }, look: { x: spawn[0], y: 1.0, z: spawn[2] + 8 } },
  { name: 'gate-from-5m', eye: { x: spawn[0], y: 1.72, z: spawn[2] - 5 }, look: { x: spawn[0] - 1.5, y: 0.9, z: spawn[2] + 7 } },
]

for (const view of views) {
  await page.evaluate(({ eye, look }) => window.__teleport(eye, look), view)
  await settle()
  const base = `${OUT}/${view.name}-base.png`
  await page.screenshot({ path: base, timeout: 120000 })
  const pose = await page.evaluate(() => {
    const dir = window.__camera.getWorldDirection(new window.__THREE.Vector3())
    return { pos: window.__camera.position.toArray().map((v) => +v.toFixed(1)), dir: dir.toArray().map((v) => +v.toFixed(2)) }
  })
  console.log(`\n[${view.name}] 相机:`, JSON.stringify(pose))

  // 地板材质探测：画面下半网格射线，收集 y<0.3 的命中（含 uuid/emissiveMap）
  const floorMats = await page.evaluate(() => {
    const { Raycaster, Vector2 } = window.__THREE
    const out = []
    for (let nx = -0.8; nx <= 0.8; nx += 0.2) {
      for (let ny = -0.9; ny <= 0.2; ny += 0.2) {
        const rc = new Raycaster()
        rc.setFromCamera(new Vector2(nx, ny), window.__camera)
        const hits = rc.intersectObject(window.__gltfScene, true)
        if (!hits.length) continue
        const h = hits[0]
        if (h.point.y > 0.3) continue
        const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material]
        const m = mats[h.face?.materialIndex ?? 0] ?? mats[0]
        if (!m) continue
        out.push({
          mesh: h.object.name,
          material: m.name,
          matUuid: m.uuid.slice(0, 8),
          roughness: typeof m.roughness === 'number' ? +m.roughness.toFixed(3) : null,
          metalness: m.metalness,
          envMapIntensity: m.envMapIntensity,
          emissiveMap: !!m.emissiveMap,
          emissive: m.emissive ? `#${m.emissive.getHexString()}` : null,
          map: m.map?.name ?? null,
        })
      }
    }
    const seen = new Map()
    for (const row of out) {
      const key = `${row.mesh}|${row.material}`
      seen.set(key, { ...row, hits: (seen.get(key)?.hits ?? 0) + 1 })
    }
    return [...seen.values()].sort((a, b) => b.hits - a.hits)
  })
  console.log(`[${view.name}] 地板命中材质:`)
  for (const row of floorMats) console.log(' ', JSON.stringify(row))

  // A/B 1: 关环境贴图
  await page.evaluate(() => {
    const root = window.__gltfScene.parent
    window.__savedEnv = root.environment
    root.environment = null
  })
  await settle()
  const envOff = `${OUT}/${view.name}-env-off.png`
  await page.screenshot({ path: envOff, timeout: 120000 })
  await page.evaluate(() => {
    window.__gltfScene.parent.environment = window.__savedEnv
  })
  console.log(`[${view.name}] 关 scene.environment:`, JSON.stringify(await diffSpatial(readFileSync(base).toString('base64'), readFileSync(envOff).toString('base64'))))

  // A/B 2: 关点光/聚光/方向光（保留 hemi/ambient）
  await page.evaluate(() => {
    const root = window.__gltfScene.parent
    window.__savedLights = []
    root.traverse((o) => {
      if (o.isLight && !/Hemisphere|Ambient/i.test(o.type)) {
        window.__savedLights.push([o, o.visible])
        o.visible = false
      }
    })
  })
  await settle()
  const lightsOff = `${OUT}/${view.name}-lights-off.png`
  await page.screenshot({ path: lightsOff, timeout: 120000 })
  await page.evaluate(() => {
    for (const [light, visible] of window.__savedLights) light.visible = visible
  })
  console.log(`[${view.name}] 关全部点光/聚光灯:`, JSON.stringify(await diffSpatial(readFileSync(base).toString('base64'), readFileSync(lightsOff).toString('base64'))))
}

await browser.close()
console.log('\n截图目录:', OUT)
