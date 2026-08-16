import { useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { RAW_FIGMA_EXPORTS } from '../data/assets.js'

// 后续更换加载页背景：改这里的图片地址即可（设为 '' 则使用米白纯色背景）
const LOADING_BACKGROUND = RAW_FIGMA_EXPORTS.background

// 文件下载占前 90%；模型解析 / 碰撞体构建阶段缓慢逼近 99%，场景就绪才显示 100%
const FILE_STAGE_RATIO = 0.9
const PARSE_STAGE_RATIO = 0.09
const PARSE_STAGE_HALF_TIME = 4000

export function LoadingOverlay({ visible, ready }) {
  const { progress } = useProgress()
  const [parseElapsed, setParseElapsed] = useState(0)
  const maxRatioRef = useRef(0)

  const filesRatio = Math.min(1, Math.max(0, progress / 100))
  const filesDone = filesRatio >= 1

  useEffect(() => {
    if (!filesDone || ready) {
      return undefined
    }

    const startedAt = performance.now()
    const timer = window.setInterval(() => {
      setParseElapsed(performance.now() - startedAt)
    }, 200)

    return () => window.clearInterval(timer)
  }, [filesDone, ready])

  let ratio = filesRatio * FILE_STAGE_RATIO
  if (filesDone) {
    ratio = FILE_STAGE_RATIO + PARSE_STAGE_RATIO * (1 - Math.exp(-parseElapsed / PARSE_STAGE_HALF_TIME))
  }
  if (ready) {
    ratio = 1
  }

  // 进度条只前进不回退，避免新资源开始下载时百分比跳动
  maxRatioRef.current = Math.max(maxRatioRef.current, ratio)
  const percent = Math.round(maxRatioRef.current * 100)
  const preparing = !ready && percent >= 90

  return (
    <div
      aria-hidden={!visible}
      className={[
        'fixed inset-0 z-[500] flex flex-col items-center justify-center transition-opacity duration-500',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      ].join(' ')}
      style={{
        backgroundColor: '#ebe5dc',
        backgroundImage: LOADING_BACKGROUND ? `url("${LOADING_BACKGROUND}")` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 px-[4vw] pb-[7vh]">
        <div
          className="flex items-baseline gap-3 text-[13px] text-slate-600"
          style={{ textShadow: '0 1px 0 rgba(255,255,255,0.65)' }}
        >
          <span className="tracking-[0.2em]">{preparing ? '正在进入展厅' : '展厅资源加载中'}</span>
          <span className="text-[15px] font-semibold tabular-nums text-slate-800">{percent}%</span>
        </div>
        <div className="h-[3px] w-full overflow-hidden rounded-full bg-slate-900/10">
          {/* 不加宽度过渡：保证条和数字永远同步，避免 100% 时条还没走满 */}
          <div
            className="h-full rounded-full bg-slate-800"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </div>
  )
}
