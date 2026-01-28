import * as THREE from "three"
import { createScene } from "./scene.js"
import { createCamera, attachCameraControls } from "./camera.js"
import { worldToGrid, gridToWorld, key } from "./grid.js"
import { ISLAND_RADIUS, GRID_HALF } from "../game/constants"
import { makeBillboardSprite, makeIconSprite, makeTextSprite } from "./sprites.js"
import { createBuildingObject, preloadBuildingModels } from "../game/BuildingRenderer.js"
import { RoadSystem } from "./roads.js"

export function createEngine({ container }){
  preloadBuildingModels()
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
  const groundY = 3.1

  const buildGroup = new THREE.Group()
  scene.add(buildGroup)
  const roadSystem = new RoadSystem({ scene, y: groundY + 0.08 })

  const popups = []
  const guests = []
  const villaStatus = new Map()
  const sparkles = []
  const placementBounces = []

  let ghost = null
  let mode = "build"
  let selectedTool = "villa"
  let onPlace = null
  let onHover = null
  let onInvalid = null
  let lastTime = performance.now()
  let shakeTime = 0
  let shakeDuration = 0.2
  let shakeStrength = 0.6

  function setHandlers({ onPlaceCb, onHoverCb, onInvalidCb }){
    onPlace = onPlaceCb
    onHover = onHoverCb
    onInvalid = onInvalidCb
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
    if(!ghost || !ghost.userData?.ok) {
      onInvalid?.()
      return
    }
    onPlace?.({ gx: ghost.userData.gx, gz: ghost.userData.gz })
  }

  function makeContactShadow(radius){
    const geo = new THREE.CircleGeometry(radius, 24)
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    })
    const shadow = new THREE.Mesh(geo, mat)
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = groundY + 0.03
    return shadow
  }

  async function addBuilding({ building, gx, gz, uid }){
    const { x, z } = gridToWorld(gx,gz)
    if (building.id === "road") {
      roadSystem.addRoad({ gx, gz })
      return { type: "road", gx, gz, uid }
    }

    const size = building.id === "road" ? 3.0 : 3.6
    const placeholder = makeBillboardSprite(building.spritePath, size)
    placeholder.position.set(x, groundY + size / 2, z)
    placeholder.userData = { gx, gz, uid }
    buildGroup.add(placeholder)

    if (building.modelPath) {
      const { object, isModel } = await createBuildingObject({
        building,
        spritePath: building.spritePath,
        size,
      })
      if (isModel) {
        buildGroup.remove(placeholder)
        object.position.set(x, groundY, z)
        object.userData = { gx, gz, uid }
        animatePlacement(object)
        buildGroup.add(object)
        return object
      }
    }

    const shadow = makeContactShadow(size * 0.42)
    shadow.position.set(x, groundY + 0.03, z)
    buildGroup.add(shadow)
    placeholder.userData.shadow = shadow
    animatePlacement(placeholder)
    return placeholder
  }

  function removePlacedObject(obj){
    if (!obj) return
    if (obj.type === "road") {
      roadSystem.removeRoad({ gx: obj.gx, gz: obj.gz })
      return
    }
    if (obj.userData?.shadow) {
      buildGroup.remove(obj.userData.shadow)
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

  function spawnCoinSparkle({ gx, gz }){
    const { x, z } = gridToWorld(gx, gz)
    const geo = new THREE.SphereGeometry(0.2, 10, 10)
    const mat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xfacc15,
      emissiveIntensity: 0.6,
    })
    const sparkle = new THREE.Mesh(geo, mat)
    sparkle.position.set(x + (Math.random() - 0.5) * 0.6, 7.5, z + (Math.random() - 0.5) * 0.6)
    sparkle.castShadow = false
    buildGroup.add(sparkle)
    sparkles.push({ mesh: sparkle, ttl: 0.6, velocity: 1.8 })
  }

  function animatePlacement(object){
    if (!object) return
    object.userData.baseScale = object.scale.clone()
    placementBounces.push({ object, time: 0, duration: 0.25 })
  }

  function shakeCamera(){
    shakeTime = shakeDuration
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
    roadSystem.update(delta)

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

    for (let i = sparkles.length - 1; i >= 0; i -= 1) {
      const s = sparkles[i]
      s.ttl -= delta
      s.mesh.position.y += s.velocity * delta
      s.mesh.material.opacity = Math.max(0, s.ttl / 0.6)
      s.mesh.material.transparent = true
      if (s.ttl <= 0) {
        buildGroup.remove(s.mesh)
        sparkles.splice(i, 1)
      }
    }

    for (const status of villaStatus.values()) {
      status.pulse += delta
      if (status.coin.visible) {
        const scale = 1 + Math.sin(status.pulse * 6) * 0.08
        status.coin.scale.set(scale * 2.2, scale * 2.2, 1)
      }
    }

    for (let i = placementBounces.length - 1; i >= 0; i -= 1) {
      const bounce = placementBounces[i]
      bounce.time += delta
      const progress = Math.min(1, bounce.time / bounce.duration)
      const scalePulse = 1 + Math.sin(progress * Math.PI) * 0.2
      const baseScale = bounce.object.userData.baseScale || new THREE.Vector3(1, 1, 1)
      bounce.object.scale.set(
        baseScale.x * scalePulse,
        baseScale.y * scalePulse,
        baseScale.z * scalePulse
      )
      if (progress >= 1) {
        bounce.object.scale.copy(baseScale)
        placementBounces.splice(i, 1)
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
  }

  function tick(){
    const now = performance.now()
    const delta = Math.min(0.05, (now - lastTime) / 1000)
    lastTime = now
    controls.update?.()
    if (shakeTime > 0) {
      shakeTime -= delta
      const strength = shakeStrength * (shakeTime / shakeDuration)
      camera.position.x += (Math.random() - 0.5) * strength
      camera.position.y += (Math.random() - 0.5) * strength
      camera.position.z += (Math.random() - 0.5) * strength
    }
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
    spawnCoinSparkle,
    spawnGuest,
    shakeCamera,
    getGuestCount: () => guests.length,
  }
}
