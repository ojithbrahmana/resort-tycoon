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

const GUEST_SOURCE_IDS = new Set([
  "villa",
  "villa_plus",
  "beachclub",
  "beach_dj",
  "pool_halloween",
  "icecream_parlour",
  "burgershop",
  "spa",
])

const HAPPINESS_ATTRACTION_IDS = new Set([
  "nightbar",
  "beachclub",
  "pool",
  "pool_halloween",
  "beach_dj",
  "spa",
  "icecream_parlour",
])

const GUEST_WEIGHTS: Record<string, number> = {
  villa: 6,
  villa_plus: 10,
  beachclub: 12,
  beach_dj: 8,
  pool_halloween: 10,
  icecream_parlour: 6,
  burgershop: 6,
  spa: 8,
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

export function computeGuestCount({ buildings }: { buildings: BuildingInstance[] }){
  let guests = 0
  for (const b of buildings) {
    if (!GUEST_SOURCE_IDS.has(b.id)) continue
    guests += GUEST_WEIGHTS[b.id] ?? 0
  }
  return guests
}

export function computeHappiness({
  buildings,
  catalogById,
  money,
  hasLoan,
}: {
  buildings: BuildingInstance[]
  catalogById: Record<string, BuildingCatalogItem>
  money: number
  hasLoan: boolean
}){
  const attractionCount = buildings.filter(b => HAPPINESS_ATTRACTION_IDS.has(b.id)).length
  const roadCount = buildings.filter(b => b.id === "road").length
  const palmCount = buildings.filter(b => b.id === "palm").length
  const generatorCount = buildings.filter(b => b.id === "generator").length
  const decorCount = buildings.filter(b => catalogById[b.id]?.category === "Decor").length
  const utilityCount = buildings.filter(b => catalogById[b.id]?.category === "Utility").length
  const buildingCount = buildings.filter(b => b.id !== "road").length

  let score = 50
  score += attractionCount * 4
  score += Math.min(12, roadCount * 0.4)
  score += Math.min(10, palmCount * 1)
  score += Math.min(10, decorCount * 0.6)

  score -= generatorCount * 3
  if (buildingCount > 18) {
    score -= Math.min(12, (buildingCount - 18) * 0.6)
  }
  if (attractionCount === 0) score -= 15
  if (roadCount === 0) score -= 10
  if (utilityCount === 0) score -= 8
  if (money < 0) score -= 8
  if (hasLoan) score -= 6

  return Math.max(0, Math.min(100, Math.round(score)))
}

export function computeEconomy({
  buildings,
  catalogById,
  guests,
  level,
}: {
  buildings: BuildingInstance[]
  catalogById: Record<string, BuildingCatalogItem>
  guests: number
  level: number
}){
  const generators = buildings.filter(b => b.id === "generator")
  const generatorRadius = catalogById.generator?.powerRadius ?? DEFAULT_POWER_RADIUS
  const statuses: EconomyStatus[] = []
  let income = 0

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
    income += incomePerSec
  }

  const buildingCount = buildings.length
  const generatorCount = generators.length
  const beachDjCount = buildings.filter(b => b.id === "beach_dj").length
  const spaCount = buildings.filter(b => b.id === "spa").length
  const beachClubCount = buildings.filter(b => b.id === "beachclub").length
  const utilityCount = buildings.filter(b => catalogById[b.id]?.category === "Utility" && b.id !== "generator").length

  const baseMaintenance = 8
  const buildingMaintenance = buildingCount * 1.1
  const generatorUpkeep = generatorCount * 2.4
  const guestServices = guests * 0.08
  const djOperation = beachDjCount * 2.8
  const utilitiesCost = utilityCount * 0.9
  const spaCost = spaCount * 3.2
  const beachClubCost = beachClubCount * 4.1
  const levelScale = 1 + level * 0.04
  const expenses = Math.max(
    0,
    Math.round(
      (baseMaintenance +
        buildingMaintenance +
        generatorUpkeep +
        guestServices +
        djOperation +
        utilitiesCost +
        spaCost +
        beachClubCost) *
        levelScale
    )
  )

  const total = income - expenses

  return { total, income, expenses, statuses }
}
