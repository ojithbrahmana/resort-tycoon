import * as THREE from "three"
import { createScene } from "./scene.js"
import { createCamera, attachCameraControls } from "./camera.js"
import { worldToGrid, gridToWorld, key } from "./grid.js"
import { ISLAND_RADIUS, GRID_HALF } from "../game/constants"
import { makeBillboardSprite, makeIconSprite, makeTextSprite } from "./sprites.js"
import { createBuildingObject } from "../game/BuildingRenderer.js"

export function createEngine({ container }){
  const width = container.clientWidth
  const height = container.clientHeight

  const renderer = new THREE.WebGLRenderer({ antialias:true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.shadowMap.enabled = true
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)

  const { scene, island } = createScene()
  const camera = createCamera(width,height)
  const controls = attachCameraControls({ dom: renderer.domElement, camera })

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()

  const buildGroup = new THREE.Group()
  const roadGroup = new THREE.Group()
  scene.add(buildGroup)
  scene.add(roadGroup)

  const roadSystem = createRoadSystem({ roadGroup })

  const popups = []
  const guests = []
  const villaStatus = new Map()
  const bounceQueue = []

  let ghost = null
  let mode = "build"
  let selectedTool = "villa"
  let onPlace = null
  let onHover = null
  let lastTime = performance.now()

  function setHandlers({ onPlaceCb, onHoverCb }){
    onPlace = onPlaceCb
    onHover = onHoverCb
  }

  function setMode(next){ mode = next; removeGhost() }
  function setTool(t){ selectedTool = t; removeGhost() }

  function removeGhost(){
    if(ghost){
      buildGroup.remove(ghost)
      ghost = null
    }
  }

  function withinIsland(x,z){
    return Math.sqrt(x*x + z*z) <= (ISLAND_RADIUS - 3)
  }

  function isWithinGrid(gx,gz){
    return Math.abs(gx) <= GRID_HALF && Math.abs(gz) <= GRID_HALF
  }

  function pickIsland(clientX, clientY){
    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -(((clientY - rect.top) / rect.height) * 2 - 1)
    raycaster.setFromCamera(mouse, camera)
    const hits = raycaster.intersectObject(island)
    if(hits.length===0) return null
    return hits[0].point
  }

  function ensureGhost(spriteUrl){
    if(ghost) return
    ghost = makeBillboardSprite(spriteUrl, 3.6)
    ghost.material.opacity = 0.7
    buildGroup.add(ghost)
  }

  function handleMouseMove(e, { spriteUrl, occupiedKeys }){
    const p = pickIsland(e.clientX, e.clientY)
    if(!p){ removeGhost(); onHover?.(null); return }
    const { gx, gz } = worldToGrid(p.x, p.z)
    const { x, z } = gridToWorld(gx,gz)

    const ok = withinIsland(x,z) && isWithinGrid(gx,gz) && !occupiedKeys.has(key(gx,gz))
    ensureGhost(spriteUrl)
    ghost.position.set(x, 4.2, z)
    ghost.material.color.setHex(ok ? 0x22c55e : 0xef4444)
    ghost.userData = { gx, gz, ok }
    onHover?.({ gx, gz, ok })
  }

  function handleClick(){
    if(!ghost || !ghost.userData?.ok) return
    onPlace?.({ gx: ghost.userData.gx, gz: ghost.userData.gz })
  }

  function addBuilding({ building, gx, gz, uid }){
    if (building.id === "road") {
      roadSystem.addRoad({ gx, gz })
      return null
    }

    const { x, z } = gridToWorld(gx,gz)
    const object = createBuildingObject({ id: building.id })
    object.position.set(x, 3.25, z)
    object.userData = { gx, gz, uid }
    object.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    buildGroup.add(object)
    bounceQueue.push({ object, time: 0 })
    return object
  }

  function removePlacedObject(obj){
    if (!obj) return
    if (obj.userData?.roadKey) {
      roadSystem.removeRoad(obj.userData.roadKey)
      return
    }
    buildGroup.remove(obj)
  }

  function updateVillaStatus({ uid, gx, gz, roadOk, powerOk, active }){
    let status = villaStatus.get(uid)
    if (!status) {
      status = {
        road: makeIconSprite({ emoji: "🛣️", background: "#ff5b5b" }),
        power: makeIconSprite({ emoji: "⚡", background: "#ff5b5b" }),
        coin: makeIconSprite({ emoji: "🪙", background: "#22c55e" }),
        pulse: 0,
      }
      status.road.position.set(0, 9, 0)
      status.power.position.set(0, 9, 0)
      status.coin.position.set(0, 9, 0)
      buildGroup.add(status.road)
      buildGroup.add(status.power)
      buildGroup.add(status.coin)
      villaStatus.set(uid, status)
    }

    const { x, z } = gridToWorld(gx,gz)
    const baseY = 9.2

    status.road.position.set(x - 1.4, baseY, z)
    status.power.position.set(x + 1.4, baseY, z)
    status.coin.position.set(x, baseY + 0.6, z)

    status.road.visible = !roadOk
    status.power.visible = !powerOk
    status.coin.visible = active
  }

  function spawnPopup({ text, gx, gz, color = "#22c55e" }){
    const { x, z } = gridToWorld(gx, gz)
    const spr = makeTextSprite({ text, background: color })
    spr.position.set(x, 10, z)
    buildGroup.add(spr)
    popups.push({ sprite: spr, ttl: 1.2, velocity: 1.4 })
  }

  function spawnSparkle({ gx, gz }){
    const { x, z } = gridToWorld(gx, gz)
    const spr = makeIconSprite({ emoji: "✨", background: "#facc15", size: 1.4 })
    spr.position.set(x + 0.4, 9.6, z - 0.4)
    buildGroup.add(spr)
    popups.push({ sprite: spr, ttl: 0.8, velocity: 0.9 })
  }

  function spawnGuest({ path }){
    if (!path || path.length < 2) return
    const sprite = makeIconSprite({ emoji: "🧍", background: "#5b8cff", size: 1.8 })
    const { x, z } = gridToWorld(path[0].gx, path[0].gz)
    sprite.position.set(x, 4.5, z)
    buildGroup.add(sprite)
    guests.push({ sprite, path, index: 0, speed: 2 })
  }

  function resize(){
    const w = container.clientWidth
    const h = container.clientHeight
    camera.aspect = w/h
    camera.updateProjectionMatrix()
    renderer.setSize(w,h)
  }

  window.addEventListener("resize", resize)

  function render(){
    renderer.render(scene, camera)
  }

  function update(delta){
    for (let i = popups.length - 1; i >= 0; i -= 1) {
      const p = popups[i]
      p.ttl -= delta
      p.sprite.position.y += p.velocity * delta
      p.sprite.material.opacity = Math.max(0, p.ttl / 1.2)
      if (p.ttl <= 0) {
        buildGroup.remove(p.sprite)
        popups.splice(i, 1)
      }
    }

    for (const status of villaStatus.values()) {
      status.pulse += delta
      if (status.coin.visible) {
        const scale = 1 + Math.sin(status.pulse * 6) * 0.08
        status.coin.scale.set(scale * 2.2, scale * 2.2, 1)
      }
    }

    for (let i = guests.length - 1; i >= 0; i -= 1) {
      const guest = guests[i]
      const nextIndex = Math.min(guest.index + 1, guest.path.length - 1)
      const next = guest.path[nextIndex]
      const target = gridToWorld(next.gx, next.gz)
      const dx = target.x - guest.sprite.position.x
      const dz = target.z - guest.sprite.position.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < 0.2) {
        guest.index = nextIndex
        if (guest.index >= guest.path.length - 1) {
          buildGroup.remove(guest.sprite)
          guests.splice(i, 1)
        }
      } else {
        guest.sprite.position.x += (dx / dist) * guest.speed * delta
        guest.sprite.position.z += (dz / dist) * guest.speed * delta
      }
    }

    for (let i = bounceQueue.length - 1; i >= 0; i -= 1) {
      const b = bounceQueue[i]
      b.time += delta
      const t = Math.min(1, b.time / 0.28)
      const scale = 0.6 + Math.sin(t * Math.PI) * 0.45
      b.object.scale.setScalar(scale)
      if (t >= 1) {
        b.object.scale.setScalar(1)
        bounceQueue.splice(i, 1)
      }
    }
  }

  function tick(){
    const now = performance.now()
    const delta = Math.min(0.05, (now - lastTime) / 1000)
    lastTime = now
    controls.update?.()
    update(delta)
    render()
    requestAnimationFrame(tick)
  }
  tick()

  return {
    renderer,
    scene,
    camera,
    island,
    buildGroup,
    setMode,
    setTool,
    setHandlers,
    pickIsland,
    handleMouseMove,
    handleClick,
    addBuilding,
    removePlacedObject,
    updateVillaStatus,
    spawnPopup,
    spawnSparkle,
    spawnGuest,
    shakeCamera: (strength = 0.6) => controls.shake?.(strength),
    getGuestCount: () => guests.length,
    updateRoadsAround: (gx, gz) => roadSystem.updateNeighbors({ gx, gz }),
  }
}

function createRoadSystem({ roadGroup }){
  const roadSet = new Set()
  const roadData = new Map()
  const geometryMap = createRoadGeometries()
  const material = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.65 })
  const edgeMaterial = new THREE.MeshBasicMaterial({ color: 0x0b1220, transparent: true, opacity: 0.35 })

  const meshes = {}
  const edgeMeshes = {}
  const typeKeys = Object.keys(geometryMap)
  for (const type of typeKeys) {
    meshes[type] = new THREE.InstancedMesh(geometryMap[type], material, 400)
    meshes[type].instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    meshes[type].castShadow = true
    meshes[type].receiveShadow = true
    meshes[type].count = 0
    roadGroup.add(meshes[type])

    edgeMeshes[type] = new THREE.InstancedMesh(geometryMap[type], edgeMaterial, 400)
    edgeMeshes[type].instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    edgeMeshes[type].count = 0
    roadGroup.add(edgeMeshes[type])
  }

  function addRoad({ gx, gz }){
    const k = key(gx, gz)
    if (roadSet.has(k)) return
    roadSet.add(k)
    updateNeighbors({ gx, gz })
  }

  function removeRoad(k){
    if (!roadSet.has(k)) return
    roadSet.delete(k)
    if (roadData.has(k)) removeInstance(k)
    const [gx, gz] = k.split(",").map(Number)
    updateNeighbors({ gx, gz })
  }

  function updateNeighbors({ gx, gz }){
    updateRoadAt(gx, gz)
    updateRoadAt(gx + 1, gz)
    updateRoadAt(gx - 1, gz)
    updateRoadAt(gx, gz + 1)
    updateRoadAt(gx, gz - 1)
  }

  function updateRoadAt(gx, gz){
    const k = key(gx, gz)
    if (!roadSet.has(k)) {
      if (roadData.has(k)) removeInstance(k)
      return
    }
    const mask = getRoadMask(gx, gz)
    const { type, rotation, offset } = resolveRoadVariant(mask)
    setRoadInstance(k, type, rotation, offset)
  }

  function getRoadMask(gx, gz){
    let mask = 0
    if (roadSet.has(key(gx, gz + 1))) mask += 1
    if (roadSet.has(key(gx + 1, gz))) mask += 2
    if (roadSet.has(key(gx, gz - 1))) mask += 4
    if (roadSet.has(key(gx - 1, gz))) mask += 8
    return mask
  }

  function setRoadInstance(k, type, rotation, offset){
    const existing = roadData.get(k)
    if (existing && existing.type !== type) {
      removeInstance(k)
    }
    const record = roadData.get(k) || { type, index: null }
    if (record.index === null) {
      record.index = meshes[type].count
      meshes[type].count += 1
      edgeMeshes[type].count += 1
      record.type = type
      roadData.set(k, record)
    }
    const [gx, gz] = k.split(",").map(Number)
    const { x, z } = gridToWorld(gx, gz)
    const matrix = new THREE.Matrix4()
    const position = new THREE.Vector3(x, 3.2, z)
    const rotationVec = new THREE.Euler(0, rotation, 0)
    const scale = new THREE.Vector3(1, 1, 1)
    const offsetVec = new THREE.Vector3(offset.x, 0, offset.z)
    offsetVec.applyEuler(rotationVec)
    position.add(offsetVec)
    matrix.compose(position, new THREE.Quaternion().setFromEuler(rotationVec), scale)
    meshes[type].setMatrixAt(record.index, matrix)

    const outlineMatrix = new THREE.Matrix4()
    outlineMatrix.compose(position, new THREE.Quaternion().setFromEuler(rotationVec), new THREE.Vector3(1.04, 1.04, 1.04))
    edgeMeshes[type].setMatrixAt(record.index, outlineMatrix)

    meshes[type].instanceMatrix.needsUpdate = true
    edgeMeshes[type].instanceMatrix.needsUpdate = true
  }

  function removeInstance(k){
    const record = roadData.get(k)
    if (!record) return
    const mesh = meshes[record.type]
    const edgeMesh = edgeMeshes[record.type]
    const lastIndex = mesh.count - 1
    if (record.index !== lastIndex) {
      const tempMatrix = new THREE.Matrix4()
      mesh.getMatrixAt(lastIndex, tempMatrix)
      mesh.setMatrixAt(record.index, tempMatrix)
      edgeMesh.getMatrixAt(lastIndex, tempMatrix)
      edgeMesh.setMatrixAt(record.index, tempMatrix)
      const swappedKey = [...roadData.entries()].find(([, value]) => value.type === record.type && value.index === lastIndex)?.[0]
      if (swappedKey) {
        roadData.set(swappedKey, { type: record.type, index: record.index })
      }
    }
    mesh.count -= 1
    edgeMesh.count -= 1
    mesh.instanceMatrix.needsUpdate = true
    edgeMesh.instanceMatrix.needsUpdate = true
    roadData.delete(k)
  }

  return { addRoad, removeRoad, updateNeighbors }
}

function resolveRoadVariant(mask){
  const offset = { x: 0, z: 0 }
  switch (mask) {
    case 1:
      return { type: "end", rotation: 0, offset: { x: 0, z: 0.4 } }
    case 2:
      return { type: "end", rotation: -Math.PI / 2, offset: { x: 0, z: 0.4 } }
    case 4:
      return { type: "end", rotation: Math.PI, offset: { x: 0, z: 0.4 } }
    case 8:
      return { type: "end", rotation: Math.PI / 2, offset: { x: 0, z: 0.4 } }
    case 5:
      return { type: "straight", rotation: 0, offset }
    case 10:
      return { type: "straight", rotation: Math.PI / 2, offset }
    case 3:
      return { type: "corner", rotation: 0, offset }
    case 6:
      return { type: "corner", rotation: Math.PI / 2, offset }
    case 12:
      return { type: "corner", rotation: Math.PI, offset }
    case 9:
      return { type: "corner", rotation: -Math.PI / 2, offset }
    case 7:
      return { type: "tee", rotation: Math.PI / 2, offset }
    case 11:
      return { type: "tee", rotation: 0, offset }
    case 13:
      return { type: "tee", rotation: -Math.PI / 2, offset }
    case 14:
      return { type: "tee", rotation: Math.PI, offset }
    case 15:
      return { type: "cross", rotation: 0, offset }
    case 0:
    default:
      return { type: "end", rotation: 0, offset }
  }
}

function createRoadGeometries(){
  const tile = 4
  const width = 2.2
  const half = tile / 2
  const depth = 0.35
  const bevel = 0.08

  const straightShape = new THREE.Shape()
  straightShape.moveTo(-width / 2, -half)
  straightShape.lineTo(width / 2, -half)
  straightShape.lineTo(width / 2, half)
  straightShape.lineTo(-width / 2, half)
  straightShape.lineTo(-width / 2, -half)

  const endShape = new THREE.Shape()
  const endLength = tile * 0.8
  endShape.moveTo(-width / 2, -endLength / 2)
  endShape.lineTo(width / 2, -endLength / 2)
  endShape.lineTo(width / 2, endLength / 2)
  endShape.lineTo(-width / 2, endLength / 2)
  endShape.lineTo(-width / 2, -endLength / 2)

  const cornerShape = new THREE.Shape()
  cornerShape.moveTo(-width / 2, -width / 2)
  cornerShape.lineTo(width / 2, -width / 2)
  cornerShape.lineTo(width / 2, 0)
  cornerShape.lineTo(half, 0)
  cornerShape.lineTo(half, width / 2)
  cornerShape.lineTo(-width / 2, width / 2)
  cornerShape.lineTo(-width / 2, -width / 2)

  const teeShape = new THREE.Shape()
  teeShape.moveTo(-half, -width / 2)
  teeShape.lineTo(half, -width / 2)
  teeShape.lineTo(half, width / 2)
  teeShape.lineTo(width / 2, width / 2)
  teeShape.lineTo(width / 2, half)
  teeShape.lineTo(-width / 2, half)
  teeShape.lineTo(-width / 2, width / 2)
  teeShape.lineTo(-half, width / 2)
  teeShape.lineTo(-half, -width / 2)

  const crossShape = new THREE.Shape()
  crossShape.moveTo(-width / 2, -half)
  crossShape.lineTo(width / 2, -half)
  crossShape.lineTo(width / 2, -width / 2)
  crossShape.lineTo(half, -width / 2)
  crossShape.lineTo(half, width / 2)
  crossShape.lineTo(width / 2, width / 2)
  crossShape.lineTo(width / 2, half)
  crossShape.lineTo(-width / 2, half)
  crossShape.lineTo(-width / 2, width / 2)
  crossShape.lineTo(-half, width / 2)
  crossShape.lineTo(-half, -width / 2)
  crossShape.lineTo(-width / 2, -width / 2)

  const extrude = (shape) => new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
  })

  const geometries = {
    straight: extrude(straightShape),
    end: extrude(endShape),
    corner: extrude(cornerShape),
    tee: extrude(teeShape),
    cross: extrude(crossShape),
  }

  Object.values(geometries).forEach(geo => {
    geo.rotateX(-Math.PI / 2)
    geo.translate(0, 0, 0)
  })
  return geometries
}
