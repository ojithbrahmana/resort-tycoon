import React from "react"

const stopUiEvent = (event) => {
  event.preventDefault()
  event.stopPropagation()
}

export default function ModeBar({ mode, onChange }){
  return (
    <div className="panel modebar" onMouseDown={stopUiEvent}>
      <button
        className={`modebtn ${mode === "build" ? "active" : ""}`}
        onMouseDown={stopUiEvent}
        onClick={(event) => {
          stopUiEvent(event)
          onChange("build")
        }}
      >
        <span>B</span>
        <small>Build</small>
      </button>
      <button
        className={`modebtn ${mode === "camera" ? "active" : ""}`}
        onMouseDown={stopUiEvent}
        onClick={(event) => {
          stopUiEvent(event)
          onChange("camera")
        }}
      >
        <span>C</span>
        <small>Camera</small>
      </button>
      <button
        className={`modebtn ${mode === "move" ? "active" : ""}`}
        onMouseDown={stopUiEvent}
        onClick={(event) => {
          stopUiEvent(event)
          onChange("move")
        }}
      >
        <span>M</span>
        <small>Move</small>
      </button>
      <button
        className={`modebtn ${mode === "demolish" ? "active" : ""}`}
        onMouseDown={stopUiEvent}
        onClick={(event) => {
          stopUiEvent(event)
          onChange("demolish")
        }}
      >
        <span>D</span>
        <small>Demolish</small>
      </button>
    </div>
  )
}
