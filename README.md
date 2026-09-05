# GETAWAY

A small original top-down crime/arcade driving game — vertical slice.
TypeScript + Vite + Phaser 3 (Matter physics). No backend, no external art:
every sprite and every road marking is drawn procedurally at boot.

## Run

```bash
npm install
npm run dev
```

Production build (static, deployable to Netlify as-is — see `netlify.toml`):

```bash
npm run build
```

## Controls

| Key | Action |
| --- | --- |
| `W A S D` / arrows | walk, or drive (throttle / steer / brake + reverse) |
| `E` | enter a car when the prompt shows; exit again at low speed |
| `Space` | handbrake — hold it into a corner to slide |

## What is in the slice

- One hand-laid city block grid: roads, markings, crossings, kerbs, parks,
  car parks, buildings with fake height, street trees and lamps.
- Walk on foot, approach a parked car, `[E] ENTER`, drive it away.
- Arcade driving model on top of Matter: acceleration, braking, reverse,
  speed-dependent steering, grip that lets go under a hard turn or the
  handbrake, and slide momentum that partly returns as drive so a drift
  exits carrying speed.
- Collision impact: sparks, smoke, screen shake scaled to the hit.
- Skid marks stamped into a world-sized render texture, tyre dust while sliding.
- Camera: smooth follow, look-ahead in the direction of travel, zoom-out with speed.
- HEAT meter: crashes raise it, thresholds dispatch patrol cars, patrols in
  contact hold it, breaking contact drains it fast and the units go home.

## Layout

```
src/
  main.ts               game boot + viewport handling
  config.ts             every tuning value
  scenes/               BootScene (textures), GameScene (orchestration), UIScene (HUD)
  world/World.ts        seeded city generation, static bodies, parking spots
  entities/             Vehicle (arcade physics body), Player (on foot)
  systems/              VehicleController (input + chase AI), HeatSystem,
                        PoliceSystem, CameraRig, Effects
  gfx/Textures.ts       every sprite, drawn with Phaser Graphics at boot
```

All content is original. Genre mechanics only — no assets, names, maps, UI or
code from any existing game.
