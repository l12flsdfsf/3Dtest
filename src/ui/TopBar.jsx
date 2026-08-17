import { useEffect, useRef } from 'react'
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
// 按钮统一 64px：音量滑杆面板 88px 宽，居中挂在音乐按钮下方时两侧各外扩 12px，视觉对齐
// text: 参考曲靖原版，自主漫游按钮为横长形（图标 + 文字并排）
function NavButton({ label, icon, text, active = false, onClick }) {
  const shape = text ? 'px-5 gap-2' : 'w-16'
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={[
        `flex h-16 shrink-0 items-center justify-center rounded-full text-[27px] transition-all duration-150 active:scale-95 ${shape}`,
        active
          ? 'bg-[#2563eb] text-white shadow-[0_16px_28px_rgba(37,99,235,0.28)]'
          : 'text-slate-500 hover:scale-105 hover:bg-[#2563eb]/10 hover:text-[#2563eb]',
      ].join(' ')}
    >
      {icon}
      {text ? <span className='text-[15px] font-medium tracking-wide'>{text}</span> : null}
    </button>
  )
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
  const musicWrapRef = useRef(null)

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
    <div className="pointer-events-none absolute right-8 top-8 z-30">
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-[40px] border border-white/65 bg-white/76 px-4 py-3 shadow-[0_18px_50px_rgba(15,23,42,0.12)] backdrop-blur">
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
