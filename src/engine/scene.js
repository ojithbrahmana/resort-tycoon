import * as THREE from "three"
import { ISLAND_RADIUS } from "../data/constants.js"

export function createScene(){
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0xbfeef0)
  scene.fog = new THREE.Fog(0xbfeef0, 140, 520)

  const ambient = new THREE.AmbientLight(0xffffff, 0.75)
  scene.add(ambient)

  const sun = new THREE.DirectionalLight(0xffffff, 0.9)
  sun.position.set(90, 140, 70)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048,2048)
  sun.shadow.camera.near = 10
  sun.shadow.camera.far = 400
  scene.add(sun)

  // ocean
  const ocean = new THREE.Mesh(
    new THREE.CircleGeometry(1200, 64),
    new THREE.MeshStandardMaterial({ color: 0x2dd4bf, roughness: 0.35, metalness: 0.0 })
  )
  ocean.rotation.x = -Math.PI/2
  ocean.position.y = -1
  ocean.receiveShadow = true
  scene.add(ocean)

  // island base
  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS+10, 6, 64),
    new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.9 })
  )
  island.position.y = 0
  island.receiveShadow = true
  island.castShadow = false
  island.name = "island"
  scene.add(island)

  // subtle grid
  const grid = new THREE.GridHelper(120, 120/4, 0x0f766e, 0x0f766e)
  grid.position.y = 3.1
  grid.material.opacity = 0.08
  grid.material.transparent = true
  scene.add(grid)

  return { scene, island }
}
