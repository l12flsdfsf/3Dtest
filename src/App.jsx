import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Experience } from './experience/Experience.jsx'
import { HOTSPOTS } from './data/hotspots.js'
import { hallAtWorldPosition } from './data/halls.js'
import { RAW_FIGMA_EXPORTS } from './data/assets.js'
import { TopBar } from './ui/TopBar.jsx'
import { HotspotDrawer } from './ui/HotspotDrawer.jsx'
import { HelpOverlay } from './ui/RoamOverlay.jsx'
import { TrophyModal } from './ui/TrophyModal.jsx'

const INITIAL_MAP_HALL = {
  id: 'corridor',
  label: '\u5c55\u9986\u5927\u5385',
  worldLayout: null,
}

const PANEL_ASSETS_TO_PRELOAD = [
  RAW_FIGMA_EXPORTS.cPanel,
  RAW_FIGMA_EXPORTS.cPanel1,
  RAW_FIGMA_EXPORTS.cPanel3,
].filter(Boolean)

export default function App() {
  const controlsRef = useRef(null)
  const resumeModeRef = useRef('roam')
  const playerPosRef = useRef({ x: 10, z: 0 })
  const worldLayoutRef = useRef(null)
  const mapOpenRef = useRef(false)
  const [mode, setMode] = useState('roam')
  const [selected, setSelected] = useState(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [locked, setLocked] = useState(false)
  const [focused, setFocused] = useState(null)
  const [volume, setVolume] = useState(60)
  const [volumeOpen, setVolumeOpen] = useState(false)
  const [trophy, setTrophy] = useState(null)
  const [mapHall, setMapHall] = useState(INITIAL_MAP_HALL)

  const frozen = Boolean(selected) || helpOpen || Boolean(trophy)
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

  const mapPanel = useMemo(
    () => ({
      id: 'hall-map',
      code: 'MAP',
      title: '\u5c55\u5385\u5730\u56fe',
      subtitle: '\u67e5\u770b\u516d\u4e2a\u5206\u5385\u7684\u4f4d\u7f6e\u4e0e\u63a8\u8350\u6e38\u89c8\u8def\u7ebf',
      tag: '\u5730\u56fe',
      kind: 'map',
      color: '#2563eb',
      assetSrc: RAW_FIGMA_EXPORTS.cPanel,
      scenePreview: RAW_FIGMA_EXPORTS.cPanel,
      description:
        '\u5f53\u524d\u5c55\u5385\u91c7\u7528\u73af\u5f62\u6e38\u89c8\u52a8\u7ebf\uff0c\u5165\u53e3\u4f4d\u4e8e\u5357\u4fa7\u4e2d\u592e\uff0c\u987a\u65f6\u9488\u53ef\u4f9d\u6b21\u5b8c\u6210\u516d\u4e2a\u4e3b\u9898\u5206\u5385\u7684\u53c2\u89c2\u3002',
      route: [
        '\u5165\u53e3 / \u5c55\u9986\u5927\u5385',
        '\u5173\u6000\u5385',
        '\u5e7f\u64ad\u5385',
        '\u7535\u89c6\u5385',
        '\u7535\u5f71\u5385',
        '\u6280\u672f\u8bbe\u5907\u5385',
        '\u5c55\u671b\u5385',
      ],
      bullets: [
        '\u70ed\u70b9\u6807\u8bb0\u60ac\u6d6e\u5728\u5206\u5385\u524d\u65b9\uff0c\u53ef\u76f4\u63a5\u70b9\u51fb\u67e5\u770b\u5185\u5bb9\u3002',
        '\u624b\u52a8\u6f2b\u6e38\u66f4\u9002\u5408\u8fd1\u8ddd\u79bb\u67e5\u770b\u5899\u9762\u8d34\u56fe\u4e0e\u5165\u53e3\u5c55\u9879\u3002',
        '\u81ea\u52a8\u5de1\u822a\u4f1a\u6cbf\u9884\u8bbe\u8def\u5f84\u5b8c\u6210\u4e00\u5708\u6d4f\u89c8\u3002',
      ],
      facts: [
        { label: '\u5206\u5385\u6570\u91cf', value: '6 \u4e2a' },
        { label: '\u6e38\u89c8\u65b9\u5f0f', value: '\u624b\u52a8 / \u81ea\u52a8' },
        { label: '\u5f53\u524d\u5165\u53e3', value: '\u5357\u4fa7\u4e2d\u8f74' },
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

  const handleWorldLayout = useCallback((layout) => {
    worldLayoutRef.current = layout

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
    <div className="relative h-full w-full overflow-hidden bg-[#ebe5dc]">
      <Experience
        mode={mode}
        hotspots={HOTSPOTS}
        onSelect={openHotspot}
        onSelectTrophy={openTrophy}
        onReady={(controls) => {
          controlsRef.current = controls
        }}
        onLockChange={setLocked}
        onFocused={setFocused}
        frozen={frozen}
        playerPosRef={playerPosRef}
        onWorldLayout={handleWorldLayout}
      />

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.45),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.04),transparent_24%)]" />

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

      <HelpOverlay open={helpOpen} onClose={resumePreviousMode} autoActive={mode === 'auto'} />
      <HotspotDrawer hotspot={selected} currentHall={mapHall} onClose={closeDrawer} />
      <TrophyModal trophy={trophy} onClose={() => setTrophy(null)} />
    </div>
  )
}
