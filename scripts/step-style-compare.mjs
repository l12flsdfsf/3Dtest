// 对比荣誉墙两端样式：南端(前墙角) vs 北端(台阶) + 检查回头面暗带是否通高
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__camera && window.__THREE && window.__mainHallCeilingShadows,
  null, { timeout: 180000 },
)
await page.waitForTimeout(2500)

const lines = await page.evaluate(() => ({
  topX: window.__mainHallCeilingShadows.lines.topX,
  topZ: window.__mainHallCeilingShadows.lines.topZ,
}))
console.log('== topX =='); lines.topX.forEach((l) => console.log(` coord=${l.coord} span=[${l.span.join(',')}] sign=${l.sign}`))
console.log('== topZ =='); lines.topZ.forEach((l) => console.log(` coord=${l.coord} span=[${l.span.join(',')}] sign=${l.sign}`))

const shots = [
  // 荣誉墙北端（台阶/关怀厅门口），斜 45° 看转角
  { name: 'step-45', pos: [-7.2, 1.7, 21.5], look: [-9.5, 2.4, 18.9] },
  // 荣誉墙南端（前墙角），同角度同距离对照
  { name: 'south-45', pos: [-7.2, 1.7, 22.2], look: [-9.5, 2.4, 24.5] },
  // 台阶正面（回头面）正对
  { name: 'step-front', pos: [-9.0, 1.7, 21.8], look: [-9.6, 3.0, 19.09] },
  // 台阶顶部与天花交界（关怀厅三字左上方）
  { name: 'step-top', pos: [-8.2, 1.7, 21.2], look: [-9.6, 4.9, 19.0] },
]
for (const s of shots) {
  await page.evaluate((shot) => {
    const THREE = window.__THREE
    const cam = window.__camera
    cam.up.set(0, 1, 0)
    cam.position.set(shot.pos[0], shot.pos[1], shot.pos[2])
    cam.lookAt(new THREE.Vector3(shot.look[0], shot.look[1], shot.look[2]))
    cam.updateMatrixWorld()
  }, s)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `.tmp-ktx/${s.name}.png`, timeout: 90000 })
  console.log('shot', s.name)
}
await browser.close()
