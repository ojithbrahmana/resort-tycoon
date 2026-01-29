import React, { useState } from "react"

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
  hidden,
  onClose,
}){
  const visibleItems = items.filter(item => selectedCategory === "All" ? true : item.category === selectedCategory)
  const [jiggleId, setJiggleId] = useState(null)
  const [activeInfoId, setActiveInfoId] = useState(null)

  const formatIncome = (value) => `+$${value.toFixed(1)} / sec`

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
                {formatIncome(item.incomePerSec)}
              </div>
              <div style={{ fontWeight: 900 }}>{item.name}</div>
              <div style={{ fontWeight: 900, color: "#16a34a" }}>${item.cost}</div>
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
