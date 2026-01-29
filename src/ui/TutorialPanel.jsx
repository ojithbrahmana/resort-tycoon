import React from "react"

const stopUiEvent = (event) => {
  event.preventDefault()
  event.stopPropagation()
}

export default function TutorialPanel({ tutorial, onClose }){
  return (
    <div id="tutorialPanel" className="panel guide">
      <div className="avatar">🐧</div>
      <div className="bubble">
        <div style={{ fontWeight: 900, fontFamily: "var(--font-display)" }}>{tutorial.message}</div>
        <div className="checklist">
          {tutorial.steps.map((step, i) => (
            <div key={step} className={`check ${tutorial.completed[i] ? "done" : ""}`}>
              <span className="box">{tutorial.completed[i] ? "✓" : ""}</span>
              <span>{step}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 800, opacity: 0.7 }}>
          Tip: Villas only earn with power.
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            className="btn"
            type="button"
            onMouseDown={stopUiEvent}
            onClick={(event) => {
              stopUiEvent(event)
              onClose()
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
