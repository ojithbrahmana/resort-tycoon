import React from "react"

export default function LevelToast({ levelUp, onDismiss }){
  if (!levelUp) return null
  return (
    <div className="panel level-toast">
      <h3>🎉 Level Up! (Lv {levelUp.level})</h3>
      <div style={{ fontWeight: 800 }}>New items unlocked:</div>
      <div className="unlock-list">
        {levelUp.unlocked.map(item => (
          <div key={item.id} style={{ fontWeight: 700 }}>{item.name}</div>
        ))}
      </div>
      <button className="btn" onClick={onDismiss}>Awesome!</button>
    </div>
  )
}
