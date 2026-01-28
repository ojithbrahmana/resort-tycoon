import React from "react"

export default function TutorialPanel({ tutorial, onNext, nextJiggle, onClose }){
  return (
    <div className="panel guide">
      <div className="avatar">🐧</div>
      <div className="bubble">
        <button className="guide-close" type="button" onClick={onClose} aria-label="Close tutorial">
          ✕
        </button>
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
          <button className={`btn ${nextJiggle ? "jiggle" : ""}`} onClick={onNext}>Next</button>
        </div>
      </div>
    </div>
  )
}
