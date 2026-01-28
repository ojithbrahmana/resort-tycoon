import React from "react"

export default function HUD({ money, income, incomeTrend, level, xp, xpToNext, gems }){
  const xpPct = Math.min(100, Math.round((xp / xpToNext) * 100))
  return (
    <div className="panel hud">
      <div className="hud-badge">
        <span>🏝️</span>
        <div>
          <div style={{ fontSize: 18 }}>Resort Tycoon</div>
          <div style={{ fontSize: 12, opacity: 0.85 }}>Casual island getaway</div>
        </div>
      </div>
      <div className="hud-stats">
        <div className="hud-stat">
          <label>Money</label>
          <strong className={money.bump ? "bump" : ""}>🪙 ${money.value}</strong>
        </div>
        <div className="hud-stat">
          <label>Income / sec</label>
          <strong className={incomeTrend === "up" ? "bump" : incomeTrend === "down" ? "shake" : ""}>
            ${income.value}
            {income.deltaText && (
              <span className={`income-pill ${incomeTrend === "down" ? "negative" : ""}`}>
                {income.deltaText}
              </span>
            )}
          </strong>
        </div>
        <div className="hud-stat">
          <label>Gems</label>
          <strong>💎 {gems}</strong>
        </div>
        <div className="hud-stat">
          <label>Level</label>
          <strong>⭐ {level}</strong>
        </div>
        <div className="hud-stat">
          <label>XP to next</label>
          <strong>{xpPct}%</strong>
        </div>
      </div>
      <div className="level-pill">XP {xp} / {xpToNext}</div>
    </div>
  )
}
