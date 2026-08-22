// 精确测量烘焙亮斑：斜俯视(unlit albedo) + 连通域 + 质心亮度剖面 → 世界范围/梯度参数
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
page.on('console', (msg) => {
  const text = msg.text()
  if (text.includes('候选')) console.log('[page]', text.slice(0, 800))
})
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

// 地板换 unlit、环境置空
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

// 斜俯视（避免正下方 up 向量退化）：在亮斑上方偏移处看向偏移点
await page.evaluate(({ eye, look }) => window.__teleport(eye, look), {
  eye: { x: -1.4, y: 8.5, z: 20.8 },
  look: { x: -0.9, y: 0, z: 20.8 },
})
await settle()
await page.screenshot({ path: `${OUT}/unlit-tilt.png`, timeout: 120000 })

const analysis = await page.evaluate(async (b64) => {
  const img = new Image()
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = 'data:image/png;base64,' + b64 })
  const w = img.width, h = img.height
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, w, h).data
  const lum = (x, y) => {
    const k = (y * w + x) * 4
    return 0.299 * d[k] + 0.587 * d[k + 1] + 0.114 * d[k + 2]
  }

  // >225 阈值掩码 + 连通域（4邻接，网格步长 2）
  const step = 2
  const gw = Math.ceil(w / step), gh = Math.ceil(h / step)
  const mask = new Uint8Array(gw * gh)
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      if (lum(gx * step, gy * step) > 244) mask[gy * gw + gx] = 1
    }
  }
  const visited = new Uint8Array(gw * gh)
  const blobs = []
  const { Raycaster, Vector2, Plane, Vector3 } = window.__THREE
  const rc = new Raycaster()
  const plane = new Plane(new Vector3(0, 1, 0), 0)
  const hit = new Vector3()
  const toWorld = (px, py) => {
    rc.setFromCamera(new Vector2((px / w) * 2 - 1, -(py / h) * 2 + 1), window.__camera)
    if (!rc.ray.intersectPlane(plane, hit)) return null
    return [hit.x, hit.z]
  }
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || visited[start]) continue
    const stack = [start]
    visited[start] = 1
    const members = []
    while (stack.length) {
      const cur = stack.pop()
      members.push(cur)
      const cx = cur % gw, cy = (cur / gw) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
        const n = ny * gw + nx
        if (mask[n] && !visited[n]) { visited[n] = 1; stack.push(n) }
      }
    }
    if (members.length > 40) blobs.push(members)
  }
  if (!blobs.length) return { error: 'no blob' }

  // 每个连通域算世界范围：丢弃跨度过大(门带/灯带)与不在入口地板(z<14 或 y=0 外)的
  const scored = []
  for (const members of blobs) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, ok = 0
    for (const m of members) {
      const wp = toWorld((m % gw) * step, ((m / gw) | 0) * step)
      if (!wp) continue
      ok++
      minX = Math.min(minX, wp[0]); maxX = Math.max(maxX, wp[0])
      minZ = Math.min(minZ, wp[1]); maxZ = Math.max(maxZ, wp[1])
    }
    if (!ok) continue
    const sizeX = maxX - minX, sizeZ = maxZ - minZ
    scored.push({
      members, ok,
      world: { minX: +minX.toFixed(2), maxX: +maxX.toFixed(2), minZ: +minZ.toFixed(2), maxZ: +maxZ.toFixed(2), sizeX: +sizeX.toFixed(2), sizeZ: +sizeZ.toFixed(2) },
      tooBig: sizeX > 8 || sizeZ > 8,
    })
  }
  scored.sort((a, b) => b.members.length - a.members.length)
  console.info('候选连通域:', JSON.stringify(scored.slice(0, 6).map((s) => ({ px: s.members.length, ...s.world, tooBig: s.tooBig }))))
  const best = scored.find((s) => !s.tooBig) ?? scored[0]

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, sx = 0, sz = 0
  const worlds = []
  for (const m of best.members) {
    const px = (m % gw) * step, py = ((m / gw) | 0) * step
    const wp = toWorld(px, py)
    if (!wp) continue
    worlds.push({ wp, px, py })
    minX = Math.min(minX, wp[0]); maxX = Math.max(maxX, wp[0])
    minZ = Math.min(minZ, wp[1]); maxZ = Math.max(maxZ, wp[1])
    sx += wp[0]; sz += wp[1]
  }
  const cx = sx / worlds.length, cz = sz / worlds.length
  if (!worlds.length) return { error: 'no world points', blobPixels: best.members.length }

  // 亮度分位（斑内）
  const lums = worlds.map((it) => lum(it.px, it.py)).sort((a, b) => a - b)

  // 斑外地板参考亮度：掩码 bbox 屏幕范围向外扩 60~160px 的环带采样
  let sMinX = Infinity, sMaxX = -Infinity, sMinY = Infinity, sMaxY = -Infinity
  for (const it of worlds) {
    sMinX = Math.min(sMinX, it.px); sMaxX = Math.max(sMaxX, it.px)
    sMinY = Math.min(sMinY, it.py); sMaxY = Math.max(sMaxY, it.py)
  }
  const ringLums = []
  const bcx = (sMinX + sMaxX) / 2, bcy = (sMinY + sMaxY) / 2
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7]]) {
    for (const r of [220, 300, 400]) {
      const px = Math.round(bcx + dx * r), py = Math.round(bcy + dy * r)
      if (px < 0 || py < 0 || px >= w || py >= h) continue
      ringLums.push(lum(px, py))
    }
  }
  ringLums.sort((a, b) => a - b)

  // 穿斑亮度剖面：世界 x∈[-3.6,1.2]@z=cz、z∈[18.2,23]@x=cx，投影到屏幕采样
  const profile = []
  const toScreen = (wx, wz) => {
    const v = new Vector3(wx, 0, wz).project(window.__camera)
    return [Math.round((v.x + 1) / 2 * w), Math.round((1 - v.y) / 2 * h)]
  }
  for (let wx = -3.6; wx <= 1.2; wx += 0.2) {
    const [px, py] = toScreen(wx, cz)
    if (px >= 0 && py >= 0 && px < w && py < h) profile.push({ axis: 'x', at: +wx.toFixed(1), lum: +lum(px, py).toFixed(0) })
  }
  for (let wz = 18.2; wz <= 23; wz += 0.2) {
    const [px, py] = toScreen(cx, wz)
    if (px >= 0 && py >= 0 && px < w && py < h) profile.push({ axis: 'z', at: +wz.toFixed(1), lum: +lum(px, py).toFixed(0) })
  }

  return {
    blobPixels: best.members.length,
    candidates: scored.slice(0, 6).map((s) => ({ px: s.members.length, ...s.world, tooBig: s.tooBig })),
    world: { minX: +minX.toFixed(2), maxX: +maxX.toFixed(2), minZ: +minZ.toFixed(2), maxZ: +maxZ.toFixed(2), cx: +cx.toFixed(2), cz: +cz.toFixed(2), sizeX: +(maxX - minX).toFixed(2), sizeZ: +(maxZ - minZ).toFixed(2) },
    lumPercentiles: {
      p5: +lums[Math.floor(lums.length * 0.05)].toFixed(0),
      p50: +lums[Math.floor(lums.length * 0.5)].toFixed(0),
      p95: +lums[Math.floor(lums.length * 0.95)].toFixed(0),
    },
    ringFloorLum: {
      p10: +ringLums[Math.floor(ringLums.length * 0.1)].toFixed(0),
      p50: +ringLums[Math.floor(ringLums.length * 0.5)].toFixed(0),
      p90: +ringLums[Math.floor(ringLums.length * 0.9)].toFixed(0),
    },
    screenBBox: { sMinX, sMinY, sMaxX, sMaxY },
    profile,
  }
}, readFileSync(`${OUT}/unlit-tilt.png`).toString('base64'))
console.log('亮斑连通域:', JSON.stringify(analysis))

// 恢复
await page.evaluate(() => {
  window.__unlitState.mesh.material = window.__unlitState.orig
  window.__gltfScene.parent.environment = window.__savedEnv2
})
await browser.close()
