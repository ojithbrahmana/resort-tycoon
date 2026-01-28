# Resort Tycoon (prototype)

A tiny grid-based island resort builder made with Vite + React + Three.js.

## Run
```bash
npm install
npm run dev
```

## Controls
- Right-click drag: rotate camera
- Mouse wheel: zoom
- Middle mouse drag: pan (press wheel)

## Gameplay (current)
- Place **Villa**, **Road**, **Generator** from the Build drawer.
- Villas earn **$3/sec** only when:
  - at least one **Road** is adjacent (N/E/S/W), and
  - a **Generator** is within **6 tiles**.

## Next steps
- Move/Demolish logic
- Proper 3D GLB models (swap sprites for models)
- Terrain tiles + guests walking
