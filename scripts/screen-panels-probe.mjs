// 探屏幕面板:大屏(1屏)正面/背面 + 立式预装屏。列出相关网格、材质、贴图分辨率与位置。
import { chromium } from 'playwright-core'

const CHROME = 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => window.__gltfScene && window.__THREE, null, { timeout: 300000, polling: 2000 })
const info = await page.evaluate(() => {
  const THREE = window.__THREE
  const rows = []
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    const ms = Array.isArray(o.material) ? o.material : [o.material]
    const hit = ms.some((m) => m && (/屏/.test(m.name) || /屏/.test(o.name)))
    if (!hit) return
    const b = new THREE.Box3().setFromObject(o)
    const c = b.getCenter(new THREE.Vector3())
    const s = b.getSize(new THREE.Vector3())
    for (const m of ms) {
      if (!m) continue
      rows.push({
        mesh: o.name,
        mat: m.name,
        type: m.type.split('Mesh')[1],
        map: m.map ? `${m.map.name}:${m.map.image?.width}x${m.map.image?.height}` : null,
        emissiveMap: m.emissiveMap ? `${m.emissiveMap.name}:${m.emissiveMap.image?.width}x${m.emissiveMap.image?.height}` : null,
        toneMapped: m.toneMapped,
        side: m.side,
        pos: [c.x, c.y, c.z].map((v) => +v.toFixed(1)),
        size: [s.x, s.y, s.z].map((v) => +v.toFixed(1)),
      })
    }
  })
  return rows
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
