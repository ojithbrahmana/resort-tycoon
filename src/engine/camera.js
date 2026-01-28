import * as THREE from "three"

export function createCamera(width,height){
  const camera = new THREE.PerspectiveCamera(45, width/height, 0.1, 2000)
  camera.position.set(120, 90, 120)
  camera.lookAt(0,0,0)
  return camera
}

export function attachCameraControls({ dom, camera }){
  // lightweight orbit + pan + zoom
  let isRot=false, isPan=false
  let pointerDown=false
  let enabled=true
  let lastX=0,lastY=0
  const target = new THREE.Vector3(0,0,0)
  let radius = 180
  let theta = Math.PI/4
  let phi = 0.85

  function update(){
    const x = target.x + radius * Math.sin(phi) * Math.sin(theta)
    const z = target.z + radius * Math.sin(phi) * Math.cos(theta)
    const y = target.y + radius * Math.cos(phi)
    camera.position.set(x,y,z)
    camera.lookAt(target)
  }
  update()

  function setEnabled(next){
    enabled = next
    if (!enabled) {
      isRot = false
      isPan = false
      pointerDown = false
    }
  }

  dom.addEventListener("contextmenu", e => e.preventDefault())
  dom.addEventListener("pointerdown", (e) => {
    if (!enabled) return
    pointerDown = true
    lastX = e.clientX
    lastY = e.clientY
  })
  dom.addEventListener("mousedown", (e)=>{
    if (!enabled) return
    if(e.button===2){ isRot=true; lastX=e.clientX; lastY=e.clientY }
    if(e.button===1){ isPan=true; lastX=e.clientX; lastY=e.clientY }
  })
  window.addEventListener("pointerup", ()=>{ isRot=false; isPan=false; pointerDown=false })
  window.addEventListener("mousemove", (e)=>{
    if (!enabled) return
    const dx = e.clientX-lastX
    const dy = e.clientY-lastY
    if(isRot){
      theta -= dx*0.006
      phi = Math.max(0.35, Math.min(1.35, phi + dy*0.006))
      update()
    }
    if(isPan){
      // pan in camera plane
      const panSpeed = 0.15
      const right = new THREE.Vector3().subVectors(camera.position, target).cross(camera.up).normalize()
      const up = new THREE.Vector3().copy(camera.up).normalize()
      target.addScaledVector(right, -dx*panSpeed)
      target.addScaledVector(up, dy*panSpeed)
      update()
    }
    lastX=e.clientX; lastY=e.clientY
  })
  dom.addEventListener("wheel",(e)=>{
    if (!enabled || !pointerDown) return
    radius = Math.max(60, Math.min(360, radius + e.deltaY*0.15))
    update()
  }, { passive:true })

  return { update, setEnabled }
}
