import { useCallback, useEffect, useRef, useState } from 'react'
import { Experience } from './experience/Experience.jsx'
import { getAutoRoamStartPose } from './data/autoRoam.js'
import { CONFIG } from './data/config.js'
import { hallAtWorldPosition, getHallEntrancePosition, getHallCenterPosition } from './data/halls.js'
import { RAW_FIGMA_EXPORTS } from './data/assets.js'
import { TopBar } from './ui/TopBar.jsx'
import { FullscreenButton } from './ui/FullscreenButton.jsx'
import { LoadingOverlay } from './ui/LoadingOverlay.jsx'
import { MapOverlay } from './ui/MapOverlay.jsx'
import { HelpOverlay } from './ui/RoamOverlay.jsx'
import { TrophyModal } from './ui/TrophyModal.jsx'
import { PictureViewer } from './ui/PictureViewer.jsx'
import { ExhibitModal } from './ui/ExhibitModal.jsx'

const INITIAL_MAP_HALL = {
  id: 'corridor',
  label: '展厅大馆',
  worldLayout: null,
}

const INITIAL_START_POSE = getAutoRoamStartPose()
const USING_EXTERNAL_MODEL = Boolean(CONFIG.modelUrl)

const PANEL_ASSETS_TO_PRELOAD = [
  RAW_FIGMA_EXPORTS.cPanel,
  RAW_FIGMA_EXPORTS.cPanel1,
  RAW_FIGMA_EXPORTS.cPanel3,
].filter(Boolean)

export default function App() {
  const controlsRef = useRef(null)
  const resumeModeRef = useRef('roam')
  const autoHelpShownRef = useRef(false)
  const playerPosRef = useRef({
    x: INITIAL_START_POSE.position.x,
    z: INITIAL_START_POSE.position.z,
  })
  const worldLayoutRef = useRef(null)
  const mapOpenRef = useRef(false)
  const bgmRef = useRef(null)
  const pictureUrlRef = useRef(null)
  const hoverTipRef = useRef(null)
  const hoverTipPhotoRef = useRef(null)
  const hoverTipExhibitRef = useRef(null)
  const hoverTipTextRef = useRef(null)
  const [mode, setMode] = useState('roam')
  const [mapOpen, setMapOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [locked, setLocked] = useState(false)
  const [volume, setVolume] = useState(60)
  const [volumeOpen, setVolumeOpen] = useState(false)
  const [trophy, setTrophy] = useState(null)
  const [picture, setPicture] = useState(null)
  const [exhibit, setExhibit] = useState(null)
  const [mapHall, setMapHall] = useState(INITIAL_MAP_HALL)
  const [worldLayout, setWorldLayout] = useState(null)

  const frozen = mapOpen || helpOpen || Boolean(trophy) || Boolean(picture) || Boolean(exhibit)
  mapOpenRef.current = mapOpen

  useEffect(() => {
    const images = PANEL_ASSETS_TO_PRELOAD.map((src) => {
      const image = new Image()
      image.decoding = 'async'
      image.src = src
      return image
    })
    return () => {
      images.forEach((image) => {
        image.src = ''
      })
    }
  }, [])

  useEffect(() => {
    if (bgmRef.current) bgmRef.current.volume = volume / 100
  }, [volume])

  useEffect(() => {
    const audio = bgmRef.current
    if (!audio) return undefined
    const startPlayback = () => {
      audio.play().catch(() => {})
      window.removeEventListener('pointerdown', startPlayback)
    }
    window.addEventListener('pointerdown', startPlayback)
    return () => window.removeEventListener('pointerdown', startPlayback)
  }, [])

  const sceneReady = !USING_EXTERNAL_MODEL || Boolean(worldLayout)

  useEffect(() => {
    if (!sceneReady || autoHelpShownRef.current) return
    const timer = window.setTimeout(() => {
      autoHelpShownRef.current = true
      setMode('inspect')
      setHelpOpen(true)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [sceneReady])

  const lockManualRoam = useCallback(() => {
    setMode('roam')
    window.requestAnimationFrame(() => {
      controlsRef.current?.lock?.()
    })
  }, [])

  const enterManualRoam = useCallback(() => {
    resumeModeRef.current = 'roam'
    setHelpOpen(false)
    lockManualRoam()
  }, [lockManualRoam])

  const enterAutoRoam = useCallback(() => {
    resumeModeRef.current = 'auto'
    controlsRef.current?.unlock?.()
    setLocked(false)
    setHelpOpen(false)
    setMode('auto')
  }, [])

  const pauseRoam = useCallback(
    (nextMode = 'inspect') => {
      if (mode === 'roam' || mode === 'auto') {
        resumeModeRef.current = mode
      }
      controlsRef.current?.unlock?.()
      setLocked(false)
      setMode(nextMode)
    },
    [mode],
  )

  const resumePreviousMode = useCallback(() => {
    setHelpOpen(false)
    if (resumeModeRef.current === 'auto') {
      setMode('auto')
      return
    }
    lockManualRoam()
  }, [lockManualRoam])

  const toggleAutoRoam = useCallback(() => {
    if (mode === 'auto') {
      enterManualRoam()
      return
    }
    enterAutoRoam()
  }, [enterAutoRoam, enterManualRoam, mode])

  const openHelp = useCallback(() => {
    if (helpOpen) {
      resumePreviousMode()
      return
    }
    pauseRoam('inspect')
    setHelpOpen(true)
  }, [helpOpen, pauseRoam, resumePreviousMode])

  const closeMap = useCallback(() => {
    setMapOpen(false)
    resumePreviousMode()
  }, [resumePreviousMode])

  const openMap = useCallback(() => {
    if (mapOpen) {
      closeMap()
      return
    }
    const { x, z } = playerPosRef.current
    const worldLayout = worldLayoutRef.current
    setMapHall({
      ...hallAtWorldPosition(x, z, worldLayout),
      worldLayout,
    })
    pauseRoam('inspect')
    setHelpOpen(false)
    setMapOpen(true)
  }, [closeMap, mapOpen, pauseRoam])

  const openTrophy = useCallback((item) => {
    controlsRef.current?.unlock?.()
    setHelpOpen(false)
    setTrophy(item)
  }, [])

  // 点击墙上照片：暂停漫游弹出可缩放查看器，关闭后回到原漫游模式并回收 blob URL
  const openPicture = useCallback((photo) => {
    controlsRef.current?.unlock?.()
    setHelpOpen(false)

    if (pictureUrlRef.current) URL.revokeObjectURL(pictureUrlRef.current)
    pictureUrlRef.current = photo.url
    setPicture(photo)
  }, [])

  const closePicture = useCallback(() => {
    if (pictureUrlRef.current) {
      URL.revokeObjectURL(pictureUrlRef.current)
      pictureUrlRef.current = null
    }
    setPicture(null)
    resumePreviousMode()
  }, [resumePreviousMode])

  // 点击展柜实物（书本除外）：暂停漫游弹出独立 3D 查看器（含说明），关闭后回到原漫游模式
  const openExhibit = useCallback(
    (payload) => {
      if (mode === 'roam' || mode === 'auto') resumeModeRef.current = mode
      controlsRef.current?.unlock?.()
      setHelpOpen(false)
      setExhibit(payload)
    },
    [mode],
  )

  const closeExhibit = useCallback(() => {
    setExhibit(null)
    resumePreviousMode()
  }, [resumePreviousMode])

  // 可点击目标（照片/展品/大屏）的悬停提示浮层：位置随鼠标实时更新。
  // 照片 = 放大镜+黑胶囊堆叠（照片块宽 165 高 71+44），展品/大屏 = 小文字条。
  // mousemove 高频触发，直接改 DOM 不走 state，避免整棵树逐帧重渲染。
  const handleHoverHint = useCallback((hint) => {
    const tip = hoverTipRef.current
    const photo = hoverTipPhotoRef.current
    const simple = hoverTipExhibitRef.current
    const text = hoverTipTextRef.current
    if (!tip || !photo || !simple || !text) return

    if (!hint) {
      tip.style.opacity = '0'
      return
    }

    const isPhoto = hint.kind === 'picture'
    photo.style.display = isPhoto ? '' : 'none'
    simple.style.display = isPhoto ? 'none' : ''
    if (!isPhoto) {
      const label = hint.kind === 'screen' ? (hint.playing ? '点击暂停' : '点击播放视频') : '点击查看'
      if (text.textContent !== label) text.textContent = label
    }

    // 照片堆叠块缩放后约 145×101，光标偏右下放置并贴边收拢
    const x = Math.min(hint.x + 14, window.innerWidth - 160)
    const y = Math.min(hint.y + 18, window.innerHeight - 112)
    tip.style.transform = `translate(${x}px, ${y}px)`
    tip.style.opacity = '1'
  }, [])

  const toggleVolumePanel = useCallback(() => {
    setVolumeOpen((open) => !open)
  }, [])

  const closeVolumePanel = useCallback(() => setVolumeOpen(false), [])

  const exitExperience = useCallback(() => {
    controlsRef.current?.unlock?.()
    resumeModeRef.current = 'roam'
    setLocked(false)
    setHelpOpen(false)
    setMode('inspect')
  }, [])

  const teleportToHall = useCallback((hallId) => {
    const layout = worldLayoutRef.current
    const entrancePosition = getHallEntrancePosition(hallId, layout)
    if (!entrancePosition) return
    controlsRef.current?.teleportTo?.(entrancePosition, getHallCenterPosition(hallId, layout))
    const hall = hallAtWorldPosition(entrancePosition.x, entrancePosition.z, layout)
    setMapHall({
      ...hall,
      worldLayout: layout,
    })
    setMapOpen(false)
    setHelpOpen(false)
    setMode('roam')
    window.requestAnimationFrame(() => {
      controlsRef.current?.lock?.()
    })
  }, [])

  const handleWorldLayout = useCallback((layout) => {
    worldLayoutRef.current = layout
    setWorldLayout((prev) => (prev === layout ? prev : layout))

    setMapHall((prev) => {
      if (!mapOpenRef.current) {
        return prev.worldLayout === layout ? prev : { ...prev, worldLayout: layout }
      }
      const { x, z } = playerPosRef.current
      return {
        ...hallAtWorldPosition(x, z, layout),
        worldLayout: layout,
      }
    })
  }, [])

  return (
    <div className='relative h-full w-full overflow-hidden bg-[#ebe5dc]'>
      <audio ref={bgmRef} src='/audio/bgm-hall.m4a' loop preload='auto' />

      <Experience
        mode={mode}
        onSelectPicture={openPicture}
        onSelectExhibit={openExhibit}
        onSelectTrophy={openTrophy}
        onReady={(controls) => {
          controlsRef.current = controls
        }}
        onLockChange={setLocked}
        frozen={frozen}
        hoverEnabled={!frozen}
        onHoverHint={handleHoverHint}
        playerPosRef={playerPosRef}
        onWorldLayout={handleWorldLayout}
        worldLayout={worldLayout}
      />

      <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.45),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.04),transparent_24%)]' />

      <LoadingOverlay visible={!sceneReady} ready={sceneReady} />

      <TopBar
        autoActive={mode === 'auto'}
        helpActive={helpOpen}
        mapActive={mapOpen}
        musicActive={volume > 0}
        volume={volume}
        volumeOpen={volumeOpen}
        onAutoRoam={toggleAutoRoam}
        onHelp={openHelp}
        onMap={openMap}
        onMusic={toggleVolumePanel}
        onVolumeChange={setVolume}
        onVolumeClose={closeVolumePanel}
        onExit={exitExperience}
      />

      <FullscreenButton />

      <HelpOverlay open={helpOpen} onClose={resumePreviousMode} autoActive={mode === 'auto'} />
      <MapOverlay open={mapOpen} currentHall={mapHall} onClose={closeMap} onHallClick={teleportToHall} />
      <TrophyModal trophy={trophy} onClose={() => setTrophy(null)} />
      <PictureViewer key={picture?.url} photo={picture} onClose={closePicture} />
      <ExhibitModal exhibit={exhibit} onClose={closeExhibit} />

      {/* 悬停提示浮层：位置由 handleHoverHint 直接更新，不触发 React 渲染。
          照片提示复刻原 Unity 校史馆的「放大镜(71×71) + 黑胶囊(165×44)」竖向堆叠
          （素材取自 Version.data 的 btn_viewmore / btn_viewmore_box_hov，图标按原部署水平翻转）；
          展品提示保持纯文字小条 */}
      <div
        ref={hoverTipRef}
        className="hover-tip pointer-events-none absolute left-0 top-0 flex flex-col items-center"
        style={{ opacity: 0, transition: 'opacity 120ms ease' }}
      >
        <div
          ref={hoverTipPhotoRef}
          className="tip-photo flex flex-col items-center"
          style={{ display: 'none', filter: 'blur(0.6px)', transform: 'scale(0.88)' }}
        >
          <img src="/ui/viewmore.png" alt="" style={{ width: 71, height: 71 }} />
          <div
            className="flex items-center justify-center"
            style={{
              width: 165,
              height: 44,
              marginTop: -2,
              backgroundImage: 'url(/ui/viewmore-box.png)',
              backgroundSize: '100% 100%',
            }}
          >
            <span className="text-[18px] leading-none text-white">点击查看大图</span>
          </div>
        </div>
        <div
          ref={hoverTipExhibitRef}
          className="tip-exhibit rounded-md bg-slate-900/80 px-2.5 py-1.5 text-xs tracking-wide text-slate-50 shadow-md"
          style={{ display: 'none' }}
        >
          <span ref={hoverTipTextRef}>点击查看</span>
        </div>
      </div>
    </div>
  )
}
