import * as THREE from "three"

function makeContactShadow(){
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 20),
    new THREE.MeshBasicMaterial({ color: 0x0f172a, transparent: true, opacity: 0.28 })
  )
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.05
  return shadow
}

function makeVilla(){
  const group = new THREE.Group()
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.6, 2.2),
    new THREE.MeshStandardMaterial({ color: 0xffc4d6, roughness: 0.6 })
  )
  base.position.y = 1.1
  base.castShadow = true

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.9, 1.4, 4),
    new THREE.MeshStandardMaterial({ color: 0xff7ac7, roughness: 0.5 })
  )
  roof.rotation.y = Math.PI / 4
  roof.position.y = 2.3
  roof.castShadow = true

  group.add(makeContactShadow(), base, roof)
  return group
}

function makeGenerator(){
  const group = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.4, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x93c5fd, roughness: 0.55 })
  )
  body.position.y = 0.9
  body.castShadow = true

  const chimney = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.35, 1.6, 12),
    new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.5 })
  )
  chimney.position.set(0.7, 2.0, -0.5)
  chimney.castShadow = true

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.25, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xfff59e, emissive: 0xfff1a8, emissiveIntensity: 0.8 })
  )
  bulb.position.set(-0.6, 1.4, 0.8)

  group.add(makeContactShadow(), body, chimney, bulb)
  return group
}

function makePalm(){
  const group = new THREE.Group()
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.35, 2.8, 10),
    new THREE.MeshStandardMaterial({ color: 0xcaa472, roughness: 0.7 })
  )
  trunk.position.y = 1.5
  trunk.castShadow = true

  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 1.2, 6),
    new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.6 })
  )
  leaves.position.y = 3.1
  leaves.rotation.y = Math.PI / 6
  leaves.castShadow = true

  group.add(makeContactShadow(), trunk, leaves)
  return group
}

function makeGeneric(color = 0xfcd34d){
  const group = new THREE.Group()
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 1.4, 2.2),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6 })
  )
  box.position.y = 0.95
  box.castShadow = true
  group.add(makeContactShadow(), box)
  return group
}

export function createBuildingObject({ id }){
  switch (id) {
    case "villa":
    case "villa_plus":
      return makeVilla()
    case "generator":
      return makeGenerator()
    case "palm":
      return makePalm()
    case "restaurant":
      return makeGeneric(0xfca5a5)
    case "spa":
      return makeGeneric(0xa7f3d0)
    case "dock":
      return makeGeneric(0xf8b4ff)
    case "pool":
      return makeGeneric(0x7dd3fc)
    case "nightbar":
      return makeGeneric(0xc4b5fd)
    case "lighthouse":
      return makeGeneric(0xfef08a)
    case "beachclub":
      return makeGeneric(0x86efac)
    default:
      return makeGeneric()
  }
}
