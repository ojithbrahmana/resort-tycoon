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
  const gens = buildings.filter(b=>b.id==="generator")

  let total = 0
  const perVilla = []
  for(const v of villas){
    const powOk = isPowered({ villa:v, generators: gens, powerRadius: catalogById.generator?.powerRadius ?? 6 })
    const active = powOk
    const income = active ? 3 : 0
    total += income
    perVilla.push({ gx:v.gx, gz:v.gz, income, active, roadOk: true, powOk })
  }
  return { total, perVilla }
}
