// 新旧模型同机位 A/B 截图：scene-0817 vs scene-site1（世界坐标一致，固定机位直接对比）
// 用法: node scripts/site1-ab-views.mjs [--new /models/site1/scene-site1.glb] [--old /models/scene-0817.glb]
import { chromium } from 'playwright-core'

const argOf = (name) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const NEW = encodeURIComponent(argOf('--new') ?? '/models/site1/scene-site1.glb')
const OLD = encodeURIComponent(argOf('--old') ?? '/models/scene-0817.glb')

// 固定世界机位（两模型坐标系已验证逐米吻合）
const VIEWS = [
  { key: 'honor', pos: [6, 1.7, 13], look: [9.7, 2.2, 21.5] }, // 荣誉篇章东墙
  { key: 'trophy', pos: [2.5, 1.7, -13.5], look: [0.4, 2.2, -17.5] }, // 奖杯墙
  { key: 'enter-screen', pos: [14, 1.7, 3.5], look: [10, 2.4, 0] }, // 入口大屏方向
  { key: 'tv-hall', pos: [-16, 1.7, -6], look: [-21.8, 1.3, -1.5] }, // 广播厅设备(tripo 578f)
  { key: 'tech-hall', pos: [12, 1.7, 4], look: [21.8, 1.2, 0.6] }, // 技术厅设备墙
  { key: 'future-books', pos: [13, 1.7, 13], look: [17, 1.5, 20] }, // 展望厅书架
]

const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})

async function shoot(modelUrl, tag) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.on('pageerror', (e) => console.log(`  [${tag} 页面异常]`, String(e).slice(0, 200)))
  await page.goto(`http://localhost:5173/?model=${modelUrl}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => document.querySelector('button[aria-label="关闭"]'), null, { timeout: 300000 })
  await page.evaluate(() => {
    document.querySelectorAll('button[aria-label="关闭"]').forEach((b) => b.click())
  })
  await page.waitForFunction(() => window.__gltfScene && window.__camera, null, { timeout: 300000 })
  const layout = await page.evaluate(() => ({
    halls: window.__worldLayout?.halls?.length ?? 0,
    anchors: Object.keys(window.__worldLayout?.anchors ?? {}),
  }))
  console.log(`[${tag}] worldLayout 厅数 ${layout.halls} 锚点 ${layout.anchors.join('/') || '无'}`)
  for (const view of VIEWS) {
    await page.evaluate(([pos, look]) => {
      const camera = window.__camera
      camera.position.set(...pos)
      camera.lookAt(...look)
      camera.updateMatrixWorld()
    }, [view.pos, view.look])
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `.tmp-site1/ab-${tag}-${view.key}.png` })
    console.log(`  [${tag}] ${view.key} ✓`)
  }
  await page.close()
}

await shoot(OLD, 'old')
await shoot(NEW, 'new')
console.log('A/B 截图完成 -> .tmp-site1/ab-{old,new}-{view}.png')
await browser.close()
