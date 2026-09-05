/** Central tuning values. Tweak here, not in the systems. */

export const WORLD = {
  width: 3300,
  height: 2300,
  roadHalfWidth: 92,
  sidewalk: 26,
  seed: 'getaway-01',
  /** Road centre lines. */
  roadsX: [400, 1250, 2100, 2900],
  roadsY: [350, 1150, 1950],
};

export const DRIVE = {
  /** px per physics step (~60Hz). 11 ≈ 660 px/s. */
  maxSpeed: 9.9,
  maxReverse: 3.9,
  accel: 0.145,
  brake: 0.34,
  reverseAccel: 0.16,
  /** velocity retained per step with no throttle */
  coastDrag: 0.988,
  /** lateral velocity retained per step: lower = more grip */
  grip: 0.80,
  driftGrip: 0.955,
  /** rad per step at full steer */
  maxTurn: 0.076,
  /** how quickly steering ramps in/out */
  steerLerp: 0.22,
  /** steering loses authority at top speed */
  highSpeedSteerLoss: 0.34,
  /** below this fraction of max speed steering scales up from zero */
  steerSpeedRamp: 0.22,
  /** how much scrubbed sideways momentum returns as forward drive */
  slideRecovery: 0.62,
  /** lateral speed above which we consider the car sliding */
  slipThreshold: 1.6,
  exitSpeed: 2.2,
};

export const POLICE = {
  maxSpeed: 9.0,
  accel: 0.15,
  spawnMinDist: 950,
  spawnMaxDist: 1700,
  despawnDist: 2200,
};

export const HEAT = {
  max: 100,
  /** slow passive cool-down when nothing is chasing */
  idleDecay: 1.4,
  /** fast cool-down once you have broken contact long enough */
  escapeDecay: 15,
  /** a patrol closer than this holds your heat where it is */
  contactRadius: 560,
  /** seconds out of contact before the fast cool-down kicks in */
  escapeTime: 2.6,
  impactFloor: 2.6,
  impactScale: 1.9,
  maxPerImpact: 20,
  thresholds: [26, 56, 82],
};

export const CAM = {
  lerp: 0.09,
  leadFoot: 6,
  leadCar: 26,
  zoomFoot: 1.42,
  zoomCar: 1.3,
  zoomFast: 1.0,
};

export const COLORS = {
  asphalt: 0x41454f,
  asphaltEdge: 0x33363e,
  line: 0xf2ead0,
  lineDim: 0xa8a48f,
  sidewalk: 0x8a8e99,
  sidewalkEdge: 0x9aa0ab,
  lot: 0x6a6e79,
  grass: 0x4e7f57,
};

export const TRAFFIC = {
  /** Cars kept alive around the player. */
  count: 22,
  /** Half the distance between the two lane centres of a road. */
  lane: 46,
  maxSpeed: 5.2,
  recklessSpeed: 8.4,
  accel: 0.1,
  /** Chance a spawned driver is in a hurry. */
  recklessChance: 0.14,
  /** Look this far ahead for something to brake for. */
  feeler: 96,
  spawnMin: 700,
  spawnMax: 1500,
  despawn: 2100,
  hornAfter: 2600,
};

export const PEDS = {
  count: 82,
  speed: 0.72,
  runSpeed: 1.85,
  /** Sidewalk waypoints are spaced roughly this far apart. */
  nodeSpacing: 92,
  /** Recycle anyone further away than this. */
  despawn: 1250,
  spawnMin: 620,
  spawnMax: 1150,
  /** A vehicle this close and this fast makes them bolt. */
  scareDist: 86,
  scareSpeed: 2.4,
};

export const AMBIENT = {
  minGap: 30000,
  maxGap: 60000,
  /** Events are staged this far from the player: close enough to notice. */
  nearMin: 420,
  nearMax: 1250,
};

export const SCORE = {
  escape: [0, 400, 900, 1600],
  jobBase: 600,
  jobPerMetre: 0.9,
  /** Points per second of sustained high-speed driving. */
  streakRate: 55,
  streakSpeed: 0.72,
  heatRunWin: 2000,
};

export const NET = {
  /** Transform broadcasts per second while moving. */
  sendHz: 12,
  idleHz: 2,
  /** Render remote players this far in the past so we always interpolate. */
  interpDelay: 130,
  staleAfter: 9000,
};
