import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { SkeletonUtils } from "three/examples/jsm/utils/SkeletonUtils.js"
import { createScene } from "./scene.js"
import { createCamera, attachCameraControls } from "./camera.js"
import { worldToGrid, gridToWorld, key, neighbors4 } from "./grid.js"
import { GRID_SIZE, ISLAND_RADIUS, GRID_HALF } from "../game/constants"
import { makeBillboardSprite, makeIconSprite, makeTextSprite } from "./sprites.js"
import { createBuildingObject, preloadBuildingModels } from "../game/BuildingRenderer.js"
import { RoadSystem } from "./roads.js"

const NPC_MODEL_URL = new URL("../assets/models/npc.woman.v1.glb", import.meta.url).toString()
const DRACO_DECODER_URL = "https://www.gstatic.com/draco/v1/decoders/"

let npcWomanTemplate = null
let npcWomanClips = []
let npcWomanScaleFactor = 1
let npcWomanPromise = null
let npcIdleClips = []
let npcWalkClips = []

function initNpcLoader(){
  if (npcWomanPromise) return npcWomanPromise
  const loader = new GLTFLoader()
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath(DRACO_DECODER_URL)
  loader.setDRACOLoader(dracoLoader)
  npcWomanPromise = loader.loadAsync(NPC_MODEL_URL).then((gltf) => {
    npcWomanTemplate = gltf.scene
    npcWomanClips = gltf.animations ?? []
    npcWomanTemplate.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    npcWomanTemplate.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(npcWomanTemplate)
    const height = bounds.max.y - bounds.min.y
    const targetHeight = 1.6
    npcWomanScaleFactor = height > 0 ? targetHeight / height : 1
    npcWomanTemplate.position.set(0, 0, 0)
    npcIdleClips = npcWomanClips.filter(clip => /idle/i.test(clip.name))
    npcWalkClips = npcWomanClips.filter(clip => /walk|walking/i.test(clip.name))
    if (!npcIdleClips.length && npcWomanClips.length) npcIdleClips = [npcWomanClips[0]]
    if (!npcWalkClips.length && npcWomanClips.length) npcWalkClips = [npcWomanClips[0]]
    return npcWomanTemplate
  })
  return npcWomanPromise
}

export function createEngine({ container }){
  preloadBuildingModels()
  initNpcLoader()
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
  controls.setEnabled?.(false)

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  const groundY = 3.1

  const buildGroup = new THREE.Group()
  scene.add(buildGroup)
  const roadSystem = new RoadSystem({ scene, y: groundY + 0.08 })

  const state = {
    npcs: [],
  }
  const buildingOccupiedKeys = new Set()
  const buildingTilesByUid = new Map()

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
  let inputLocked = false
  let npcTime = 0
  let npcSpawnedInitial = false
  let npcConflictCheckAt = 0

  function setHandlers({ onPlaceCb, onHoverCb, onInvalidCb }){
    onPlace = onPlaceCb
    onHover = onHoverCb
    onInvalid = onInvalidCb
  }

  function setMode(next){
    mode = next
    controls.setEnabled?.(!inputLocked && mode === "camera")
    removeGhost()
  }

  function setInputLocked(locked){
    inputLocked = locked
    controls.setEnabled?.(!inputLocked && mode === "camera")
  }
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

  function createFootprintOutline({ w, h }) {
    const width = GRID_SIZE * w
    const height = GRID_SIZE * h
    const geometry = new THREE.PlaneGeometry(width, height)
    const edges = new THREE.EdgesGeometry(geometry)
    const material = new THREE.LineBasicMaterial({ color: 0x22c55e })
    const outline = new THREE.LineSegments(edges, material)
    outline.rotation.x = -Math.PI / 2
    outline.position.y = groundY + 0.12
    outline.userData.footprint = { w, h }
    return outline
  }

  function ensureGhost({ footprint }){
    const nextFootprint = footprint ?? { w: 1, h: 1 }
    if (ghost) {
      const { w, h } = ghost.userData.footprint ?? { w: 1, h: 1 }
      if (w === nextFootprint.w && h === nextFootprint.h) return
      buildGroup.remove(ghost)
      ghost = null
    }
    ghost = createFootprintOutline(nextFootprint)
    buildGroup.add(ghost)
  }

  function getFootprintCells(gx, gz, footprint) {
    const { w = 1, h = 1 } = footprint ?? {}
    const cells = []
    for (let dx = 0; dx < w; dx += 1) {
      for (let dz = 0; dz < h; dz += 1) {
        cells.push({ gx: gx + dx, gz: gz + dz })
      }
    }
    return cells
  }

  function registerBuildingFootprint({ uid, gx, gz, footprint }) {
    if (!uid) return
    const cells = getFootprintCells(gx, gz, footprint)
    buildingTilesByUid.set(uid, cells)
    for (const cell of cells) {
      buildingOccupiedKeys.add(key(cell.gx, cell.gz))
    }
  }

  function unregisterBuildingFootprint(uid) {
    if (!uid) return
    const cells = buildingTilesByUid.get(uid)
    if (!cells) return
    for (const cell of cells) {
      buildingOccupiedKeys.delete(key(cell.gx, cell.gz))
    }
    buildingTilesByUid.delete(uid)
  }

  function isRoadTile(gx, gz) {
    return roadSystem.roadsSet.has(key(gx, gz))
  }

  function isBlockedTile(gx, gz) {
    if (!isRoadTile(gx, gz)) return true
    return buildingOccupiedKeys.has(key(gx, gz))
  }

  function handleMouseMove(e, { footprint, occupiedKeys }){
    const p = pickIsland(e.clientX, e.clientY)
    if(!p){ removeGhost(); onHover?.(null); return }
    const { gx, gz } = worldToGrid(p.x, p.z)
    const cells = getFootprintCells(gx, gz, footprint)
    const ok = cells.every(cell => {
      const { x, z } = gridToWorld(cell.gx, cell.gz)
      return withinIsland(x, z)
        && isWithinGrid(cell.gx, cell.gz)
        && !occupiedKeys.has(key(cell.gx, cell.gz))
    })

    const { w = 1, h = 1 } = footprint ?? {}
    const center = {
      gx: gx + (w - 1) / 2,
      gz: gz + (h - 1) / 2,
    }
    const { x, z } = gridToWorld(center.gx, center.gz)
    ensureGhost({ footprint: { w, h } })
    ghost.position.set(x, groundY + 0.2, z)
    ghost.material.color.setHex(ok ? 0x22c55e : 0xef4444)
    ghost.userData = { ...ghost.userData, gx, gz, ok }
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

  function getFootprintCenter({ gx, gz }, footprint){
    const { w = 1, h = 1 } = footprint ?? {}
    const center = {
      gx: gx + (w - 1) / 2,
      gz: gz + (h - 1) / 2,
    }
    return gridToWorld(center.gx, center.gz)
  }

  function parseTileKey(tileKey) {
    const [gx, gz] = tileKey.split(",").map(Number)
    return { gx, gz }
  }

  function findNearestRoadTile({ gx, gz }) {
    if (isRoadTile(gx, gz)) return { gx, gz }
    const startKey = key(gx, gz)
    const queue = [{ gx, gz }]
    const visited = new Set([startKey])
    while (queue.length) {
      const current = queue.shift()
      for (const neighbor of neighbors4(current.gx, current.gz)) {
        if (!isWithinGrid(neighbor.gx, neighbor.gz)) continue
        const { x, z } = gridToWorld(neighbor.gx, neighbor.gz)
        if (!withinIsland(x, z)) continue
        const neighborKey = key(neighbor.gx, neighbor.gz)
        if (visited.has(neighborKey)) continue
        if (isRoadTile(neighbor.gx, neighbor.gz)) {
          return neighbor
        }
        visited.add(neighborKey)
        queue.push(neighbor)
      }
    }
    return null
  }

  const MIN_NPC_DISTANCE = 2.0
  const NEAR_DISTANCE = 3.0
  const TOO_CLOSE = 1.2
  const NPC_DECISION_INTERVAL = 1.2
  const NPC_GROUND_OFFSET = 0.05
  const NPC_CONFLICT_INTERVAL = 0.5

  function getRoadTilesArray() {
    return Array.from(roadSystem.roadsSet.values())
  }

  function tileCenterPosition(gx, gz) {
    const { x, z } = gridToWorld(gx, gz)
    return new THREE.Vector3(x, groundY + NPC_GROUND_OFFSET, z)
  }

  function getNpcClipPool(isMoving) {
    if (isMoving) return npcWalkClips.length ? npcWalkClips : npcWomanClips
    return npcIdleClips.length ? npcIdleClips : npcWomanClips
  }

  function chooseClip(pool, excludeName) {
    if (!pool.length) return null
    const options = excludeName ? pool.filter(clip => clip.name !== excludeName) : pool
    const source = options.length ? options : pool
    return source[Math.floor(Math.random() * source.length)]
  }

  function playNpcClip(npc, clip, fadeDuration = 0.2) {
    if (!clip) return
    const action = npc.mixer.clipAction(clip)
    if (npc.action && npc.action !== action) {
      npc.action.fadeOut(fadeDuration)
    }
    action.reset()
    action.time = Math.random() * clip.duration
    action.timeScale = 0.9 + Math.random() * 0.25
    action.fadeIn(fadeDuration)
    action.play()
    npc.action = action
    npc.actionName = clip.name
    npc.currentClip = clip
  }

  function retimeNpcAction(npc) {
    if (!npc.action) return
    const clip = npc.action.getClip()
    npc.action.time = Math.random() * clip.duration
    npc.action.timeScale = 0.9 + Math.random() * 0.25
  }

  function isNpcTooClose(position) {
    for (const other of state.npcs) {
      if (other.mesh.position.distanceTo(position) < MIN_NPC_DISTANCE) {
        return true
      }
    }
    return false
  }

  function spawnNpcWoman({ tileKey, position } = {}) {
    if (!npcWomanTemplate) return null
    let targetTile = null
    if (tileKey) {
      const parsed = parseTileKey(tileKey)
      targetTile = findNearestRoadTile(parsed)
    } else if (position) {
      const grid = worldToGrid(position.x, position.z)
      targetTile = findNearestRoadTile(grid)
    }
    const roads = getRoadTilesArray()
    let attempts = 0
    let finalTile = targetTile
    while (attempts < 30) {
      if (!finalTile && roads.length) {
        finalTile = parseTileKey(roads[Math.floor(Math.random() * roads.length)])
      }
      if (!finalTile) return null
      if (!isBlockedTile(finalTile.gx, finalTile.gz)) {
        const pos = tileCenterPosition(finalTile.gx, finalTile.gz)
        if (!isNpcTooClose(pos)) {
          const npcMesh = SkeletonUtils.clone(npcWomanTemplate)
          npcMesh.scale.setScalar(npcWomanScaleFactor)
          npcMesh.position.copy(pos)
          npcMesh.traverse(child => {
            if (child.isMesh) {
              child.castShadow = true
              child.receiveShadow = true
            }
          })
          const mixer = new THREE.AnimationMixer(npcMesh)
          const clipPool = getNpcClipPool(false)
          const clip = chooseClip(clipPool)
          const npc = {
            mesh: npcMesh,
            mixer,
            actionName: clip?.name ?? "",
            speed: 1.1 + Math.random() * 0.5,
            phaseOffset: Math.random() * Math.PI * 2,
            targetTileKey: null,
            currentTileKey: key(finalTile.gx, finalTile.gz),
            lastTileKey: null,
            nextDecisionAt: npcTime + Math.random() * NPC_DECISION_INTERVAL,
            pauseUntil: 0,
            isMoving: false,
            action: null,
            currentClip: null,
          }
          playNpcClip(npc, clip, 0.0)
          buildGroup.add(npcMesh)
          state.npcs.push(npc)
          return npc
        }
      }
      finalTile = null
      attempts += 1
    }
    return null
  }

  function resolveNearbyAnimationConflicts() {
    if (state.npcs.length < 2) return
    for (let i = 0; i < state.npcs.length; i += 1) {
      const npc = state.npcs[i]
      for (let j = i + 1; j < state.npcs.length; j += 1) {
        const other = state.npcs[j]
        if (npc.mesh.position.distanceTo(other.mesh.position) >= NEAR_DISTANCE) continue
        if (!npc.actionName || npc.actionName !== other.actionName) continue
        const pool = getNpcClipPool(other.isMoving)
        const nextClip = chooseClip(pool, other.actionName)
        if (nextClip && nextClip.name !== other.actionName) {
          playNpcClip(other, nextClip)
        } else {
          retimeNpcAction(other)
        }
      }
    }
  }

  function chooseNpcTarget(npc) {
    const { gx, gz } = parseTileKey(npc.currentTileKey)
    let options = neighbors4(gx, gz).filter(tile => isRoadTile(tile.gx, tile.gz) && !isBlockedTile(tile.gx, tile.gz))
    if (npc.lastTileKey && options.length > 1) {
      options = options.filter(tile => key(tile.gx, tile.gz) !== npc.lastTileKey)
    }
    if (!options.length) return null
    const reserved = new Set(
      state.npcs
        .filter(other => other !== npc)
        .flatMap(other => [other.currentTileKey, other.targetTileKey].filter(Boolean))
    )
    options = options.filter(tile => !reserved.has(key(tile.gx, tile.gz)))
    if (!options.length) return null
    return options[Math.floor(Math.random() * options.length)]
  }

  function updateNpcMovement(npc, delta) {
    npc.mixer.update(delta)
    if (npc.pauseUntil && npcTime < npc.pauseUntil) return

    const nearby = state.npcs
      .filter(other => other !== npc)
      .map(other => npc.mesh.position.distanceTo(other.mesh.position))
    const nearest = nearby.length ? Math.min(...nearby) : Infinity
    let speedMultiplier = 1
    if (nearest < TOO_CLOSE) {
      speedMultiplier = 0.2
      if (nearest < TOO_CLOSE * 0.7) {
        npc.pauseUntil = npcTime + 0.4
        npc.targetTileKey = null
        npc.isMoving = false
        const idleClip = chooseClip(getNpcClipPool(false), npc.actionName)
        if (idleClip) playNpcClip(npc, idleClip)
        return
      }
    }

    if (npc.targetTileKey) {
      const { gx, gz } = parseTileKey(npc.targetTileKey)
      const targetPos = tileCenterPosition(gx, gz)
      const dx = targetPos.x - npc.mesh.position.x
      const dz = targetPos.z - npc.mesh.position.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < 0.05) {
        npc.mesh.position.copy(targetPos)
        npc.lastTileKey = npc.currentTileKey
        npc.currentTileKey = npc.targetTileKey
        npc.targetTileKey = null
        npc.isMoving = false
        const idleClip = chooseClip(getNpcClipPool(false), npc.actionName)
        if (idleClip) playNpcClip(npc, idleClip)
        npc.nextDecisionAt = npcTime + NPC_DECISION_INTERVAL + Math.random() * 0.8
      } else {
        npc.isMoving = true
        const walkClip = chooseClip(getNpcClipPool(true), npc.actionName)
        if (walkClip && walkClip.name !== npc.actionName) {
          playNpcClip(npc, walkClip)
        }
        npc.mesh.position.x += (dx / dist) * npc.speed * speedMultiplier * delta
        npc.mesh.position.z += (dz / dist) * npc.speed * speedMultiplier * delta
      }
    } else if (npcTime >= npc.nextDecisionAt) {
      const next = chooseNpcTarget(npc)
      if (next) {
        npc.targetTileKey = key(next.gx, next.gz)
      } else {
        npc.nextDecisionAt = npcTime + NPC_DECISION_INTERVAL
      }
    }

    const grid = worldToGrid(npc.mesh.position.x, npc.mesh.position.z)
    if (!isRoadTile(grid.gx, grid.gz)) {
      const nearestTile = findNearestRoadTile(grid)
      if (nearestTile) {
        npc.mesh.position.copy(tileCenterPosition(nearestTile.gx, nearestTile.gz))
        npc.currentTileKey = key(nearestTile.gx, nearestTile.gz)
        npc.targetTileKey = null
        npc.isMoving = false
        const idleClip = chooseClip(getNpcClipPool(false), npc.actionName)
        if (idleClip) playNpcClip(npc, idleClip)
      }
    }
  }

  async function addBuilding({ building, gx, gz, uid }){
    const { x, z } = getFootprintCenter({ gx, gz }, building?.footprint)
    if (building.id === "road") {
      roadSystem.addRoad({ gx, gz })
      return { type: "road", gx, gz, uid }
    }
    registerBuildingFootprint({ uid, gx, gz, footprint: building?.footprint })

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
    unregisterBuildingFootprint(obj.userData?.uid)
    if (obj.userData?.shadow) {
      buildGroup.remove(obj.userData.shadow)
    }
    buildGroup.remove(obj)
  }

  function updateVillaStatus({ uid, gx, gz, roadOk, powerOk, active, footprint }){
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

    const { x, z } = getFootprintCenter({ gx, gz }, footprint)
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
    npcTime += delta
    if (!npcSpawnedInitial && npcWomanTemplate && roadSystem.roadsSet.size > 0) {
      const targetCount = 3 + Math.floor(Math.random() * 4)
      const roadTiles = getRoadTilesArray().map(parseTileKey)
      roadTiles.sort((a, b) => {
        const distA = Math.abs(a.gx) + Math.abs(a.gz)
        const distB = Math.abs(b.gx) + Math.abs(b.gz)
        return distA - distB
      })
      const preferred = roadTiles.slice(0, Math.min(20, roadTiles.length))
      for (let i = 0; i < targetCount; i += 1) {
        const chosen = preferred.length
          ? preferred[Math.floor(Math.random() * preferred.length)]
          : null
        spawnNpcWoman({ tileKey: chosen ? key(chosen.gx, chosen.gz) : null })
      }
      npcSpawnedInitial = true
    }

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

    for (const npc of state.npcs) {
      updateNpcMovement(npc, delta)
    }
    if (npcTime >= npcConflictCheckAt) {
      resolveNearbyAnimationConflicts()
      npcConflictCheckAt = npcTime + NPC_CONFLICT_INTERVAL
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
    setInputLocked,
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
