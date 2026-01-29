import type { BuildingCatalogItem } from "../assets/catalog"
import { GUEST_WEIGHTS, HAPPINESS_ATTRACTION_IDS } from "./economy"

const BASE_BUILDING_UPKEEP = 0.45
const ROAD_HAPPINESS = 0.8
const PALM_HAPPINESS = 1.2
const DECOR_HAPPINESS = 0.8
const ATTRACTION_HAPPINESS = 5
const GENERATOR_HAPPINESS_PENALTY = -2

const EXPENSE_BONUSES: Record<string, number> = {
  generator: 1.2,
  beach_dj: 1.4,
  spa: 1.6,
  beachclub: 2.0,
}

export function getItemStats(item: BuildingCatalogItem) {
  const incomePerSec = item.incomePerSec ?? 0
  const guests = GUEST_WEIGHTS[item.id] ?? 0
  let happinessImpact = 0

  if (item.id === "road") happinessImpact += ROAD_HAPPINESS
  if (item.id === "palm") happinessImpact += PALM_HAPPINESS
  if (item.category === "Decor") happinessImpact += DECOR_HAPPINESS
  if (HAPPINESS_ATTRACTION_IDS.has(item.id)) happinessImpact += ATTRACTION_HAPPINESS
  if (item.id === "generator") happinessImpact += GENERATOR_HAPPINESS_PENALTY

  let expensesPerSec = BASE_BUILDING_UPKEEP
  if (item.category === "Utility" && item.id !== "generator") {
    expensesPerSec += 0.5
  }
  if (EXPENSE_BONUSES[item.id]) {
    expensesPerSec += EXPENSE_BONUSES[item.id]
  }

  return {
    incomePerSec,
    expensesPerSec,
    happinessImpact,
    guests,
    powerRadius: item.powerRadius ?? null,
  }
}
