export type ProgressionState = {
  level: number
  xp: number
  xpToNext: number
}

export const XP_REWARDS = {
  BUILDING_BASE: 10,
  VILLA_EARNING_FIRST: 30,
  POSITIVE_INCOME_TICK: 10,
}

export function createProgressionState(): ProgressionState {
  return { level: 1, xp: 0, xpToNext: 100 }
}

export function applyXp(state: ProgressionState, amount: number){
  let next = { ...state, xp: state.xp + amount }
  let leveledUp = false
  let levelsGained = 0

  while (next.xp >= next.xpToNext) {
    next.xp -= next.xpToNext
    next.level += 1
    next.xpToNext = Math.round(next.xpToNext * 1.25 + 25)
    leveledUp = true
    levelsGained += 1
  }

  return { next, leveledUp, levelsGained }
}
