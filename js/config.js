// Game balance & visual constants
const CONFIG = {
  TILE: 36,                    // logical pixel size of one tile
  INITIAL_RADIUS: 7,           // playfield radius in tiles
  RADIUS_GROWTH: 1,            // tiles added each round
  MAX_RADIUS: 20,

  HQ_HP: 100,
  HQ_SIZE: 2,                  // hq occupies 2x2 tiles
  HQ_ACCEPT_RADIUS: 1.6,       // drop ore within this many tiles to deposit
  HQ_RECIPE: {                 // ore → plate, at HQ
    input: { ore: 1 },
    output: 'plate',
    outputAmount: 1,
    time: 1.5,
    outputBufferMax: 5,
    // Plate buffer starts MAX so the first ore the player manually drags isn't
    // immediately consumed by HQ processing — they can stockpile ore for building.
    // HQ resumes refining once downstream pulls plates out and frees buffer space.
    startingPlates: 5,
  },
  TURRET_AMMO_MAX: 10,

  RESOURCE_NODE: {
    INITIAL: 5,
    PER_ROUND: 2,
    CAPACITY: 200,             // ore reserves per node (large; effectively unlimited early)
    MIN_DIST_FROM_HQ: 2.5,
    MIN_DIST_FROM_NODE: 2.5,
  },

  // Indestructible terrain that blocks building/conveyor placement.
  OBSTACLE: {
    INITIAL: 5,
    PER_ROUND: 2,
    MIN_DIST_FROM_HQ: 2.5,
    MIN_DIST_FROM_NODE: 1.5,
    MIN_DIST_FROM_OBSTACLE: 1.5,
  },

  HARVEST: {
    CLICK_AMOUNT: 1,
  },

  COSTS: {
    harvester: { ore: 5 },
    conveyor: { ore: 1 },
    splitter: { ore: 4 },
    refinery: { ore: 12 },
    bullet_plant: { ore: 10 },
    missile_plant: { ore: 20 },
    power_plant: { ore: 15 },
    gun_turret: { ore: 15 },
    missile_turret: { ore: 30 },
    laser_turret: { ore: 40 },
  },

  // Per-building upgrades. Keys are building type ('hq' or building.type).
  // Each tier deducts/adds the perTier values from the relevant base stat.
  // Cost scales: baseCost * UPGRADE_COST_MUL^currentTier
  UPGRADE_COST_MUL: 1.6,
  UPGRADES: {
    hq:             { speed: { maxTier: 3, baseCost: 15, perTier: { time: -0.25 } },
                      storage: { maxTier: 2, baseCost: 20, perTier: { outputBufferMax: +2 } } },
    refinery:       { speed: { maxTier: 3, baseCost: 8,  perTier: { time: -0.2 } },
                      storage: { maxTier: 2, baseCost: 12, perTier: { inputBufferMax: +1, outputBufferMax: +1 } } },
    bullet_plant:   { speed: { maxTier: 3, baseCost: 8,  perTier: { time: -0.2 } },
                      storage: { maxTier: 2, baseCost: 12, perTier: { inputBufferMax: +1, outputBufferMax: +1 } } },
    missile_plant:  { speed: { maxTier: 3, baseCost: 15, perTier: { time: -0.3 } },
                      storage: { maxTier: 2, baseCost: 20, perTier: { inputBufferMax: +1, outputBufferMax: +1 } } },
    power_plant:    { speed: { maxTier: 3, baseCost: 10, perTier: { regen: +2 } },
                      storage: { maxTier: 2, baseCost: 15, perTier: { maxPower: +5 } } },
    harvester:      { speed: { maxTier: 3, baseCost: 5,  perTier: { rate: -0.2 } },
                      storage: { maxTier: 2, baseCost: 8,  perTier: { buffer: +1 } } },
    gun_turret:     { speed: { maxTier: 3, baseCost: 10, perTier: { cooldown: -0.05 } },
                      storage: { maxTier: 2, baseCost: 12, perTier: { ammoMax: +3 } } },
    missile_turret: { speed: { maxTier: 3, baseCost: 20, perTier: { cooldown: -0.2 } },
                      storage: { maxTier: 2, baseCost: 25, perTier: { range: +1.0 }, label: 'Range' } },
  },
  POWER_BASE_REGEN_PER_PLANT: 4,

  HARVESTER: {
    RATE: 1.2,                 // seconds per ore produced
    BUFFER: 4,                 // how many ore can sit on harvester before blocking
  },

  CONVEYOR: {
    SPEED: 2.6,                // tiles per second
  },

  FACTORIES: {
    refinery: {
      inputType: 'ore', inputAmount: 1, inputBufferMax: 3,
      outputType: 'plate', outputAmount: 1, outputBufferMax: 3,
      time: 1.2,
    },
    bullet_plant:  {
      inputType: 'plate', inputAmount: 1, inputBufferMax: 4,
      outputType: 'bullet', outputAmount: 5, outputBufferMax: 5,
      time: 1.5,
    },
    missile_plant: {
      inputType: 'plate', inputAmount: 2, inputBufferMax: 4,
      outputType: 'missile', outputAmount: 1, outputBufferMax: 3,
      time: 2.5,
    },
    power_plant:   { output: { power_max: 10 }, passive: true },
  },

  TURRETS: {
    gun_turret: {
      range: 4.2, damage: 4, cooldown: 0.35,
      ammo: 'bullet', ammoCost: 1,
      projectileSpeed: 14, projectileColor: '#e0e0f0',
    },
    missile_turret: {
      range: 6.5, damage: 22, cooldown: 1.6,
      ammo: 'missile', ammoCost: 1,
      projectileSpeed: 7, splash: 1.4,
      projectileColor: '#ff8050', homing: true,
    },
    laser_turret: {
      range: 5.0, damage: 9, cooldown: 0,
      ammo: 'power', ammoCost: 4,    // power per second draw
      continuous: true,
      beamColor: '#ffe040',
    },
  },

  WAVE: {
    PREP_TIME: 60,
    BETWEEN_TIME: 25,
    BASE_ENEMIES: 3,
    ENEMIES_PER_ROUND: 2,
    BASE_HP: 16,
    HP_PER_ROUND: 7,
    BASE_SPEED: 1.05,
    SPEED_PER_ROUND: 0.04,
    SPAWN_INTERVAL: 1.0,
    ENEMY_SIZE: 0.45,
    HQ_HEAL_PER_WAVE: 20,
  },

  // Enemy types — multipliers apply on top of round-scaled base values.
  // Picked by weighted random per spawn from types unlocked at current round.
  // Damages tuned so leaking all 3 grunts in round 1 (3 × 35 = 105) destroys HQ (100 hp).
  ENEMIES: {
    grunt: { color: '#ff4060', shield: '#ff90a0', hpMul: 1.0,  speedMul: 1.0,  sizeMul: 1.0, damage: 35, reward: 2,  weight: 3, unlockRound: 1, label: 'Grunt' },
    scout: { color: '#ffd040', shield: '#fff0a0', hpMul: 0.45, speedMul: 1.8,  sizeMul: 0.65, damage: 14, reward: 1,  weight: 2, unlockRound: 3, label: 'Scout' },
    tank:  { color: '#a060ff', shield: '#c090ff', hpMul: 3.0,  speedMul: 0.55, sizeMul: 1.6, damage: 50, reward: 6,  weight: 1.5, unlockRound: 5, label: 'Tank' },
    brute: { color: '#6a1f30', shield: '#a04050', hpMul: 5.5,  speedMul: 0.4,  sizeMul: 2.0, damage: 80, reward: 15, weight: 1, unlockRound: 8, label: 'Brute' },
  },

  COLORS: {
    grid: '#15152a',
    gridBright: '#20204a',
    hq: '#5af7ff',
    hqCore: '#ffffff',
    node: '#d8a050',
    enemy: '#ff4060',
    enemyShield: '#ff90a0',
    pickup: '#d8a050',
    dragging: '#fff',
    selected: '#5af7ff',
    blocked: '#ff4060',
    valid: '#50ff80',
    conveyor: '#404060',
    conveyorArrow: '#6080a0',
    rangeIndicator: 'rgba(90,247,255,0.12)',
  },

  // Per-item visual: color & outline used wherever an item is rendered (conveyor cargo, pickup, etc.)
  ITEMS: {
    ore:     { color: '#d8a050', outline: '#603018', symbol: '◆' },
    plate:   { color: '#80d0e0', outline: '#103850', symbol: '▣' },
    bullet:  { color: '#e0e0f0', outline: '#404060', symbol: '●' },
    missile: { color: '#ff8050', outline: '#601800', symbol: '▲' },
  },
};
