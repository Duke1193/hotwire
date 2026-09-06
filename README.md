# GETAWAY

A small original top-down arcade city. Steal a car, lose the cops, send one
link and a friend appears in the same city.

TypeScript + Vite + Phaser 3 (Matter physics) + Supabase Realtime.
No backend of our own, no accounts, no build-time assets: every sprite, road
marking and sound is generated at runtime.

## Run

```bash
npm install
npm run dev
```

Production build (static, deploys to Netlify as-is — see `netlify.toml`):

```bash
npm run build
```

## Controls

| Key | Action |
| --- | --- |
| `W A S D` / arrows | walk, or drive (throttle / steer / brake + reverse) |
| `E` | enter a car when the prompt shows; exit again at low speed |
| `Space` | handbrake — hold it into a corner to slide |

On a touch device the same actions come from a floating thumb stick on the
left and pill buttons on the right — `ENTER` on foot, `GO` / `BRAKE` / `DRIFT`
/ `EXIT` while driving. Keyboard and touch write into one `InputState`
(`src/systems/Input.ts`), so nothing downstream knows which was used and touch
is never faked as synthetic key events.

## Phones

Landscape is the intended orientation; portrait shows a `ROTATE TO PLAY`
screen and gets out of the way as soon as the phone is turned. The canvas is
rendered at up to 2× device pixels and scaled back down by CSS, so a retina
screen stays sharp without paying for 3×. Safe-area insets are respected by
both the DOM chrome and the on-screen controls, page scrolling, text selection,
callouts and double-tap zoom are disabled over the play area, and the viewport
is measured from a `100dvh` fixed element — plus a half-second poll, because
Safari does not reliably fire an event when the address bar collapses.

Phones also get a lighter simulation: 44 pedestrians instead of 82, 14 traffic
cars instead of 22, a smaller active radius, fewer impact particles and skid
marks stamped less often. The camera pulls back so the field of view roughly
matches desktop rather than showing a magnified sliver of street. Subtle
haptics fire on heavy collisions, pursuit escalation and completed jobs where
the Vibration API exists (it does not on iOS, and is a no-op there).

## Multiplayer

Optional. Copy `.env.example` to `.env` and fill in:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Create a Supabase project and take these from *Project Settings → API*. No
tables, no auth and no row policies are needed: the game only uses Realtime
**Presence** (who is in the room) and **Broadcast** (where they are), and
stores nothing. Set the same two variables in Netlify's environment.

Without them the game runs single player and the room chip reads `OFFLINE`.
The Supabase client is imported lazily and is dropped from the bundle entirely
when the variables are absent.

**Rooms.** Every session has a code in the URL (`?room=7KQ2`). Opening the same
URL joins the same channel (`getaway:7KQ2`). `INVITE` copies that link.

**In development**, with no credentials, a `BroadcastChannel` loopback
transport stands in so the whole netcode can be exercised in two tabs on one
machine. Force it anywhere with `?loopback=1`. It cannot reach another device.

### What is and is not synchronised

Each client simulates its own city: its own traffic, its own pedestrians, its
own physics, its own police. Only **human players** are exchanged, at ~12
updates per second, and remote players are drawn from an interpolation buffer
~130 ms in the past so they move smoothly.

Two deliberate V1 compromises, both documented at the code:

- **Remote players do not collide** (`src/net/RemotePlayers.ts`). They are
  plain sprites with no Matter body. Networked vehicle collisions need shared
  authority over both cars; out of scope here.
- **Heat Run has no referee** (`src/net/HeatRun.ts`). Each client believes the
  first `win` message it receives, so a photo finish can be scored differently
  on two machines. Acceptable for a social prototype.

## What is in the city

- **Traffic** on a lane grid: keeps right, picks turns at intersections, brakes
  for whatever is in front, yields to sirens, sounds the horn when blocked, and
  some drivers are simply in a hurry.
- **Pedestrians** on a sidewalk waypoint graph: they wander, loiter, wait at the
  kerb for a gap before crossing, scatter from fast cars and sirens, and get
  knocked aside if you cut it too fine. They never leave the graph, so they
  cannot walk into a building and need no pathfinding.
- **Ambient incidents** every 30–60 s near the player: a patrol chasing an NPC,
  a stalled car snarling a junction, a reckless driver, a panicking crowd.
  Each one is time-boxed and cleans itself up.
- **HEAT**, police pursuit, jobs, score and the shared **Heat Run** challenge.

## Layout

```
src/
  main.ts               game boot + viewport handling
  session.ts            identity, room, audio, invite — resolved before play
  config.ts             every tuning value
  scenes/               BootScene (textures), GameScene (orchestration), UIScene (HUD)
  world/                seeded city generation, lane grid, sidewalk graph
  entities/             Vehicle (arcade physics body), Player (on foot)
  systems/              Traffic, Pedestrians, AmbientEvents, Police, Heat,
                        Jobs, Score, Onboarding, Camera, Effects, Audio,
                        Identity, Analytics
  net/                  Transport (Supabase + loopback), Multiplayer,
                        RemotePlayers, HeatRun, Room codes
  ui/                   DOM overlay: nickname, room, invite, roster
  gfx/Textures.ts       every sprite, drawn with Phaser Graphics at boot
scripts/make-og.mjs     regenerates the social preview PNG
```

Meta UI is DOM, gameplay HUD is canvas. The split keeps text selectable and
tappable while costing the renderer nothing.

## Analytics

PostHog, behind one abstraction in `src/systems/Analytics.ts`. Set
`VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` to enable it; without them no
analytics client is loaded or even shipped, and events are still buffered on
`window.getawayEvents` for local inspection.

Every event carries the current context automatically: anonymous `player_id`,
`room_id`, `nickname_set` (a boolean — the nickname itself is never sent),
`device_type`, `mobile`, `touch`, `multiplayer`, `online_player_count`,
`current_heat`, `score` and `session_duration`.

`identify()` uses the anonymous UUID already in localStorage. There is no
login, no email and no session recording. Browsers sending Do Not Track are
opted out automatically, and `window.getawayAnalytics.optOut()` /
`.optIn()` are available for a consent UI when one is needed.

The funnel to watch:

```
game_started → vehicle_entered → pursuit_escaped | mission_completed
             → invite_clicked → second_player_joined
```

Milestones (`first_vehicle_entered`, `first_drive`, `first_pursuit_escaped`,
`first_mission_completed`) fire once per session so cohorts are easy to slice.

## Performance

A full frame — 82 pedestrians, 22 traffic cars, a police pursuit, an ambient
incident and remote players — measures ~0.7 ms of scripting on a modern laptop,
against a 16.7 ms budget. Static geometry is baked into render textures, NPC
updates fall off with distance, and nothing in the update loop allocates.

## Audio

Everything is synthesised at runtime with the Web Audio API — engine, tyre
scrub, braking, light and heavy collisions, horns, pedestrian reactions, a
proximity-driven police siren, a city ambience bed, and short original motifs
for missions, HEAT, escapes, players joining and the Heat Run. There are no
audio files in this repository and nothing is sampled. Audio starts on the
first user gesture, as browsers require, and resumes when the tab returns.

## Provenance

All content is original. Genre mechanics only — no assets, names, maps, UI,
audio or code from any existing game. See [IP_AUDIT.md](IP_AUDIT.md) for the
full inventory, the repository sweep and the open name-clearance items.
