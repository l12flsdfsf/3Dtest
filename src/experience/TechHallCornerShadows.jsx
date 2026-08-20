import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

const SHADER_CACHE_KEY = 'tech-hall-corner-occlusion-v1'

function findTechWallMeshes(scene, hallName) {
  const meshes = []

  scene.traverse((object) => {
    if (!object.isMesh) return
    const materials = Array.isArray(object.material) ? object.material : [object.material]
    if (!materials.some((material) => material?.name === hallName)) return
    meshes.push(object)
  })

  return meshes
}

function getCornerOcclusionBounds(scene, hallName) {
  const meshes = findTechWallMeshes(scene, hallName)
  if (!meshes.length) return null

  const box = new THREE.Box3()
  meshes.forEach((mesh) => box.expandByObject(mesh))

  return {
    meshes,
    west: box.min.x,
    east: box.max.x,
    south: box.min.z,
    north: box.max.z,
    bottom: box.min.y + 0.12,
    top: box.max.y - 0.72,
  }
}

function applyCornerOcclusion(material, bounds) {
  const shadowMaterial = material.clone()
  shadowMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.techCornerBounds = {
      value: new THREE.Vector4(bounds.west, bounds.east, bounds.south, bounds.north),
    }
    shader.uniforms.techCornerVerticalRange = {
      value: new THREE.Vector2(bounds.bottom, bounds.top),
    }
    shader.uniforms.techCornerWidth = { value: 0.48 }
    shader.uniforms.techCornerStrength = { value: 0.24 }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vTechCornerWorldPosition;',
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvTechCornerWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;',
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vTechCornerWorldPosition;
uniform vec4 techCornerBounds;
uniform vec2 techCornerVerticalRange;
uniform float techCornerWidth;
uniform float techCornerStrength;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `float westEdge = 1.0 - smoothstep(0.0, techCornerWidth, vTechCornerWorldPosition.x - techCornerBounds.x);
float eastEdge = 1.0 - smoothstep(0.0, techCornerWidth, techCornerBounds.y - vTechCornerWorldPosition.x);
float southEdge = 1.0 - smoothstep(0.0, techCornerWidth, vTechCornerWorldPosition.z - techCornerBounds.z);
float northEdge = 1.0 - smoothstep(0.0, techCornerWidth, techCornerBounds.w - vTechCornerWorldPosition.z);
float cornerOcclusion = max(
  max(min(westEdge, southEdge), min(westEdge, northEdge)),
  max(min(eastEdge, southEdge), min(eastEdge, northEdge))
);
float verticalOcclusion =
  smoothstep(techCornerVerticalRange.x, techCornerVerticalRange.x + 0.18, vTechCornerWorldPosition.y) *
  (1.0 - smoothstep(techCornerVerticalRange.y - 0.18, techCornerVerticalRange.y, vTechCornerWorldPosition.y));
outgoingLight *= 1.0 - cornerOcclusion * verticalOcclusion * techCornerStrength;
#include <opaque_fragment>`,
      )
  }
  shadowMaterial.customProgramCacheKey = () => SHADER_CACHE_KEY
  shadowMaterial.needsUpdate = true
  return shadowMaterial
}

export function TechHallCornerShadows({ scene, worldLayout }) {
  const techHall = worldLayout?.halls?.find((hall) => hall.id === 'tech')
  const bounds = useMemo(
    () => (techHall ? getCornerOcclusionBounds(scene, techHall.name) : null),
    [scene, techHall],
  )

  useEffect(() => {
    if (!bounds) return undefined

    const materialStates = bounds.meshes.map((mesh) => {
      const originalMaterial = mesh.material
      const originalMaterials = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial]
      const shadowMaterials = originalMaterials.map((material) => applyCornerOcclusion(material, bounds))
      mesh.material = Array.isArray(originalMaterial) ? shadowMaterials : shadowMaterials[0]
      return { mesh, originalMaterial, shadowMaterials }
    })

    return () => {
      materialStates.forEach(({ mesh, originalMaterial, shadowMaterials }) => {
        mesh.material = originalMaterial
        shadowMaterials.forEach((material) => material.dispose())
      })
    }
  }, [bounds])

  return null
}
