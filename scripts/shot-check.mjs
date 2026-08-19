// 实拍：广播厅橙色墙(pCube186) 与展柜玻璃(pCube191.001) 的当前渲染效果
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__teleport && window.__THREE && window.__gltfScene, null, { timeout: 120000 })
await page.waitForTimeout(1500)

for (const [name, out] of [['pCube186', 'wall-orange'], ['pCube191.001', 'showcase-glass']]) {
  const ok = await page.evaluate(([n]) => {
    const THREE = window.__THREE
    let target = null
    window.__gltfScene.traverse((o) => {
      if (target || !o.isMesh || o.name !== n) return
      target = o
    })
    if (!target) return false
    target.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(target)
    const c = box.getCenter(new THREE.Vector3())
    const s = box.getSize(new THREE.Vector3())
    const thin = ['x', 'y', 'z'].reduce((a, b) => (s[b] < s[a] ? b : a))
    const off = new THREE.Vector3()
    off[thin] = Math.sign(c[thin] - 0) * 1 || 1
    // 沿薄轴法线方向退 3.5m（朝厅内侧）
    const stand = c.clone()
    stand[thin] += (s[thin] / 2 + 3.5) * (c[thin] > 0 ? 1 : -1)
    window.__teleport({ x: stand.x, y: 1.55, z: stand.z }, { x: c.x, y: c.y, z: c.z })
    return { size: [+s.x.toFixed(1), +s.y.toFixed(1), +s.z.toFixed(1)] }
  }, [name])
  await page.waitForTimeout(1200)
  await page.screenshot({ path: `D:/3Dtest/.tmp-hover/check-${out}.png` })
  console.log(name, JSON.stringify(ok))
}
await browser.close()
