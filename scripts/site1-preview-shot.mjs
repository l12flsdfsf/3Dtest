// 通用单模型加载截图：验证 site1 中间产物/压缩产物渲染是否正常
// 用法: node scripts/site1-preview-shot.mjs --model /models/site1/大厅.glb --pos 0,1.7,5 --look 9.7,2,21 --out .tmp-site1/大厅.png
import { chromium } from 'playwright-core'

const argOf = (name) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv.slice(i + 1)[0] : undefined
}
const MODEL = argOf('--model')
const POS = (argOf('--pos') ?? '0,1.7,0').split(',').map(Number)
const LOOK = (argOf('--look') ?? '0,1.7,-5').split(',').map(Number)
const OUT = argOf('--out') ?? '.tmp-site1/preview.png'
const WAIT = Number(argOf('--wait') ?? 3000)

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('console', (msg) => {
  const text = msg.text()
  if (/\[perf\]|\[gltf\]|error|Error|加载|失败/.test(text)) console.log('  [页面]', text.slice(0, 200))
})
page.on('pageerror', (error) => console.log('  [页面异常]', String(error).slice(0, 300)))
await page.goto(`http://localhost:5173/?model=${MODEL}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
// 模型加载 + 弹窗出现（操作帮助/加载遮罩的关闭按钮可能被判定不可见，用 DOM 点击兜底）
await page.waitForFunction(() => document.querySelector('button[aria-label="关闭"]'), null, { timeout: 300000 })
await page.evaluate(() => {
  document.querySelectorAll('button[aria-label="关闭"]').forEach((b) => b.click())
})
await page.waitForFunction(() => window.__gltfScene && window.__camera, null, { timeout: 300000 })

const info = await page.evaluate(
  ([pos, look]) => {
    const camera = window.__camera
    camera.position.set(...pos)
    camera.lookAt(...look)
    camera.updateMatrixWorld()
    let meshes = 0
    let drawVerts = 0
    window.__gltfScene.traverse((o) => {
      if (o.isMesh) {
        meshes += 1
        drawVerts += o.geometry?.attributes?.position?.count ?? 0
      }
    })
    return { meshes, drawVerts, layout: window.__worldLayout?.halls?.length ?? 0 }
  },
  [POS, LOOK],
)
console.log(`模型 ${MODEL}: 网格 ${info.meshes} / 顶点 ${info.drawVerts} / worldLayout 厅数 ${info.layout}`)
await page.waitForTimeout(WAIT)
await page.screenshot({ path: OUT })
console.log(`截图 -> ${OUT}`)
await browser.close()
