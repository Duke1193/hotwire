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
