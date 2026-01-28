import React from "react"

export default function ModeBar({ mode, onChange }){
  return (
    <div className="panel modebar">
      <button className={`modebtn ${mode === "build" ? "active" : ""}`} onClick={() => onChange("build")}>
        <span>🧱</span>
        <small>Build</small>
      </button>
      <button className={`modebtn ${mode === "move" ? "active" : ""}`} onClick={() => onChange("move")}>
        <span>✋</span>
        <small>Move</small>
      </button>
      <button className={`modebtn ${mode === "demolish" ? "active" : ""}`} onClick={() => onChange("demolish")}>
        <span>🗑️</span>
        <small>Trash</small>
      </button>
    </div>
  )
}
