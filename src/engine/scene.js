import * as THREE from "three"
import { ISLAND_RADIUS } from "../game/constants"

export function createScene(){
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x8ae3ff)
  scene.fog = new THREE.Fog(0x8ae3ff, 140, 520)

  const ambient = new THREE.AmbientLight(0xffffff, 0.86)
  scene.add(ambient)

  const sun = new THREE.DirectionalLight(0xffffff, 1.04)
  sun.position.set(90, 140, 70)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
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

  // shoreline ring
  const shore = new THREE.Mesh(
    new THREE.RingGeometry(ISLAND_RADIUS - 6, ISLAND_RADIUS + 6, 64),
    new THREE.MeshStandardMaterial({ color: 0xfed7aa, roughness: 0.95 })
  )
  shore.rotation.x = -Math.PI / 2
  shore.position.y = 3.05
  scene.add(shore)

  // grass patch
  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(ISLAND_RADIUS - 12, 64),
    new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.85 })
  )
  grass.rotation.x = -Math.PI / 2
  grass.position.y = 3.02
  scene.add(grass)

  // decorative props
  const props = new THREE.Group()
  const rockGeo = new THREE.DodecahedronGeometry(2.5, 0)
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8b8b, roughness: 0.8 })
  const palmMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.8 })

  for (let i = 0; i < 6; i += 1) {
    const rock = new THREE.Mesh(rockGeo, rockMat)
    rock.position.set(20 + i * 4, 4, -18 + i * 3)
    rock.castShadow = false
    props.add(rock)
  }

  for (let i = 0; i < 5; i += 1) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 6, 6), new THREE.MeshStandardMaterial({ color: 0xcaa472 }))
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(3, 4, 6), palmMat)
    trunk.position.set(-18 + i * 6, 6, 18 - i * 4)
    leaves.position.set(trunk.position.x, 9, trunk.position.z)
    trunk.castShadow = false
    leaves.castShadow = false
    props.add(trunk)
    props.add(leaves)
  }

  scene.add(props)

  // subtle grid
  const grid = new THREE.GridHelper(120, 120/4, 0x0f766e, 0x0f766e)
  grid.position.y = 3.1
  grid.material.opacity = 0.08
  grid.material.transparent = true
  scene.add(grid)

  return { scene, island }
}
