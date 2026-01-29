import * as THREE from "three"
import { GRID_HALF, GRID_SIZE, ISLAND_RADIUS } from "../game/constants"

export const TERRAIN_Y = 3.0
export const GRID_Y = TERRAIN_Y + 0.01
export const BUILD_OVERLAY_Y = TERRAIN_Y + 0.02
export const PREVIEW_OVERLAY_Y = TERRAIN_Y + 0.03

export function createScene(){
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x8ae3ff)
  scene.fog = new THREE.Fog(0x8ae3ff, 140, 520)

  const ambient = new THREE.AmbientLight(0xffffff, 0.86)
  scene.add(ambient)

  const sun = new THREE.DirectionalLight(0xffffff, 1.04)
  sun.position.set(90, 140, 70)
  sun.castShadow = true
  sun.shadow.mapSize.set(768, 768)
  sun.shadow.camera.near = 10
  sun.shadow.camera.far = 320
  scene.add(sun)

  // ocean
  const ocean = new THREE.Mesh(
    new THREE.CircleGeometry(1200, 64),
    new THREE.MeshStandardMaterial({ color: 0x2dd4bf, roughness: 0.35, metalness: 0.0 })
  )
  ocean.rotation.x = -Math.PI/2
  ocean.position.y = -1
  ocean.receiveShadow = false
  scene.add(ocean)

  // island base
  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS+10, 6, 64),
    new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.9 })
  )
  island.position.y = 0
  island.receiveShadow = false
  island.castShadow = false
  island.name = "island"
  scene.add(island)

  // shoreline ring
  const shore = new THREE.Mesh(
    new THREE.RingGeometry(ISLAND_RADIUS - 6, ISLAND_RADIUS + 6, 64),
    new THREE.MeshStandardMaterial({ color: 0xfed7aa, roughness: 0.95 })
  )
  shore.rotation.x = -Math.PI / 2
  shore.position.y = TERRAIN_Y + 0.04
  shore.receiveShadow = false
  scene.add(shore)

  // grass patch
  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(ISLAND_RADIUS - 12, 64),
    new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.85 })
  )
  grass.rotation.x = -Math.PI / 2
  grass.position.y = TERRAIN_Y
  grass.receiveShadow = false
  scene.add(grass)

  // subtle grid
  const gridSize = GRID_SIZE * GRID_HALF * 2
  const grid = new THREE.GridHelper(gridSize, gridSize / GRID_SIZE, 0x0f766e, 0x0f766e)
  grid.position.y = GRID_Y
  grid.material.opacity = 0.08
  grid.material.transparent = true
  grid.material.depthWrite = false
  grid.material.depthTest = false
  grid.renderOrder = 1
  scene.add(grid)

  return { scene, island }
}
