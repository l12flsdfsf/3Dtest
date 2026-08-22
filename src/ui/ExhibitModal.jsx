import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeftOutlined,
  CaretRightOutlined,
  CodeSandboxOutlined,
  OrderedListOutlined,
  PauseOutlined,
} from '@ant-design/icons'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { FIGMA_ASSETS } from '../data/assets.js'
import { getExhibitInfo } from '../data/exhibits.js'
import { ExhibitEnvironment, HighPolyExhibit } from '../experience/HighPolyExhibit.jsx'

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '00:00'
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

// 解说音频播放条：音频后续上传后在 exhibits.js 里配 audio 字段即可直接播放；
// 未配置时播放条置灰占位，不影响布局。
function ExhibitAudioPlayer({ src }) {
  const audioRef = useRef(null)
  const railRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    setPlaying(false)
    setTime(0)
    setDuration(0)
  }, [src])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  }

  const seek = (event) => {
    const audio = audioRef.current
    const rail = railRef.current
    if (!audio || !rail || !Number.isFinite(audio.duration)) return
    const rect = rail.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    audio.currentTime = ratio * audio.duration
  }

  const percent = duration > 0 ? Math.min(100, (time / duration) * 100) : 0

  return (
    <div className="flex w-[min(560px,92%)] items-center gap-4 rounded-lg border border-slate-200 bg-white/95 px-5 py-3 shadow-[0_2px_12px_rgba(15,23,42,0.08)]">
      <button
        type="button"
        onClick={toggle}
        disabled={!src}
        title={src ? (playing ? '暂停解说' : '播放解说') : '解说音频待上传'}
        aria-label={src ? (playing ? '暂停解说' : '播放解说') : '解说音频待上传'}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-[#3B82F6] transition enabled:hover:border-[#3B82F6]/50 disabled:opacity-45"
      >
        {playing ? <PauseOutlined className="text-base" /> : <CaretRightOutlined className="text-xl" />}
      </button>

      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-slate-600">解说音频</div>
        <div
          ref={railRef}
          onClick={seek}
          className={`mt-1.5 h-1.5 rounded-full bg-slate-200 ${src ? 'cursor-pointer' : ''}`}
        >
          <div className="h-full rounded-full bg-[#3B82F6]" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="shrink-0 font-mono text-xs text-slate-500">
        {formatTime(time)} / {src ? formatTime(duration) : '--:--'}
      </div>

      {src ? (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        />
      ) : null}
    </div>
  )
}

// 展柜实物全屏查看器（布局参照 model-cover 设计稿，背景 hall-bg.png）：
// 左 1/4「设备介绍」卡片，右 3/4 展示区（标题 / 可旋转查看 / 3D 模型 / 解说音频条），右上「返回」。
// 展品网格从主场景克隆，在弹窗专属 Canvas 渲染，可拖拽旋转/滚轮缩放；关闭即销毁，平时零开销。
export function ExhibitModal({ exhibit, onClose }) {
  // 高模加载状态：{ ready, failed, loaded, total }，切展品时归零
  const [highPolyStatus, setHighPolyStatus] = useState(null)
  useEffect(() => {
    setHighPolyStatus(null)
  }, [exhibit])

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
  const loadingHighPoly = Boolean(info.highPolyModel) && !highPolyStatus?.ready
  const progress =
    highPolyStatus && highPolyStatus.total > 0
      ? Math.min(100, Math.round((highPolyStatus.loaded / highPolyStatus.total) * 100))
      : null

  return (
    <div className="exhibit-modal fixed inset-0 z-[1000] overflow-hidden bg-[#e8f1fb]">
      <img
        src={FIGMA_ASSETS.hallBackground}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      />

      {/* 3D 展示层铺满整屏（与背景图同范围）：放大/旋转不再被右侧小区域裁切 */}
      <div className="absolute inset-0">
        <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.55, 3.4], fov: 40 }}>
          <ExhibitEnvironment />
          <ambientLight intensity={0.9} />
          <directionalLight position={[3, 4, 3]} intensity={1.4} />
          <directionalLight position={[-3, 2, -2.5]} intensity={0.5} color="#e8eef8" />
          {info.highPolyModel ? (
            // 高精度展品：点击后才加载该 GLB（组件挂载即请求，主场景不含它），
            // 加载期间只显示进度界面；高模请求失败时才回退到低模克隆
            <HighPolyExhibit
              url={info.highPolyModel}
              fallbackObject={exhibit.object}
              onStatus={setHighPolyStatus}
            />
          ) : (
            <primitive object={exhibit.object} />
          )}
          <OrbitControls
            enablePan={false}
            autoRotate
            autoRotateSpeed={1.4}
            minDistance={2}
            maxDistance={6}
          />
        </Canvas>

        {loadingHighPoly ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[rgba(232,241,251,0.45)]">
            <div className="w-64 rounded-lg border border-slate-200 bg-white/95 px-5 py-4 shadow-[0_2px_12px_rgba(15,23,42,0.10)]">
              <div className="text-sm text-slate-700">正在加载高精度模型…</div>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className={`h-full rounded-full bg-[#3B82F6] ${progress === null ? 'w-1/3 animate-pulse' : 'transition-[width] duration-150'}`}
                  style={progress === null ? undefined : { width: `${progress}%` }}
                />
              </div>
              <div className="mt-1.5 text-right font-mono text-xs text-slate-400">
                {progress !== null ? `${progress}%` : '…'}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="absolute right-[3vw] top-[4.5vh] z-10 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-[0_2px_10px_rgba(15,23,42,0.10)] transition hover:bg-slate-50"
      >
        <ArrowLeftOutlined />
        返回
      </button>

      {/* UI 悬浮层：卡片/标题/音频条浮在 3D 之上；容器与中间空区穿透，画布照常接收拖拽/缩放 */}
      <div className="pointer-events-none relative flex h-full w-full items-stretch gap-[2vw] px-[4vw] py-[7vh]">
        {/* 左：设备介绍卡片 */}
        <aside className="pointer-events-auto flex max-h-full w-[clamp(260px,24vw,380px)] shrink-0 flex-col overflow-y-auto rounded-lg border-r-2 border-[#3B82F6] bg-white/95 p-6 shadow-[0_2px_16px_rgba(15,23,42,0.08)]">
          <div className="flex items-center gap-2 text-slate-800">
            <OrderedListOutlined className="text-lg text-[#3B82F6]" />
            <span className="text-lg font-semibold tracking-wide">设备介绍</span>
          </div>
          <div className="mt-1 pl-7 text-xs text-slate-500">{info.subtitle}</div>
          <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
            {info.body
              .split('\n')
              .filter(Boolean)
              .map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
          </div>
        </aside>

        {/* 右：标题与音频条（中间留空透出 3D） */}
        <section className="flex h-full min-w-0 flex-1 flex-col">
          <div className="shrink-0">
            <div className="text-2xl font-bold text-[#2D3748]">{info.title}</div>
            <div className="mt-1.5 flex items-center gap-1.5 text-sm text-slate-500">
              <CodeSandboxOutlined className="text-[#3B82F6]" />
              可旋转查看
            </div>
          </div>

          <div className="min-h-0 flex-1" />

          <div className="pointer-events-auto flex shrink-0 justify-center">
            <ExhibitAudioPlayer src={info.audio} />
          </div>
        </section>
      </div>
    </div>
  )
}
