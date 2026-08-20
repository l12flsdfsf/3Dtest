// 诊断奖杯4高模：加载后 wrapper 是否挂在弹窗场景里、包围盒/材质/可见性
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 400)))
page.on('console', (msg) => {
  const text = msg.text()
  if (msg.type() === 'error' || text.includes('high-poly')) console.log('[console]', msg.type(), text.slice(0, 300))
})

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__teleport && window.__THREE, null, { timeout: 120000 })

const setup = await page.evaluate(() => {
  const THREE = window.__THREE
  let target = null
  window.__gltfScene.traverse((o) => {
    if (target || !o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    if (mats.some((m) => m?.map?.name === '奖杯4_basecolor')) target = o
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
    const firstSolid = hits.find((h) => {
      const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material]
      const idx = h.face?.materialIndex
      const m = Number.isInteger(idx) && mats[idx] ? mats[idx] : mats[0]
      return !(m?.name.includes('玻璃') || (m?.transparent && m.opacity <= 0.6))
    })
    const mats = firstSolid ? [firstSolid.object.material].flat() : []
    const idx = firstSolid?.face?.materialIndex
    const m = Number.isInteger(idx) && mats[idx] ? mats[idx] : mats[0]
    if (m?.map?.name === '奖杯4_basecolor') {
      return {
        px: Math.round(((v.x + 1) / 2) * window.innerWidth),
        py: Math.round(((1 - v.y) / 2) * window.innerHeight),
      }
    }
  }
  return null
})
if (!setup) {
  console.log('FAIL: 找不到可直击机位')
  await browser.close()
  process.exit(1)
}
await page.waitForTimeout(600)
await page.mouse.click(setup.px, setup.py)
await page.waitForSelector('.exhibit-modal', { timeout: 20000 })
await page.waitForFunction(() => window.__highPolyExhibit?.ready === true, null, { timeout: 180000 })
await page.waitForTimeout(1500)

const diag = await page.evaluate(() => {
  const THREE = window.__THREE
  const debug = window.__highPolyDebug ?? {}
  const wrapper = debug.wrapper
  const info = { status: window.__highPolyExhibit, meshCount: debug.meshCount, rawBox: debug.rawBox }

  if (wrapper) {
    // wrapper 是否已挂进弹窗 Canvas 场景（沿 parent 一路到顶）
    let node = wrapper
    let depth = 0
    while (node?.parent && depth < 10) {
      node = node.parent
      depth += 1
    }
    info.attachedRootType = node?.type ?? '(无parent,未挂载)'
    info.attachDepth = depth

    // 子树结构 + 每层旋转（找旋转丢失的层）
    const dumpTree = (obj, level = 0, out = []) => {
      if (level > 5) return out
      out.push({
        level,
        type: obj.type,
        name: obj.name || '',
        rotX: +(obj.rotation?.x ?? 0).toFixed(3),
        scale: obj.scale ? +obj.scale.x.toFixed(3) : null,
        parentName: obj.parent?.name || obj.parent?.type || '(null)',
        childN: obj.children?.length ?? 0,
      })
      obj.children?.forEach((c) => dumpTree(c, level + 1, out))
      return out
    }
    info.tree = dumpTree(wrapper)

    wrapper.updateWorldMatrix(true, true)
    const worldBox = new THREE.Box3().setFromObject(wrapper)
    info.wrapperWorldBox = worldBox.isEmpty() ? 'empty' : [worldBox.min.toArray(), worldBox.max.toArray()]

    let meshInfo = null
    wrapper.traverse((o) => {
      if (meshInfo || !o.isMesh) return
      const geo = o.geometry
      meshInfo = {
        name: o.name,
        visible: o.visible,
        posCount: geo?.attributes?.position?.count ?? 0,
        hasIndex: Boolean(geo?.index),
        frustumCulled: o.frustumCulled,
        material: {
          type: Array.isArray(o.material) ? o.material.map((m) => m.type) : o.material?.type,
          transparent: Array.isArray(o.material) ? o.material[0]?.transparent : o.material?.transparent,
          opacity: Array.isArray(o.material) ? o.material[0]?.opacity : o.material?.opacity,
          color: (Array.isArray(o.material) ? o.material[0]?.color : o.material?.color)?.getHexString?.(),
          metalness: Array.isArray(o.material) ? o.material[0]?.metalness : o.material?.metalness,
          map: Boolean((Array.isArray(o.material) ? o.material[0]?.map : o.material?.map)),
        },
      }
    })
    info.mesh = meshInfo
  }
  return info
})
console.log(JSON.stringify(diag, null, 1))
await page.screenshot({ path: '.tmp-ktx/trophy-diag.png', timeout: 90000 })
await browser.close()
