import { useRef } from 'react'
import { Button, Modal } from 'antd'
import { Canvas, useFrame } from '@react-three/fiber'
import { TrophyModel } from '../experience/TrophyDisplay.jsx'

function SpinningTrophy() {
  const ref = useRef()
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.5
  })
  return (
    <group ref={ref} position={[0, -0.35, 0]}>
      <TrophyModel />
    </group>
  )
}

// 点击奖杯弹出：以 3D 查看器为主，展示奖杯模型（当前为占位，后续替换真实模型）。
export function TrophyModal({ trophy, onClose }) {
  return (
    <Modal
      open={Boolean(trophy)}
      onCancel={onClose}
      footer={null}
      width={720}
      destroyOnHidden
      rootClassName="trophy-modal"
      title={null}
    >
      {trophy ? (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_top,#eef2ff,transparent_60%),linear-gradient(180deg,#e2e8f0,#f8fafc)]">
            <div className="h-[380px] w-full">
              <Canvas camera={{ position: [0, 0.1, 3.1], fov: 42 }}>
                <ambientLight intensity={0.8} />
                <directionalLight position={[3, 4, 3]} intensity={1.2} />
                <pointLight position={[-2, 2, 2]} intensity={2.5} color="#dbeafe" />
                <SpinningTrophy />
              </Canvas>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-2xl font-semibold text-slate-900">{trophy.name}</div>
              <div className="mt-1 text-sm leading-6 text-slate-500">{trophy.caption}</div>
            </div>
            <Button size="large" onClick={onClose}>
              关闭
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
