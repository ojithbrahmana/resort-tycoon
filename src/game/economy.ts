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
  "reception",
  "villa",
  "villa_plus",
  "beachclub",
  "beach_dj",
  "pool_halloween",
  "icecream_parlour",
  "burgershop",
  "spa",
])

export const HAPPINESS_ATTRACTION_IDS = new Set([
  "nightbar",
  "beachclub",
  "pool",
  "pool_halloween",
  "beach_dj",
  "spa",
  "icecream_parlour",
])

export const GUEST_WEIGHTS: Record<string, number> = {
  reception: 8,
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

  let score = 0
  score += attractionCount * 5
  score += Math.min(20, roadCount * 0.8)
  score += Math.min(15, palmCount * 1.2)
  score += Math.min(18, decorCount * 0.8)

  score -= generatorCount * 2
  if (buildingCount > 18) {
    score -= Math.min(10, (buildingCount - 18) * 0.5)
  }
  if (attractionCount === 0) score -= 10
  if (roadCount === 0) score -= 10
  if (utilityCount === 0) score -= 6
  if (money < 0) score -= 6
  if (hasLoan) score -= 4

  return Math.max(0, Math.min(100, Math.round(score)))
}

export function computeEconomy({
  buildings,
  catalogById,
  guests,
  level,
  happiness,
  loanPaymentPerSec = 0,
}: {
  buildings: BuildingInstance[]
  catalogById: Record<string, BuildingCatalogItem>
  guests: number
  level: number
  happiness: number
  loanPaymentPerSec?: number
}){
  const generators = buildings.filter(b => b.id === "generator")
  const generatorRadius = catalogById.generator?.powerRadius ?? DEFAULT_POWER_RADIUS
  const statuses: EconomyStatus[] = []
  let income = 0
  const incomeMultiplier = Math.max(1, 1 + (happiness / 100) * 0.5)

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
    const incomePerSec = active ? Math.round(item.incomePerSec * incomeMultiplier) : 0

    statuses.push({ uid: b.uid, id: b.id, gx: b.gx, gz: b.gz, active, roadOk, powerOk, incomePerSec })
    income += incomePerSec
  }

  const buildingCount = buildings.length
  const generatorCount = generators.length
  const beachDjCount = buildings.filter(b => b.id === "beach_dj").length
  const spaCount = buildings.filter(b => b.id === "spa").length
  const beachClubCount = buildings.filter(b => b.id === "beachclub").length
  const utilityCount = buildings.filter(b => catalogById[b.id]?.category === "Utility" && b.id !== "generator").length

  const baseMaintenance = 4
  const buildingMaintenance = buildingCount * 0.45
  const generatorUpkeep = generatorCount * 1.2
  const guestServices = guests * 0.04
  const djOperation = beachDjCount * 1.4
  const utilitiesCost = utilityCount * 0.5
  const spaCost = spaCount * 1.6
  const beachClubCost = beachClubCount * 2.0
  const levelScale = 1 + level * 0.02
  const rawExpenses = Math.max(
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
  const cappedExpenses = income > 0 ? Math.min(rawExpenses, Math.round(income * 0.2)) : 0
  const expenses = cappedExpenses + Math.round(loanPaymentPerSec)

  const total = income - cappedExpenses

  return { total, income, expenses, statuses }
}
