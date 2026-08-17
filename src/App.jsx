import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Experience } from './experience/Experience.jsx'
import { getAutoRoamStartPose } from './data/autoRoam.js'
import { CONFIG } from './data/config.js'
import { HOTSPOTS } from './data/hotspots.js'
import { hallAtWorldPosition, getHallEntrancePosition, getHallCenterPosition } from './data/halls.js'
import { RAW_FIGMA_EXPORTS } from './data/assets.js'
import { TopBar } from './ui/TopBar.jsx'
import { FullscreenButton } from './ui/FullscreenButton.jsx'
import { LoadingOverlay } from './ui/LoadingOverlay.jsx'
import { HotspotDrawer } from './ui/HotspotDrawer.jsx'
import { HelpOverlay } from './ui/RoamOverlay.jsx'
import { TrophyModal } from './ui/TrophyModal.jsx'
import { PictureViewer } from './ui/PictureViewer.jsx'

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
  const [mode, setMode] = useState('roam')
  const [selected, setSelected] = useState(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [locked, setLocked] = useState(false)
  const [focused, setFocused] = useState(null)
  const [volume, setVolume] = useState(60)
  const [volumeOpen, setVolumeOpen] = useState(false)
  const [trophy, setTrophy] = useState(null)
  const [picture, setPicture] = useState(null)
  const [mapHall, setMapHall] = useState(INITIAL_MAP_HALL)
  const [worldLayout, setWorldLayout] = useState(null)

  const frozen = Boolean(selected) || helpOpen || Boolean(trophy) || Boolean(picture)
  mapOpenRef.current = selected?.id === 'hall-map'

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

  const mapPanel = useMemo(
    () => ({
      id: 'hall-map',
      code: 'MAP',
      title: '展厅地图',
      subtitle: '查看各分厅的位置与推荐游览路线',
      tag: '地图',
      kind: 'map',
      color: '#2563eb',
      assetSrc: RAW_FIGMA_EXPORTS.cPanel,
      scenePreview: RAW_FIGMA_EXPORTS.cPanel,
      description:
        '当前自动巡航从入口出发，先看入口左侧博中序言，依次进入六个主题分厅，经过荣誉墙与博中序章后再回到入口循环。',
      route: [
        '入口 / 展览大馆',
        '博中馆',
        '关怀馆',
        '广播馆',
        '电视馆',
        '荣誉墙',
        '电影馆',
        '技术设备馆',
        '展望馆',
        '博中序章',
      ],
      bullets: [
        '热点标记漂浮在分厅前方，可直接点击查看内容。',
        '点击展厅地图中的分厅区域，可快速传送到该分厅入口。',
        '自动巡航会在入口、荣誉区和博中序章等节点短暂停留。',
      ],
      facts: [
        { label: '分厅数量', value: '6 个' },
        { label: '游览方式', value: '手动 / 自动 / 地图传送' },
        { label: '当前入口', value: '南偏东方向' },
      ],
    }),
    [],
  )

  const lockManualRoam = useCallback(() => {
    setMode('roam')
    window.requestAnimationFrame(() => {
      controlsRef.current?.lock?.()
    })
  }, [])

  const enterManualRoam = useCallback(() => {
    resumeModeRef.current = 'roam'
    setSelected(null)
    setHelpOpen(false)
    setFocused(null)
    lockManualRoam()
  }, [lockManualRoam])

  const enterAutoRoam = useCallback(() => {
    resumeModeRef.current = 'auto'
    controlsRef.current?.unlock?.()
    setLocked(false)
    setSelected(null)
    setHelpOpen(false)
    setFocused(null)
    setMode('auto')
  }, [])

  const pauseRoam = useCallback(
    (nextMode = 'inspect') => {
      if (mode === 'roam' || mode === 'auto') {
        resumeModeRef.current = mode
      }
      controlsRef.current?.unlock?.()
      setLocked(false)
      setFocused(null)
      setMode(nextMode)
    },
    [mode],
  )

  const resumePreviousMode = useCallback(() => {
    setSelected(null)
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
    setSelected(null)
    setHelpOpen(true)
  }, [helpOpen, pauseRoam, resumePreviousMode])

  const openMap = useCallback(() => {
    if (selected?.id === mapPanel.id) {
      resumePreviousMode()
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
    setSelected(mapPanel)
  }, [mapPanel, pauseRoam, resumePreviousMode, selected?.id])

  const openHotspot = useCallback((hotspot) => {
    controlsRef.current?.unlock?.()
    setFocused(null)
    setHelpOpen(false)
    setSelected(hotspot)
  }, [])

  const openTrophy = useCallback((item) => {
    controlsRef.current?.unlock?.()
    setFocused(null)
    setSelected(null)
    setHelpOpen(false)
    setTrophy(item)
  }, [])

  const closeDrawer = useCallback(() => {
    setSelected(null)
    resumePreviousMode()
  }, [resumePreviousMode])

  // 点击墙上照片：暂停漫游弹出可缩放查看器，关闭后回到原漫游模式并回收 blob URL
  const openPicture = useCallback((photo) => {
    controlsRef.current?.unlock?.()
    setFocused(null)
    setSelected(null)
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

  const toggleVolumePanel = useCallback(() => {
    setVolumeOpen((open) => !open)
  }, [])

  const closeVolumePanel = useCallback(() => setVolumeOpen(false), [])

  const exitExperience = useCallback(() => {
    controlsRef.current?.unlock?.()
    resumeModeRef.current = 'roam'
    setLocked(false)
    setSelected(null)
    setHelpOpen(false)
    setFocused(null)
    setMode('inspect')
  }, [])

  const teleportToHall = useCallback((hallId) => {
    const layout = worldLayoutRef.current
    const entrancePosition = getHallEntrancePosition(hallId, layout)
    if (!entrancePosition) return
    controlsRef.current?.teleportTo?.(entrancePosition, getHallCenterPosition(hallId, layout))
    const hall = hallAtWorldPosition(entrancePosition.x, entrancePosition.z, worldLayoutRef.current)
    setMapHall({
      ...hall,
      worldLayout: worldLayoutRef.current,
    })
    setSelected(null)
    setHelpOpen(false)
    setFocused(null)
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
        hotspots={HOTSPOTS}
        onSelect={openHotspot}
        onSelectPicture={openPicture}
        onSelectTrophy={openTrophy}
        onReady={(controls) => {
          controlsRef.current = controls
        }}
        onLockChange={setLocked}
        onFocused={setFocused}
        frozen={frozen}
        playerPosRef={playerPosRef}
        onWorldLayout={handleWorldLayout}
        worldLayout={worldLayout}
      />

      <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.45),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.04),transparent_24%)]' />

      <LoadingOverlay visible={!sceneReady} ready={sceneReady} />

      <TopBar
        autoActive={mode === 'auto'}
        helpActive={helpOpen}
        mapActive={selected?.id === mapPanel.id}
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
      <HotspotDrawer hotspot={selected} currentHall={mapHall} onClose={closeDrawer} onTeleportToHall={teleportToHall} />
      <TrophyModal trophy={trophy} onClose={() => setTrophy(null)} />
      <PictureViewer key={picture?.url} photo={picture} onClose={closePicture} />
    </div>
  )
}
