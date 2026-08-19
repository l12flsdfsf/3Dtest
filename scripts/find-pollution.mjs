// 污染源定位：哪些网格包含厅内空点（0,1.2,0）？统计它们的属性（名字/三角数/包围盒/可见性/材质）
import { chromium } from 'playwright-core'

const MODEL = process.argv[2] || 'preview-0817-compat.glb'
const browser = await chromium.launch({
  executablePath: 'C:\\Users\\ASUS\\AppData\\Local\\ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 800, height: 480 } })
await page.goto(`http://localhost:5173/?model=/models/${MODEL}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('button[aria-label="关闭"]', { timeout: 300000 })
await page.click('button[aria-label="关闭"]', { force: true, timeout: 60000 })
await page.waitForFunction(() => window.__gltfScene && window.__playerDebug?.collision === true, null, { timeout: 60000 })

const report = await page.evaluate(() => {
  const scene = window.__gltfScene
  const box = new (scene.children.constructor === Array ? Object : Object)()
  // 逐网格检查是否包住厅内采样点
  const POINTS = [
    [0, 1.2, 0],
    [5, 1.2, 5],
    [-5, 1.2, -5],
    [10, 1.2, 0],
  ]
  const offenders = []
  let meshCount = 0
  scene.traverse((object) => {
    if (!object.isMesh) return
    meshCount += 1
    object.updateWorldMatrix(true, false)
    const geometry = object.geometry
    if (!geometry?.attributes?.position) return
    geometry.computeBoundingBox()
    const worldBox = geometry.boundingBox.clone().applyMatrix4(object.matrixWorld)
    const hitPoints = POINTS.filter(
      ([x, y, z]) =>
        x >= worldBox.min.x && x <= worldBox.max.x && y >= worldBox.min.y && y <= worldBox.max.y && z >= worldBox.min.z && z <= worldBox.max.z,
    )
    if (hitPoints.length) {
      const material = Array.isArray(object.material) ? object.material[0] : object.material
      offenders.push({
        name: object.name || '(未命名)',
        visible: object.visible,
        materialName: material?.name || '',
        transparent: material?.transparent ?? null,
        opacity: material?.opacity ?? null,
        tris: geometry.index ? geometry.index.count / 3 : geometry.attributes.position.count / 3,
        boxSize: [
          +(worldBox.max.x - worldBox.min.x).toFixed(1),
          +(worldBox.max.y - worldBox.min.y).toFixed(1),
          +(worldBox.max.z - worldBox.min.z).toFixed(1),
        ],
        covers: hitPoints.length + '/4点',
      })
    }
  })
  return { meshCount, offenders: offenders.slice(0, 25), offenderCount: offenders.length }
})
console.log('网格总数:', report.meshCount, '| 包住厅内采样点的网格:', report.offenderCount)
for (const o of report.offenders) {
  console.log(
    `  ${o.name} | 可见:${o.visible} | 材质:${o.materialName} 透明:${o.transparent} 透明度:${o.opacity} | ${o.tris}三角 | 尺寸${o.boxSize} | ${o.covers}`,
  )
}
await browser.close()
