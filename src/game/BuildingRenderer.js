import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { makeBillboardSprite } from "../engine/sprites.js"

const modelCache = new Map()
let loader = null

function getLoader(){
  if (loader) return loader
  const gltf = new GLTFLoader()
  const draco = new DRACOLoader()
  draco.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.6/")
  gltf.setDRACOLoader(draco)
  loader = gltf
  return loader
}

async function loadModel(url){
  if (modelCache.has(url)) return modelCache.get(url)
  const gltfLoader = getLoader()
  const promise = new Promise((resolve, reject)=>{
    gltfLoader.load(
      url,
      (gltf)=>resolve(gltf.scene),
      undefined,
      (err)=>reject(err)
    )
  })
  modelCache.set(url, promise)
  return promise
}

export async function createBuildingObject({ modelPath, spritePath, size = 3.6 }){
  if (modelPath) {
    try {
      const scene = await loadModel(modelPath)
      const clone = scene.clone(true)
      clone.traverse(obj => {
        if (obj.isMesh) {
          obj.castShadow = true
          obj.receiveShadow = true
          if (obj.material) obj.material.side = THREE.FrontSide
        }
      })
      clone.scale.setScalar(1.8)
      return { object: clone, isModel: true }
    } catch (error) {
      // fall through to sprite
    }
  }

  return { object: makeBillboardSprite(spritePath, size), isModel: false }
}
