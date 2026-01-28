import React, { useEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { createEngine } from "../engine/engine.js"
import { gridToWorld, key } from "../engine/grid.js"
import { computeTutorialProgress, steps as tutorialSteps } from "../engine/tutorial.js"
import { computeEconomy } from "../game/economy"
import { createProgressionState, applyXp, XP_REWARDS } from "../game/progression"
import { CATALOG, CATEGORIES } from "../assets/catalog"
import { GRID_HALF, INCOME_TICK_MS, INCOME_XP_INTERVAL_MS, ISLAND_RADIUS } from "../game/constants"
import { playSound } from "../game/sound"
import { findPath, findRoadAnchor } from "../game/guests"
import splashImage from "../assets/ui/splash.png"
import HUD from "../ui/HUD.jsx"
import ModeBar from "../ui/ModeBar.jsx"
import BuildShop from "../ui/BuildShop.jsx"
import TutorialPanel from "../ui/TutorialPanel.jsx"
import LevelToast from "../ui/LevelToast.jsx"

const catalogById = Object.fromEntries(CATALOG.map(item => [item.id, item]))

const VILLA_IDS = new Set(["villa", "villa_plus"])

function createUid(prefix){
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
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
  const economyRef = useRef({ total: 0, statuses: [] })
  const moneyRef = useRef(1000)
  const levelRef = useRef(1)
  const hoverRef = useRef(null)
  const dragRef = useRef({ active: false, start: null, axis: null, placed: new Set() })

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
  const [nextJiggle, setNextJiggle] = useState(false)
  const [progression, setProgression] = useState(createProgressionState())
  const [tutorialVisible, setTutorialVisible] = useState(true)
  const [buildShopOpen, setBuildShopOpen] = useState(true)
  const [revenueLabels, setRevenueLabels] = useState([])
  const earningOnceRef = useRef(new Set())
  const lastIncomeRef = useRef(0)
  const splashRef = useRef("show")

  toolRef.current = tool
  modeRef.current = mode
  buildingsRef.current = buildings
  moneyRef.current = money
  levelRef.current = progression.level
  splashRef.current = splashPhase

  useEffect(() => {
    const s = new Set()
    for (const b of buildings) {
      const item = catalogById[b.id]
      const cells = getFootprintCells({ gx: b.gx, gz: b.gz }, item?.footprint)
      for (const cell of cells) {
        s.add(key(cell.gx, cell.gz))
      }
    }
    occupiedRef.current = s
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
      if (!isCanvasEvent(e)) return
      if (modeRef.current !== "build") return
      const item = catalogById[toolRef.current]
      current.handleMouseMove(e, { footprint: item?.footprint, occupiedKeys: occupiedRef.current })
    }
    const onMouseDown = (e) => {
      const current = engineRef.current
      if (!current) return
      if (splashRef.current !== "done") return
      if (!isCanvasEvent(e)) return
      if (modeRef.current !== "build") return
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
    }
    const onMouseUp = () => {
      stopDrag()
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mousedown", onMouseDown)
    window.addEventListener("mouseup", onMouseUp)

    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mousedown", onMouseDown)
      window.removeEventListener("mouseup", onMouseUp)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportRef])

  useEffect(() => {
    engineRef.current?.setInputLocked(splashPhase !== "done")
  }, [splashPhase])

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
        eng.spawnPopup({ text: `+$${v.incomePerSec}`, gx: v.gx, gz: v.gz })
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

  function setModeSafe(next){
    setMode(next)
    engineRef.current?.setMode(next)
    if (next !== "build") {
      setBuildShopOpen(false)
    }
  }

  function isCanvasEvent(event){
    if (!viewportRef.current) return false
    if (!event?.target) return false
    if (!viewportRef.current.contains(event.target)) return false
    if (event.target.closest?.(".guide")) return true
    if (event.target.closest?.(".ui")) return false
    return true
  }

  function withinIsland(gx, gz){
    const { x, z } = gridToWorld(gx, gz)
    return Math.sqrt(x * x + z * z) <= (ISLAND_RADIUS - 3)
  }

  function isWithinGrid(gx, gz){
    return Math.abs(gx) <= GRID_HALF && Math.abs(gz) <= GRID_HALF
  }

  function validatePlacement({ item, gx, gz }){
    const cells = getFootprintCells({ gx, gz }, item?.footprint)
    for (const cell of cells) {
      if (!isWithinGrid(cell.gx, cell.gz) || !withinIsland(cell.gx, cell.gz)) {
        return "Can't build there."
      }
      if (occupiedRef.current.has(key(cell.gx, cell.gz))) {
        return "Tile already occupied."
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
      if (obj) {
        const bounds = new THREE.Box3().setFromObject(obj)
        bboxTopY = bounds.max.y
        bboxHeight = bounds.max.y - bounds.min.y
        obj.userData = { ...obj.userData, bboxTopY, bboxHeight }
      }
      setBuildings(prev => prev.map(b => b.uid === uid ? { ...b, object: obj, bboxTopY, bboxHeight } : b))
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
      if (!isWithinGrid(cell.gx, cell.gz) || !withinIsland(cell.gx, cell.gz)) {
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

  const moneyDisplayState = { value: moneyDisplay.toLocaleString(), bump: moneyBump }
  const incomeDisplayState = { value: economy.total, deltaText: incomeDeltaText }

  const splashVisible = splashPhase !== "done"

  useEffect(() => {
    let raf
    const tempVec = new THREE.Vector3()
    const updateLabels = () => {
      const eng = engineRef.current
      if (!eng) {
        raf = requestAnimationFrame(updateLabels)
        return
      }
      const { camera, renderer } = eng
      const width = renderer.domElement.clientWidth
      const height = renderer.domElement.clientHeight
      const statuses = economyRef.current.statuses.filter(status => status.incomePerSec > 0)
      const labels = []
      for (const status of statuses) {
        const building = buildingsRef.current.find(b => b.uid === status.uid)
        const obj = building?.object
        if (!obj) continue
        let topY = building?.bboxTopY
        if (topY == null) {
          const bounds = new THREE.Box3().setFromObject(obj)
          topY = bounds.max.y
          obj.userData.bboxTopY = topY
        }
        tempVec.set(obj.position.x, topY + 0.6, obj.position.z)
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
        <HUD
          money={moneyDisplayState}
          income={incomeDisplayState}
          incomeTrend={incomeTrend}
          level={progression.level}
          xp={progression.xp}
          xpToNext={progression.xpToNext}
          onReopenTutorial={() => setTutorialVisible(true)}
        />

        <ModeBar mode={mode} onChange={setModeSafe} />

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
          hidden={mode !== "build" || !buildShopOpen}
          onClose={() => setBuildShopOpen(false)}
        />

        {mode === "build" && !buildShopOpen && (
          <button
            className="panel shop-toggle"
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={() => setBuildShopOpen(true)}
          >
            Open Build Shop
          </button>
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

        {tutorialVisible && (
          <TutorialPanel
            tutorial={tutorial}
            nextJiggle={nextJiggle}
            onNext={() => {
              setNextJiggle(true)
              window.clearTimeout(setNextJiggle._t)
              setNextJiggle._t = window.setTimeout(() => setNextJiggle(false), 400)
            }}
            onClose={() => setTutorialVisible(false)}
          />
        )}

        <LevelToast levelUp={levelUp} onDismiss={() => setLevelUp(null)} />

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
