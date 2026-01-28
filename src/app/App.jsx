import React, { useEffect, useMemo, useRef, useState } from "react"
import { createEngine } from "../engine/engine.js"
import { key } from "../engine/grid.js"
import { computeTutorialProgress, steps as tutorialSteps } from "../engine/tutorial.js"
import { computeEconomy } from "../game/economy"
import { createProgressionState, applyXp, XP_REWARDS } from "../game/progression"
import { CATALOG, CATEGORIES } from "../assets/catalog"
import { INCOME_TICK_MS, INCOME_XP_INTERVAL_MS } from "../game/constants"
import { playSound } from "../game/sound"
import { findPath, findRoadAnchor } from "../game/guests"
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

  const [mode, setMode] = useState("build")
  const [category, setCategory] = useState("All")
  const [tool, setTool] = useState("villa")
  const [money, setMoney] = useState(1000)
  const [moneyDisplay, setMoneyDisplay] = useState(1000)
  const [moneyBump, setMoneyBump] = useState(false)
  const [gems] = useState(12)
  const [incomeTrend, setIncomeTrend] = useState("stable")
  const [incomeDeltaText, setIncomeDeltaText] = useState("")
  const [buildings, setBuildings] = useState([])
  const [toast, setToast] = useState("")
  const [levelUp, setLevelUp] = useState(null)
  const [confetti, setConfetti] = useState([])
  const [nextJiggle, setNextJiggle] = useState(false)
  const [progression, setProgression] = useState(createProgressionState())
  const earningOnceRef = useRef(new Set())
  const lastIncomeRef = useRef(0)

  toolRef.current = tool
  modeRef.current = mode
  buildingsRef.current = buildings
  moneyRef.current = money
  levelRef.current = progression.level

  useEffect(() => {
    const s = new Set()
    for (const b of buildings) s.add(key(b.gx, b.gz))
    occupiedRef.current = s
  }, [buildings])

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
        if (occupiedRef.current.has(key(gx, gz))) return
        if (levelRef.current < item.unlockLevel) {
          pop(`Unlocks at Level ${item.unlockLevel}.`)
          playSound("error")
          return
        }
        if (moneyRef.current < item.cost) {
          pop("Not enough coins!")
          playSound("error")
          return
        }

        const uid = createUid(item.id)
        const entry = { uid, id: item.id, gx, gz, cost: item.cost, object: null }
        setBuildings(prev => [...prev, entry])
        setMoney(prev => prev - item.cost)
        addXp(Math.round(XP_REWARDS.BUILDING_BASE * item.buildingTier))
        playSound("place")

        void eng.addBuilding({ building: item, gx, gz, uid }).then(obj => {
          setBuildings(prev => prev.map(b => b.uid === uid ? { ...b, object: obj } : b))
        })

        pop(`${item.name} placed.`)
      },
      onHoverCb: () => {},
    })

    const onMove = (e) => {
      const current = engineRef.current
      if (!current) return
      if (modeRef.current !== "build") return
      const item = catalogById[toolRef.current]
      current.handleMouseMove(e, { spriteUrl: item?.spritePath ?? "/sprites/villa.png", occupiedKeys: occupiedRef.current })
    }
    const onClick = (e) => {
      const current = engineRef.current
      if (!current) return
      if (modeRef.current !== "build") return
      current.handleClick(e)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mousedown", onClick)

    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mousedown", onClick)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportRef])

  useEffect(() => {
    const eng = engineRef.current
    if (!eng) return
    economy.statuses.forEach(status => {
      if (!VILLA_IDS.has(status.id)) return
      eng.updateVillaStatus(status)
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
    setToast(msg)
    window.clearTimeout(pop._t)
    pop._t = window.setTimeout(() => setToast(""), 1600)
  }

  function setModeSafe(next){
    setMode(next)
    engineRef.current?.setMode(next)
  }

  const moneyDisplayState = { value: moneyDisplay.toLocaleString(), bump: moneyBump }
  const incomeDisplayState = { value: economy.total, deltaText: incomeDeltaText }

  return (
    <>
      <div ref={viewportRef} style={{ position: "fixed", inset: 0 }} />

      <div className="ui">
        <HUD
          money={moneyDisplayState}
          income={incomeDisplayState}
          incomeTrend={incomeTrend}
          level={progression.level}
          xp={progression.xp}
          xpToNext={progression.xpToNext}
          gems={gems}
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
          hidden={mode !== "build"}
        />

        {toast && <div className="panel toast show">{toast}</div>}

        <TutorialPanel
          tutorial={tutorial}
          nextJiggle={nextJiggle}
          onNext={() => {
            setNextJiggle(true)
            window.clearTimeout(setNextJiggle._t)
            setNextJiggle._t = window.setTimeout(() => setNextJiggle(false), 400)
          }}
        />

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
