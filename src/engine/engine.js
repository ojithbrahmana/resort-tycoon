import * as THREE from "three"
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { createScene } from "./scene.js"
import { createCamera, attachCameraControls } from "./camera.js"
import { worldToGrid, gridToWorld, key } from "./grid.js"
import { GRID_SIZE, GRID_HALF, GRASS_RADIUS, SHORE_INNER_RADIUS, SHORE_OUTER_RADIUS } from "../game/constants"
import { makeBillboardSprite, makeTextSprite } from "./sprites.js"
import { createBuildingObject, preloadBuildingModels } from "../game/BuildingRenderer.js"
import { RoadSystem } from "./roads.js"
import { loadNpcModel } from "./npcLoader.js"
import { findPath } from "../game/guests"

const skeletonClone = SkeletonUtils.clone || SkeletonUtils.SkeletonUtils?.clone
const npcClone = skeletonClone || ((source) => source.clone(true))
const DRACO_DECODER_URL = "https://www.gstatic.com/draco/v1/decoders/"
const sharedDracoLoader = new DRACOLoader()
sharedDracoLoader.setDecoderPath(DRACO_DECODER_URL)
const sharedGltfLoader = new GLTFLoader()
sharedGltfLoader.setDRACOLoader(sharedDracoLoader)

export function createEngine({ container }){
  preloadBuildingModels()
  const width = container.clientWidth
  const height = container.clientHeight

  const renderer = new THREE.WebGLRenderer({ antialias:true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.BasicShadowMap
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)

  const { scene, island } = createScene()
  const camera = createCamera(width,height)
  const controls = attachCameraControls({ dom: renderer.domElement, camera })
  controls.setEnabled?.(false)
  renderer.setClearColor(scene.background ?? 0x8ae3ff, 1)
  renderer.clear()
  renderer.render(scene, camera)

  const perfState = {
    enabled: false,
    element: null,
    frames: 0,
    lastSample: performance.now(),
    fps: 0,
  }

  function ensurePerfPanel() {
    if (perfState.element) return perfState.element
    const panel = document.createElement("div")
    panel.className = "perf-debug-panel"
    panel.style.display = "none"
    container.appendChild(panel)
    perfState.element = panel
    return panel
  }

  function setPerfDebug(enabled) {
    perfState.enabled = Boolean(enabled)
    const panel = ensurePerfPanel()
    panel.style.display = perfState.enabled ? "block" : "none"
    perfState.frames = 0
    perfState.lastSample = performance.now()
  }

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  const groundY = 3.1

  const buildGroup = new THREE.Group()
  scene.add(buildGroup)
  const roadSystem = new RoadSystem({ scene, y: groundY + 0.08 })

  const popups = []
  const npcs = []
  const sparkles = []
  const placementBounces = []

  const npcState = {
    templateScene: null,
    clips: [],
    scale: 1,
    ready: false,
    pending: [],
  }
  const npcTargetCount = 0
  const npcMinDistance = GRID_SIZE * 1.6
  const npcNeighborRadius = GRID_SIZE * 2.2

  if (npcTargetCount > 0) {
    loadNpcModel().then(({ scene: npcTemplateScene, clips: npcClips, scale }) => {
      npcState.templateScene = npcTemplateScene
      npcState.clips = npcClips
      npcState.scale = scale
      npcState.ready = true
      if (npcState.pending.length) {
        const pending = [...npcState.pending]
        npcState.pending = []
        pending.forEach(request => spawnGuest(request))
      }
    })
  }

  let ghost = null
  let selectionOutline = null
  let demolishOutline = null
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
  let npcSpawnTimer = 0

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

  function cloneMaterialsForInstance(object) {
    object.traverse((child) => {
      if (!child.isMesh || !child.material) return
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      const cloned = materials.map(material => material.clone())
      child.material = Array.isArray(child.material) ? cloned : cloned[0]
      child.userData.disposeMaterial = true
    })
  }

  function removeGhost(){
    if(ghost){
      buildGroup.remove(ghost)
      disposeObject(ghost)
      ghost = null
    }
  }

  function clearSelectionOutline(){
    if (selectionOutline) {
      buildGroup.remove(selectionOutline)
      disposeObject(selectionOutline)
      selectionOutline = null
    }
  }

  function clearDemolishOutline(){
    if (demolishOutline) {
      buildGroup.remove(demolishOutline)
      disposeObject(demolishOutline)
      demolishOutline = null
    }
  }

  function isBuildableSurface(x,z){
    const radius = Math.hypot(x, z)
    return radius <= GRASS_RADIUS || (radius >= SHORE_INNER_RADIUS && radius <= SHORE_OUTER_RADIUS)
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

  function createFootprintOutline({ w, h, color = 0x22c55e }) {
    const width = GRID_SIZE * w
    const height = GRID_SIZE * h
    const geometry = new THREE.PlaneGeometry(width, height)
    const edges = new THREE.EdgesGeometry(geometry)
    const material = new THREE.LineBasicMaterial({ color })
    const outline = new THREE.LineSegments(edges, material)
    outline.rotation.x = -Math.PI / 2
    outline.position.y = groundY + 0.12
    outline.userData.footprint = { w, h }
    outline.userData.disposeGeometry = true
    outline.userData.disposeMaterial = true
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

  function setSelectionOutline({ gx, gz, footprint }){
    const nextFootprint = footprint ?? { w: 1, h: 1 }
    if (selectionOutline) {
      const { w, h } = selectionOutline.userData.footprint ?? { w: 1, h: 1 }
      if (w !== nextFootprint.w || h !== nextFootprint.h) {
        buildGroup.remove(selectionOutline)
        selectionOutline = null
      }
    }
    if (!selectionOutline) {
      selectionOutline = createFootprintOutline({ ...nextFootprint, color: 0xf59e0b })
      buildGroup.add(selectionOutline)
    }
    const { x, z } = getFootprintCenter({ gx, gz }, nextFootprint)
    selectionOutline.position.set(x, groundY + 0.22, z)
    selectionOutline.material.color.setHex(0xf59e0b)
    selectionOutline.userData = { ...selectionOutline.userData, gx, gz, footprint: nextFootprint }
  }

  function setDemolishOutline({ gx, gz, footprint }){
    const nextFootprint = footprint ?? { w: 1, h: 1 }
    if (demolishOutline) {
      const { w, h } = demolishOutline.userData.footprint ?? { w: 1, h: 1 }
      if (w !== nextFootprint.w || h !== nextFootprint.h) {
        buildGroup.remove(demolishOutline)
        demolishOutline = null
      }
    }
    if (!demolishOutline) {
      demolishOutline = createFootprintOutline({ ...nextFootprint, color: 0xef4444 })
      buildGroup.add(demolishOutline)
    }
    const { x, z } = getFootprintCenter({ gx, gz }, nextFootprint)
    demolishOutline.position.set(x, groundY + 0.22, z)
    demolishOutline.material.color.setHex(0xef4444)
    demolishOutline.userData = { ...demolishOutline.userData, gx, gz, footprint: nextFootprint }
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

  function handleMouseMove(e, { footprint, occupiedKeys }){
    const p = pickIsland(e.clientX, e.clientY)
    if(!p){ removeGhost(); onHover?.(null); return }
    const { gx, gz } = worldToGrid(p.x, p.z)
    const cells = getFootprintCells(gx, gz, footprint)
    const ok = cells.every(cell => {
      const { x, z } = gridToWorld(cell.gx, cell.gz)
      return isBuildableSurface(x, z)
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
    shadow.userData.disposeGeometry = true
    shadow.userData.disposeMaterial = true
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

  async function addBuilding({ building, gx, gz, uid }){
    const { x, z } = getFootprintCenter({ gx, gz }, building?.footprint)
    if (building.id === "road") {
      roadSystem.addRoad({ gx, gz })
      return { type: "road", gx, gz, uid }
    }

    const size = building.id === "road" ? 3.0 : 3.6
    const placeholder = makeBillboardSprite(building.spritePath, size)
    placeholder.position.set(x, groundY + size / 2, z)
    placeholder.userData = { gx, gz, uid }
    placeholder.userData.disposeMaterial = true
    buildGroup.add(placeholder)

    if (building.modelPath) {
      const { object, isModel } = await createBuildingObject({
        building,
        spritePath: building.spritePath,
        size,
      })
      if (isModel) {
        buildGroup.remove(placeholder)
        disposeObject(placeholder)
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
      disposeObject(obj.userData.shadow)
    }
    buildGroup.remove(obj)
    disposeObject(obj)
  }

  function updateVillaStatus() {}

  function spawnPopup({ text, gx, gz, color = "#22c55e" }){
    const { x, z } = gridToWorld(gx, gz)
    const spr = makeTextSprite({ text, background: color })
    spr.position.set(x, 10, z)
    spr.userData.disposeMaterial = true
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
    sparkle.userData.disposeGeometry = true
    sparkle.userData.disposeMaterial = true
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

  function getNpcClipCandidates(tags) {
    if (!npcState.clips.length) return []
    if (!tags?.length) return npcState.clips
    const loweredTags = tags.map(tag => tag.toLowerCase())
    return npcState.clips.filter(clip =>
      loweredTags.some(tag => clip.name.toLowerCase().includes(tag))
    )
  }

  function getNearbyClipNames(position, radius, ignoreNpc) {
    const names = new Set()
    for (const npc of npcs) {
      if (npc === ignoreNpc) continue
      const dx = npc.object.position.x - position.x
      const dz = npc.object.position.z - position.z
      if (Math.hypot(dx, dz) <= radius) {
        if (npc.currentClipName) names.add(npc.currentClipName)
      }
    }
    return names
  }

  function pickNpcClip({ position, tags = [], ignoreNpc } = {}) {
    const preferred = getNpcClipCandidates(tags)
    const candidates = preferred.length ? preferred : npcState.clips
    if (!candidates.length) return null
    const nearby = getNearbyClipNames(position, npcNeighborRadius, ignoreNpc)
    const shuffled = [...candidates].sort(() => Math.random() - 0.5)
    const available = shuffled.find(clip => !nearby.has(clip.name))
    return available || shuffled[0]
  }

  function applyNpcClip(npc, clip) {
    if (!clip) return
    if (npc.action) {
      npc.action.fadeOut(0.2)
    }
    const action = npc.mixer.clipAction(clip)
    const speed = 0.9 + Math.random() * 0.25
    action.timeScale = speed
    action.reset()
    action.time = Math.random() * Math.max(clip.duration, 0.1)
    action.fadeIn(0.2).play()
    npc.action = action
    npc.currentClipName = clip.name
  }

  function ensureNpcClipVariety(npc, tags) {
    const nearby = getNearbyClipNames(npc.object.position, npcNeighborRadius, npc)
    if (!npc.currentClipName || !nearby.has(npc.currentClipName)) return
    const nextClip = pickNpcClip({ position: npc.object.position, tags, ignoreNpc: npc })
    if (nextClip && nextClip.name !== npc.currentClipName) {
      applyNpcClip(npc, nextClip)
      if (tags.includes("idle") || tags.includes("stand")) {
        npc.idleClip = nextClip
      } else {
        npc.moveClip = nextClip
      }
    }
  }

  function isPositionSpaced(position, ignoreNpc) {
    for (const npc of npcs) {
      if (npc === ignoreNpc) continue
      const dx = npc.object.position.x - position.x
      const dz = npc.object.position.z - position.z
      if (Math.hypot(dx, dz) < npcMinDistance) return false
    }
    return true
  }

  function pickSpawnCell(preferredCell) {
    const roadCells = roadSystem.getRoadCells()
    if (!roadCells.length) return null
    if (preferredCell && roadSystem.hasRoad(preferredCell.gx, preferredCell.gz)) {
      const preferredWorld = gridToWorld(preferredCell.gx, preferredCell.gz)
      if (isPositionSpaced(preferredWorld)) {
        return preferredCell
      }
    }
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const cell = roadCells[Math.floor(Math.random() * roadCells.length)]
      const position = gridToWorld(cell.gx, cell.gz)
      if (isPositionSpaced(position)) return cell
    }
    return null
  }

  function buildNpcInstance() {
    if (!npcState.templateScene) return null
    const npcRoot = npcClone(npcState.templateScene)
    cloneMaterialsForInstance(npcRoot)
    npcRoot.scale.setScalar(npcState.scale)
    npcRoot.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(npcRoot)
    const yOffset = -bounds.min.y + 0.02
    npcRoot.position.y += yOffset
    const group = new THREE.Group()
    group.add(npcRoot)
    return { group, npcRoot }
  }

  function buildRoadsSet() {
    const roadCells = roadSystem.getRoadCells()
    const roadsSet = new Set(roadCells.map(cell => key(cell.gx, cell.gz)))
    return { roadCells, roadsSet }
  }

  function findNpcPath(npc, preferredPath) {
    if (preferredPath?.length > 1) return preferredPath
    const { roadCells, roadsSet } = buildRoadsSet()
    if (!roadCells.length) return null
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const cell = roadCells[Math.floor(Math.random() * roadCells.length)]
      if (cell.gx === npc.currentCell.gx && cell.gz === npc.currentCell.gz) continue
      if (!isPositionSpaced(gridToWorld(cell.gx, cell.gz), npc)) continue
      const path = findPath({ start: npc.currentCell, goal: cell, roadsSet })
      if (path && path.length > 1) return path
    }
    return null
  }

  function spawnGuest({ path } = {}){
    if (npcTargetCount <= 0) return
    if (!npcState.ready) {
      npcState.pending.push({ path })
      return
    }
    if (!npcState.clips.length) return
    if (npcs.length >= npcTargetCount) return

    const startCell = pickSpawnCell(path?.[0])
    if (!startCell) return
    const instance = buildNpcInstance()
    if (!instance) return

    const { group, npcRoot } = instance
    const worldPos = gridToWorld(startCell.gx, startCell.gz)
    group.position.set(worldPos.x, groundY + 0.15, worldPos.z)

    const mixer = new THREE.AnimationMixer(npcRoot)
    const moveClip = pickNpcClip({ position: group.position, tags: ["walk", "run", "stylish", "confident"] })
    const idleClip = pickNpcClip({ position: group.position, tags: ["idle", "stand"] })
    const primaryClip = moveClip || idleClip || npcState.clips[0]

    buildGroup.add(group)
    const npc = {
      object: group,
      mixer,
      action: null,
      currentClipName: "",
      currentCell: { ...startCell },
      lastCell: null,
      targetCell: null,
      path: null,
      pathIndex: 0,
      speed: 1.6 + Math.random() * 0.6,
      idleClip,
      moveClip: moveClip || primaryClip,
      idleTimer: 0,
    }
    applyNpcClip(npc, primaryClip)
    npc.path = findNpcPath(npc, path)
    if (npc.path) {
      npc.pathIndex = 1
      npc.targetCell = npc.path[npc.pathIndex] || null
    } else {
      npc.idleTimer = 0.6 + Math.random() * 0.8
      if (npc.idleClip) {
        applyNpcClip(npc, npc.idleClip)
      }
    }
    npcs.push(npc)
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

    if (npcTargetCount > 0) {
      npcSpawnTimer -= delta
      if (npcSpawnTimer <= 0 && npcState.ready && npcs.length < npcTargetCount) {
        if (roadSystem.getRoadCells().length > 0) {
          spawnGuest()
          npcSpawnTimer = 0.6
        }
      }
    }

    for (let i = popups.length - 1; i >= 0; i -= 1) {
      const p = popups[i]
      p.ttl -= delta
      p.sprite.position.y += p.velocity * delta
      p.sprite.material.opacity = Math.max(0, p.ttl / 1.2)
      if (p.ttl <= 0) {
        buildGroup.remove(p.sprite)
        disposeObject(p.sprite)
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
        disposeObject(s.mesh)
        sparkles.splice(i, 1)
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

    if (npcTargetCount > 0) {
      for (let i = npcs.length - 1; i >= 0; i -= 1) {
        const npc = npcs[i]
        npc.mixer.update(delta)

        let minNeighborDist = Infinity
        for (const other of npcs) {
          if (other === npc) continue
          const dx = other.object.position.x - npc.object.position.x
          const dz = other.object.position.z - npc.object.position.z
          const dist = Math.hypot(dx, dz)
          if (dist < minNeighborDist) minNeighborDist = dist
        }
        const separationScale = minNeighborDist < npcMinDistance ? 0.2 : 1

        if (!npc.targetCell) {
          npc.idleTimer -= delta
          if (npc.idleTimer <= 0) {
            npc.path = findNpcPath(npc)
            if (npc.path) {
              npc.pathIndex = 1
              npc.targetCell = npc.path[npc.pathIndex] || null
              const moveClip = pickNpcClip({
                position: npc.object.position,
                tags: ["walk", "run", "stylish", "confident"],
                ignoreNpc: npc,
              })
              if (moveClip) npc.moveClip = moveClip
              if (npc.moveClip && npc.currentClipName !== npc.moveClip.name) {
                applyNpcClip(npc, npc.moveClip)
              }
            } else {
              npc.idleTimer = 0.8 + Math.random() * 0.8
            }
          }
          ensureNpcClipVariety(npc, ["idle", "stand"])
          continue
        }

        ensureNpcClipVariety(npc, ["walk", "run", "stylish", "confident"])
        const target = gridToWorld(npc.targetCell.gx, npc.targetCell.gz)
        const dx = target.x - npc.object.position.x
        const dz = target.z - npc.object.position.z
        const dist = Math.hypot(dx, dz)
        if (dist < 0.15) {
          npc.lastCell = npc.currentCell
          npc.currentCell = npc.targetCell
          npc.pathIndex += 1
          if (!npc.path || npc.pathIndex >= npc.path.length) {
            npc.targetCell = null
            npc.path = null
            npc.idleTimer = 0.8 + Math.random() * 0.8
            if (npc.idleClip) {
              const idleClip = pickNpcClip({
                position: npc.object.position,
                tags: ["idle", "stand"],
                ignoreNpc: npc,
              })
              npc.idleClip = idleClip || npc.idleClip
              applyNpcClip(npc, npc.idleClip)
            }
          } else {
            npc.targetCell = npc.path[npc.pathIndex]
          }
        } else {
          npc.object.rotation.y = Math.atan2(dx, dz)
          npc.object.position.x += (dx / dist) * npc.speed * separationScale * delta
          npc.object.position.z += (dz / dist) * npc.speed * separationScale * delta
        }
      }
    }
  }

  let animationFrameId = null
  function tick(){
    const now = performance.now()
    const delta = Math.min(0.05, (now - lastTime) / 1000)
    lastTime = now
    if (perfState.enabled) {
      perfState.frames += 1
      const elapsed = now - perfState.lastSample
      if (elapsed >= 250) {
        perfState.fps = Math.round((perfState.frames / elapsed) * 1000)
        perfState.frames = 0
        perfState.lastSample = now
        const panel = ensurePerfPanel()
        const info = renderer.info
        panel.textContent = `FPS ${perfState.fps} | Draws ${info.render.calls} | Tris ${info.render.triangles}`
      }
    }
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
    animationFrameId = requestAnimationFrame(tick)
  }
  tick()

  function resetWorld(){
    removeGhost()
    clearSelectionOutline()
    clearDemolishOutline()
    for (const child of [...buildGroup.children]) {
      buildGroup.remove(child)
      disposeObject(child)
    }
    popups.length = 0
    sparkles.length = 0
    placementBounces.length = 0
    npcs.length = 0
    roadSystem.clear()
    npcSpawnTimer = 0
  }

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
    clearGhost: removeGhost,
    setSelectionOutline,
    clearSelectionOutline,
    setDemolishOutline,
    clearDemolishOutline,
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
    getGuestCount: () => npcs.length,
    getZoomState: () => controls.getZoomState?.(),
    resetWorld,
    setPerfDebug,
    dispose: () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
        animationFrameId = null
      }
      window.removeEventListener("resize", resize)
      resetWorld()
      roadSystem.dispose?.()
      renderer.dispose()
      if (renderer.domElement?.parentElement) {
        renderer.domElement.parentElement.removeChild(renderer.domElement)
      }
      if (perfState.element?.parentElement) {
        perfState.element.parentElement.removeChild(perfState.element)
      }
    },
  }
}

function disposeObject(object) {
  if (!object) return
  object.traverse((child) => {
    if (child.geometry && child.userData?.disposeGeometry) {
      child.geometry.dispose()
    }
    if (child.material && child.userData?.disposeMaterial) {
      const materials = Array.isArray(child.material) ? child.material : [child.material]
      materials.forEach((material) => material.dispose())
    }
  })
}
