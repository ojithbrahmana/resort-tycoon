import * as THREE from "three"
import { createScene } from "./scene.js"
import { createCamera, attachCameraControls } from "./camera.js"
import { worldToGrid, gridToWorld, key } from "./grid.js"
import { ISLAND_RADIUS, GRID_HALF } from "../data/constants.js"
import { makeBillboardSprite } from "./sprites.js"

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

  let ghost = null
  let mode = "build"
  let selectedTool = "villa"
  let onPlace = null
  let onHover = null

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

  function updateGhost({ spriteUrl, occupiedKeys }){
    // called from UI render loop as user moves mouse
    // but we only update on mousemove events for simplicity
    (spriteUrl)
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

  function handleClick(e){
    if(!ghost || !ghost.userData?.ok) return
    onPlace?.({ gx: ghost.userData.gx, gz: ghost.userData.gz })
  }

  function addPlacedSprite({ spriteUrl, gx, gz }){
    const { x, z } = gridToWorld(gx,gz)
    const spr = makeBillboardSprite(spriteUrl, 3.6)
    spr.position.set(x, 4.2, z)
    spr.userData = { gx, gz }
    buildGroup.add(spr)
    return spr
  }

  function removePlacedSprite(sprite){
    buildGroup.remove(sprite)
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

  function tick(){
    controls.update?.()
    render()
    requestAnimationFrame(tick)
  }
  tick()

  renderer.domElement.addEventListener("mousemove", (e)=>{
    if(mode!=="build" && mode!=="move") return
    // UI will pass spriteUrl and occupied keys via closures; see App wiring.
  })

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
    addPlacedSprite,
    removePlacedSprite,
  }
}
