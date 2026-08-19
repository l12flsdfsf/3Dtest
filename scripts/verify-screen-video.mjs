// 验证进门大屏视频：静音自动播放 → 首次点击开声 → 悬停/点击播放暂停 → 进度条拖拽跳转 → 音量随距离衰减
import { chromium } from 'playwright-core'

const OUT = 'D:/3Dtest/.tmp-hover/'
const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('页面错误:', String(e).slice(0, 200)))
page.on('console', (msg) => {
  if (msg.text().includes('bar-debug')) console.log('[console]', msg.text())
})
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })

let failures = 0
const check = (ok, message) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${message}`)
  if (!ok) failures += 1
}

// 1) 静音自动播放（此时尚未点击过任何地方，引导浮窗还开着）
await page.waitForFunction(() => window.__screenVideo && window.__screenVideo.readyState >= 2, null, { timeout: 120000 })
await page.waitForTimeout(1500)
let v = await page.evaluate(() => ({
  paused: window.__screenVideo.paused,
  muted: window.__screenVideo.muted,
}))
check(v.paused === false, `进场自动播放（paused=${v.paused}）`)
check(v.muted === true, `初始为静音（muted=${v.muted}）`)

// 2) 首次点击（关掉引导浮窗）→ 恢复声音
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__teleport && window.__THREE, null, { timeout: 120000 })
v = await page.evaluate(() => ({ muted: window.__screenVideo.muted }))
check(v.muted === false, `首次点击后开声（muted=${v.muted}）`)

const standAt = async (pos) => {
  await page.evaluate(([p]) => {
    window.__teleport({ x: p[0], y: p[1], z: p[2] }, { x: 0, y: 2, z: 15.8 })
  }, [pos])
  await page.waitForTimeout(500)
}
const projectPoint = (wp) =>
  page.evaluate(([p]) => {
    window.__camera.updateMatrixWorld()
    const THREE = window.__THREE
    const v3 = new THREE.Vector3(p[0], p[1], p[2]).project(window.__camera)
    return { px: Math.round(((v3.x + 1) / 2) * innerWidth), py: Math.round(((1 - v3.y) / 2) * innerHeight) }
  }, [wp])
const tipState = () =>
  page.evaluate(() => ({
    text: document.querySelector('.tip-exhibit')?.textContent?.trim(),
    shown: document.querySelector('.tip-exhibit')?.style.display !== 'none',
    cursor: document.body.style.cursor,
    paused: window.__screenVideo?.paused,
    muted: window.__screenVideo?.muted,
    volume: window.__screenVideo ? Math.round(window.__screenVideo.volume * 100) / 100 : null,
    currentTime: window.__screenVideo?.currentTime,
    duration: window.__screenVideo?.duration,
  }))

// 3) 悬停显示「点击暂停」→ 点击暂停 → 再悬停「点击播放视频」→ 点击恢复
await standAt([0, 1.55, 18.5])
const center = await projectPoint([0, 2, 15.9])
await page.mouse.move(center.px, center.py)
await page.waitForTimeout(400)
let state = await tipState()
check(state.text === '点击暂停', `播放中悬停显示「点击暂停」（"${state.text}"）`)
await page.mouse.click(center.px, center.py)
await page.waitForTimeout(600)
state = await tipState()
check(state.paused === true, '点击大屏暂停')
await page.mouse.move(center.px - 5, center.py)
await page.waitForTimeout(400)
state = await tipState()
check(state.text === '点击播放视频', `暂停时悬停显示「点击播放视频」（"${state.text}"）`)
await page.mouse.click(center.px - 5, center.py)
await page.waitForTimeout(600)
state = await tipState()
check(state.paused === false, '再次点击恢复播放')

// 4) 拖拽进度条：从 20% 拖到 70%（进度条在屏底，站位时视线压低让它进画面）
await page.evaluate(() => {
  window.__teleport({ x: 0, y: 1.55, z: 18.5 }, { x: 0, y: 1.0, z: 15.8 })
})
await page.waitForTimeout(600)
const barInfo = await page.evaluate(() => {
  const THREE = window.__THREE
  let mesh = null
  window.__gltfScene.traverse((o) => {
    if (mesh || !o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    if (mats.some((m) => m?.name === '1屏')) mesh = o
  })
  const box = new THREE.Box3().setFromObject(mesh)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const width = size.x * 0.86
  return {
    left: center.x - width / 2,
    y: center.y - size.y / 2 + 0.22,
    z: center.z + size.z / 2 + 0.08,
    width,
  }
})
const p20 = await projectPoint([barInfo.left + barInfo.width * 0.2, barInfo.y, barInfo.z])
const p70 = await projectPoint([barInfo.left + barInfo.width * 0.7, barInfo.y, barInfo.z])
// 探针：p20 处的最近命中（确认热区可被射中）
const probe = await page.evaluate(
  ([pt]) => {
    const THREE = window.__THREE
    let root = window.__gltfScene
    while (root.parent) root = root.parent
    let hot = null
    root.traverse((o) => {
      if (hot || !o.isMesh) return
      const p = o.geometry?.parameters
      if (p && Math.abs(p.height - 0.2) < 1e-6) hot = o
    })
    const ray = new THREE.Raycaster()
    ray.setFromCamera(new THREE.Vector2((pt.px / innerWidth) * 2 - 1, -(pt.py / innerHeight) * 2 + 1), window.__camera)
    const hits = ray.intersectObjects(root.children, true)
    const direct = hot ? ray.intersectObject(hot, false).length : 0
    return {
      p20: pt,
      first: hits[0] ? `${hits[0].object.name || '(无名)'} d=${hits[0].distance.toFixed(2)}` : null,
      hotInHits: hits.some((h) => h.object === hot),
      hotDirect: direct,
      topElement: document.elementFromPoint(pt.px, pt.py)?.tagName,
      cursor: document.body.style.cursor,
    }
  },
  [p20],
)
console.log('p20 探针:', JSON.stringify(probe))
await page.mouse.move(p20.px, p20.py)
await page.waitForTimeout(300)
const preDrag = await page.evaluate(() => ({
  cursor: document.body.style.cursor,
  tip: document.querySelector('.tip-exhibit')?.textContent?.trim() ?? null,
  tipShown: document.querySelector('.tip-exhibit')?.style.display !== 'none',
}))
console.log('按下前状态:', JSON.stringify(preDrag))
await page.mouse.down()
await page.waitForTimeout(250)
await page.mouse.move(p70.px, p70.py, { steps: 8 })
await page.waitForTimeout(400)
await page.mouse.up()
await page.waitForTimeout(600)
state = await tipState()
const dragRatio = state.currentTime / state.duration
check(state.paused === false && dragRatio > 0.62 && dragRatio < 0.8,
  `拖拽进度条跳转（currentTime=${state.currentTime.toFixed(0)}s ≈ ${(dragRatio * 100).toFixed(1)}%）`)

// 5) 音量随距离：远距 0 → 中距 ~0.75
await standAt([0, 1.55, -8.6])
await page.mouse.move(200, 300)
await page.waitForTimeout(700)
await page.mouse.move(230, 330)
await page.waitForTimeout(1200)
state = await tipState()
check(state.paused === false && state.volume === 0, `远距离静音（volume=${state.volume}）`)
await standAt([-0.4, 1.55, 22.3])
await page.mouse.move(240, 320)
await page.waitForTimeout(700)
await page.mouse.move(270, 350)
await page.waitForTimeout(1200)
state = await tipState()
check(state.paused === false && state.volume > 0.5 && state.volume < 0.85, `中距离音量过渡（volume=${state.volume}）`)

await page.screenshot({ path: `${OUT}screen-autoplay.png` })
console.log(failures ? `\n${failures} 项未通过` : '\n全部通过')
await browser.close()
