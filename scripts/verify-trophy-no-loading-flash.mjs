import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5173/'
const HIGH_MODEL_URL = '/models/trophy-4-high.glb'

mkdirSync('.tmp-ktx', { recursive: true })

let releaseHighModel
const highModelGate = new Promise((resolve) => {
  releaseHighModel = resolve
})

const browser = await chromium.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
let delayedRequests = 0

await page.route(`**${HIGH_MODEL_URL}`, async (route) => {
  delayedRequests += 1
  await highModelGate
  await route.continue()
})

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForFunction(
    () =>
      window.__gltfScene &&
      window.__camera &&
      window.__teleport &&
      window.__THREE &&
      window.__playerDebug?.collision === true,
    null,
    { timeout: 600_000, polling: 1_000 },
  )
  await page.locator('button[aria-label="关闭"]').click({ force: true }).catch(() => {})
  await page.evaluate(() => document.exitPointerLock?.())

  const setup = await page.evaluate((mapName) => {
    const THREE = window.__THREE
    let target = null
    window.__gltfScene.traverse((object) => {
      if (target || !object.isMesh) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      if (materials.some((material) => material?.map?.name === mapName)) target = object
    })
    if (!target) return { found: false }

    target.updateWorldMatrix(true, false)
    const center = new THREE.Box3().setFromObject(target).getCenter(new THREE.Vector3())
    for (const [dx, dz] of [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ]) {
      const cameraPosition = new THREE.Vector3(center.x + dx * 2.2, 1.72, center.z + dz * 2.2)
      window.__teleport(cameraPosition, center)
      window.__camera.updateMatrixWorld(true)

      const projected = center.clone().project(window.__camera)
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(projected.x, projected.y), window.__camera)
      const firstSolid = raycaster.intersectObject(window.__gltfScene, true).find((hit) => {
        const materials = Array.isArray(hit.object.material)
          ? hit.object.material
          : [hit.object.material]
        const material = Number.isInteger(hit.face?.materialIndex)
          ? materials[hit.face.materialIndex]
          : materials[0]
        return !(
          material?.name?.includes('玻璃') ||
          (material?.transparent === true && (material.opacity ?? 1) <= 0.6)
        )
      })

      if (firstSolid?.object === target) {
        return {
          found: true,
          hittable: true,
          px: Math.round(((projected.x + 1) / 2) * window.innerWidth),
          py: Math.round(((1 - projected.y) / 2) * window.innerHeight),
        }
      }
    }
    return { found: true, hittable: false }
  }, '奖杯4_basecolor')

  if (!setup.found || !setup.hittable) {
    throw new Error(`Cannot click trophy 4: ${JSON.stringify(setup)}`)
  }

  await page.mouse.click(setup.px, setup.py)
  await page.waitForSelector('.exhibit-modal', { timeout: 20_000 })
  await page.waitForTimeout(500)

  const loadingStatus = await page.evaluate(() => ({ ...window.__highPolyExhibit }))
  const title = await page.locator('.exhibit-modal section .text-2xl').textContent()
  await page.screenshot({
    path: '.tmp-ktx/trophy-no-flash-loading.png',
    timeout: 90_000,
  })
  console.log(
    `title=${JSON.stringify(title)} loading=${JSON.stringify(loadingStatus)} requests=${delayedRequests}`,
  )

  releaseHighModel()
  await page.waitForFunction(
    () => window.__highPolyExhibit?.ready === true,
    null,
    { timeout: 180_000 },
  )
  await page.waitForTimeout(1_000)

  const readyStatus = await page.evaluate(() => ({ ...window.__highPolyExhibit }))
  await page.screenshot({
    path: '.tmp-ktx/trophy-no-flash-ready.png',
    timeout: 90_000,
  })
  console.log(`ready=${JSON.stringify(readyStatus)} requests=${delayedRequests}`)

  if (delayedRequests !== 1 || readyStatus.failed !== false) {
    throw new Error('High-poly loading state did not follow the expected transition')
  }
} finally {
  releaseHighModel?.()
  await browser.close()
}
