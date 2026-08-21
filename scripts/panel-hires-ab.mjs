// 屏幕面板高清替换 A/B:--phase before|after,三机位(2屏/屏3/屏4)+ 中心裁剪清晰度指标
import { chromium } from 'playwright-core'

const phase = process.argv.includes('--phase') ? process.argv[process.argv.indexOf('--phase') + 1] : 'after'
const CHROME = 'C:/Users/ASUS/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'
const OUT_DIR = new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') + '../.tmp-panels/'
import { mkdirSync } from 'node:fs'
mkdirSync(OUT_DIR, { recursive: true })

const POSES = [
  { tag: 'near-screen2', pos: [0, 1.8, 14.4], look: [0, 2, 15.8] },
  { tag: 'near-screen3', pos: [0, 1.8, -7.2], look: [0, 2, -8.6] },
  { tag: 'near-screen4', pos: [0, 1.8, -10.3], look: [0, 2, -8.9] },
]

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)))
if (phase === 'before') {
  // 在任何页面脚本前注入开关,让 effect 跳过高清替换(改前状态)
  await page.addInitScript(() => { window.__panelHiresDisabled = true })
}
await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(
  () => window.__gltfScene && window.__worldLayout?.halls?.length && window.__teleport && window.__THREE,
  null,
  { timeout: 300000, polling: 2000 },
)
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 60000 })
for (let attempt = 0; attempt < 5; attempt++) {
  await page.evaluate(() => document.querySelector('button[aria-label="关闭"]')?.click())
  if (await page.evaluate(() => !document.querySelector('button[aria-label="关闭"]'))) break
  await page.waitForTimeout(1500)
}
// 等高清贴图真正挂上(检查 map 尺寸变化)再拍
await page.evaluate(() => new Promise((r) => setTimeout(r, 1200)))
for (const p of POSES) {
  await page.evaluate((arg) => window.__teleport({ x: arg.pos[0], y: arg.pos[1], z: arg.pos[2] }, { x: arg.look[0], y: arg.look[1], z: arg.look[2] }), p)
  await page.evaluate(
    (n) => new Promise((r) => { let l = n; const t = () => (--l <= 0 ? r() : requestAnimationFrame(t)); requestAnimationFrame(t) }),
    3,
  )
  await page.screenshot({ path: `${OUT_DIR}${phase}-${p.tag}.png`, timeout: 120000 })
  console.log('shot', phase + '-' + p.tag)
}
const texInfo = await page.evaluate(() => {
  const out = {}
  window.__gltfScene.traverse((o) => {
    if (!o.isMesh) return
    const ms = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of ms) {
      if (!m?.map?.name) continue
      if (/屏内容/.test(m.map.name)) out[m.map.name] = `${m.map.image?.width}x${m.map.image?.height}`
    }
  })
  return out
})
console.log('panel textures:', JSON.stringify(texInfo))
await browser.close()

const sharp = (await import('sharp')).default
// 清晰度指标:画面中心 50% 裁剪的平均 |Laplacian|(高频能量,越大越锐)
for (const p of POSES) {
  const img = sharp(`${OUT_DIR}${phase}-${p.tag}.png`)
  const { width, height } = await img.metadata()
  const { data, info } = await img
    .extract({ left: Math.round(width * 0.25), top: Math.round(height * 0.25), width: Math.round(width * 0.5), height: Math.round(height * 0.5) })
    .greyscale().raw().toBuffer({ resolveWithObject: true })
  let sum = 0
  for (let y = 1; y < info.height - 1; y++) {
    for (let x = 1; x < info.width - 1; x++) {
      const i = y * info.width + x
      sum += Math.abs(4 * data[i] - data[i - 1] - data[i + 1] - data[i - info.width] - data[i + info.width])
    }
  }
  console.log(`${phase}-${p.tag}: sharpness=${(sum / ((info.width - 2) * (info.height - 2))).toFixed(1)}`)
}
