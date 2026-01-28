import { GRID_SIZE } from "../game/constants"

export function worldToGrid(x,z){
  const gx = Math.floor(x / GRID_SIZE)
  const gz = Math.floor(z / GRID_SIZE)
  return { gx, gz }
}

export function gridToWorld(gx,gz){
  return { x: (gx + 0.5) * GRID_SIZE, z: (gz + 0.5) * GRID_SIZE }
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
