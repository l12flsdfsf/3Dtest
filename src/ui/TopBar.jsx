import { useEffect, useRef } from 'react'
import { VolumeSlider } from './VolumeSlider.jsx'

function NavButton({ label, active, onClick, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={['nav-button', active ? 'nav-button--active' : '', danger ? 'nav-button--danger' : '']
        .filter(Boolean)
        .join(' ')}
    >
      {label}
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
      <div className="pointer-events-auto flex items-center gap-4 rounded-[26px] border border-white/65 bg-white/76 px-4 py-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)] backdrop-blur">
        <NavButton label={'自主漫游'} active={autoActive} onClick={onAutoRoam} />
        <NavButton label={'帮助'} active={helpActive} onClick={onHelp} />
        <NavButton label={'展厅地图'} active={mapActive} onClick={onMap} />
        <div className="relative" ref={musicWrapRef}>
          <NavButton label={'全局音乐'} active={musicActive} onClick={onMusic} />
          {volumeOpen ? (
            <div className="absolute right-0 top-[calc(100%+12px)] z-40">
              <VolumeSlider value={volume} onChange={onVolumeChange} />
            </div>
          ) : null}
        </div>
        <NavButton label={'退出'} onClick={onExit} danger />
      </div>
    </div>
  )
}
