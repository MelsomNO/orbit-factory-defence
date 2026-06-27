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

  // ─── Modifications ────────────────────────────────────────────────────────
  // Roguelike-style permanent perks chosen after each wave clear.
  // Every modifier always has one positive AND one negative trait, both scale
  // per level, and the player can stack the same modifier across multiple
  // rounds. `mults` map stat-keys (read by modMul in entities.js) to a
  // per-level effect: numbers are simply multiplied (1.5 = +50% per level).
  // `onApply` runs once at selection for one-shot effects (e.g. heal HQ).
  MODIFIERS_PER_PICK: 2,
  MODIFIERS: {
    rich_veins: {
      label: 'Rich Veins',
      pos: l => `+${l * 8}% node ore & capacity`,
      neg: l => `−${l * 5}% harvest rate`,
      mults: {
        'node.capacityMul':  l => 1 + l * 0.08,
        'harvester.rateMul': l => 1 + l * 0.05,          // bigger period = slower
      },
      onApply(prevLvl) {
        const newMul = 1 + (prevLvl + 1) * 0.08;
        for (const n of State.resourceNodes) {
          const base = n.maxReserves || CONFIG.RESOURCE_NODE.CAPACITY;
          const newMax = CONFIG.RESOURCE_NODE.CAPACITY * newMul;
          const inc = newMax - base;
          n.maxReserves = newMax;
          n.reserves = Math.min(newMax, n.reserves + inc);
        }
      },
    },
    reinforced_hull: {
      label: 'Reinforced Hull',
      pos: l => `+${l * 8} max HQ HP (heals to full)`,
      neg: l => `−${l * 5}% all production speed`,
      mults: {
        'hq.timeMul':      l => 1 + l * 0.05,
        'factory.timeMul': l => 1 + l * 0.05,
      },
      onApply() {
        State.hq.maxHp += 8;
        State.hq.hp = State.hq.maxHp;
      },
    },
    wider_patrol: {
      label: 'Wider Patrol',
      pos: l => `+${l * 8}% turret range`,
      neg: l => `−${l * 5}% turret fire rate`,
      mults: {
        'turret.rangeMul':    l => 1 + l * 0.08,
        'turret.cooldownMul': l => 1 + l * 0.05,
      },
    },
    munitions_surge: {
      label: 'Munitions Surge',
      pos: l => `+${l * 8}% turret ammo capacity`,
      neg: l => `−${l * 5}% turret damage`,
      mults: {
        'turret.ammoMaxMul': l => 1 + l * 0.08,
        'turret.damageMul':  l => 1 - l * 0.05,
      },
    },
    overclocked_plants: {
      label: 'Overclocked Plants',
      pos: l => `+${l * 8}% plant output amount`,
      neg: l => `+${l * 6}% plant cycle time`,
      mults: {
        'factory.outputMul': l => 1 + l * 0.08,
        'factory.timeMul':   l => 1 + l * 0.06,
      },
    },
    quick_belts: {
      label: 'Quick Belts',
      pos: l => `+${l * 8}% conveyor speed`,
      neg: l => `−${l * 5}% harvester rate`,
      mults: {
        'conveyor.speedMul': l => 1 + l * 0.08,
        'harvester.rateMul': l => 1 + l * 0.05,
      },
    },
    tough_enemies: {
      label: 'Tough Enemies',
      pos: l => `+${l * 8}% ore from kills`,
      neg: l => `+${l * 5}% enemy HP`,
      mults: {
        'enemy.rewardMul': l => 1 + l * 0.08,
        'enemy.hpMul':     l => 1 + l * 0.05,
      },
    },
    swarm_tactics: {
      label: 'Swarm Tactics',
      pos: l => `−${l * 5}% enemy HP`,
      neg: l => `+${l * 8}% enemies per wave`,
      mults: {
        'enemy.hpMul':        l => 1 - l * 0.05,
        'wave.enemyCountMul': l => 1 + l * 0.08,
      },
    },
    heavy_ammo: {
      label: 'Heavy Ammo',
      pos: l => `+${l * 8}% bullet & missile damage`,
      neg: l => `−${l * 5}% bullet & missile fire rate`,
      mults: {
        'turret.damageMul':   l => 1 + l * 0.08,
        'turret.cooldownMul': l => 1 + l * 0.05,
      },
    },
    energy_surplus: {
      label: 'Energy Surplus',
      pos: l => `+${l * 8}% power plant capacity`,
      neg: l => `−${l * 5}% power plant regen`,
      mults: {
        'power.maxMul':   l => 1 + l * 0.08,
        'power.regenMul': l => 1 - l * 0.05,
      },
    },
    glass_cannon: {
      label: 'Glass Cannon',
      pos: l => `+${l * 8}% turret fire rate`,
      neg: l => `−${l * 5}% turret range`,
      mults: {
        'turret.cooldownMul': l => 1 - l * 0.08,
        'turret.rangeMul':    l => 1 - l * 0.05,
      },
    },
    sluggish_foes: {
      label: 'Sluggish Foes',
      pos: l => `−${l * 5}% enemy speed`,
      neg: l => `+${l * 8}% enemy HP`,
      mults: {
        'enemy.speedMul': l => 1 - l * 0.05,
        'enemy.hpMul':    l => 1 + l * 0.08,
      },
    },
    surge_protector: {
      label: 'Surge Protector',
      pos: l => `+${l * 8}% power regen`,
      neg: l => `−${l * 5}% power max`,
      mults: {
        'power.regenMul': l => 1 + l * 0.08,
        'power.maxMul':   l => 1 - l * 0.05,
      },
    },
    hunting_pack: {
      label: 'Hunting Pack',
      pos: l => `+${l * 8}% ore from kills`,
      neg: l => `−${l * 5}% spawn interval (faster waves)`,
      mults: {
        'enemy.rewardMul':         l => 1 + l * 0.08,
        'wave.spawnIntervalMul':   l => 1 - l * 0.05,
      },
    },
    steady_aim: {
      label: 'Steady Aim',
      pos: l => `+${l * 8}% projectile speed`,
      neg: l => `−${l * 5}% projectile damage`,
      mults: {
        'turret.projectileSpeedMul': l => 1 + l * 0.08,
        'turret.damageMul':           l => 1 - l * 0.05,
      },
    },
    bulk_storage: {
      label: 'Bulk Storage',
      pos: l => `+${l * 8}% plant buffer capacity`,
      neg: l => `+${l * 5}% plant cycle time`,
      mults: {
        'factory.bufferMul': l => 1 + l * 0.08,
        'factory.timeMul':   l => 1 + l * 0.05,
      },
    },
    field_repair: {
      label: 'Field Repair',
      pos: l => `HQ regens +${l} HP/sec`,
      neg: l => `+${l * 5}% enemy damage to HQ`,
      mults: {
        'hq.regenRate':     l => l,                  // additive HP/sec
        'enemy.hqDamageMul': l => 1 + l * 0.05,
      },
    },
    cache_discovery: {
      label: 'Cache Discovery',
      pos: l => `+${l * 20} ore on pickup`,
      neg: l => `+${l * 5}% enemy speed`,
      mults: {
        'enemy.speedMul': l => 1 + l * 0.05,
      },
      onApply(prevLvl) {
        // Grant ore each time the perk is chosen (incl. when stacked)
        State.inventory.ore = (State.inventory.ore || 0) + 20;
      },
    },
  },

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
