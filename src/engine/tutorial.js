export const steps = [
  { id:"reception", text:"Your Reception is open. Guests will start arriving.", done: (s)=> s.buildings.some(b=>b.id==="reception") },
  { id:"villa", text:"Build a Villa (the money-maker).", done: (s)=> s.buildings.some(b=>b.id==="villa") },
  { id:"gen", text:"Build a Generator within 6 tiles of the Villa.", done: (s)=> {
      const v = s.buildings.find(b=>b.id==="villa"); if(!v) return false;
      return s.buildings.filter(b=>b.id==="generator").some(g => {
        const dx=v.gx-g.gx, dz=v.gz-g.gz;
        return Math.sqrt(dx*dx+dz*dz) <= 6;
      });
    }
  }
]

export function computeTutorialProgress(state){
  const completed = steps.map(st => st.done(state))
  const firstIncomplete = completed.findIndex(x=>!x)
  const idx = firstIncomplete === -1 ? steps.length-1 : firstIncomplete
  const allDone = completed.every(Boolean)
  const message = allDone
    ? "Nice. Now expand. Guests are picky and your electricity is probably illegal."
    : steps[idx].text
  return { completed, idx, allDone, message }
}
