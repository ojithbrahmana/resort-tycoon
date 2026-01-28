import React, { useEffect, useState } from "react"

export default function LevelToast({ levelUp, onDismiss }){
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!levelUp) {
      setVisible(false)
      return () => {}
    }
    setVisible(true)
    const fadeTimer = window.setTimeout(() => setVisible(false), 2500)
    const dismissTimer = window.setTimeout(() => onDismiss?.(), 3000)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(dismissTimer)
    }
  }, [levelUp, onDismiss])

  if (!levelUp) return null

  return (
    <div className={`panel level-toast ${visible ? "show" : ""}`} onMouseDown={(event) => event.stopPropagation()}>
      <strong>Level Up! LEVEL ⭐{levelUp.level}</strong>
    </div>
  )
}
