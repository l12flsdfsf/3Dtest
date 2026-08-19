// 验证悬停提示：鼠标移到墙上照片上出现「点击查看大图」、移到开放展品（采访机）上出现
// 「点击查看介绍」，移到空白墙面提示消失，且光标随之变 pointer/auto
import { chromium } from 'playwright-core'

const OUT = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') + '../.tmp-hover/'

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (error) => console.log('页面错误:', String(error).slice(0, 200)))
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__camera && window.__teleport && window.__THREE, null, { timeout: 120000 })

const tipState = () =>
  page.evaluate(() => {
    const tip = document.querySelector('.hover-tip')
    if (!tip) return { missing: true }
    return { opacity: tip.style.opacity, text: tip.textContent, cursor: document.body.style.cursor }
  })

// 找一块贴在竖直墙上的照片网格：材质名 材质/材质.NNN 且有 emissiveMap，包围盒薄轴为水平方向
const findWallPhoto = () =>
  page.evaluate(() => {
    const THREE = window.__THREE
    const found = []
    window.__gltfScene.traverse((o) => {
      if (!o.isMesh) return
      const mats = Array.isArray(o.material) ? o.material : [o.material]
      if (!mats.some((m) => /^材质(\.\d+)?$/.test(m?.name || '') && m.emissiveMap)) return
      o.updateWorldMatrix(true, false)
      const box = new THREE.Box3().setFromObject(o)
      if (box.isEmpty()) return
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())
      const thin = ['x', 'y', 'z'].reduce((a, b) => (size[b] < size[a] ? b : a))
      if (thin === 'y') return // 天花/地面贴图，跳过
      found.push({ center: { x: center.x, y: center.y, z: center.z }, size: { x: size.x, y: size.y, z: size.z } })
    })
    return found[0] ?? null
  })

const project = (center, standOffset) =>
  page.evaluate(
    ([c, off]) => {
      window.__teleport({ x: c.x + off.x, y: 1.55, z: c.z + off.z }, { x: c.x, y: c.y, z: c.z })
      window.__camera.updateMatrixWorld()
      const THREE = window.__THREE
      const v = new THREE.Vector3(c.x, c.y, c.z).project(window.__camera)
      return {
        px: Math.round(((v.x + 1) / 2) * window.innerWidth),
        py: Math.round(((1 - v.y) / 2) * window.innerHeight),
      }
    },
    [center, standOffset],
  )

let failures = 0
const check = (ok, message) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${message}`)
  if (!ok) failures += 1
}

// 1) 墙上照片 → 「点击查看大图」
const photo = await findWallPhoto()
if (!photo) {
  console.log('FAIL: 场景里没找到墙上照片网格')
  failures += 1
} else {
  const thin = ['x', 'z'].reduce((a, b) => (photo.size[b] < photo.size[a] ? b : a))
  const offsets = [
    { x: thin === 'x' ? 1.6 : 0, z: thin === 'z' ? 1.6 : 0 },
    { x: thin === 'x' ? -1.6 : 0, z: thin === 'z' ? -1.6 : 0 },
  ]
  let shown = false
  for (const off of offsets) {
    const { px, py } = await project(photo.center, off)
    await page.waitForTimeout(600)
    await page.mouse.move(px, py)
    await page.waitForTimeout(400)
    const state = await tipState()
    if (state.text === '点击查看大图' && state.opacity === '1') {
      shown = true
      check(state.cursor === 'pointer', `照片悬停光标 pointer（实际 "${state.cursor}"）`)
      await page.screenshot({ path: `${OUT}hover-photo.png` })
      // 1a) 点击同一位置 → 照片查看器打开（antd Image 预览），关闭后可继续
      await page.mouse.click(px, py)
      await page.waitForTimeout(1500)
      const preview = page.locator('.ant-image-preview')
      if (await preview.count()) {
        console.log('PASS: 点击照片打开查看器')
        await page.screenshot({ path: `${OUT}photo-viewer.png` })
        await page.locator('.ant-image-preview-close').click({ timeout: 5000 })
        await page.waitForTimeout(800)
      } else {
        console.log('FAIL: 点击照片未打开查看器')
        failures += 1
      }
      // 1b) 对准脚下地面（无可交互目标）→ 提示消失、光标还原
      await page.evaluate(
        ([c]) => {
          window.__teleport({ x: c.x, y: 1.55, z: c.z }, { x: c.x, y: 0.1, z: c.z + 2.5 })
        },
        [photo.center],
      )
      await page.waitForTimeout(600)
      await page.mouse.move(640, 620)
      await page.waitForTimeout(400)
      const blank = await tipState()
      check(blank.opacity === '0' && blank.cursor === 'auto', `移开后提示消失、光标还原（opacity=${blank.opacity} cursor="${blank.cursor}"）`)
      break
    }
  }
  check(shown, '照片上出现「点击查看大图」提示')
}

// 2) 开放展品（采访机）→ 「点击查看介绍」
const exhibit = await page.evaluate(() => {
  const THREE = window.__THREE
  let target = null
  window.__gltfScene.traverse((o) => {
    if (target || !o.isMesh) return
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    if (mats.some((m) => m?.map?.name === '采访机_basecolor')) target = o
  })
  if (!target) return null
  target.updateWorldMatrix(true, false)
  const box = new THREE.Box3().setFromObject(target)
  const c = box.getCenter(new THREE.Vector3())
  return { x: c.x, y: c.y, z: c.z }
})
if (!exhibit) {
  console.log('FAIL: 没找到采访机网格')
  failures += 1
} else {
  const { px, py } = await project(exhibit, { x: 1.8, z: 0 })
  await page.waitForTimeout(600)
  await page.mouse.move(px, py)
  await page.waitForTimeout(400)
  const state = await tipState()
  check(state.text === '点击查看介绍' && state.opacity === '1', `展品上出现「点击查看介绍」（实际 "${state.text}" opacity=${state.opacity}）`)
  await page.screenshot({ path: `${OUT}hover-exhibit.png` })
}

console.log(failures ? `\n${failures} 项未通过` : '\n全部通过')
await browser.close()
