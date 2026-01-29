import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js"
import { makeBillboardSprite } from "../engine/sprites.js"
import { GRID_SIZE } from "./constants"

const VILLA_MODEL_URL = new URL("../assets/models/villa.final.glb", import.meta.url).toString()
const ICECREAM_MODEL_URL = new URL("../assets/models/icecream.final.glb", import.meta.url).toString()
const PALM_MODEL_URL = new URL("../assets/models/palm.final.glb", import.meta.url).toString()
const SPA_MODEL_URL = new URL("../assets/models/spa.final.glb", import.meta.url).toString()
const POOL_MODEL_URL = new URL("../assets/models/pool.final.glb", import.meta.url).toString()
const BEACH_DJ_MODEL_URL = new URL("../assets/models/beachdj.final.glb", import.meta.url).toString()
const DRACO_DECODER_URL = "https://www.gstatic.com/draco/v1/decoders/"
let villaModel = null
let villaModelPromise = null
let villaScaleFactor = 1
let iceCreamModel = null
let iceCreamModelPromise = null
let iceCreamScaleFactor = 1
let palmModel = null
let palmModelPromise = null
let palmScaleFactor = 1
let spaModel = null
let spaModelPromise = null
let spaScaleFactor = 1
let poolModel = null
let poolModelPromise = null
let poolScaleFactor = 1
let beachDjModel = null
let beachDjModelPromise = null
let beachDjScaleFactor = 1
const MODEL_BRIGHTNESS_FACTOR = 1.35

function applyModelBrightness(object, factor = MODEL_BRIGHTNESS_FACTOR) {
  object.traverse((child) => {
    if (!child.isMesh || !child.material) return
    const materials = Array.isArray(child.material) ? child.material : [child.material]
    const brightened = materials.map((material) => {
      const next = material.clone()
      if (next.color) {
        next.color.multiplyScalar(factor)
      }
      if (next.emissive) {
        next.emissive.multiplyScalar(factor)
      }
      if (next.map) {
        next.map.colorSpace = THREE.SRGBColorSpace
        next.map.needsUpdate = true
      }
      if (typeof next.envMapIntensity === "number") {
        next.envMapIntensity = 1.2
      }
      if (typeof next.roughness === "number") {
        next.roughness = Math.min(next.roughness, 0.95)
      }
      next.needsUpdate = true
      return next
    })
    child.material = Array.isArray(child.material) ? brightened : brightened[0]
  })
}

function loadVillaModel() {
  if (villaModelPromise) return villaModelPromise

  const loader = new GLTFLoader()
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath(DRACO_DECODER_URL)
  loader.setDRACOLoader(dracoLoader)

  villaModelPromise = loader.loadAsync(VILLA_MODEL_URL).then((gltf) => {
    villaModel = gltf.scene
    villaModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    villaModel.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(villaModel)
    const size = new THREE.Vector3()
    bounds.getSize(size)
    const footprint = Math.max(size.x, size.z) || 1
    const targetFootprint = GRID_SIZE * 4
    villaScaleFactor = targetFootprint / footprint
    return villaModel
  })

  return villaModelPromise
}

export function preloadBuildingModels() {
  return Promise.all([
    loadVillaModel(),
    loadPalmModel(),
    loadIceCreamModel(),
    loadSpaModel(),
    loadPoolModel(),
    loadBeachDjModel(),
  ])
}

function createContactShadow(radius) {
  const geo = new THREE.CircleGeometry(radius, 24)
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  })
  const shadow = new THREE.Mesh(geo, mat)
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = 0.05
  return shadow
}

function createVillaMesh({ upgraded = false }) {
  const group = new THREE.Group()
  const baseMat = new THREE.MeshStandardMaterial({
    color: upgraded ? 0xdbeafe : 0xfbcfe8,
    roughness: 0.7,
  })
  const roofMat = new THREE.MeshStandardMaterial({
    color: upgraded ? 0x93c5fd : 0xfdba74,
    roughness: 0.55,
  })
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xf9fafb,
    roughness: 0.8,
  })

  const base = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.6, 2.4), baseMat)
  base.position.y = 0.8
  base.castShadow = true
  base.receiveShadow = true

  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.2, 4), roofMat)
  roof.rotation.y = Math.PI / 4
  roof.position.y = 2.1
  roof.castShadow = true
  roof.receiveShadow = true

  const trim = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.2, 2.5), trimMat)
  trim.position.y = 1.65
  trim.castShadow = true

  group.add(createContactShadow(1.6))
  group.add(base, trim, roof)
  applyModelBrightness(group)
  return group
}

async function createVillaModel() {
  const model = await loadVillaModel()
  if (!model) {
    return createVillaMesh({ upgraded: false })
  }
  const clone = model.clone(true)
  clone.scale.setScalar(villaScaleFactor)
  clone.updateMatrixWorld(true)
  const scaledBounds = new THREE.Box3().setFromObject(clone)
  const yOffset = -scaledBounds.min.y
  clone.position.y += yOffset
  const group = new THREE.Group()
  group.add(createContactShadow(1.6))
  group.add(clone)
  applyModelBrightness(group)
  return group
}

function loadIceCreamModel() {
  if (iceCreamModelPromise) return iceCreamModelPromise

  const loader = new GLTFLoader()
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath(DRACO_DECODER_URL)
  loader.setDRACOLoader(dracoLoader)

  iceCreamModelPromise = loader.loadAsync(ICECREAM_MODEL_URL).then((gltf) => {
    iceCreamModel = gltf.scene
    iceCreamModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    iceCreamModel.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(iceCreamModel)
    const size = new THREE.Vector3()
    bounds.getSize(size)
    const footprint = Math.max(size.x, size.z) || 1
    const targetFootprint = GRID_SIZE * 3
    iceCreamScaleFactor = targetFootprint / footprint
    return iceCreamModel
  })

  return iceCreamModelPromise
}

async function createIceCreamModel() {
  const model = await loadIceCreamModel()
  if (!model) {
    return new THREE.Group()
  }
  const clone = model.clone(true)
  clone.scale.setScalar(iceCreamScaleFactor)
  clone.updateMatrixWorld(true)
  const scaledBounds = new THREE.Box3().setFromObject(clone)
  const yOffset = -scaledBounds.min.y
  clone.position.y += yOffset
  const group = new THREE.Group()
  group.add(createContactShadow(2.2))
  group.add(clone)
  applyModelBrightness(group)
  return group
}

function createGeneratorMesh() {
  const group = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xa7f3d0,
    roughness: 0.6,
  })
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.5,
    metalness: 0.4,
  })
  const emissiveMat = new THREE.MeshStandardMaterial({
    color: 0xfef08a,
    emissive: 0xfef08a,
    emissiveIntensity: 0.8,
  })

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 1.8), bodyMat)
  body.position.y = 0.6
  body.castShadow = true
  body.receiveShadow = true

  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 1.4, 8), metalMat)
  chimney.position.set(0.7, 1.5, -0.5)
  chimney.castShadow = true

  const light = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), emissiveMat)
  light.position.set(-0.6, 1.05, 0.6)

  group.add(createContactShadow(1.3))
  group.add(body, chimney, light)
  applyModelBrightness(group)
  return group
}

function loadPalmModel() {
  if (palmModelPromise) return palmModelPromise

  const loader = new GLTFLoader()
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath(DRACO_DECODER_URL)
  loader.setDRACOLoader(dracoLoader)

  palmModelPromise = loader.loadAsync(PALM_MODEL_URL).then((gltf) => {
    palmModel = gltf.scene
    palmModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    palmModel.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(palmModel)
    const size = new THREE.Vector3()
    bounds.getSize(size)
    const footprint = Math.max(size.x, size.z) || 1
    const targetFootprint = GRID_SIZE * 2
    palmScaleFactor = targetFootprint / footprint
    return palmModel
  })

  return palmModelPromise
}

async function createPalmModel() {
  const model = await loadPalmModel()
  if (!model) {
    return new THREE.Group()
  }
  const clone = model.clone(true)
  clone.scale.setScalar(palmScaleFactor)
  clone.updateMatrixWorld(true)
  const scaledBounds = new THREE.Box3().setFromObject(clone)
  const yOffset = -scaledBounds.min.y
  clone.position.y += yOffset
  const group = new THREE.Group()
  group.add(createContactShadow(1.1))
  group.add(clone)
  applyModelBrightness(group)
  return group
}

function loadSpaModel() {
  if (spaModelPromise) return spaModelPromise

  const loader = new GLTFLoader()
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath(DRACO_DECODER_URL)
  loader.setDRACOLoader(dracoLoader)

  spaModelPromise = loader.loadAsync(SPA_MODEL_URL).then((gltf) => {
    spaModel = gltf.scene
    spaModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    spaModel.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(spaModel)
    const size = new THREE.Vector3()
    bounds.getSize(size)
    const footprint = Math.max(size.x, size.z) || 1
    const targetFootprint = GRID_SIZE * 4
    spaScaleFactor = targetFootprint / footprint
    return spaModel
  })

  return spaModelPromise
}

async function createSpaModel() {
  const model = await loadSpaModel()
  if (!model) {
    return new THREE.Group()
  }
  const clone = model.clone(true)
  clone.scale.setScalar(spaScaleFactor)
  clone.updateMatrixWorld(true)
  const scaledBounds = new THREE.Box3().setFromObject(clone)
  const yOffset = -scaledBounds.min.y
  clone.position.y += yOffset
  const group = new THREE.Group()
  group.add(createContactShadow(2.8))
  group.add(clone)
  applyModelBrightness(group)
  return group
}

function loadPoolModel() {
  if (poolModelPromise) return poolModelPromise

  const loader = new GLTFLoader()
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath(DRACO_DECODER_URL)
  loader.setDRACOLoader(dracoLoader)

  poolModelPromise = loader.loadAsync(POOL_MODEL_URL).then((gltf) => {
    poolModel = gltf.scene
    poolModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    poolModel.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(poolModel)
    const size = new THREE.Vector3()
    bounds.getSize(size)
    const footprint = Math.max(size.x, size.z) || 1
    const targetFootprint = GRID_SIZE * 4
    poolScaleFactor = targetFootprint / footprint
    return poolModel
  })

  return poolModelPromise
}

async function createPoolModel() {
  const model = await loadPoolModel()
  if (!model) {
    return new THREE.Group()
  }
  const clone = model.clone(true)
  clone.scale.setScalar(poolScaleFactor)
  clone.updateMatrixWorld(true)
  const scaledBounds = new THREE.Box3().setFromObject(clone)
  const yOffset = -scaledBounds.min.y
  clone.position.y += yOffset + 0.05
  const group = new THREE.Group()
  group.add(createContactShadow(2.8))
  group.add(clone)
  applyModelBrightness(group)
  return group
}

function loadBeachDjModel() {
  if (beachDjModelPromise) return beachDjModelPromise

  const loader = new GLTFLoader()
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath(DRACO_DECODER_URL)
  loader.setDRACOLoader(dracoLoader)

  beachDjModelPromise = loader.loadAsync(BEACH_DJ_MODEL_URL).then((gltf) => {
    beachDjModel = gltf.scene
    beachDjModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    beachDjModel.updateMatrixWorld(true)
    const bounds = new THREE.Box3().setFromObject(beachDjModel)
    const size = new THREE.Vector3()
    bounds.getSize(size)
    const footprint = Math.max(size.x, size.z) || 1
    const targetFootprint = GRID_SIZE * 2
    beachDjScaleFactor = targetFootprint / footprint
    return beachDjModel
  })

  return beachDjModelPromise
}

async function createBeachDjModel() {
  const model = await loadBeachDjModel()
  if (!model) {
    return new THREE.Group()
  }
  const clone = model.clone(true)
  clone.scale.setScalar(beachDjScaleFactor)
  clone.updateMatrixWorld(true)
  const scaledBounds = new THREE.Box3().setFromObject(clone)
  const yOffset = -scaledBounds.min.y
  clone.position.y += yOffset + 0.05
  const group = new THREE.Group()
  group.add(createContactShadow(1.4))
  group.add(clone)
  applyModelBrightness(group)
  return group
}

export async function createBuildingObject({ building, spritePath, size = 3.6 }){
  if (building?.id === "villa" || building?.id === "villa_plus") {
    const object = await createVillaModel()
    return { object, isModel: true }
  }
  if (building?.id === "icecream_parlour") {
    const object = await createIceCreamModel()
    return { object, isModel: true }
  }
  if (building?.id === "generator") {
    return { object: createGeneratorMesh(), isModel: true }
  }
  if (building?.id === "palm") {
    const object = await createPalmModel()
    return { object, isModel: true }
  }
  if (building?.id === "spa") {
    const object = await createSpaModel()
    return { object, isModel: true }
  }
  if (building?.id === "pool_halloween") {
    const object = await createPoolModel()
    return { object, isModel: true }
  }
  if (building?.id === "beach_dj") {
    const object = await createBeachDjModel()
    return { object, isModel: true }
  }

  return { object: makeBillboardSprite(spritePath, size), isModel: false }
}
