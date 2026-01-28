import { GRID_SIZE } from "../data/constants.js"

export function worldToGrid(x,z){
  const gx = Math.round(x / GRID_SIZE)
  const gz = Math.round(z / GRID_SIZE)
  return { gx, gz }
}

export function gridToWorld(gx,gz){
  return { x: gx * GRID_SIZE, z: gz * GRID_SIZE }
}

export function key(gx,gz){ return `${gx},${gz}` }

export function neighbors4(gx,gz){
  return [
    {gx: gx+1, gz},
    {gx: gx-1, gz},
    {gx, gz: gz+1},
    {gx, gz: gz-1},
  ]
}
