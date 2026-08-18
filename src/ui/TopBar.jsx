import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  CompassOutlined,
  EnvironmentOutlined,
  PoweroffOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons'
import { VolumeSlider } from './VolumeSlider.jsx'

// 音乐图标：曲靖原版音符字形（public/icons/music-note.png），
// 用 CSS mask 上色——backgroundColor currentColor 让它跟随按钮状态变色（灰/悬停蓝/激活白）
function MusicNoteOutlined() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-[1em] w-[1em] bg-current"
      style={{
        WebkitMaskImage: 'url(/icons/music-note.png)',
        maskImage: 'url(/icons/music-note.png)',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  )
}

// 顶栏保持应用的浅色胶囊风格；图标用矢量图标，激活态沿用全局按钮的蓝色 (#2563eb)
// 大屏按钮为 64px；菜单会整体等比缩放，保持图标与胶囊的比例。
// 音量滑杆面板 88px 宽，居中挂在音乐按钮下方时两侧各外扩 12px，视觉对齐。
function NavButton({ label, icon, text, active = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={[
        'topbar__button',
        text ? 'topbar__button--text' : '',
        active
          ? 'bg-[#2563eb] text-white shadow-[0_16px_28px_rgba(37,99,235,0.28)]'
          : 'text-slate-500 hover:scale-105 hover:bg-[#2563eb]/10 hover:text-[#2563eb]',
      ].join(' ')}
    >
      {icon}
      {text ? <span className="topbar__button-label">{text}</span> : null}
    </button>
  )
}

function getPreferredTopbarScale(baseDevicePixelRatio) {
  if (typeof window === 'undefined') return 1
  const zoomRatio = window.devicePixelRatio / baseDevicePixelRatio
  const viewportWidth = window.innerWidth * zoomRatio
  const viewportHeight = window.innerHeight * zoomRatio
  const isCompactHighDpiLaptop =
    baseDevicePixelRatio >= 1.25 &&
    viewportWidth <= 1800 &&
    viewportHeight <= 1100
  const isLowResolutionDisplay = viewportWidth <= 1440 && viewportHeight <= 900
  const isCompactDisplay = isCompactHighDpiLaptop || isLowResolutionDisplay

  if (!isCompactDisplay) return 1

  // 14 寸级别高 DPI 笔记本或 1366px 及以下屏幕使用 75%，更小的窗口继续按比例缩小。
  const widthScale = 0.75 * Math.min(1, viewportWidth / 1366)
  const heightScale = 0.75 * Math.min(1, viewportHeight / 768)
  return Math.max(0.45, Math.min(widthScale, heightScale))
}

function getScreenSignature() {
  if (typeof window === 'undefined') return ''
  const { availHeight, availWidth, height, width } = window.screen
  return `${width}x${height}:${availWidth}x${availHeight}`
}

export function TopBar({
  autoActive,
  helpActive,
  mapActive,
  musicActive,
  volume,
  volumeOpen,
  onAutoRoam,
  onHelp,
  onMap,
  onMusic,
  onVolumeChange,
  onVolumeClose,
  onExit,
}) {
  const baseDevicePixelRatioRef = useRef(typeof window === 'undefined' ? 1 : window.devicePixelRatio)
  const screenSignatureRef = useRef(getScreenSignature())
  const topbarRef = useRef(null)
  const topbarInnerRef = useRef(null)
  const musicWrapRef = useRef(null)
  const [menuScale, setMenuScale] = useState(() => getPreferredTopbarScale(baseDevicePixelRatioRef.current))

  useLayoutEffect(() => {
    const updateScale = () => {
      const topbar = topbarRef.current
      const menu = topbarInnerRef.current
      if (!topbar || !menu) return

      const screenSignature = getScreenSignature()
      if (screenSignature !== screenSignatureRef.current) {
        screenSignatureRef.current = screenSignature
        baseDevicePixelRatioRef.current = window.devicePixelRatio
      }

      const rightOffset = Number.parseFloat(window.getComputedStyle(topbar).right) || 0
      const availableWidth = Math.max(0, window.innerWidth - rightOffset - 8)
      const fitScale = availableWidth / menu.offsetWidth
      const nextScale = Math.min(getPreferredTopbarScale(baseDevicePixelRatioRef.current), fitScale)

      setMenuScale(Math.max(0.1, nextScale))
    }

    const observer = new ResizeObserver(updateScale)
    observer.observe(topbarInnerRef.current)
    window.addEventListener('resize', updateScale)
    window.addEventListener('focus', updateScale)
    updateScale()

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateScale)
      window.removeEventListener('focus', updateScale)
    }
  }, [autoActive])

  useEffect(() => {
    if (!volumeOpen) return undefined
    const onPointerDown = (e) => {
      if (musicWrapRef.current && !musicWrapRef.current.contains(e.target)) {
        onVolumeClose?.()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [volumeOpen, onVolumeClose])

  return (
    <div
      ref={topbarRef}
      className="topbar pointer-events-none absolute z-30"
      style={{ '--topbar-scale': menuScale }}
    >
      <div
        ref={topbarInnerRef}
        className="topbar__inner pointer-events-auto flex items-center rounded-[40px] border border-white/65 bg-white/76 shadow-[0_18px_50px_rgba(15,23,42,0.12)] backdrop-blur"
      >
        <NavButton
          label={autoActive ? '切换到自主漫游' : '切换到自动漫游'}
          icon={<CompassOutlined />}
          text={autoActive ? '自动漫游' : '自主漫游'}
          active={autoActive}
          onClick={onAutoRoam}
        />
        <NavButton label={'帮助'} icon={<QuestionCircleOutlined />} active={helpActive} onClick={onHelp} />
        <NavButton label={'展厅地图'} icon={<EnvironmentOutlined />} active={mapActive} onClick={onMap} />
        <div className="relative" ref={musicWrapRef}>
          <NavButton label={'全局音乐'} icon={<MusicNoteOutlined />} active={musicActive} onClick={onMusic} />
          {volumeOpen ? (
            <div className="absolute top-[calc(100%+12px)] left-1/2 z-40 -translate-x-1/2">
              <VolumeSlider value={volume} onChange={onVolumeChange} />
            </div>
          ) : null}
        </div>
        <NavButton label={'退出'} icon={<PoweroffOutlined />} onClick={onExit} />
      </div>
    </div>
  )
}
