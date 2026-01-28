import * as THREE from "three"

const texCache = new Map()

export function loadTexture(url){
  if(texCache.has(url)) return texCache.get(url)
  const tex = new THREE.TextureLoader().load(url)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  texCache.set(url, tex)
  return tex
}

export function makeBillboardSprite(url, size=3.4){
  const tex = loadTexture(url)
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true })
  const spr = new THREE.Sprite(mat)
  spr.scale.set(size, size, 1)
  spr.castShadow = false
  spr.receiveShadow = false
  return spr
}
