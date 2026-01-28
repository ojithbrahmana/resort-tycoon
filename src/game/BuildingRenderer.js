import * as THREE from "three"
import { makeBillboardSprite } from "../engine/sprites.js"

function createContactShadow(radius) {
  const geo = new THREE.CircleGeometry(radius, 24)
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  })
  const shadow = new THREE.Mesh(geo, mat)
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.05
  return shadow
}

function createVillaMesh({ upgraded = false }) {
  const group = new THREE.Group()
  const baseMat = new THREE.MeshStandardMaterial({
    color: upgraded ? 0xdbeafe : 0xfbcfe8,
    roughness: 0.7,
  })
  const roofMat = new THREE.MeshStandardMaterial({
    color: upgraded ? 0x93c5fd : 0xfdba74,
    roughness: 0.55,
  })
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xf9fafb,
    roughness: 0.8,
  })

  const base = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 2.4), baseMat)
  base.position.y = 0.8
  base.castShadow = true
  base.receiveShadow = true

  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 4), roofMat)
  roof.rotation.y = Math.PI / 4
  roof.position.y = 2.1
  roof.castShadow = true
  roof.receiveShadow = true

  const trim = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.2, 2.5), trimMat)
  trim.position.y = 1.65
  trim.castShadow = true

  group.add(createContactShadow(1.6))
  group.add(base, trim, roof)
  return group
}

function createGeneratorMesh() {
  const group = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xa7f3d0,
    roughness: 0.6,
  })
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.5,
    metalness: 0.4,
  })
  const emissiveMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfef08a,
    emissiveIntensity: 0.8,
  })

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.8), bodyMat)
  body.position.y = 0.6
  body.castShadow = true
  body.receiveShadow = true

  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.4, 8), metalMat)
  chimney.position.set(0.7, 1.5, -0.5)
  chimney.castShadow = true

  const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), emissiveMat)
  light.position.set(-0.6, 1.05, 0.6)

  group.add(createContactShadow(1.3))
  group.add(body, chimney, light)
  return group
}

function createPalmMesh() {
  const group = new THREE.Group()
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0xcaa472, roughness: 0.8 })
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.7 })

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3.6, 8), trunkMat)
  trunk.position.y = 1.8
  trunk.castShadow = true
  trunk.receiveShadow = true

  const leaves = new THREE.Group()
  for (let i = 0; i < 4; i += 1) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.4, 6), leafMat)
    leaf.position.set(Math.cos((Math.PI / 2) * i) * 0.6, 3.6, Math.sin((Math.PI / 2) * i) * 0.6)
    leaf.rotation.x = Math.PI / 2
    leaf.rotation.z = (Math.PI / 2) * i
    leaf.castShadow = true
    leaves.add(leaf)
  }

  group.add(createContactShadow(1.1))
  group.add(trunk, leaves)
  return group
}

export async function createBuildingObject({ building, spritePath, size = 3.6 }){
  if (building?.id === "villa" || building?.id === "villa_plus") {
    return { object: createVillaMesh({ upgraded: building.id === "villa_plus" }), isModel: true }
  }
  if (building?.id === "generator") {
    return { object: createGeneratorMesh(), isModel: true }
  }
  if (building?.id === "palm") {
    return { object: createPalmMesh(), isModel: true }
  }

  return { object: makeBillboardSprite(spritePath, size), isModel: false }
}
