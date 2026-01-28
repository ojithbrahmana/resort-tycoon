import React from "react"

export default function HUD({ money, income, incomeTrend, level, xp, xpToNext, onReopenTutorial }){
  const xpPct = Math.min(100, Math.round((xp / xpToNext) * 100))
  return (
    <div className="hud">
      <div className={`hud-pill ${money.bump ? "bump" : ""}`}>
        🪙 ${money.value}
      </div>
      <div className={`hud-pill ${incomeTrend === "up" ? "bump" : incomeTrend === "down" ? "shake" : ""}`}>
        ${income.value}
        {income.deltaText && (
          <span className={`income-pill ${incomeTrend === "down" ? "negative" : ""}`}>
            {income.deltaText}
          </span>
        )}
      </div>
      <div className="hud-pill">⭐ {level}</div>
      <div className="hud-pill hud-pill-muted">{xpPct}%</div>
      <button className="hud-pill hud-help" type="button" onClick={onReopenTutorial}>
        ❔ <span>Re-open tutorial</span>
      </button>
    </div>
  )
}
