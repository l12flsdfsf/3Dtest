import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// 高精度展品模型查看组件：只挂在 ExhibitModal 的独立 Canvas 里，主场景永远不含它。
//
// 按需加载：组件挂载（= 用户点击展品弹出查看器）才发起 GLB 网络请求。
//
// 内存驻留策略（单实例）：同一时刻至多一个高模留在内存里——
// - 弹窗关闭即整体释放（几何/贴图/材质 dispose，CPU 侧解码数据随之可回收），
//   GPU 侧随弹窗 Canvas 卸载一并销毁；
// - 从奖杯A切到奖杯B：先释放A再加载B，内存不叠加；
// - 重开同一个奖杯会重新加载（走浏览器 HTTP 缓存，无网络往返，仅重新解析）。
// 这是刻意不缓存换取的：高模单个几十MB解码数据，多奖杯常驻会线性吃内存。
let current = null // { url, promise, gltf, wrapper, claimed, failed }

// 调试用：场景里网格计数
function countMeshes(root) {
  let count = 0
  root.traverse((object) => {
    if (object.isMesh) count += 1
  })
  return count
}

function disposeGltf(gltf) {
  gltf.scene.traverse((object) => {
    if (!object.isMesh) return
    object.geometry?.dispose()
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (!material) continue
      for (const texture of [
        material.map,
        material.normalMap,
        material.roughnessMap,
        material.metalnessMap,
        material.aoMap,
        material.emissiveMap,
        material.specularMap,
        material.specularColorMap,
      ]) {
        texture?.dispose()
      }
      material.dispose()
    }
  })
}

// 释放当前驻留的高模（若还在加载中则只摘掉引用，迟到结果在 then 里自行销毁）
function disposeCurrent() {
  if (!current) return
  const entry = current
  current = null
  if (entry.gltf) disposeGltf(entry.gltf)
  // 调试钩子随实例一起清掉，避免自动化测试读到上一个奖杯的陈旧 ready 状态
  if (typeof window !== 'undefined') window.__highPolyExhibit = null
}

function loadHighPolyModel(url, onProgress) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      resolve,
      (event) => onProgress?.(event.loaded, event.total),
      reject,
    )
  })
}

// 包围盒归一化（1.5 最大边、居中原点，与 buildExhibitPreview 同一约定，共用弹窗机位）。
// 注意 updateMatrixWorld(true) 必须先行：刚加载的子树 matrixWorld 全是过期值，
// 直接 setFromObject 会拿到不含节点烘焙变换（旋转/缩放）的错误包围盒。
// （两个高模源文件都自带 "convert" 根 + 节点级 +90° X 旋转，导出时已转好 Y-up，勿再转。）
function buildHighPolyWrapper(gltf) {
  gltf.scene.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(gltf.scene)
  if (box.isEmpty()) return null
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxSpan = Math.max(size.x, size.y, size.z) || 1

  const scale = 1.5 / maxSpan
  const wrapper = new THREE.Group()
  wrapper.scale.setScalar(scale)
  wrapper.position.copy(center).multiplyScalar(-scale)
  wrapper.add(gltf.scene)
  return wrapper
}

function getWrapper(entry) {
  if (!entry.wrapper) {
    entry.wrapper = buildHighPolyWrapper(entry.gltf)
    // 失败兜底：拿不到有效包围盒时仍用裸场景，保证有东西可看
    if (!entry.wrapper) {
      entry.wrapper = new THREE.Group()
      entry.wrapper.add(entry.gltf.scene)
    }
  }
  return entry.wrapper
}

// 在弹窗 Canvas 挂载期间给场景挂程序生成的环境贴图：扫描高模金属度高，
// 只有直射光没有环境反射会整体发黑；RoomEnvironment 本地生成，零网络请求。
function useRoomEnvironment() {
  const { gl, scene } = useThree()

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const target = pmrem.fromScene(new RoomEnvironment(), 0.04)
    scene.environment = target.texture
    return () => {
      scene.environment = null
      target.dispose()
      pmrem.dispose()
    }
  }, [gl, scene])
}

export function ExhibitEnvironment() {
  useRoomEnvironment()
  return null
}

// url: 高模 GLB 地址；fallbackObject: 仅在高模加载失败后使用的低模克隆。
// onStatus: { ready, failed, loaded, total } —— DOM 侧据此显示进度浮层。
export function HighPolyExhibit({ url, fallbackObject, onStatus }) {
  const [gltf, setGltf] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let disposed = false
    setGltf(null)
    setFailed(false)
    const report = (status) => {
      if (typeof window !== 'undefined') window.__highPolyExhibit = { url, ...status } // 调试/自动化测试
      if (!disposed) onStatus?.(status)
    }

    let entry = current?.url === url ? current : null
    if (entry) {
      // 同一奖杯：此前未真正关闭（或 StrictMode 卸载-重挂间隙），直接认领复用
      entry.claimed = true
    } else {
      // 换了奖杯（或首次）：先释放上一个，保证单实例驻留
      disposeCurrent()
      entry = { url, promise: null, gltf: null, wrapper: null, claimed: true, failed: false }
      current = entry
      report({ ready: false, loaded: 0, total: 0 })
      entry.promise = loadHighPolyModel(url, (loaded, total) => {
        if (current === entry) report({ ready: false, loaded, total })
      })
        .then((result) => {
          if (current !== entry) {
            // 等待期间已被释放（关闭弹窗/切换奖杯）：迟到结果就地销毁
            disposeGltf(result)
            return
          }
          entry.gltf = result
          entry.failed = false
          report({ ready: true, failed: false })
          setFailed(false)
          setGltf(result)
        })
        .catch((error) => {
          console.error('[high-poly] 高精度模型加载失败，回退低模', error)
          if (current === entry) {
            entry.gltf = null
            entry.failed = true
            report({ ready: true, failed: true })
            setFailed(true)
          }
        })
    }

    if (entry.gltf) {
      // 复用已在内存里的实例（重开间隙极短的场景）
      report({ ready: true, failed: false })
      setFailed(false)
      setGltf(entry.gltf)
    } else if (entry.failed) {
      report({ ready: true, failed: true })
      setFailed(true)
    }

    return () => {
      disposed = true
      entry.claimed = false
      // 延迟释放：跳过 StrictMode 卸载-重挂的间隙（紧接着的 effect 会重新认领）。
      // 真正关闭弹窗时，这里就是内存回落到基线的时机。
      window.setTimeout(() => {
        if (current === entry && !entry.claimed) disposeCurrent()
      }, 0)
    }
  }, [url, onStatus])

  const wrapper = useMemo(() => {
    if (!gltf || !current || current.gltf !== gltf) return null
    const result = getWrapper(current)
    if (typeof window !== 'undefined') {
      // 调试/自动化测试：网格计数、原始包围盒与 wrapper 引用
      const box = new THREE.Box3().setFromObject(gltf.scene)
      window.__highPolyDebug = {
        meshCount: countMeshes(gltf.scene),
        rawBox: box.isEmpty() ? 'empty' : [box.min.toArray(), box.max.toArray()],
        wrapper: result,
      }
    }
    return result
  }, [gltf])

  if (!wrapper) {
    // Loading is covered by the modal progress UI; only use the low model after a real failure.
    return failed && fallbackObject ? <primitive object={fallbackObject} /> : null
  }
  return <primitive object={wrapper} />
}
