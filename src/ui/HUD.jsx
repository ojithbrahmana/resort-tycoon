import React from "react"

export default function HUD({ money, income, incomeTrend, level, xp, xpToNext, gems, onHelp }){
  const xpPct = Math.min(100, Math.round((xp / xpToNext) * 100))
  return (
    <div className="panel hud">
      <div className="hud-pills">
        <div className="hud-pill hud-logo">🏝️ Resort Tycoon</div>
        <div className={`hud-pill ${money.bump ? "bump" : ""}`}>🪙 ${money.value}</div>
        <div className={`hud-pill ${incomeTrend === "up" ? "bump" : incomeTrend === "down" ? "shake" : ""}`}>
          ${income.value}
          {income.deltaText && (
            <span className={`income-pill ${incomeTrend === "down" ? "negative" : ""}`}>
              {income.deltaText}
            </span>
          )}
        </div>
        <div className="hud-pill">💎 {gems}</div>
        <div className="hud-pill">⭐ {level}</div>
        <div className="hud-pill hud-xp">{xpPct}%</div>
        <button className="hud-pill hud-help" onClick={onHelp} title="Re-open tutorial">❓</button>
      </div>
    </div>
  )
}
