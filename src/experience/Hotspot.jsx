import { useEffect, useRef, useState } from 'react'

export function Hotspot({ data, markersRef, onSelect }) {
  const sphereRef = useRef()
  const [hovered, setHovered] = useState(false)

  useEffect(() => {
    const mesh = sphereRef.current
    if (!mesh) return
    mesh.userData.hotspot = data
    markersRef.current.push({ mesh, data })
    return () => {
      markersRef.current = markersRef.current.filter((item) => item.mesh !== mesh)
    }
  }, [data, markersRef])

  return (
    <group position={data.position}>
      <mesh>
        <sphereGeometry args={[0.14, 20, 20]} />
        <meshBasicMaterial color={data.color} transparent opacity={hovered ? 0.34 : 0.18} toneMapped={false} />
      </mesh>

      <mesh
        ref={sphereRef}
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
        <sphereGeometry args={[0.08, 24, 24]} />
        <meshStandardMaterial
          color={data.color}
          emissive={data.color}
          emissiveIntensity={hovered ? 2.1 : 1.4}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
