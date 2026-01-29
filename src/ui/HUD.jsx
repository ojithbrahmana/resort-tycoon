import React from "react"

const stopUiEvent = (event) => {
  event.preventDefault()
  event.stopPropagation()
}

function HUD({ money, income, incomeTrend, level, xp, xpToNext, onReopenTutorial, onOpenLoan, perfEnabled, onTogglePerf }){
  const xpPct = Math.min(100, Math.round((xp / xpToNext) * 100))
  const formattedMoney = `$${money.value.toLocaleString()}`
  const formattedIncome = `Income $${income.value.toLocaleString()}/s`
  return (
    <div id="hud" className="hud" onMouseDown={stopUiEvent}>
      <div className={`hud-pill hud-pill-stack ${money.bump ? "bump" : ""}`}>
        <div className="hud-label">💰 Bank Balance</div>
        <div className="hud-value">{formattedMoney}</div>
      </div>
      <div className={`hud-pill hud-pill-stack ${incomeTrend === "up" ? "bump" : incomeTrend === "down" ? "shake" : ""}`}>
        <div className="hud-label">📈 Income</div>
        <div className="hud-value">{formattedIncome}</div>
        {income.deltaText && (
          <span className={`income-pill ${incomeTrend === "down" ? "negative" : ""}`}>
            {income.deltaText}
          </span>
        )}
      </div>
      <div className="hud-pill">LEVEL ⭐{level}</div>
      <div className="hud-pill hud-pill-muted">{xpPct}%</div>
      <button
        className="hud-pill hud-loan"
        type="button"
        onMouseDown={stopUiEvent}
        onClick={(event) => {
          stopUiEvent(event)
          onOpenLoan?.()
        }}
      >
        💰 <span>Loan</span>
      </button>
      <button
        className="hud-pill hud-help"
        type="button"
        onMouseDown={stopUiEvent}
        onClick={(event) => {
          stopUiEvent(event)
          onReopenTutorial?.()
        }}
      >
        ❔ <span>Re-open tutorial</span>
      </button>
      <button
        className={`hud-pill ${perfEnabled ? "hud-pill-active" : "hud-pill-muted"}`}
        type="button"
        onMouseDown={stopUiEvent}
        onClick={(event) => {
          stopUiEvent(event)
          onTogglePerf?.()
        }}
      >
        🛠 <span>Perf Debug</span>
      </button>
    </div>
  )
}

export default React.memo(HUD)
