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
  scene.add(buildGroup)

  const popups = []
  const guests = []
  const villaStatus = new Map()

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

  async function addBuilding({ building, gx, gz, uid }){
    const { x, z } = gridToWorld(gx,gz)
    const placeholder = makeBillboardSprite(building.spritePath, building.id === "road" ? 3.0 : 3.6)
    placeholder.position.set(x, 4.2, z)
    placeholder.userData = { gx, gz, uid }
    buildGroup.add(placeholder)

    if (building.modelPath) {
      const { object, isModel } = await createBuildingObject({
        modelPath: building.modelPath,
        spritePath: building.spritePath,
        size: building.id === "road" ? 3.0 : 3.6,
      })
      if (isModel) {
        buildGroup.remove(placeholder)
        object.position.set(x, 3.4, z)
        object.userData = { gx, gz, uid }
        buildGroup.add(object)
        return object
      }
    }

    return placeholder
  }

  function removePlacedObject(obj){
    if (!obj) return
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
    spawnGuest,
    getGuestCount: () => guests.length,
  }
}
