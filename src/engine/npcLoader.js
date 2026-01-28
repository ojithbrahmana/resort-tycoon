import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { GRID_SIZE } from "../game/constants"

const NPC_MODEL_URL = new URL("../assets/models/npc.woman.v1.glb", import.meta.url).toString()
const DRACO_DECODER_URL = "https://www.gstatic.com/draco/v1/decoders/"

let npcTemplateScene = null
let npcClips = []
let npcScaleFactor = 1
let npcModelPromise = null

export function loadNpcModel() {
  if (npcModelPromise) return npcModelPromise

  const loader = new GLTFLoader()
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath(DRACO_DECODER_URL)
  loader.setDRACOLoader(dracoLoader)

  npcModelPromise = loader.loadAsync(NPC_MODEL_URL).then((gltf) => {
    npcTemplateScene = gltf.scene
    npcClips = gltf.animations ?? []
    npcTemplateScene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    npcTemplateScene.updateMatrixWorld(true)

    const bounds = new THREE.Box3().setFromObject(npcTemplateScene)
    const size = new THREE.Vector3()
    bounds.getSize(size)
    const height = size.y || 1
    const targetHeight = GRID_SIZE * 0.6
    npcScaleFactor = targetHeight / height

    return {
      scene: npcTemplateScene,
      clips: npcClips,
      scale: npcScaleFactor,
    }
  })

  return npcModelPromise
}

export function getNpcModelData() {
  return {
    scene: npcTemplateScene,
    clips: npcClips,
    scale: npcScaleFactor,
  }
}
