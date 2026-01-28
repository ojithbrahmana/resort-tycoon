import React, { useEffect, useMemo, useRef, useState } from "react"
import { createEngine } from "../engine/engine.js"
import { CATALOG, CATEGORIES } from "../data/catalog.js"
import { key } from "../engine/grid.js"
import { computeIncomePerSecond } from "../engine/economy.js"
import { computeTutorialProgress } from "../engine/tutorial.js"

const catalogById = Object.fromEntries(CATALOG.map(i => [i.id, i]))

function clamp(n,a,b){ return Math.max(a, Math.min(b,n)) }

export default function App(){
  const viewportRef = useRef(null)
  const engineRef = useRef(null)

  const [mode, setMode] = useState("build") // build | move | demolish
  const [category, setCategory] = useState("All")
  const [tool, setTool] = useState("villa")

  const [money, setMoney] = useState(1000)
  const [buildings, setBuildings] = useState([]) // {id,gx,gz,cost,sprite, meshRef}
  const [toast, setToast] = useState("")
  const [hover, setHover] = useState(null)

  const occupiedKeys = useMemo(()=>{
    const s = new Set()
    for(const b of buildings) s.add(key(b.gx,b.gz))
    return s
  }, [buildings])

  const income = useMemo(()=> computeIncomePerSecond({ buildings, catalogById }), [buildings])

  const tutorial = useMemo(()=> computeTutorialProgress({ buildings }), [buildings])

  // engine boot
  useEffect(()=>{
    if(!viewportRef.current) return
    const eng = createEngine({ container: viewportRef.current })
    engineRef.current = eng

    // wire handlers
    eng.setHandlers({
      onPlaceCb: ({ gx, gz }) => {
        const item = catalogById[tool]
        if(!item) return
        if(occupiedKeys.has(key(gx,gz))) return
        if(money < item.cost){ pop("Not enough cash. Capitalism strikes again."); return }

        // place sprite
        const spr = eng.addPlacedSprite({ spriteUrl: item.sprite, gx, gz })
        const b = { id: item.id, name:item.name, gx, gz, cost: item.cost, sprite:item.sprite, _sprite: spr }
        setBuildings(prev => [...prev, b])
        setMoney(prev => prev - item.cost)
        pop(`${item.name} placed.`)
      },
      onHoverCb: (h) => setHover(h)
    })

    // mouse listeners that need fresh state: attach on window and read refs via closures
    const onMove = (e)=>{
      const current = engineRef.current
      if(!current) return
      if(mode !== "build") return
      const item = catalogById[tool]
      current.handleMouseMove(e, { spriteUrl: item?.sprite ?? "/sprites/villa.png", occupiedKeys })
    }
    const onClick = (e)=>{
      const current = engineRef.current
      if(!current) return
      if(mode !== "build") return
      current.handleClick(e)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mousedown", onClick)

    return ()=>{
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mousedown", onClick)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportRef])

  // income tick
  useEffect(()=>{
    const t = setInterval(()=>{
      if(income.total > 0){
        setMoney(m => m + income.total)
      }
    }, 1000)
    return ()=> clearInterval(t)
  }, [income.total])

  // toast helper
  function pop(msg){
    setToast(msg)
    window.clearTimeout(pop._t)
    pop._t = window.setTimeout(()=>setToast(""), 1400)
  }

  // UI handlers
  function setModeSafe(m){
    setMode(m)
    const eng = engineRef.current
    eng?.setMode(m)
  }

  const visibleItems = CATALOG.filter(i => category==="All" ? true : i.category===category)

  return (
    <>
      <div ref={viewportRef} style={{ position:"fixed", inset:0 }} />

      <div className="ui">
        <div className="panel hud">
          <div style={{display:"flex", flexDirection:"column"}}>
            <div className="title">Resort Tycoon</div>
            <div style={{fontSize:12, fontWeight:900, opacity:.6}}>Island prototype</div>
          </div>
          <div style={{width:2, height:44, background:"rgba(0,0,0,.08)", borderRadius:99}} />
          <div className="stat">
            <div className="label">Money</div>
            <div className="value">${money.toLocaleString()}</div>
          </div>
          <div className="stat">
            <div className="label">Income/sec</div>
            <div className="value">${income.total}</div>
          </div>
        </div>

        <div className="panel modebar">
          <button className={"modebtn "+(mode==="build"?"active":"")} onClick={()=>setModeSafe("build")} title="Build (B)">
            🧱 <div style={{fontSize:12, fontWeight:900}}>Build</div>
          </button>
          <button className={"modebtn "+(mode==="move"?"active":"")} onClick={()=>setModeSafe("move")} title="Move (M)">
            ✋ <div style={{fontSize:12, fontWeight:900}}>Move</div>
          </button>
          <button className={"modebtn "+(mode==="demolish"?"active":"")} onClick={()=>setModeSafe("demolish")} title="Demolish (X)">
            🗑️ <div style={{fontSize:12, fontWeight:900}}>Trash</div>
          </button>
        </div>

        <div className={"panel drawer "+(mode==="build" ? "" : "hidden")}>
          <header>
            <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline"}}>
              <div style={{fontSize:22, fontWeight:1000}}>Build</div>
              <div style={{fontSize:12, fontWeight:900, opacity:.6}}>Click island to place</div>
            </div>
          </header>

          <div className="chips">
            {CATEGORIES.map(c=>(
              <button key={c} className={"chip "+(category===c?"active":"")} onClick={()=>setCategory(c)}>{c}</button>
            ))}
          </div>

          <div className="grid">
            {visibleItems.map(item=>(
              <button key={item.id} className={"card "+(tool===item.id?"active":"")} onClick={()=>setTool(item.id)}>
                <div className="thumb">
                  <img src={item.sprite} alt="" style={{width:56, height:56, imageRendering:"auto"}} />
                </div>
                <div style={{fontWeight:1000}}>{item.name}</div>
                <div style={{fontWeight:1000, color:"#10b981"}}>${item.cost}</div>
              </button>
            ))}
          </div>
        </div>

        <div className={"panel toast "+(toast ? "show" : "")}>{toast || " "}</div>

        <div className="panel guide">
          <div className="avatar">🐧</div>
          <div className="bubble">
            <div style={{fontWeight:1000}}>{tutorial.message}</div>
            <div className="checklist">
              {["Build a Villa","Add 3 Roads next to it","Place a Generator nearby"].map((t,i)=>(
                <div key={t} className={"check "+(tutorial.completed[i] ? "done":"")}>
                  <span className="box">{tutorial.completed[i] ? "✓" : ""}</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
            <div style={{marginTop:8, fontSize:12, fontWeight:900, opacity:.6}}>
              Tip: Villas only earn if they have a road next to them and power nearby.
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
