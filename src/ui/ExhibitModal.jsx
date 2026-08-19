import { useEffect } from 'react'
import CloseOutlined from '@ant-design/icons/CloseOutlined'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { getExhibitInfo } from '../data/exhibits.js'

// 点击展柜实物弹出的独立 3D 查看器：
// - 展品网格从主场景克隆（几何/贴图共享），在弹窗内专属小 Canvas 渲染，
//   可拖拽旋转/滚轮缩放，缓慢自转；关闭即销毁该 Canvas，平时零开销；
// - 纯 2D 结构 + 独立上下文，不给主场景加任何对象，不影响漫游帧率。
export function ExhibitModal({ exhibit, onClose }) {
  useEffect(() => {
    if (!exhibit) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [exhibit, onClose])

  if (!exhibit?.object) return null

  const info = getExhibitInfo(exhibit.name)

  return (
    <div
      className="exhibit-modal fixed inset-0 z-[1000] flex items-center justify-center bg-[rgba(15,23,42,0.22)] p-4"
      onClick={onClose}
    >
      <div
        className="relative w-[min(520px,calc(100vw-32px))] rounded-2xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="关闭"
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
          onClick={onClose}
        >
          <CloseOutlined />
        </button>

        <div className="h-[320px] overflow-hidden rounded-xl border border-slate-200 bg-[radial-gradient(circle_at_top,#f8fafc,#e2e8f0)]">
          <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.55, 2.3], fov: 40 }}>
            <ambientLight intensity={0.9} />
            <directionalLight position={[3, 4, 3]} intensity={1.4} />
            <directionalLight position={[-3, 2, -2.5]} intensity={0.5} color="#e8eef8" />
            <primitive object={exhibit.object} />
            <OrbitControls
              enablePan={false}
              autoRotate
              autoRotateSpeed={1.4}
              minDistance={1.3}
              maxDistance={4}
            />
          </Canvas>
        </div>

        <div className="mt-4 flex items-center gap-3 pr-10">
          <span className="h-7 w-1 rounded-full bg-slate-300" aria-hidden="true" />
          <div className="text-2xl font-semibold text-slate-900">{info.title}</div>
        </div>
        <p className="mt-2 text-sm leading-7 text-slate-600">{info.body}</p>
        <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-400">
          拖动旋转 · 滚轮缩放 · 按 Esc 或点击空白处关闭
        </div>
      </div>
    </div>
  )
}
