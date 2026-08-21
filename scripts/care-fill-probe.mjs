// 探关怀厅几何:墙面材质包围盒(天花高度)、相邻厅位置(评估补光泄漏)
import { chromium } from 'playwright-core'

const CHROME = 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__worldLayout?.halls?.length,
  null,
  { timeout: 300000, polling: 2000 },
)
const info = await page.evaluate(() => {
  const THREE = window.__THREE
  const box3 = (min, max) => ({ min: [min.x, min.y, min.z].map((v) => +v.toFixed(2)), max: [max.x, max.y, max.z].map((v) => +v.toFixed(2)) })
  // 关怀厅墙面包围盒
  const wallBox = new THREE.Box3()
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    const ms = Array.isArray(o.material) ? o.material : [o.material]
    if (!ms.some((m) => ['关怀厅', '关怀厅板'].includes(m?.name))) return
    wallBox.expandByObject(o)
  })
  // 厅内地板采样:从厅中心向下射线找地面 y
  const ray = new THREE.Raycaster()
  const care = window.__worldLayout.halls.find((h) => h.id === 'care')
  const cx = (care.worldMinX + care.worldMaxX) / 2
  const cz = (care.worldMinZ + care.worldMaxZ) / 2
  ray.set(new THREE.Vector3(cx, 5, cz), new THREE.Vector3(0, -1, 0))
  const floor = ray.intersectObjects(window.__gltfScene.children, true)[0]
  return {
    wallBox: box3(wallBox.min, wallBox.max),
    careCenter: [cx, cz].map((v) => +v.toFixed(2)),
    floorY: floor ? +floor.point.y.toFixed(2) : null,
    halls: window.__worldLayout.halls.map((h) => ({
      id: h.id,
      min: [h.worldMinX, h.worldMinZ].map((v) => +v.toFixed(1)),
      max: [h.worldMaxX, h.worldMaxZ].map((v) => +v.toFixed(1)),
    })),
  }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
