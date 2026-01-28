import { neighbors4, key } from "./grid.js"

export function isRoadAdjacent({ villa, roadsSet }){
  return neighbors4(villa.gx, villa.gz).some(n => roadsSet.has(key(n.gx,n.gz)))
}

export function isPowered({ villa, generators, powerRadius }){
  for(const g of generators){
    const dx = villa.gx - g.gx
    const dz = villa.gz - g.gz
    const dist = Math.sqrt(dx*dx + dz*dz)
    if(dist <= powerRadius) return true
  }
  return false
}

export function computeIncomePerSecond({ buildings, catalogById }){
  const villas = buildings.filter(b => b.id==="villa")
  const roadsSet = new Set(buildings.filter(b=>b.id==="road").map(b=>key(b.gx,b.gz)))
  const gens = buildings.filter(b=>b.id==="generator")

  let total = 0
  const perVilla = []
  for(const v of villas){
    const roadOk = isRoadAdjacent({ villa:v, roadsSet })
    const powOk = isPowered({ villa:v, generators: gens, powerRadius: catalogById.generator?.powerRadius ?? 6 })
    const active = roadOk && powOk
    const income = active ? 3 : 0
    total += income
    perVilla.push({ gx:v.gx, gz:v.gz, income, active, roadOk, powOk })
  }
  return { total, perVilla }
}
