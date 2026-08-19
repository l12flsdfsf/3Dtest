// 最终验证：电视厅进门左手第一个（采访机）点击弹出说明卡片；录像机不弹
import { chromium } from 'playwright-core'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__teleport && window.__THREE, null, { timeout: 120000 })

const findExhibit = (mapName) => page.evaluate((mapName) => {
  const THREE = window.__THREE
  let target = null
  window.__gltfScene.traverse((o) => {
    if (target || !o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    if (mats.some((m) => m?.map?.name === mapName)) target = o
  })
  if (!target) return null
  target.updateWorldMatrix(true, false)
  const box = new THREE.Box3().setFromObject(target)
  const c = box.getCenter(new THREE.Vector3())
  return { x: c.x, y: c.y, z: c.z }
}, mapName)

const aimAndClick = async (center) => {
  const screen = await page.evaluate(([c]) => {
    window.__teleport({ x: c.x + 1.8, y: 1.55, z: c.z }, { x: c.x, y: c.y, z: c.z })
    window.__camera.updateMatrixWorld()
    const THREE = window.__THREE
    const v = new THREE.Vector3(c.x, c.y, c.z).project(window.__camera)
    return { px: Math.round(((v.x + 1) / 2) * window.innerWidth), py: Math.round(((1 - v.y) / 2) * window.innerHeight) }
  }, [center])
  await page.waitForTimeout(600)
  await page.mouse.click(screen.px, screen.py)
  await page.waitForTimeout(1000)
}

// 1) 采访机
const c1 = await findExhibit('采访机_basecolor')
await aimAndClick(c1)
const card1 = await page.evaluate(() => {
  const el = document.querySelector('.exhibit-modal')
  return el ? el.textContent?.slice(0, 50) : null
})
console.log(card1 ? `PASS: 弹出展品卡片 -> "${card1}"` : 'FAIL: 采访机没有弹出卡片')

if (card1) {
  await page.click('.exhibit-modal button[aria-label="关闭"]', { force: true })
  await page.waitForTimeout(600)
  const closed = await page.evaluate(() => !document.querySelector('.exhibit-modal'))
  console.log(closed ? '卡片已关闭' : 'FAIL: 卡片未关闭')
}

// 2) 录像机（未开放）
const c2 = await findExhibit('录像机_basecolor')
await aimAndClick(c2)
const card2 = await page.evaluate(() => Boolean(document.querySelector('.exhibit-modal')))
console.log(card2 ? 'FAIL: 未开放的录像机也弹出了卡片' : 'PASS: 未开放的录像机不弹出卡片')
await browser.close()
