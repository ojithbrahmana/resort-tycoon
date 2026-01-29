import React, { useState } from "react"
import { getItemStats } from "../game/itemStats"

const stopUiEvent = (event) => {
  event.preventDefault()
  event.stopPropagation()
}

export default function BuildShop({
  items,
  categories,
  selectedCategory,
  onSelectCategory,
  selectedTool,
  onSelectTool,
  level,
  getItemCost,
  hidden,
  onClose,
}){
  const visibleItems = items.filter(item => selectedCategory === "All" ? true : item.category === selectedCategory)
  const [jiggleId, setJiggleId] = useState(null)
  const [activeInfoId, setActiveInfoId] = useState(null)

  const formatIncome = (value) => `+$${value.toFixed(1)} / sec`
  const formatExpense = (value) => `-$${value.toFixed(1)} / sec`
  const formatSigned = (value) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`

  return (
    <div
      id="buildShop"
      className={`panel drawer ${hidden ? "hidden" : ""}`}
      onMouseDown={stopUiEvent}
    >
      <header>
        {onClose && (
          <button
            className="drawer-close"
            type="button"
            onMouseDown={stopUiEvent}
            onClick={(event) => {
              stopUiEvent(event)
              onClose()
            }}
            aria-label="Close build shop"
          >
            ✕
          </button>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 24, fontWeight: 700, fontFamily: "var(--font-display)" }}>Build Shop</div>
        </div>
      </header>

      <div className="chips">
        {categories.map(c => (
          <button
            key={c}
            className={`chip ${selectedCategory === c ? "active" : ""}`}
            onMouseDown={stopUiEvent}
            onClick={(event) => {
              stopUiEvent(event)
              onSelectCategory(c)
            }}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid">
        {visibleItems.map(item => {
          const locked = level < item.unlockLevel
          const stats = getItemStats(item)
          const itemCost = getItemCost ? getItemCost(item) : item.cost
          const powerRadius = stats.powerRadius ? `${stats.powerRadius} tiles` : "None"
          return (
            <button
              key={item.id}
              className={`card ${selectedTool === item.id ? "active" : ""} ${locked ? "locked" : ""} ${jiggleId === item.id ? "jiggle" : ""}`}
              onMouseDown={stopUiEvent}
              onClick={(event) => {
                stopUiEvent(event)
                if (locked) return
                onSelectTool(item.id)
                setJiggleId(item.id)
                window.clearTimeout(setJiggleId._t)
                setJiggleId._t = window.setTimeout(() => setJiggleId(null), 400)
              }}
            >
              <div className="thumb">
                <img src={item.iconPath} alt="" className="thumb-image" />
              </div>
              <button
                type="button"
                className="info-icon"
                onMouseDown={stopUiEvent}
                onClick={(event) => {
                  stopUiEvent(event)
                  setActiveInfoId(prev => (prev === item.id ? null : item.id))
                }}
                aria-label={`Info for ${item.name}`}
              >
                i
              </button>
              <div className={`info-tooltip ${activeInfoId === item.id ? "show" : ""}`}>
                <div className="info-row">
                  <span>Income</span>
                  <strong>{formatIncome(stats.incomePerSec)}</strong>
                </div>
                <div className="info-row">
                  <span>Expenses</span>
                  <strong>{formatExpense(stats.expensesPerSec)}</strong>
                </div>
                <div className="info-row">
                  <span>Happiness</span>
                  <strong>{formatSigned(stats.happinessImpact)}</strong>
                </div>
                <div className="info-row">
                  <span>Guests</span>
                  <strong>{stats.guests}</strong>
                </div>
                <div className="info-row">
                  <span>Power Radius</span>
                  <strong>{powerRadius}</strong>
                </div>
              </div>
              <div style={{ fontWeight: 900 }}>{item.name}</div>
              <div style={{ fontWeight: 900, color: "#16a34a" }}>${itemCost}</div>
              {locked && (
                <div className="lock-banner">
                  {`Unlocks at Level ${item.unlockLevel}`}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
