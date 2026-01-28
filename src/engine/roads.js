import * as THREE from "three"
import { GRID_HALF, GRID_SIZE } from "../game/constants"
import { gridToWorld, key } from "./grid"

const MAX_ROADS = (GRID_HALF * 2 + 1) ** 2

function createRoadGeometries({ tileSize, thickness }) {
  const tile = new THREE.BoxGeometry(tileSize, thickness, tileSize)
  tile.translate(0, thickness / 2, 0)
  const straight = tile.clone()
  const endCap = tile.clone()
  const corner = tile.clone()
  const tee = tile.clone()
  const cross = tile.clone()
  return { endCap, straight, corner, tee, cross }
}

function getVariant(mask) {
  if (mask === 5 || mask === 10) {
    return { type: "straight", rotation: mask === 10 ? Math.PI / 2 : 0 }
  }
  if (mask === 3 || mask === 6 || mask === 12 || mask === 9) {
    const rotationMap = {
      3: 0,
      6: -Math.PI / 2,
      12: Math.PI,
      9: Math.PI / 2,
    }
    return { type: "corner", rotation: rotationMap[mask] }
  }
  if (mask === 7 || mask === 11 || mask === 13 || mask === 14) {
    const rotationMap = {
      11: 0,
      7: -Math.PI / 2,
      14: Math.PI,
      13: Math.PI / 2,
    }
    return { type: "tee", rotation: rotationMap[mask] }
  }
  if (mask === 15) {
    return { type: "cross", rotation: 0 }
  }
  if (mask === 1 || mask === 2 || mask === 4 || mask === 8) {
    const rotationMap = {
      1: 0,
      2: -Math.PI / 2,
      4: Math.PI,
      8: Math.PI / 2,
    }
    return { type: "endCap", rotation: rotationMap[mask] }
  }
  return { type: "endCap", rotation: 0 }
}

function parseKey(value) {
  const [gx, gz] = value.split(",").map(Number)
  return { gx, gz }
}

export class RoadSystem {
  constructor({ scene, y = 3.12, tileSize = GRID_SIZE, maxCount = MAX_ROADS }) {
    this.group = new THREE.Group()
    this.group.name = "roads"
    scene.add(this.group)

    this.y = y
    this.tileSize = tileSize
    this.thickness = 0.22
    this.maxCount = maxCount

    const geometries = createRoadGeometries({ tileSize, thickness: this.thickness })

    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.85,
      metalness: 0.05,
    })
    const outlineMaterial = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.9,
      metalness: 0.05,
    })

    this.meshes = {
      endCap: new THREE.InstancedMesh(geometries.endCap, baseMaterial, maxCount),
      straight: new THREE.InstancedMesh(geometries.straight, baseMaterial, maxCount),
      corner: new THREE.InstancedMesh(geometries.corner, baseMaterial, maxCount),
      tee: new THREE.InstancedMesh(geometries.tee, baseMaterial, maxCount),
      cross: new THREE.InstancedMesh(geometries.cross, baseMaterial, maxCount),
    }

    this.outlines = {
      endCap: new THREE.InstancedMesh(geometries.endCap, outlineMaterial, maxCount),
      straight: new THREE.InstancedMesh(geometries.straight, outlineMaterial, maxCount),
      corner: new THREE.InstancedMesh(geometries.corner, outlineMaterial, maxCount),
      tee: new THREE.InstancedMesh(geometries.tee, outlineMaterial, maxCount),
      cross: new THREE.InstancedMesh(geometries.cross, outlineMaterial, maxCount),
    }

    Object.values(this.meshes).forEach(mesh => {
      mesh.castShadow = false
      mesh.receiveShadow = true
      this.group.add(mesh)
    })
    Object.values(this.outlines).forEach(mesh => {
      mesh.castShadow = false
      mesh.receiveShadow = true
      this.group.add(mesh)
    })

    this.roadsSet = new Set()
    this.tileData = new Map()
    this.bounces = new Map()
  }

  addRoad({ gx, gz }) {
    const k = key(gx, gz)
    if (this.roadsSet.has(k)) return
    this.roadsSet.add(k)
    this.bounces.set(k, 0)
    this.updateNeighbors(gx, gz)
  }

  removeRoad({ gx, gz }) {
    const k = key(gx, gz)
    if (!this.roadsSet.has(k)) return
    this.roadsSet.delete(k)
    this.tileData.delete(k)
    this.bounces.delete(k)
    this.updateNeighbors(gx, gz)
  }

  updateNeighbors(gx, gz) {
    const targets = [
      { gx, gz },
      { gx: gx + 1, gz },
      { gx: gx - 1, gz },
      { gx, gz: gz + 1 },
      { gx, gz: gz - 1 },
    ]

    targets.forEach(({ gx: tx, gz: tz }) => {
      const k = key(tx, tz)
      if (!this.roadsSet.has(k)) {
        this.tileData.delete(k)
        return
      }
      const mask = this.computeMask(tx, tz)
      const variant = getVariant(mask)
      this.tileData.set(k, { gx: tx, gz: tz, mask, ...variant })
    })

    this.rebuildInstances()
  }

  computeMask(gx, gz) {
    let mask = 0
    if (this.roadsSet.has(key(gx, gz + 1))) mask += 1
    if (this.roadsSet.has(key(gx + 1, gz))) mask += 2
    if (this.roadsSet.has(key(gx, gz - 1))) mask += 4
    if (this.roadsSet.has(key(gx - 1, gz))) mask += 8
    return mask
  }

  rebuildInstances() {
    const counts = {
      endCap: 0,
      straight: 0,
      corner: 0,
      tee: 0,
      cross: 0,
    }

    for (const mesh of Object.values(this.meshes)) {
      mesh.count = 0
    }
    for (const mesh of Object.values(this.outlines)) {
      mesh.count = 0
    }

    for (const value of this.roadsSet.values()) {
      const { gx, gz } = parseKey(value)
      const mask = this.computeMask(gx, gz)
      const { type, rotation } = getVariant(mask)
      const index = counts[type]
      counts[type] += 1
      this.tileData.set(value, { gx, gz, mask, type, rotation, index })
      this.applyMatrix({ type, index, gx, gz, rotation, scale: 1 })
    }

    Object.entries(counts).forEach(([type, count]) => {
      this.meshes[type].count = count
      this.outlines[type].count = count
      this.meshes[type].instanceMatrix.needsUpdate = true
      this.outlines[type].instanceMatrix.needsUpdate = true
    })
  }

  applyMatrix({ type, index, gx, gz, rotation, scale }) {
    const { x, z } = gridToWorld(gx, gz)
    const position = new THREE.Vector3(x, this.y, z)
    const quat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation)
    const scaleVec = new THREE.Vector3(scale, scale, scale)
    const matrix = new THREE.Matrix4().compose(position, quat, scaleVec)
    this.meshes[type].setMatrixAt(index, matrix)

    const outlinePosition = new THREE.Vector3(x, this.y - 0.03, z)
    const outlineScale = scale * 1.04
    const outlineMatrix = new THREE.Matrix4().compose(
      outlinePosition,
      quat,
      new THREE.Vector3(outlineScale, outlineScale, outlineScale)
    )
    this.outlines[type].setMatrixAt(index, outlineMatrix)
  }

  update(delta) {
    if (!this.bounces.size) return
    const finished = []

    for (const [value, timer] of this.bounces.entries()) {
      const nextTime = timer + delta
      const progress = Math.min(1, nextTime / 0.25)
      const bounce = 1 + Math.sin(progress * Math.PI) * 0.18
      const data = this.tileData.get(value)
      if (data) {
        this.applyMatrix({
          type: data.type,
          index: data.index,
          gx: data.gx,
          gz: data.gz,
          rotation: data.rotation,
          scale: bounce,
        })
        this.meshes[data.type].instanceMatrix.needsUpdate = true
        this.outlines[data.type].instanceMatrix.needsUpdate = true
      }
      if (progress >= 1) {
        finished.push(value)
      } else {
        this.bounces.set(value, nextTime)
      }
    }

    finished.forEach(value => this.bounces.delete(value))
  }
}
