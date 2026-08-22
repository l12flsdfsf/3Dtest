// 截图确认：荣誉墙天花、荣誉篇章天花、大门门槛 的现状
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
  () => window.__gltfScene && window.__camera && window.__THREE
    && window.__mainHallCornerShadows && window.__mainHallCeilingShadows,
  null,
  { timeout: 180000 },
)
await page.waitForTimeout(2500)

const setPose = (shot) => page.evaluate((s) => {
  const THREE = window.__THREE
  const cam = window.__camera
  cam.up.set(0, 1, 0)
  cam.position.set(s.pos[0], s.pos[1], s.pos[2])
  cam.lookAt(new THREE.Vector3(s.look[0], s.look[1], s.look[2]))
  cam.updateMatrixWorld()
}, shot)

// 荣誉墙(北墙 z=-17):从厅内向南看墙-天花交界
// 荣誉篇章(东墙 x=9.71, z 19.7~24.1):从厅内看东墙前段
// 大门(前墙 z=24.7, 门洞 x±3.87):从厅内看前墙门洞
const shots = [
  { name: 'honor-wall', pos: [0, 1.7, -10], look: [0, 4.9, -17] },
  { name: 'honor-wall-left', pos: [-7, 1.7, -11], look: [-8.5, 4.9, -17] },
  { name: 'honor-chapter', pos: [4, 1.7, 16], look: [9.7, 4.4, 22] },
  { name: 'honor-chapter-wide', pos: [2, 1.7, 13], look: [9.7, 4.2, 22] },
  { name: 'entrance', pos: [0, 1.7, 20], look: [0, 2.2, 25] },
  { name: 'entrance-wide', pos: [0, 1.7, 16], look: [0, 2.0, 24.7] },
]
for (const s of shots) {
  await setPose(s)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `.tmp-ktx/honor-${s.name}.png`, timeout: 90000 })
  console.log('shot', s.name)
}
await browser.close()
