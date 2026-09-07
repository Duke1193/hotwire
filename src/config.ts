/** Central tuning values. Tweak here, not in the systems. */

export const WORLD = {
  width: 3300,
  height: 2300,
  /* Generous by car width on purpose: two lanes each way with room to slide. */
  roadHalfWidth: 104,
  sidewalk: 26,
  /** Spacing of kerbside street furniture; phones get a sparser street. */
  propStep: 108,
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
  /** Hurting people on the street is what brings the city down on you. */
  civilianDown: 14,
  civilianHurt: 4,
  impactFloor: 2.6,
  impactScale: 1.9,
  maxPerImpact: 20,
  thresholds: [26, 56, 82],
};

export const CAM = {
  lerp: 0.09,
  leadFoot: 6,
  leadCar: 30,
  /*
   * Three clearly different distances, not three shades of the same one: on
   * foot you are in the street, in a car you can see the junction, and flat
   * out the city opens up in front of you.
   */
  zoomFoot: 1.78,
  zoomCar: 1.42,
  zoomFast: 0.98,
  /** How fast the zoom chases the target. Noticeable, still smooth. */
  zoomLerp: 0.05,
};

export const COLORS = {
  /*
   * Harsher and flatter than a modern game would grade it: the road is nearly
   * black, the pavement is nearly white, and there is very little in between.
   * Cheap contrast is doing the work that soft lighting used to.
   */
  asphalt: 0x2a2d33,
  asphaltEdge: 0x1c1f24,
  line: 0xfff6d8,
  lineDim: 0xa8a48d,
  sidewalk: 0xa8afbc,
  sidewalkEdge: 0xc6ccd6,
  lot: 0x64686f,
  grass: 0x437a4c,
  /** Painted hazard/■kerb accents used sparingly around the city. */
  hazard: 0xd8a83c,
};

export interface District {
  name: string;
  /** Building wall/roof/detail tones, sampled per building. */
  walls: number[];
  roofs: number[];
  details: number[];
  pavement: number;
  lot: number;
  /** 0-1 chance a block interior becomes greenery. */
  green: number;
  /** 0-1 chance a kerbside prop slot gets industrial furniture. */
  industrial: number;
  /** Accent used for painted markings and signage in this district. */
  accent: number;
}

/**
 * Four quarters of one city. Same generator, different materials — the point
 * is that a screenshot from each is instantly identifiable without changing
 * how anything is built or rendered.
 */
export const DISTRICTS: District[] = [
  {
    name: 'WAREHOUSE ROW',
    walls: [0x3c4048, 0x474b52, 0x4e463c, 0x3a4147],
    roofs: [0x767d86, 0x8a8f95, 0x94836a, 0x6f7a83],
    details: [0xa9b0b8, 0xbfc4c9, 0xc0a883],
    pavement: 0x8d939e,
    lot: 0x54585f,
    green: 0.04,
    industrial: 0.72,
    accent: 0xd8a83c,
  },
  {
    name: 'NIGHT MARKET',
    walls: [0x5e3f3a, 0x6a4a35, 0x54383f, 0x5c4a2e],
    roofs: [0xb07a63, 0xc08d5c, 0xa06b74, 0xb59a5a],
    details: [0xe0b48a, 0xf0cf94, 0xd79a9a],
    pavement: 0xa79a91,
    lot: 0x6b544a,
    green: 0.1,
    industrial: 0.22,
    accent: 0xff9d4d,
  },
  {
    name: 'RIVERSIDE',
    walls: [0x35505a, 0x3d5a5f, 0x2f4a58, 0x44605c],
    roofs: [0x6d95a0, 0x7aa5a6, 0x63899d, 0x86a89f],
    details: [0x9fc4cb, 0xb2d4d0, 0x8fb6c6],
    pavement: 0x9daab0,
    lot: 0x4f6a70,
    green: 0.42,
    industrial: 0.12,
    accent: 0x5ad1c4,
  },
  {
    name: 'OLD BLOCKS',
    walls: [0x5a4038, 0x4d3a35, 0x63483c, 0x46352f],
    roofs: [0x9c7161, 0x8d6a5e, 0xa87c64, 0x7f6154],
    details: [0xc79a80, 0xd8ae90, 0xb08a74],
    pavement: 0x9b958c,
    lot: 0x5f4f45,
    green: 0.16,
    industrial: 0.3,
    accent: 0xffb347,
  },
];

/** Fictional places, used for signage and for saying "meet me at the depot". */
export const LANDMARKS = [
  { name: 'EASTSIDE DEPOT', district: 0 },
  { name: 'CITY MOTORS', district: 0 },
  { name: 'NIGHT MARKET', district: 1 },
  { name: 'RIVER GARAGE', district: 2 },
  { name: 'CENTRAL PARKING', district: 3 },
  { name: 'OLD MILL', district: 3 },
];

export const TRAFFIC = {
  /** Cars kept alive around the player. */
  count: 22,
  /** Half the distance between the two lane centres of a road. */
  lane: 52,
  /* City traffic pootles. You are the fast thing on this road, not them. */
  maxSpeed: 3.4,
  recklessSpeed: 5.6,
  accel: 0.08,
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
  /** One pistol round is not quite enough; a shotgun always is. */
  health: 34,
  /** A car above this speed knocks someone down for good rather than aside. */
  fatalSpeed: 4.6,
  /** How long a body stays on the street before the crowd is recycled. */
  downMs: 26000,
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
  eliminate: 400,
  crewWarWin: 1500,
};

export const NET = {
  /** Transform broadcasts per second while moving. */
  sendHz: 12,
  idleHz: 2,
  /** Render remote players this far in the past so we always interpolate. */
  interpDelay: 130,
  staleAfter: 9000,
};

export const VITALS = {
  maxHealth: 100,
  maxArmor: 100,
  /** Seconds you cannot be hurt after respawning. */
  spawnProtection: 3.5,
  downTime: 2.6,
  regenDelay: 9,
  regenRate: 4,
};

/**
 * A wreck does not vanish, it burns. Four readable stages, one timer, no
 * explosion: fire, smoke, then a black shell that stays on the street.
 */
export const FIRE = {
  /** Chance a shell catches once it is wrecked. */
  chance: 0.62,
  /** Chance a badly hurt but still driveable car catches anyway. */
  criticalChance: 0.16,
  burnMs: 9000,
  /** Damage per second to anyone still sitting in it. */
  cookDps: 16,
  /** Pedestrians give a burning car this much room. */
  scare: 190,
};

export const COMBAT = {
  /** Projectiles alive at once, pooled. */
  poolSize: 64,
  bulletLife: 900,
  /** How close a shot has to pass to count as a hit. */
  hitRadius: 16,
};

export const PICKUPS = {
  /** Crates alive in the world at once. */
  count: 18,
  respawnMs: 42000,
  radius: 34,
};

export const BUSTED = {
  /** A patrol has to be this close to hold you. */
  range: 96,
  /** Above this speed you are getting away, not being arrested. */
  escapeSpeed: 2.6,
  /** Seconds of containment before capture. */
  onFoot: 2.2,
  inVehicle: 3.4,
  /** Progress bleeds off this fast when you break contact. */
  recover: 1.6,
  scorePenalty: 0.25,
  immunityMs: 6000,
};

export const CREW_WAR = {
  target: 10,
  killPoints: 1,
  heatRunPoints: 2,
  missionPoints: 1,
  durationMs: 600000,
  resultMs: 8000,
};

export const ESCALATION = {
  /** Per HEAT level: how hard the response is. */
  speed: [1, 1, 1.06, 1.14],
  aggression: [1, 0.92, 1, 1.12],
  /** Roadblocks appear at the top level only. */
  roadblockLevel: 3,
  roadblockCooldownMs: 26000,
};
