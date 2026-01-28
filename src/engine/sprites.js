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

function createCanvasTexture({ width, height, draw }){
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  draw(ctx, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

export function makeIconSprite({ emoji, size = 2.2, background = "#ff5b5b" }){
  const texture = createCanvasTexture({
    width: 128,
    height: 128,
    draw: (ctx, w, h) => {
      ctx.fillStyle = background
      ctx.beginPath()
      ctx.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = "#fff"
      ctx.font = "64px Fredoka, sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(emoji, w / 2, h / 2 + 6)
    },
  })
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true })
  const spr = new THREE.Sprite(mat)
  spr.scale.set(size, size, 1)
  return spr
}

export function makeTextSprite({ text, size = 2.6, color = "#ffffff", background = "#22c55e" }){
  const texture = createCanvasTexture({
    width: 256,
    height: 128,
    draw: (ctx, w, h) => {
      ctx.fillStyle = background
      ctx.strokeStyle = "rgba(0,0,0,0.2)"
      ctx.lineWidth = 8
      ctx.beginPath()
      ctx.roundRect(10, 10, w - 20, h - 20, 24)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = color
      ctx.font = "bold 48px Nunito, sans-serif"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillText(text, w / 2, h / 2 + 6)
    },
  })
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true })
  const spr = new THREE.Sprite(mat)
  spr.scale.set(size * 2, size, 1)
  return spr
}
