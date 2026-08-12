import { useGLTF } from '@react-three/drei'

export function GltfModel({ url }) {
  const { scene } = useGLTF(url)
  return <primitive object={scene} />
}
