import { useRef } from 'react'
import { Button, Modal } from 'antd'
import { Canvas, useFrame } from '@react-three/fiber'
import { FloorMap } from './FloorMap.jsx'
import { RAW_FIGMA_EXPORTS } from '../data/assets.js'

function ContentImage({ hotspot }) {
  const src = hotspot?.scenePreview || hotspot?.assetSrc

  if (!src) {
    return (
      <div className="flex aspect-[16/10] items-center justify-center rounded-[24px] bg-slate-100 text-sm text-slate-400">
        {'\u6682\u65e0\u9884\u89c8\u7d20\u6750'}
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={hotspot.assetAlt || hotspot.title}
      className="aspect-[16/10] w-full rounded-[24px] border border-slate-200 object-cover"
    />
  )
}

function PreviewObject({ color }) {
  const ref = useRef()

  useFrame((_, delta) => {
    if (!ref.current) return
    ref.current.rotation.x += delta * 0.3
    ref.current.rotation.y += delta * 0.55
  })

  return (
    <group ref={ref}>
      <mesh castShadow>
        <torusKnotGeometry args={[0.78, 0.22, 140, 18]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.26}
          metalness={0.45}
          roughness={0.28}
        />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.22, 0.04, 12, 64]} />
        <meshBasicMaterial color="#94a3b8" transparent opacity={0.72} />
      </mesh>
    </group>
  )
}

function ModelPreview({ color }) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-[radial-gradient(circle_at_top,#eff6ff,transparent_60%),linear-gradient(180deg,#e2e8f0,#f8fafc)]">
      <div className="h-[260px] w-full">
        <Canvas camera={{ position: [0, 0.4, 3.6], fov: 42 }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[3, 4, 3]} intensity={1.2} />
          <pointLight position={[-2, 1, 2]} intensity={2.8} color="#dbeafe" />
          <PreviewObject color={color} />
        </Canvas>
      </div>
    </div>
  )
}

function Facts({ items = [] }) {
  if (!items.length) return null

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{item.label}</div>
          <div className="mt-2 text-sm font-semibold text-slate-900">{item.value}</div>
        </div>
      ))}
    </div>
  )
}

export function HotspotDrawer({ hotspot, onClose, currentHall }) {
  const isMap = hotspot?.kind === 'map'

  return (
    <Modal
      open={Boolean(hotspot)}
      onCancel={onClose}
      footer={null}
      width={isMap ? 960 : 1080}
      destroyOnClose
      rootClassName="hotspot-modal"
      title={null}
      styles={{
        container: isMap
          ? {
              aspectRatio: '5 / 4',
              backgroundImage: `url(${RAW_FIGMA_EXPORTS.cPanel3})`,
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
            }
          : undefined,
        body: isMap ? { height: '100%' } : undefined,
      }}
    >
      {hotspot ? (
        isMap ? (
          <div className="relative h-full w-full">
            {/* \u6807\u9898\uff1a\u4e0e\u5e2e\u52a9\u5f39\u7a97\u6807\u9898\u4f4d\u7f6e\u4e00\u81f4\uff08left 5.4% / top 5.2%\uff09\uff0c\u53bb\u6389 MAP\u3001\u5730\u56fe\u89d2\u6807 */}
            <div className="absolute left-[5.4%] top-[5.2%] max-w-[60%] text-slate-700">
              <div className="text-[28px] font-semibold leading-tight text-slate-800">
                {hotspot.title}
              </div>
              <div className="mt-2 text-[14px] leading-6 text-slate-500">{hotspot.subtitle}</div>
            </div>

            {/* \u5730\u56fe\uff1a\u5c45\u4e2d */}
            <div className="flex h-full w-full items-center justify-center pt-[6%]">
              <FloorMap currentHall={currentHall} />
            </div>

            {/* \u5de6\u4e0b\u89d2\u56fe\u4f8b\uff1a\u7f6e\u4e8e\u5361\u7247\u5de6\u4fa7\u767d\u8272\u7559\u767d\u5904\uff0c\u4e0d\u906e\u6321\u5730\u56fe\uff1b\u84dd\u70b9\u5927\u5c0f\u4e0e\u5730\u56fe\u6807\u8bb0\u4e00\u81f4 */}
            <div className="pointer-events-none absolute bottom-[7%] left-[5.4%] flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 shadow-[0_2px_8px_rgba(15,23,42,0.12)] ring-1 ring-slate-200">
              <span
                className="rounded-full"
                style={{
                  width: 'calc(min(48vh, 480px) / 28)',
                  height: 'calc(min(48vh, 480px) / 28)',
                  backgroundColor: '#2563eb',
                  boxShadow: '0 0 0 calc(min(48vh, 480px) * 6 / 280) rgba(37, 99, 235, 0.16)',
                }}
              />
              <span className="text-[11px] font-medium text-slate-600">{'\u5f53\u524d\u4f4d\u7f6e'}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span
                    className="rounded-full px-3 py-1 text-xs font-semibold"
                    style={{ background: `${hotspot.color}1c`, color: hotspot.color }}
                  >
                    {hotspot.code}
                  </span>
                  <span className="text-sm font-medium text-slate-500">{hotspot.tag}</span>
                </div>
                <div className="text-3xl font-semibold text-slate-900">{hotspot.title}</div>
                <div className="text-sm leading-6 text-slate-500">{hotspot.subtitle}</div>
              </div>

              <Button size="large" onClick={onClose}>
                {'\u8fd4\u56de\u6f2b\u6e38'}
              </Button>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <ContentImage hotspot={hotspot} />
                {hotspot.kind === 'model' ? <ModelPreview color={hotspot.color} /> : null}
              </div>

              <div className="space-y-5">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-5 py-5">
                  <div className="text-sm font-semibold text-slate-900">{'\u5185\u5bb9\u8bf4\u660e'}</div>
                  <div className="mt-3 text-sm leading-7 text-slate-600">{hotspot.description}</div>
                </div>

                {hotspot.route?.length ? (
                  <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-5">
                    <div className="text-sm font-semibold text-slate-900">{'\u63a8\u8350\u8def\u7ebf'}</div>
                    <div className="mt-4 space-y-3">
                      {hotspot.route.map((step, index) => (
                        <div key={step} className="flex items-center gap-3">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                            {index + 1}
                          </div>
                          <div className="text-sm text-slate-600">{step}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {hotspot.bullets?.length ? (
                  <div className="rounded-[24px] border border-slate-200 bg-white px-5 py-5">
                    <div className="text-sm font-semibold text-slate-900">{'\u8981\u70b9'}</div>
                    <div className="mt-4 space-y-3">
                      {hotspot.bullets.map((item) => (
                        <div key={item} className="flex gap-3 text-sm leading-6 text-slate-600">
                          <div
                            className="mt-2 h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: hotspot.color }}
                          />
                          <div>{item}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <Facts items={hotspot.facts} />
          </div>
        )
      ) : null}
    </Modal>
  )
}
