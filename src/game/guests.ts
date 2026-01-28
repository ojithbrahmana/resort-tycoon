import { neighbors4, key } from "../engine/grid.js"

export type GridPos = { gx: number; gz: number }

export function findRoadAnchor({ gx, gz, roadsSet }: { gx: number; gz: number; roadsSet: Set<string> }){
  const neighbors = neighbors4(gx, gz)
  for (const n of neighbors) {
    if (roadsSet.has(key(n.gx, n.gz))) return n
  }
  return null
}

export function findPath({ start, goal, roadsSet }: { start: GridPos; goal: GridPos; roadsSet: Set<string> }){
  const startKey = key(start.gx, start.gz)
  const goalKey = key(goal.gx, goal.gz)
  if (startKey === goalKey) return [start]

  const queue: GridPos[] = [start]
  const cameFrom = new Map<string, GridPos | null>()
  cameFrom.set(startKey, null)

  while (queue.length) {
    const current = queue.shift()
    if (!current) continue
    const currentKey = key(current.gx, current.gz)
    if (currentKey === goalKey) break

    for (const n of neighbors4(current.gx, current.gz)) {
      const nKey = key(n.gx, n.gz)
      if (!roadsSet.has(nKey)) continue
      if (cameFrom.has(nKey)) continue
      cameFrom.set(nKey, current)
      queue.push(n)
    }
  }

  if (!cameFrom.has(goalKey)) return null

  const path: GridPos[] = []
  let step: GridPos | null = goal
  while (step) {
    path.push(step)
    step = cameFrom.get(key(step.gx, step.gz)) ?? null
  }
  return path.reverse()
}
