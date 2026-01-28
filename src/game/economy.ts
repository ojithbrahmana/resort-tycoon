import { DEFAULT_POWER_RADIUS } from "./constants"
import type { BuildingCatalogItem } from "../assets/catalog"

export type BuildingInstance = {
  uid: string
  id: string
  gx: number
  gz: number
}

export type EconomyStatus = {
  uid: string
  id: string
  gx: number
  gz: number
  active: boolean
  roadOk: boolean
  powerOk: boolean
  incomePerSec: number
}

export function isPowered({ gx, gz, generators, powerRadius }: { gx: number; gz: number; generators: BuildingInstance[]; powerRadius: number }){
  for (const g of generators) {
    const dx = gx - g.gx
    const dz = gz - g.gz
    const dist = Math.sqrt(dx * dx + dz * dz)
    if (dist <= powerRadius) return true
  }
  return false
}

export function computeEconomy({ buildings, catalogById }: { buildings: BuildingInstance[]; catalogById: Record<string, BuildingCatalogItem> }){
  const generators = buildings.filter(b => b.id === "generator")
  const generatorRadius = catalogById.generator?.powerRadius ?? DEFAULT_POWER_RADIUS
  const statuses: EconomyStatus[] = []
  let total = 0

  for (const b of buildings) {
    const item = catalogById[b.id]
    if (!item) continue
    if (item.incomePerSec <= 0 && item.id !== "generator") continue

    // Game rule: buildings only earn if powered (if required).
    const roadOk = true
    const powerOk = item.requiresPower
      ? isPowered({ gx: b.gx, gz: b.gz, generators, powerRadius: generatorRadius })
      : true
    const active = roadOk && powerOk
    const incomePerSec = active ? item.incomePerSec : 0

    statuses.push({ uid: b.uid, id: b.id, gx: b.gx, gz: b.gz, active, roadOk, powerOk, incomePerSec })
    total += incomePerSec
  }

  return { total, statuses }
}
