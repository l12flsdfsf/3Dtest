// 设备技术厅角落阴影 A/B v3：rAF 双帧同步（swiftshader 帧极慢，1.5s 等待会抓到旧帧），
// 固定机位看 SW 角，依次 on / off / color 压暗 三态截图
import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const CHROME = 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const BASE = 'http://localhost:5173'
const OUT_DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') + '../.tmp-tech/'
mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 960, height: 540 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)))
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 160)) })

await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__worldLayout?.halls?.some((h) => h.id === 'tech') && window.__teleport,
  null,
  { timeout: 300000, polling: 2000 },
)
// 帮助浮层在 sceneReady 后 300ms 才弹出：等它出现、点击关闭、确认消失
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 60000 })
for (let attempt = 0; attempt < 5; attempt++) {
  await page.evaluate(() => document.querySelector('button[aria-label="关闭"]')?.click())
  const gone = await page.evaluate(() => !document.querySelector('button[aria-label="关闭"]'))
  if (gone) break
  await page.waitForTimeout(1500)
}
await page.waitForFunction(() => !document.querySelector('button[aria-label="关闭"]'), null, { timeout: 30000 })

// 等 n 个真实呈现帧（每帧可能要几十秒）
async function settleFrames(n) {
  await page.evaluate(
    (n) =>
      new Promise((resolve) => {
        let left = n
        const tick = () => {
          if (--left <= 0) resolve()
          else requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    n,
    { timeout: 300000 },
  )
}

// 三个机位：SW 角（门口墙侧）/ SE 角（柱子与南墙交角）/ XSE（柱子另一侧与凹墙交角）
const goto = async (tag) => {
  await page.evaluate(
    (t) => {
      const tech = window.__worldLayout.halls.find((h) => h.id === 'tech')
      const cx = (tech.worldMinX + tech.worldMaxX) / 2
      const cz = (tech.worldMinZ + tech.worldMaxZ) / 2
      let eye, look
      if (t === 'SW') {
        const c = { x: tech.worldMinX + 0.9, z: tech.worldMinZ + 0.9 }
        eye = { x: (cx + c.x) / 2, y: 1.55, z: (cz + c.z) / 2 }
        look = { x: c.x, y: 1.8, z: c.z }
      } else if (t === 'SE') {
        const c = { x: tech.worldMaxX - 0.9, z: tech.worldMinZ + 0.9 }
        eye = { x: (cx + c.x) / 2, y: 1.55, z: (cz + c.z) / 2 }
        look = { x: c.x, y: 1.8, z: c.z }
      } else if (t === 'XSE') {
        // 南端柱子另一侧：凹墙 x≈22.58 与柱子回转面 z≈-1.97 的交角，从西北方向看
        eye = { x: cx + 2.6, y: 1.55, z: cz - 1.2 }
        look = { x: 22.45, y: 1.75, z: -1.85 }
      } else if (t === 'XNE') {
        // 北端柱子另一侧：凹墙与柱子回转面 z≈9.23 的交角，从西南方向看
        eye = { x: cx + 2.6, y: 1.55, z: cz + 1.2 }
        look = { x: 22.45, y: 1.75, z: 9.1 }
      } else if (t === 'NEC') {
        // 北端柱子近景：柱面与北墙交角（门口望向左侧柱子），检验暗带是否全高连续
        eye = { x: cx + 2.4, y: 1.5, z: cz + 2.9 }
        look = { x: 21.7, y: 2.2, z: 10.1 }
      } else if (t === 'SEC') {
        // 南端柱子近景：柱面与南墙交角
        eye = { x: cx + 2.4, y: 1.5, z: cz - 2.9 }
        look = { x: 21.7, y: 2.2, z: -2.9 }
      } else {
        // 东墙全景（能看到两端柱子与中段凹墙）
        eye = { x: cx - 0.5, y: 1.6, z: cz }
        look = { x: 22.5, y: 1.6, z: cz }
      }
      window.__teleport(eye, look)
    },
    tag,
  )
}

const TAGS = ['SW', 'SE', 'XSE', 'XNE', 'NEC', 'SEC']
for (const tag of TAGS) {
  await goto(tag)
  await settleFrames(3)
  await page.screenshot({ path: OUT_DIR + 'ab-on-' + tag + '.png', timeout: 120000 })
  console.log('shot ab-on-' + tag)
}

const toggled = await page.evaluate(() => {
  if (typeof window.__techCornerShadows?.toggle !== 'function') return 'no-hook'
  return window.__techCornerShadows.toggle()
})
console.log('toggle:', toggled)
for (const tag of TAGS) {
  await goto(tag)
  await settleFrames(2)
  await page.screenshot({ path: OUT_DIR + 'ab-off-' + tag + '.png', timeout: 120000 })
  console.log('shot ab-off-' + tag)
}

if (process.argv.includes('--dim')) {
  const dimmed = await page.evaluate(() => {
    let touched = 0
    window.__gltfScene.traverse((obj) => {
      if (!obj.isMesh) return
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const m of mats) {
        if (m && ['技术设备厅', '技术展厅海报背板'].includes(m.name)) {
          m.color.multiplyScalar(0.45)
          touched++
        }
      }
    })
    return touched
  })
  console.log('dimmed materials:', dimmed)
  await settleFrames(2)
  await page.screenshot({ path: OUT_DIR + 'ab-dim.png', timeout: 120000 })
}
await browser.close()

// 像素级 A/B 统计（node 无 sharp 依赖时跳过）
try {
  const { default: sharpModule } = await import('sharp')
  const sharp = sharpModule.default ?? sharpModule
  for (const c of ['SW', 'SE', 'XSE', 'XNE', 'NEC', 'SEC']) {
    const a = await sharp(OUT_DIR + 'ab-on-' + c + '.png').greyscale().raw().toBuffer({ resolveWithObject: true })
    const b = await sharp(OUT_DIR + 'ab-off-' + c + '.png').greyscale().raw().toBuffer({ resolveWithObject: true })
    let sum = 0, n = 0, max = 0, dark = 0, darkSum = 0
    for (let k = 0; k < a.data.length; k++) {
      const d = b.data[k] - a.data[k]
      n++
      sum += Math.abs(d)
      if (d > max) max = d
      if (d > 3) { dark++; darkSum += d }
    }
    console.log(
      c + ': on-vs-off meanAbs=' + (sum / n).toFixed(2),
      'maxDrop=' + max,
      'darkened%=' + ((dark / n) * 100).toFixed(1),
      'avgDrop=' + (dark ? (darkSum / dark).toFixed(1) : 0),
    )
  }
} catch (e) {
  console.log('(sharp 不可用，跳过像素统计)')
}
