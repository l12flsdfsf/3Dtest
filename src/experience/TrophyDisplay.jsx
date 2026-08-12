import { useMemo, useState } from 'react'
import * as THREE from 'three'
import { TROPHIES, TROPHY_NICHE, TROPHY_SHELF_YS } from '../data/trophies.js'

// 金色（低金属度亮金，无环境贴图下也不发黑）；STONE 为浅色底座。
const GOLD = '#e6b84f'
const STONE = '#e7e0d1'

function useCupGeometry() {
  return useMemo(() => {
    const profile = [
      [0.0, 0.0],
      [0.046, 0.0],
      [0.072, 0.02],
      [0.098, 0.05],
      [0.114, 0.09],
      [0.116, 0.13],
      [0.104, 0.155],
      [0.088, 0.17],
    ].map(([x, y]) => new THREE.Vector2(x, y))
    return new THREE.LatheGeometry(profile, 48)
  }, [])
}

// 奖杯模型：台阶式底座 + 杯柱 + 拉胚杯身 + 杯口 + 两侧把手。原点在底座底面。
export function TrophyModel({ gold = GOLD, stone = STONE }) {
  const cupGeo = useCupGeometry()
  return (
    <group>
      {/* 底座（两级台阶） */}
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.15, 0.16, 0.06, 36]} />
        <meshStandardMaterial color={stone} roughness={0.55} metalness={0.08} />
      </mesh>
      <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.115, 0.13, 0.04, 36]} />
        <meshStandardMaterial color={stone} roughness={0.55} metalness={0.08} />
      </mesh>
      {/* 杯柱 */}
      <mesh position={[0, 0.19, 0]} castShadow>
        <cylinderGeometry args={[0.035, 0.05, 0.18, 20]} />
        <meshStandardMaterial color={gold} metalness={0.4} roughness={0.28} />
      </mesh>
      {/* 杯身（拉胚） */}
      <mesh geometry={cupGeo} position={[0, 0.28, 0]} castShadow>
        <meshStandardMaterial color={gold} metalness={0.4} roughness={0.26} side={THREE.DoubleSide} />
      </mesh>
      {/* 杯口 */}
      <mesh position={[0, 0.45, 0]} castShadow>
        <torusGeometry args={[0.09, 0.014, 14, 36]} />
        <meshStandardMaterial color={gold} metalness={0.4} roughness={0.26} />
      </mesh>
      {/* 两侧把手 */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.112, 0.37, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
          <torusGeometry args={[0.05, 0.012, 12, 28]} />
          <meshStandardMaterial color={gold} metalness={0.4} roughness={0.28} />
        </mesh>
      ))}
    </group>
  )
}

function Trophy({ data, onSelect }) {
  const [hovered, setHovered] = useState(false)

  return (
    <group
      position={data.position}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(data)
      }}
      onPointerOver={(event) => {
        event.stopPropagation()
        setHovered(true)
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        setHovered(false)
        document.body.style.cursor = 'auto'
      }}
    >
      <TrophyModel gold={hovered ? '#f1c869' : GOLD} />
    </group>
  )
}

// 后墙嵌入式展柜：浅色内壁 + 多层玻璃搁板 + 网格奖杯 + 均布照明 + 开口边框。
export function TrophyDisplay({ onSelectTrophy }) {
  const { frontX, backX, zMin, zMax, yBottom, yTop } = TROPHY_NICHE
  const depth = frontX - backX
  const cx = (frontX + backX) / 2
  const zMid = (zMin + zMax) / 2
  const zLen = zMax - zMin
  const yMid = (yBottom + yTop) / 2
  const yLen = yTop - yBottom

  const inner = '#efe7d6' // 浅色柜内壁（不再黑色）
  const trim = '#cdbfa6'

  return (
    <group>
      {/* 柜内壁：5 面构成开口朝 +x 的浅色暗盒 */}
      <mesh position={[backX, yMid, zMid]}>
        <boxGeometry args={[0.04, yLen, zLen]} />
        <meshStandardMaterial color={inner} roughness={0.85} />
      </mesh>
      <mesh position={[cx, yTop, zMid]}>
        <boxGeometry args={[depth + 0.02, 0.04, zLen]} />
        <meshStandardMaterial color={inner} roughness={0.85} />
      </mesh>
      <mesh position={[cx, yBottom, zMid]} receiveShadow>
        <boxGeometry args={[depth + 0.02, 0.04, zLen]} />
        <meshStandardMaterial color={inner} roughness={0.85} />
      </mesh>
      <mesh position={[cx, yMid, zMin]}>
        <boxGeometry args={[depth + 0.02, yLen, 0.04]} />
        <meshStandardMaterial color={inner} roughness={0.85} />
      </mesh>
      <mesh position={[cx, yMid, zMax]}>
        <boxGeometry args={[depth + 0.02, yLen, 0.04]} />
        <meshStandardMaterial color={inner} roughness={0.85} />
      </mesh>

      {/* 多层玻璃搁板（每行一层） */}
      {TROPHY_SHELF_YS.map((y) => (
        <mesh key={y} position={[cx, y, zMid]} receiveShadow>
          <boxGeometry args={[depth + 0.04, 0.03, zLen + 0.04]} />
          <meshStandardMaterial color="#eaf2fb" transparent opacity={0.28} roughness={0.08} metalness={0} />
        </mesh>
      ))}

      {/* 开口边框（贴墙面收口） */}
      <mesh position={[frontX + 0.02, yTop + 0.03, zMid]}>
        <boxGeometry args={[0.05, 0.06, zLen + 0.1]} />
        <meshStandardMaterial color={trim} roughness={0.55} metalness={0.2} />
      </mesh>
      <mesh position={[frontX + 0.02, yBottom - 0.03, zMid]}>
        <boxGeometry args={[0.05, 0.06, zLen + 0.1]} />
        <meshStandardMaterial color={trim} roughness={0.55} metalness={0.2} />
      </mesh>
      <mesh position={[frontX + 0.02, yMid, zMin - 0.03]}>
        <boxGeometry args={[0.05, yLen + 0.1, 0.06]} />
        <meshStandardMaterial color={trim} roughness={0.55} metalness={0.2} />
      </mesh>
      <mesh position={[frontX + 0.02, yMid, zMax + 0.03]}>
        <boxGeometry args={[0.05, yLen + 0.1, 0.06]} />
        <meshStandardMaterial color={trim} roughness={0.55} metalness={0.2} />
      </mesh>

      {/* 柜内照明（暖白），保证奖杯明亮 */}
      <pointLight position={[cx, yTop - 0.12, zMid]} intensity={9} distance={8} decay={2} color="#fff3df" />

      {TROPHIES.map((trophy) => (
        <Trophy key={trophy.id} data={trophy} onSelect={onSelectTrophy} />
      ))}
    </group>
  )
}
