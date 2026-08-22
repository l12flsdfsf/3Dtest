import { mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5173/'
const TARGETS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['mesh_rep_0_ori_repair_quad013', 'mesh_rep_0_ori_repair_quad014']
const EXPECTED_TITLES = {
  mesh_rep_0_ori_repair_quad013: '陶瓷奖杯',
  mesh_rep_0_ori_repair_quad014: '金色荣誉奖杯',
}

mkdirSync('.tmp-ktx', { recursive: true })
const browser = await chromium.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
page.on('pageerror', (error) => console.error('[pageerror]', String(error)))

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

for (const [index, meshName] of TARGETS.entries()) {
  await page.evaluate(() => document.exitPointerLock?.())
  await page.waitForFunction(() => document.pointerLockElement === null, null, { timeout: 5_000 })

  const setup = await page.evaluate((name) => {
    const THREE = window.__THREE
    const target = window.__gltfScene.getObjectByName(name)
    if (!target?.isMesh) return { found: false }

    target.updateWorldMatrix(true, false)
    const box = new THREE.Box3().setFromObject(target)
    const center = box.getCenter(new THREE.Vector3())
    const materials = (Array.isArray(target.material) ? target.material : [target.material]).map(
      (material) => ({
        name: material?.name ?? '',
        type: material?.type ?? '',
        color: material?.color?.getHexString?.() ?? '',
        metalness: material?.metalness ?? null,
        roughness: material?.roughness ?? null,
        envMapIntensity: material?.envMapIntensity ?? null,
        map: material?.map?.name ?? '',
      }),
    )

    for (const [dx, dz] of [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ]) {
      const cameraPosition = new THREE.Vector3(
        center.x + dx * 2.2,
        1.72,
        center.z + dz * 2.2,
      )
      window.__teleport(cameraPosition, center)
      window.__camera.updateMatrixWorld(true)
      const projected = center.clone().project(window.__camera)
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(new THREE.Vector2(projected.x, projected.y), window.__camera)
      const hits = raycaster.intersectObject(window.__gltfScene, true)
      const firstSolid = hits.find((hit) => {
        const hitMaterials = Array.isArray(hit.object.material)
          ? hit.object.material
          : [hit.object.material]
        const material = Number.isInteger(hit.face?.materialIndex)
          ? hitMaterials[hit.face.materialIndex]
          : hitMaterials[0]
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
          center: center.toArray().map((value) => +value.toFixed(2)),
          materials,
        }
      }
    }

    return {
      found: true,
      hittable: false,
      center: center.toArray().map((value) => +value.toFixed(2)),
      materials,
    }
  }, meshName)

  console.log(meshName, JSON.stringify(setup))
  if (!setup.hittable) continue

  await page.screenshot({ path: `.tmp-ktx/honor-wall-${index + 1}.png`, timeout: 90_000 })
  await page.mouse.click(setup.px, setup.py)
  await page.waitForSelector('.exhibit-modal', { timeout: 20_000 })
  const title = await page.locator('.exhibit-modal section .text-2xl').textContent()
  const expectedTitle = EXPECTED_TITLES[meshName]
  console.log(`title=${JSON.stringify(title)} expected=${JSON.stringify(expectedTitle)}`)
  if (title?.trim() !== expectedTitle) {
    throw new Error(`Clicked the wrong exhibit for ${meshName}: ${JSON.stringify(title)}`)
  }
  await page.waitForTimeout(1_500)
  await page.screenshot({ path: `.tmp-ktx/honor-viewer-${index + 1}.png`, timeout: 90_000 })
  console.log(`screenshot=.tmp-ktx/honor-viewer-${index + 1}.png`)

  const canvas = await page.locator('.exhibit-modal canvas').boundingBox()
  if (canvas) {
    await page.mouse.move(canvas.x + canvas.width * 0.56, canvas.y + canvas.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(canvas.x + canvas.width * 0.72, canvas.y + canvas.height * 0.5, {
      steps: 12,
    })
    await page.mouse.up()
    await page.waitForTimeout(700)
    await page.screenshot({
      path: `.tmp-ktx/honor-viewer-${index + 1}-rotated.png`,
      timeout: 90_000,
    })
  }

  await page.locator('.exhibit-modal > button').click({ force: true })
  await page.waitForSelector('.exhibit-modal', { state: 'detached', timeout: 20_000 })
}

await browser.close()
