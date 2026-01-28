import React from "react"

export default function ModeBar({ mode, onChange }){
  return (
    <div className="panel modebar" onMouseDown={(event) => event.stopPropagation()}>
      <button className={`modebtn ${mode === "build" ? "active" : ""}`} onClick={() => onChange("build")}>
        <span>🧱</span>
        <small>Build</small>
      </button>
      <button className={`modebtn ${mode === "camera" ? "active" : ""}`} onClick={() => onChange("camera")}>
        <span>🎥</span>
        <small>Camera</small>
      </button>
      <button className={`modebtn ${mode === "move" ? "active" : ""}`} onClick={() => onChange("move")}>
        <span>✋</span>
        <small>Move</small>
      </button>
      <button className={`modebtn ${mode === "demolish" ? "active" : ""}`} onClick={() => onChange("demolish")}>
        <span>🗑️</span>
        <small>Demolish</small>
      </button>
    </div>
  )
}
