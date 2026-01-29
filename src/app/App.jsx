import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { createEngine } from "../engine/engine.js"
import { gridToWorld, key, worldToGrid } from "../engine/grid.js"
import { computeTutorialProgress, steps as tutorialSteps } from "../engine/tutorial.js"
import { computeEconomy } from "../game/economy"
import { createProgressionState, applyXp, XP_REWARDS } from "../game/progression"
import { CATALOG, CATEGORIES } from "../assets/catalog"
import { GRID_HALF, INCOME_TICK_MS, INCOME_XP_INTERVAL_MS, GRASS_RADIUS, SHORE_INNER_RADIUS, SHORE_OUTER_RADIUS } from "../game/constants"
import { playSound } from "../game/sound"
import { findPath, findRoadAnchor } from "../game/guests"
import splashImage from "../assets/ui/splash.png"
import logoImage from "../assets/ui/urtlogo.png"
import HUD from "../ui/HUD.jsx"
import ModeBar from "../ui/ModeBar.jsx"
import BuildShop from "../ui/BuildShop.jsx"
import TutorialPanel from "../ui/TutorialPanel.jsx"
import LevelToast from "../ui/LevelToast.jsx"

const catalogById = Object.fromEntries(CATALOG.map(item => [item.id, item]))

const VILLA_IDS = new Set(["villa", "villa_plus"])
const LOAN_OPTIONS = [
  { principal: 500, rate: 0.1 },
  { principal: 2000, rate: 0.2 },
  { principal: 5000, rate: 0.35 },
]
const LOAN_DURATION_SEC = 60
const BUILT_IN_PALM_COUNT = 14

function createUid(prefix){
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function shuffleArray(list){
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

function getShoreCells(){
  const cells = []
  for (let gx = -GRID_HALF; gx <= GRID_HALF; gx += 1) {
    for (let gz = -GRID_HALF; gz <= GRID_HALF; gz += 1) {
      const { x, z } = gridToWorld(gx, gz)
      const radius = Math.hypot(x, z)
      if (radius >= SHORE_INNER_RADIUS && radius <= SHORE_OUTER_RADIUS) {
        cells.push({ gx, gz })
      }
    }
  }
  return cells
}

function makeConfetti(){
  return Array.from({ length: 14 }).map((_, index) => ({
    id: `${Date.now()}-${index}`,
    left: `${10 + Math.random() * 80}%`,
    top: `${Math.random() * 20}%`,
    delay: Math.random() * 0.3,
  }))
}

export default function App(){
  const viewportRef = useRef(null)
  const engineRef = useRef(null)
  const toolRef = useRef("villa")
  const modeRef = useRef("build")
  const occupiedRef = useRef(new Set())
  const buildingsRef = useRef([])
  const buildingsByUidRef = useRef(new Map())
  const economyRef = useRef({ total: 0, statuses: [] })
  const moneyRef = useRef(1000)
  const levelRef = useRef(1)
  const hoverRef = useRef(null)
  const dragRef = useRef({ active: false, start: null, axis: null, placed: new Set() })
  const moveSelectionRef = useRef(null)
  const activeLoanRef = useRef(null)
  const negativeTimerRef = useRef(0)
  const debtTimerRef = useRef(0)
  const builtInSeedRef = useRef(false)

  const [mode, setMode] = useState("build")
  const [category, setCategory] = useState("All")
  const [tool, setTool] = useState("villa")
  const [money, setMoney] = useState(1000)
  const [moneyDisplay, setMoneyDisplay] = useState(1000)
  const [moneyBump, setMoneyBump] = useState(false)
  const [incomeTrend, setIncomeTrend] = useState("stable")
  const [incomeDeltaText, setIncomeDeltaText] = useState("")
  const [buildings, setBuildings] = useState([])
  const [toast, setToast] = useState(null)
  const [levelUp, setLevelUp] = useState(null)
  const [confetti, setConfetti] = useState([])
  const [splashPhase, setSplashPhase] = useState("show")
  const [progression, setProgression] = useState(createProgressionState())
  const [tutorialVisible, setTutorialVisible] = useState(true)
  const [tutorialDismissed, setTutorialDismissed] = useState(false)
  const [buildShopOpen, setBuildShopOpen] = useState(true)
  const [revenueLabels, setRevenueLabels] = useState([])
  const [loanPanelOpen, setLoanPanelOpen] = useState(false)
  const [activeLoan, setActiveLoan] = useState(null)
  const [bankrupt, setBankrupt] = useState(false)
  const earningOnceRef = useRef(new Set())
  const lastIncomeRef = useRef(0)
  const splashRef = useRef("show")

  toolRef.current = tool
  modeRef.current = mode
  buildingsRef.current = buildings
  moneyRef.current = money
  levelRef.current = progression.level
  splashRef.current = splashPhase
  activeLoanRef.current = activeLoan

  useEffect(() => {
    const s = new Set()
    const byUid = new Map()
    for (const b of buildings) {
      byUid.set(b.uid, b)
      const item = catalogById[b.id]
      const cells = getFootprintCells({ gx: b.gx, gz: b.gz }, item?.footprint)
      for (const cell of cells) {
        s.add(key(cell.gx, cell.gz))
      }
    }
    occupiedRef.current = s
    buildingsByUidRef.current = byUid
  }, [buildings])

  useEffect(() => {
    const splashTimer = window.setTimeout(() => {
      setSplashPhase("fade")
    }, 3000)
    const removeTimer = window.setTimeout(() => {
      setSplashPhase("done")
    }, 3300)
    return () => {
      window.clearTimeout(splashTimer)
      window.clearTimeout(removeTimer)
    }
  }, [])

  const economy = useMemo(()=> computeEconomy({ buildings, catalogById }), [buildings])
  economyRef.current = economy

  const tutorialProgress = useMemo(() => computeTutorialProgress({ buildings }), [buildings])
  const tutorial = useMemo(() => ({
    message: tutorialProgress.message,
    completed: tutorialProgress.completed,
    steps: tutorialSteps.map(step => step.text),
  }), [tutorialProgress])

  useEffect(() => {
    const prev = lastIncomeRef.current
    if (economy.total !== prev) {
      const diff = economy.total - prev
      setIncomeTrend(diff > 0 ? "up" : "down")
      setIncomeDeltaText(` ${diff > 0 ? "+" : ""}${diff}/sec`)
      window.clearTimeout(setIncomeTrend._t)
      setIncomeTrend._t = window.setTimeout(() => {
        setIncomeTrend("stable")
        setIncomeDeltaText("")
      }, 600)
      lastIncomeRef.current = economy.total
    }
  }, [economy.total])

  useEffect(() => {
    const start = moneyDisplay
    const startTime = performance.now()
    const duration = 400
    let raf

    const animate = (now) => {
      const progress = Math.min(1, (now - startTime) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      const value = Math.round(start + (money - start) * eased)
      setMoneyDisplay(value)
      if (progress < 1) {
        raf = requestAnimationFrame(animate)
      }
    }

    if (money !== moneyDisplay) {
      setMoneyBump(true)
      window.clearTimeout(setMoneyBump._t)
      setMoneyBump._t = window.setTimeout(() => setMoneyBump(false), 400)
    }

    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [money])

  useEffect(() => {
    if (!viewportRef.current) return
    const eng = createEngine({ container: viewportRef.current })
    engineRef.current = eng
    eng.setHandlers({
      onPlaceCb: ({ gx, gz }) => {
        const item = catalogById[toolRef.current]
        if (!item) return
        placeBuilding({ item, gx, gz })
      },
      onHoverCb: (data) => {
        hoverRef.current = data
        if (!data) return
        if (!dragRef.current.active) return
        if (toolRef.current !== "road") return
        handleDragPlacement(data)
      },
      onInvalidCb: () => signalInvalid("Can't build there."),
    })

    const onMove = (e) => {
      const current = engineRef.current
      if (!current) return
      if (splashRef.current !== "done") return
      if (bankrupt) return
      if (!isCanvasEvent(e)) return
      if (modeRef.current === "build") {
        const item = catalogById[toolRef.current]
        current.handleMouseMove(e, { footprint: item?.footprint, occupiedKeys: occupiedRef.current })
      }
      if (modeRef.current === "move" && moveSelectionRef.current) {
        const selection = moveSelectionRef.current
        const item = catalogById[selection.id]
        const occupied = new Set(occupiedRef.current)
        const footprint = getFootprintCells({ gx: selection.gx, gz: selection.gz }, item?.footprint)
        footprint.forEach(cell => occupied.delete(key(cell.gx, cell.gz)))
        current.handleMouseMove(e, { footprint: item?.footprint, occupiedKeys: occupied })
      }
      if (modeRef.current === "demolish") {
        const hit = current.pickIsland?.(e.clientX, e.clientY)
        if (!hit) {
          current.clearDemolishOutline?.()
          return
        }
        const { gx, gz } = worldToGrid(hit.x, hit.z)
        const target = findBuildingAtCell({ gx, gz })
        if (!target) {
          current.clearDemolishOutline?.()
          return
        }
        const item = catalogById[target.id]
        if (!item) {
          current.clearDemolishOutline?.()
          return
        }
        current.setDemolishOutline?.({ gx: target.gx, gz: target.gz, footprint: item?.footprint })
      }
    }
    const onMouseDown = (e) => {
      const current = engineRef.current
      if (!current) return
      if (splashRef.current !== "done") return
      if (bankrupt) return
      if (!isCanvasEvent(e)) return
      if (e.button === 2) {
        if (modeRef.current === "move" && moveSelectionRef.current) {
          clearMoveSelection()
        }
        return
      }
      if (modeRef.current === "build") {
        const item = catalogById[toolRef.current]
        if (item?.id === "road") {
          const hover = hoverRef.current
          if (!hover) return
          if (!hover.ok) {
            signalInvalid("Can't build there.")
            return
          }
          startDrag(hover)
          const startResult = placeBuilding({ item, gx: hover.gx, gz: hover.gz })
          if (startResult.placed) {
            dragRef.current.placed.add(key(hover.gx, hover.gz))
          } else {
            stopDrag()
            return
          }
          return
        }
        current.handleClick(e)
        return
      }
      if (modeRef.current === "move") {
        handleMoveClick(e)
      }
      if (modeRef.current === "demolish") {
        handleDemolishClick(e)
      }
    }
    const onMouseUp = () => {
      stopDrag()
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mousedown", onMouseDown)
    window.addEventListener("mouseup", onMouseUp)
    seedBuiltInPalms({ replace: true })
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mousedown", onMouseDown)
      window.removeEventListener("mouseup", onMouseUp)
      eng.dispose?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportRef])

  useEffect(() => {
    if (!levelUp) return () => {}
    const timer = window.setTimeout(() => setLevelUp(null), 3000)
    return () => window.clearTimeout(timer)
  }, [levelUp])

  useEffect(() => {
    engineRef.current?.setInputLocked(splashPhase !== "done" || bankrupt)
  }, [splashPhase, bankrupt])

  useEffect(() => {
    if (mode !== "build" && buildShopOpen) {
      setBuildShopOpen(false)
    }
  }, [mode, buildShopOpen])

  useEffect(() => {
    if (mode !== "move") {
      clearMoveSelection()
    }
  }, [mode])

  useEffect(() => {
    if (mode !== "demolish") {
      engineRef.current?.clearDemolishOutline?.()
    }
  }, [mode])

  useEffect(() => {
    const eng = engineRef.current
    if (!eng) return
    economy.statuses.forEach(status => {
      if (!VILLA_IDS.has(status.id)) return
      const item = catalogById[status.id]
      eng.updateVillaStatus({ ...status, footprint: item?.footprint })
    })
  }, [economy.statuses])

  useEffect(() => {
    const t = setInterval(() => {
      const eng = engineRef.current
      const current = economyRef.current
      if (!eng) return
      const activeVillas = current.statuses.filter(status => VILLA_IDS.has(status.id) && status.active)
      for (const v of activeVillas) {
        eng.spawnCoinSparkle({ gx: v.gx, gz: v.gz })
        playSound("coin")
      }
    }, 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => {
      const eng = engineRef.current
      if (!eng) return
      const current = economyRef.current
      if (current.total <= 0) return
      if (eng.getGuestCount() > 12) return

      const roadsSet = new Set(buildingsRef.current.filter(b => b.id === "road").map(b => key(b.gx, b.gz)))
      const destinations = buildingsRef.current.filter(b => {
        const item = catalogById[b.id]
        return item && ["Decor", "Utility"].includes(item.category)
      })

      const activeVillas = current.statuses.filter(status => VILLA_IDS.has(status.id) && status.active)
      if (!activeVillas.length || !destinations.length || roadsSet.size === 0) return

      const source = activeVillas[Math.floor(Math.random() * activeVillas.length)]
      const targetBuilding = destinations[Math.floor(Math.random() * destinations.length)]
      const start = findRoadAnchor({ gx: source.gx, gz: source.gz, roadsSet })
      const goal = findRoadAnchor({ gx: targetBuilding.gx, gz: targetBuilding.gz, roadsSet })
      if (!start || !goal) return
      const path = findPath({ start, goal, roadsSet })
      if (!path) return
      const back = [...path].reverse().slice(1)
      eng.spawnGuest({ path: [...path, ...back] })
    }, 4000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const t = setInterval(() => {
      if (economy.total > 0) {
        setMoney(prev => prev + economy.total)
      }
    }, INCOME_TICK_MS)
    return () => clearInterval(t)
  }, [economy.total])

  useEffect(() => {
    const t = setInterval(() => {
      if (economy.total > 0) {
        addXp(XP_REWARDS.POSITIVE_INCOME_TICK)
      }
    }, INCOME_XP_INTERVAL_MS)
    return () => clearInterval(t)
  }, [economy.total])

  useEffect(() => {
    for (const status of economy.statuses) {
      if (!VILLA_IDS.has(status.id)) continue
      if (!status.active) continue
      if (earningOnceRef.current.has(status.uid)) continue
      earningOnceRef.current.add(status.uid)
      addXp(XP_REWARDS.VILLA_EARNING_FIRST)
    }
  }, [economy.statuses])

  useEffect(() => {
    if (!activeLoan) return undefined
    const timer = setInterval(() => {
      setActiveLoan(prev => {
        if (!prev) return null
        const remainingOwed = Math.max(0, prev.remainingOwed - prev.paymentPerSecond)
        if (remainingOwed <= 0) {
          return null
        }
        return { ...prev, remainingOwed }
      })
      setMoney(prev => {
        const payment = activeLoanRef.current?.paymentPerSecond ?? 0
        const next = prev - payment
        moneyRef.current = next
        return next
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [activeLoan])

  useEffect(() => {
    const timer = setInterval(() => {
      if (bankrupt) return
      const income = economyRef.current.total
      const payment = activeLoanRef.current?.paymentPerSecond ?? 0
      if (moneyRef.current < 0) {
        negativeTimerRef.current += 0.25
      } else {
        negativeTimerRef.current = 0
      }
      if (payment > income * 0.75 && payment > 0) {
        debtTimerRef.current += 0.25
      } else {
        debtTimerRef.current = 0
      }
      if (negativeTimerRef.current >= 3 || debtTimerRef.current >= 5) {
        setBankrupt(true)
        setBuildShopOpen(false)
        setLoanPanelOpen(false)
        engineRef.current?.setInputLocked(true)
      }
    }, 250)
    return () => clearInterval(timer)
  }, [bankrupt])

  function addXp(amount){
    setProgression(prev => {
      const result = applyXp(prev, amount)
      if (result.leveledUp) {
        const unlocked = CATALOG.filter(item => item.unlockLevel > prev.level && item.unlockLevel <= result.next.level)
        setLevelUp({ level: result.next.level, unlocked })
        setConfetti(makeConfetti())
        window.clearTimeout(setConfetti._t)
        setConfetti._t = window.setTimeout(() => setConfetti([]), 1400)
      }
      return result.next
    })
  }

  function stopUiEvent(event){
    event.preventDefault()
    event.stopPropagation()
  }

  function pop(msg){
    setToast({ message: msg, tone: "info" })
    window.clearTimeout(pop._t)
    pop._t = window.setTimeout(() => setToast(null), 1600)
  }

  function signalInvalid(msg){
    setToast({ message: msg, tone: "error" })
    window.clearTimeout(pop._t)
    pop._t = window.setTimeout(() => setToast(null), 1800)
    engineRef.current?.shakeCamera()
    playSound("error")
  }

  function takeLoan({ principal, rate }){
    if (activeLoanRef.current) return
    const totalOwed = Math.round(principal * (1 + rate))
    const paymentPerSecond = totalOwed / LOAN_DURATION_SEC
    setActiveLoan({
      principal,
      rate,
      totalOwed,
      remainingOwed: totalOwed,
      paymentPerSecond,
    })
    setMoney(prev => {
      const next = prev + principal
      moneyRef.current = next
      return next
    })
    setLoanPanelOpen(false)
  }

  function seedBuiltInPalms({ replace = false } = {}){
    if (builtInSeedRef.current) return
    const item = catalogById.palm
    if (!item) return
    const candidates = shuffleArray(getShoreCells())
    const occupied = replace ? new Set() : new Set(occupiedRef.current)
    const placements = []
    for (const cell of candidates) {
      if (placements.length >= BUILT_IN_PALM_COUNT) break
      const cellKey = key(cell.gx, cell.gz)
      if (occupied.has(cellKey)) continue
      occupied.add(cellKey)
      placements.push(cell)
    }
    if (!placements.length) return
    const entries = placements.map(cell => ({
      uid: createUid("palm"),
      id: "palm",
      gx: cell.gx,
      gz: cell.gz,
      cost: 0,
      object: null,
      builtIn: true,
    }))
    builtInSeedRef.current = true
    setBuildings(prev => (replace ? entries : [...prev, ...entries]))
    entries.forEach(entry => {
      void engineRef.current?.addBuilding({ building: item, gx: entry.gx, gz: entry.gz, uid: entry.uid }).then(obj => {
        let bboxTopY = null
        let bboxHeight = null
        let bboxBottomY = null
        if (obj) {
          const bounds = new THREE.Box3().setFromObject(obj)
          bboxTopY = bounds.max.y
          bboxHeight = bounds.max.y - bounds.min.y
          bboxBottomY = bounds.min.y
          obj.userData = { ...obj.userData, bboxTopY, bboxHeight, bboxBottomY }
        }
        setBuildings(prev => prev.map(b => b.uid === entry.uid ? { ...b, object: obj, bboxTopY, bboxHeight, bboxBottomY } : b))
      })
    })
  }

  function startNewGame(){
    engineRef.current?.resetWorld?.()
    engineRef.current?.setInputLocked(false)
    setBuildings([])
    occupiedRef.current = new Set()
    setMoney(1000)
    setMoneyDisplay(1000)
    moneyRef.current = 1000
    setIncomeTrend("stable")
    setIncomeDeltaText("")
    setProgression(createProgressionState())
    setHasBuiltVilla(false)
    setHasBuiltGenerator(false)
    setActiveLoan(null)
    activeLoanRef.current = null
    negativeTimerRef.current = 0
    debtTimerRef.current = 0
    setTutorialDismissed(false)
    setTutorialVisible(true)
    setModeSafe("build")
    setCategory("All")
    setTool("villa")
    engineRef.current?.setTool("villa")
    setBuildShopOpen(true)
    setLoanPanelOpen(false)
    setBankrupt(false)
    setToast(null)
    setLevelUp(null)
    setConfetti([])
    earningOnceRef.current = new Set()
    lastIncomeRef.current = 0
    clearMoveSelection()
    builtInSeedRef.current = false
    seedBuiltInPalms({ replace: true })
  }

  function setModeSafe(next){
    setMode(next)
    engineRef.current?.setMode(next)
    if (next === "build") {
      setBuildShopOpen(true)
    } else {
      setBuildShopOpen(false)
    }
  }

  function isCanvasEvent(event){
    if (!viewportRef.current) return false
    if (!event?.target) return false
    if (!viewportRef.current.contains(event.target)) return false
    if (event.target.closest?.("#hud, #buildShop, #tutorialPanel, .ui")) return false
    return true
  }

  function isBuildableSurface(gx, gz){
    const { x, z } = gridToWorld(gx, gz)
    const radius = Math.hypot(x, z)
    return radius <= GRASS_RADIUS || (radius >= SHORE_INNER_RADIUS && radius <= SHORE_OUTER_RADIUS)
  }

  function isWithinGrid(gx, gz){
    return Math.abs(gx) <= GRID_HALF && Math.abs(gz) <= GRID_HALF
  }

  function validatePlacement({ item, gx, gz }){
    const cells = getFootprintCells({ gx, gz }, item?.footprint)
    for (const cell of cells) {
      if (!isWithinGrid(cell.gx, cell.gz) || !isBuildableSurface(cell.gx, cell.gz)) {
        return "Can't build there."
      }
      if (occupiedRef.current.has(key(cell.gx, cell.gz))) {
        return "Tile already occupied."
      }
    }
    if (item?.id === "palm") {
      for (const building of buildingsRef.current) {
        if (building.id !== "palm") continue
        const dx = Math.abs(building.gx - gx)
        const dz = Math.abs(building.gz - gz)
        if (Math.max(dx, dz) <= 1) {
          return "Leave space between palms."
        }
      }
    }
    if (levelRef.current < item.unlockLevel) {
      return `Unlocks at Level ${item.unlockLevel}.`
    }
    if (moneyRef.current < item.cost) {
      return "Not enough coins!"
    }
    return null
  }

  function placeBuilding({ item, gx, gz, silentInvalid = false }){
    const reason = validatePlacement({ item, gx, gz })
    if (reason) {
      if (!silentInvalid) signalInvalid(reason)
      return { placed: false, reason }
    }

    const uid = createUid(item.id)
    const entry = { uid, id: item.id, gx, gz, cost: item.cost, object: null }
    setBuildings(prev => [...prev, entry])
    const occupiedCells = getFootprintCells({ gx, gz }, item?.footprint)
    for (const cell of occupiedCells) {
      occupiedRef.current.add(key(cell.gx, cell.gz))
    }
    moneyRef.current -= item.cost
    setMoney(prev => prev - item.cost)
    addXp(Math.round(XP_REWARDS.BUILDING_BASE * item.buildingTier))
    playSound("place")

    void engineRef.current?.addBuilding({ building: item, gx, gz, uid }).then(obj => {
      let bboxTopY = null
      let bboxHeight = null
      let bboxBottomY = null
      if (obj) {
        if (obj.type === "road") {
          setBuildings(prev => prev.map(b => b.uid === uid ? { ...b, object: obj } : b))
          return
        }
        const bounds = new THREE.Box3().setFromObject(obj)
        bboxTopY = bounds.max.y
        bboxHeight = bounds.max.y - bounds.min.y
        bboxBottomY = bounds.min.y
        obj.userData = { ...obj.userData, bboxTopY, bboxHeight, bboxBottomY }
      }
      setBuildings(prev => prev.map(b => b.uid === uid ? { ...b, object: obj, bboxTopY, bboxHeight, bboxBottomY } : b))
    })

    pop(`${item.name} placed.`)
    return { placed: true, reason: null }
  }

  function startDrag({ gx, gz }){
    dragRef.current = { active: true, start: { gx, gz }, axis: null, placed: new Set() }
  }

  function stopDrag(){
    dragRef.current = { active: false, start: null, axis: null, placed: new Set() }
  }

  function getLineCells(start, end, axis){
    if (axis === "x") {
      const min = Math.min(start.gx, end.gx)
      const max = Math.max(start.gx, end.gx)
      return Array.from({ length: max - min + 1 }, (_, idx) => ({ gx: min + idx, gz: start.gz }))
    }
    if (axis === "z") {
      const min = Math.min(start.gz, end.gz)
      const max = Math.max(start.gz, end.gz)
      return Array.from({ length: max - min + 1 }, (_, idx) => ({ gx: start.gx, gz: min + idx }))
    }
    return []
  }

  function getFootprintCells({ gx, gz }, footprint){
    const { w = 1, h = 1 } = footprint ?? {}
    const cells = []
    for (let dx = 0; dx < w; dx += 1) {
      for (let dz = 0; dz < h; dz += 1) {
        cells.push({ gx: gx + dx, gz: gz + dz })
      }
    }
    return cells
  }

  function findBuildingAtCell({ gx, gz }){
    const current = buildingsRef.current
    for (let i = current.length - 1; i >= 0; i -= 1) {
      const building = current[i]
      const item = catalogById[building.id]
      const cells = getFootprintCells({ gx: building.gx, gz: building.gz }, item?.footprint)
      if (cells.some(cell => cell.gx === gx && cell.gz === gz)) {
        return building
      }
    }
    return null
  }

  function clearMoveSelection(){
    moveSelectionRef.current = null
    engineRef.current?.clearSelectionOutline?.()
    engineRef.current?.clearGhost?.()
  }

  function selectMoveBuilding(building){
    if (!building) return
    const item = catalogById[building.id]
    moveSelectionRef.current = building
    engineRef.current?.setSelectionOutline?.({ gx: building.gx, gz: building.gz, footprint: item?.footprint })
  }

  function handleMoveClick(event){
    const eng = engineRef.current
    if (!eng) return
    const hit = eng.pickIsland?.(event.clientX, event.clientY)
    if (!hit) return
    const { gx, gz } = worldToGrid(hit.x, hit.z)
    const selection = moveSelectionRef.current
    if (!selection) {
      const target = findBuildingAtCell({ gx, gz })
      if (!target || target.id === "road") return
      selectMoveBuilding(target)
      return
    }
    const hover = hoverRef.current
    if (!hover || !hover.ok) {
      signalInvalid("Can't move there.")
      return
    }
    const item = catalogById[selection.id]
    if (!item) return
    if (hover.gx === selection.gx && hover.gz === selection.gz) {
      clearMoveSelection()
      return
    }
    const oldCells = getFootprintCells({ gx: selection.gx, gz: selection.gz }, item?.footprint)
    const newCells = getFootprintCells({ gx: hover.gx, gz: hover.gz }, item?.footprint)
    oldCells.forEach(cell => occupiedRef.current.delete(key(cell.gx, cell.gz)))
    newCells.forEach(cell => occupiedRef.current.add(key(cell.gx, cell.gz)))
    eng.removePlacedObject(selection.object)
    setBuildings(prev => prev.map(b => (
      b.uid === selection.uid
        ? { ...b, gx: hover.gx, gz: hover.gz, object: null }
        : b
    )))
    void eng.addBuilding({ building: item, gx: hover.gx, gz: hover.gz, uid: selection.uid }).then(obj => {
      let bboxTopY = null
      let bboxHeight = null
      let bboxBottomY = null
      if (obj) {
        const bounds = new THREE.Box3().setFromObject(obj)
        bboxTopY = bounds.max.y
        bboxHeight = bounds.max.y - bounds.min.y
        bboxBottomY = bounds.min.y
        obj.userData = { ...obj.userData, bboxTopY, bboxHeight, bboxBottomY }
      }
      setBuildings(prev => prev.map(b => b.uid === selection.uid ? { ...b, object: obj, bboxTopY, bboxHeight, bboxBottomY } : b))
    })
    clearMoveSelection()
  }

  function handleDemolishClick(event){
    const eng = engineRef.current
    if (!eng) return
    const hit = eng.pickIsland?.(event.clientX, event.clientY)
    if (!hit) return
    const { gx, gz } = worldToGrid(hit.x, hit.z)
    const target = findBuildingAtCell({ gx, gz })
    if (!target) return
    const item = catalogById[target.id]
    if (!item) return
    const cells = getFootprintCells({ gx: target.gx, gz: target.gz }, item?.footprint)
    cells.forEach(cell => occupiedRef.current.delete(key(cell.gx, cell.gz)))
    eng.removePlacedObject(target.object)
    setBuildings(prev => prev.filter(b => b.uid !== target.uid))
    clearMoveSelection()
    eng.clearDemolishOutline?.()
  }

  function handleDragPlacement({ gx, gz }){
    const drag = dragRef.current
    if (!drag.active || !drag.start) return
    if (!drag.axis) {
      const dx = gx - drag.start.gx
      const dz = gz - drag.start.gz
      if (dx === 0 && dz === 0) return
      drag.axis = Math.abs(dx) >= Math.abs(dz) ? "x" : "z"
    }
    const cells = getLineCells(drag.start, { gx, gz }, drag.axis)
    for (const cell of cells) {
      const cellKey = key(cell.gx, cell.gz)
      if (drag.placed.has(cellKey)) continue
      drag.placed.add(cellKey)
      const item = catalogById.road
      if (!isWithinGrid(cell.gx, cell.gz) || !isBuildableSurface(cell.gx, cell.gz)) {
        continue
      }
      const result = placeBuilding({ item, gx: cell.gx, gz: cell.gz, silentInvalid: true })
      if (!result.placed && result.reason && result.reason !== "Tile already occupied.") {
        signalInvalid(result.reason)
        stopDrag()
        break
      }
    }
  }

  const moneyDisplayState = useMemo(() => ({
    value: moneyDisplay.toLocaleString(),
    bump: moneyBump,
  }), [moneyDisplay, moneyBump])
  const incomeDisplayState = useMemo(() => ({
    value: economy.total,
    deltaText: incomeDeltaText,
  }), [economy.total, incomeDeltaText])

  const handleOpenLoan = useCallback(() => {
    if (!bankrupt) setLoanPanelOpen(true)
  }, [bankrupt])

  const splashVisible = splashPhase !== "done"
  const showLogo = tutorialDismissed || !tutorialVisible

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return
      if (modeRef.current === "move" && moveSelectionRef.current) {
        clearMoveSelection()
      }
    }
    const onContextMenu = (event) => {
      if (!isCanvasEvent(event)) return
      if (modeRef.current === "move" && moveSelectionRef.current) {
        event.preventDefault()
        clearMoveSelection()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("contextmenu", onContextMenu)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("contextmenu", onContextMenu)
    }
  }, [])

  useEffect(() => {
    let raf
    let lastUpdate = 0
    const tempVec = new THREE.Vector3()
    const updateLabels = () => {
      const eng = engineRef.current
      if (!eng) {
        raf = requestAnimationFrame(updateLabels)
        return
      }
      const now = performance.now()
      if (now - lastUpdate < 120) {
        raf = requestAnimationFrame(updateLabels)
        return
      }
      lastUpdate = now
      const { camera, renderer } = eng
      const width = renderer.domElement.clientWidth
      const height = renderer.domElement.clientHeight
      const statuses = economyRef.current.statuses.filter(status => (
        status.active
        && status.incomePerSec > 0
      ))
      const labels = []
      for (const status of statuses) {
        const building = buildingsByUidRef.current.get(status.uid)
        const obj = building?.object
        if (!obj) continue
        let topY = building?.bboxTopY ?? obj.userData?.bboxTopY
        if (topY == null) {
          const bounds = new THREE.Box3().setFromObject(obj)
          topY = bounds.max.y
          obj.userData.bboxTopY = topY
          obj.userData.bboxBottomY = bounds.min.y
          obj.userData.bboxHeight = bounds.max.y - bounds.min.y
        }
        const buildingHeight = building?.bboxHeight
          ?? obj.userData?.bboxHeight
          ?? Math.max(0.1, topY - (obj.userData?.bboxBottomY ?? 0))
        const offset = Math.max(0.6, buildingHeight * 0.2)
        tempVec.set(obj.position.x, topY + offset, obj.position.z)
        tempVec.project(camera)
        if (
          tempVec.z < -1 ||
          tempVec.z > 1 ||
          tempVec.x < -1 ||
          tempVec.x > 1 ||
          tempVec.y < -1 ||
          tempVec.y > 1
        ) {
          continue
        }
        labels.push({
          uid: status.uid,
          text: `+$${status.incomePerSec}/s`,
          x: (tempVec.x * 0.5 + 0.5) * width,
          y: (-tempVec.y * 0.5 + 0.5) * height,
        })
      }
      setRevenueLabels(labels)
      raf = requestAnimationFrame(updateLabels)
    }
    updateLabels()
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <>
      <div ref={viewportRef} style={{ position: "fixed", inset: 0 }} />

      {splashVisible && (
        <div className={`splash-screen ${splashPhase === "fade" ? "fade-out" : ""}`}>
          <img src={splashImage} alt="Resort Tycoon" />
        </div>
      )}

      <div className="ui">
        {showLogo && (
          <div className="hud-logo">
            <img src={logoImage} alt="Resort Tycoon" />
          </div>
        )}
        <HUD
          money={moneyDisplayState}
          income={incomeDisplayState}
          incomeTrend={incomeTrend}
          level={progression.level}
          onOpenLoan={handleOpenLoan}
        />

        <ModeBar mode={mode} onChange={setModeSafe} />

        {mode === "build" && (
          <>
            <BuildShop
              items={CATALOG}
              categories={CATEGORIES}
              selectedCategory={category}
              onSelectCategory={setCategory}
              selectedTool={tool}
              onSelectTool={(id) => {
                setTool(id)
                engineRef.current?.setTool(id)
              }}
              level={progression.level}
              hidden={!buildShopOpen}
              onClose={() => setModeSafe("camera")}
            />
          </>
        )}

        {revenueLabels.length > 0 && (
          <div className="revenue-labels">
            {revenueLabels.map(label => (
              <div
                key={label.uid}
                className="revenue-label"
                style={{ left: label.x, top: label.y }}
              >
                {label.text}
              </div>
            ))}
          </div>
        )}

        {toast?.message && (
          <div
            className={`panel toast show ${toast.tone === "error" ? "error" : ""}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {toast.message}
          </div>
        )}

        {tutorialVisible && !tutorialDismissed && (
          <TutorialPanel
            tutorial={tutorial}
            onClose={() => {
              setTutorialVisible(false)
              setTutorialDismissed(true)
            }}
          />
        )}

        {loanPanelOpen && !bankrupt && (
          <div className="panel loan-panel" onMouseDown={stopUiEvent}>
            <div className="loan-header">
              <strong>Loans</strong>
              <button
                className="loan-close"
                type="button"
                onMouseDown={stopUiEvent}
                onClick={(event) => {
                  stopUiEvent(event)
                  setLoanPanelOpen(false)
                }}
              >
                ✕
              </button>
            </div>
            {activeLoan ? (
              <div className="loan-active">
                <div>Active loan: ${activeLoan.principal}</div>
                <div>Remaining: ${Math.ceil(activeLoan.remainingOwed)}</div>
                <div>Payment: ${activeLoan.paymentPerSecond.toFixed(1)}/sec</div>
              </div>
            ) : (
              <div className="loan-options">
                {LOAN_OPTIONS.map(option => {
                  const totalOwed = Math.round(option.principal * (1 + option.rate))
                  const paymentPerSecond = totalOwed / LOAN_DURATION_SEC
                  return (
                  <button
                    key={option.principal}
                    className="loan-card"
                    type="button"
                    onMouseDown={stopUiEvent}
                    onClick={(event) => {
                      stopUiEvent(event)
                      takeLoan(option)
                    }}
                  >
                    <div>${option.principal.toLocaleString()}</div>
                    <small>@ {Math.round(option.rate * 100)}%</small>
                    <small>-${paymentPerSecond.toFixed(2)} / sec</small>
                  </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <LevelToast levelUp={levelUp} onDismiss={() => setLevelUp(null)} />

        {bankrupt && (
          <div
            className="bankruptcy-overlay"
            onMouseDown={stopUiEvent}
            onClick={stopUiEvent}
          >
            <div className="panel bankruptcy-panel">
              <h2>Oh! Your hotel went bankrupt.</h2>
              <p>Would you like to start a new game?</p>
              <button
                className="btn"
                type="button"
                onMouseDown={stopUiEvent}
                onClick={(event) => {
                  stopUiEvent(event)
                  setBankrupt(false)
                  startNewGame()
                }}
              >
                Yes
              </button>
            </div>
          </div>
        )}

        {confetti.length > 0 && (
          <div className="confetti">
            {confetti.map(piece => (
              <span
                key={piece.id}
                style={{ left: piece.left, top: piece.top, animationDelay: `${piece.delay}s` }}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
