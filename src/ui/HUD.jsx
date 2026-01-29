import React from "react"

const stopUiEvent = (event) => {
  event.preventDefault()
  event.stopPropagation()
}

function HUD({ money, income, incomeTrend, expenses, guests, happiness, level, onOpenLoan }){
  const formattedMoney = `$${money.value.toLocaleString()}`
  const formattedIncome = `+$${income.value.toLocaleString()}/s`
  const formattedExpenses = `-$${expenses.toLocaleString()}/s`
  const happinessBlocks = (() => {
    const totalBlocks = 10
    const filled = Math.max(0, Math.min(totalBlocks, Math.round((happiness / 100) * totalBlocks)))
    return Array.from({ length: totalBlocks }, (_, index) => index < filled)
  })()
  return (
    <div id="hud" className="hud" onMouseDown={stopUiEvent}>
      <div className={`hud-pill hud-pill-stack hud-pill-primary ${money.bump ? "bump" : ""}`}>
        <div className="hud-label">💰 Bank Balance</div>
        <div className="hud-value">{formattedMoney}</div>
      </div>
      <div className={`hud-pill hud-pill-stack hud-pill-primary ${incomeTrend === "up" ? "bump" : incomeTrend === "down" ? "shake" : ""}`}>
        <div className="hud-label">📈 Income</div>
        <div className="hud-value">{formattedIncome}</div>
        {income.deltaText && (
          <span className={`income-pill ${incomeTrend === "down" ? "negative" : ""}`}>
            {income.deltaText}
          </span>
        )}
      </div>
      <div className="hud-pill hud-pill-stack hud-pill-expense">
        <div className="hud-label">💸 Expenses</div>
        <div className="hud-value">{formattedExpenses}</div>
      </div>
      <div className="hud-pill hud-pill-stack">
        <div className="hud-label">👥 Guests</div>
        <div className="hud-value">{guests.toLocaleString()}</div>
      </div>
      <div className="hud-pill hud-pill-stack">
        <div className="hud-label">😊 Happiness</div>
        <div className="hud-value hud-happiness-bar" aria-label={`Happiness ${happiness} out of 100`}>
          {happinessBlocks.map((filled, index) => (
            <span
              key={`happy-${index}`}
              className={`hud-happiness-block ${filled ? "filled" : ""}`}
            />
          ))}
        </div>
      </div>
      <div className="hud-pill">LEVEL ⭐{level}</div>
      <button
        className="hud-pill hud-loan"
        type="button"
        onMouseDown={stopUiEvent}
        onClick={(event) => {
          stopUiEvent(event)
          onOpenLoan?.()
        }}
      >
        💰 <span>Get Loan</span>
      </button>
    </div>
  )
}

export default React.memo(HUD)
