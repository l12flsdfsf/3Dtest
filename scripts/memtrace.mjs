// 内存曲线追踪：加载指定模型，每2秒采样 JS 堆 + 控制台输出，判断卡死阶段与原因
import { chromium } from 'playwright-core'

const MODEL = process.argv[2] || 'preview-0817-compat.glb'
const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=8192'],
})
const page = await browser.newPage({ viewport: { width: 1024, height: 576 } })
page.on('console', (msg) => {
  const text = msg.text().slice(0, 220)
  if (!/PCFSoftShadowMap|Warning: \[antd|React DevTools|THREE.Clock/.test(text)) console.log(`[${msg.type()}] ${text}`)
})
page.on('pageerror', (error) => console.log('[pageerror]', String(error).slice(0, 250)))
page.on('requestfailed', (req) => console.log('[reqfail]', req.url().split('/').pop(), req.failure()?.errorText))

// 先探测本环境 WebGL 压缩格式支持（决定 KTX2 是否退化为 RGBA32）
await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded', timeout: 30000 })
const support = await page.evaluate(() => {
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl2')
  if (!gl) return 'WebGL2 不可用!'
  const dbg = gl.getExtension('WEBGL_debug_renderer_info')
  return {
    renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '未知',
    bptc: !!gl.getExtension('EXT_texture_compression_bptc'),
    s3tc: !!gl.getExtension('WEBGL_compressed_texture_s3tc'),
    astc: !!gl.getExtension('WEBGL_compressed_texture_astc'),
    etc1: !!gl.getExtension('WEBGL_compressed_texture_etc'),
  }
})
console.log('WebGL 压缩格式支持:', JSON.stringify(support))

await page.goto(`http://localhost:5173/?model=/models/${MODEL}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
console.log(`--- 开始加载 ${MODEL} ---`)

for (let tick = 1; tick <= 45; tick += 1) {
  await page.waitForTimeout(2000)
  const state = await page
    .evaluate(() => {
      const mem = performance.memory
        ? `${(performance.memory.usedJSHeapSize / 1048576).toFixed(0)}/${(performance.memory.jsHeapSizeLimit / 1048576).toFixed(0)}MB`
        : 'n/a'
      const overlay = document.body.innerText.match(/(\d+)%|正在进入展厅/) || []
      return `${mem} | ${overlay[0] || '就绪'}`
    })
    .catch(() => '页面无响应/已崩溃')
  console.log(`t=${tick * 2}s ${state}`)
  if (state.includes('就绪') && !state.includes('%')) break
}
await browser.close()
