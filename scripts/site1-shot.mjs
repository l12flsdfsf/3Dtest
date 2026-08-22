// 单机位截图（CDP 直捕，绕过 playwright 的字体等待挂起问题）
// 用法: node scripts/site1-shot.mjs <模型URL> <x,y,z> <x,y,z> <输出.png> [等待ms]
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import path from 'node:path'

const MODEL = encodeURIComponent(process.argv[2])
const POS = process.argv[3].split(',').map(Number)
const LOOK = process.argv[4].split(',').map(Number)
const OUT = process.argv[5] ?? '.tmp-site1/shot.png'
const WAIT = Number(process.argv[6] ?? 4000)

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (e) => console.log('[页面异常]', String(e).slice(0, 150)))
await page.goto(`http://localhost:5173/?model=${MODEL}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForFunction(() => document.querySelector('button[aria-label="关闭"]'), null, { timeout: 300000 })
await page.evaluate(() => document.querySelectorAll('button[aria-label="关闭"]').forEach((b) => b.click()))
await page.waitForFunction(() => window.__gltfScene && window.__camera, null, { timeout: 300000 })
const setCamera = () =>
  page.evaluate(([pos, look]) => {
    const camera = window.__camera
    camera.position.set(...pos)
    camera.lookAt(...look)
    camera.updateMatrixWorld()
  }, [POS, LOOK])
await setCamera()
await page.waitForTimeout(Math.min(WAIT, 1500))
await setCamera() // 自动漫游可能抢相机，截前再压一次
const cdp = await page.context().newCDPSession(page)
const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
fs.mkdirSync(path.dirname(OUT) || '.', { recursive: true })
fs.writeFileSync(OUT, Buffer.from(data, 'base64'))
console.log(`截图 -> ${OUT}`)
await browser.close()
