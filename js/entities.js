// Entity logic: placement, update tick for all entity types

const DIRS = {
  N: { dx: 0, dy: -1 },
  S: { dx: 0, dy: 1 },
  E: { dx: 1, dy: 0 },
  W: { dx: -1, dy: 0 },
};
const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };

// The two perpendicular directions for a given axis dir
function perpendicularDirs(dir) {
  return (dir === 'N' || dir === 'S') ? ['E', 'W'] : ['N', 'S'];
}

// Which side of building b does the (fromX, fromY) tile sit on? null if not adjacent.
function sideOfBuilding(b, fromX, fromY) {
  if (fromX === b.x - 1 && fromY === b.y) return 'W';
  if (fromX === b.x + 1 && fromY === b.y) return 'E';
  if (fromX === b.x && fromY === b.y - 1) return 'N';
  if (fromX === b.x && fromY === b.y + 1) return 'S';
  return null;
}

// Push to any acceptor (HQ tile, any building, conveyor). Used by splitters,
// which the user explicitly wants to be able to feed buildings directly so
// you don't have to glue a single conveyor tile between a splitter and a
// plant / turret.
function tryPushItem(srcX, srcY, dir, itemType) {
  const dv = DIRS[dir];
  const nx = srcX + dv.dx;
  const ny = srcY + dv.dy;
  if (isHQTile(nx, ny)) {
    if (itemType !== 'ore') return false;
    State.inventory.ore = (State.inventory.ore || 0) + 1;
    addFloater(srcX + 0.5, srcY + 0.3, '+1◆', CONFIG.COLORS.hq);
    return true;
  }
  const b = getBuildingAt(nx, ny);
  if (b) return deliverToBuilding(b, itemType, srcX, srcY);
  const c = getConveyorAt(nx, ny);
  if (c) {
    if (c.item) return false;
    if (c.dir === OPPOSITE[dir]) return false;
    c.item = { type: itemType, progress: 0 };
    return true;
  }
  return false;
}

// Push restricted to transport tiles only — conveyors and splitters. Used by
// producers (harvester, HQ, refinery, plant) so their output MUST flow through
// the belt network rather than skipping straight into an adjacent consumer.
// This preserves the factory + logistics gameplay loop (forces players to plan
// belt routes for ammo/plate delivery into turrets/plants).
function tryPushToTransport(srcX, srcY, dir, itemType) {
  const dv = DIRS[dir];
  const nx = srcX + dv.dx;
  const ny = srcY + dv.dy;
  const b = getBuildingAt(nx, ny);
  if (b && b.type === 'splitter') return deliverToBuilding(b, itemType, srcX, srcY);
  const c = getConveyorAt(nx, ny);
  if (c) {
    if (c.item) return false;
    if (c.dir === OPPOSITE[dir]) return false;
    c.item = { type: itemType, progress: 0 };
    return true;
  }
  return false;
}
function dirBetween(ax, ay, bx, by) {
  if (bx > ax) return 'E';
  if (bx < ax) return 'W';
  if (by > ay) return 'S';
  if (by < ay) return 'N';
  return 'E';
}

function getConveyorAt(x, y) {
  for (const c of State.conveyors) if (c.x === x && c.y === y) return c;
  return null;
}
function getBuildingAt(x, y) {
  for (const b of State.buildings) if (b.x === x && b.y === y) return b;
  return null;
}
function getNodeAt(x, y) {
  for (const n of State.resourceNodes) if (n.x === x && n.y === y) return n;
  return null;
}

// Reduce a node's reserves and trigger destruction when it bottoms out.
function reduceNodeReserves(node, amount) {
  if (node.reserves <= 0) return;
  node.reserves = Math.max(0, node.reserves - amount);
  if (node.reserves <= 0) depleteNode(node);
}

// Node depletion: explode visually, play crumbling sound, remove from world,
// detach any harvester sitting on it (the harvester structure itself stays —
// the player can demolish for a refund).
function depleteNode(node) {
  spawnParticles(node.x + 0.5, node.y + 0.5, CONFIG.COLORS.node, 26, 4.5);
  spawnParticles(node.x + 0.5, node.y + 0.5, '#fff8e0', 8, 3);
  addFloater(node.x + 0.5, node.y + 0.4, 'DEPLETED', '#a07030');
  Sound.nodeDepleted();
  State.resourceNodes = State.resourceNodes.filter(n => n !== node);
  // Only clear grid key if no harvester is occupying this tile (harvester sets 'building')
  if (Grid.byKey(node.x, node.y) === 'node') Grid.clearKey(node.x, node.y);
  for (const b of State.buildings) {
    if (b.type === 'harvester' && b.nodeRef === node) b.nodeRef = null;
  }
}
function isHQTile(x, y) {
  const h = State.hq;
  return h && x >= h.x && x < h.x + h.size && y >= h.y && y < h.y + h.size;
}

// Which sides of this conveyor connect to something — used by the renderer to extend
// belt arms toward neighbors for a seamless look. Output side is always connected.
// An input side connects only when a real item source exists on that side: a conveyor
// pointing into us, HQ, or a building whose output points back at us.
function getConveyorConnections(c) {
  const conn = { N: false, S: false, E: false, W: false };
  conn[c.dir] = true;
  for (const side of ['N', 'S', 'E', 'W']) {
    if (conn[side]) continue;
    const dv = DIRS[side];
    const ax = c.x + dv.dx;
    const ay = c.y + dv.dy;
    const adj = getConveyorAt(ax, ay);
    if (adj) { if (adj.dir === OPPOSITE[side]) conn[side] = true; continue; }
    const adjB = getBuildingAt(ax, ay);
    if (adjB) { if (canBuildingOutputToward(adjB, OPPOSITE[side])) conn[side] = true; continue; }
    if (isHQTile(ax, ay)) conn[side] = true; // HQ pushes plates out any side
  }
  return conn;
}

// Does building b have an item output going in direction `dirFromB`?
function canBuildingOutputToward(b, dirFromB) {
  if (b.type === 'harvester' || b.type === 'refinery' ||
      b.type === 'bullet_plant' || b.type === 'missile_plant') return true;
  if (b.type === 'splitter') {
    return (b.dir === 'N' || b.dir === 'S')
      ? (dirFromB === 'E' || dirFromB === 'W')
      : (dirFromB === 'N' || dirFromB === 'S');
  }
  // power_plant, turrets — sinks/standalone, no item output
  return false;
}

// ---------- PLACEMENT ----------
function canPlaceBuilding(type, x, y) {
  if (!inBounds(x, y)) return false;
  if (type === 'harvester') {
    if (!getNodeAt(x, y)) return false;
    if (getBuildingAt(x, y)) return false;
    return true;
  }
  if (Grid.byKey(x, y)) return false;
  return true;
}

function placeBuilding(type, x, y) {
  if (!canPlaceBuilding(type, x, y)) return false;
  const cost = CONFIG.COSTS[type];
  if (!canAfford(cost)) return false;
  spend(cost);
  const b = createBuilding(type, x, y);
  State.buildings.push(b);
  Grid.setKey(x, y, 'building');
  if (type === 'power_plant') recomputePowerMax();
  addFloater(x + 0.5, y + 0.4, '✓', CONFIG.COLORS.valid);
  Sound.placed();
  return true;
}

function createBuilding(type, x, y) {
  const base = { type, x, y };
  if (CONFIG.UPGRADES[type]) base.upgrades = { speed: 0, storage: 0 };
  if (type === 'harvester') {
    return Object.assign(base, { cooldown: 0, buffer: 0, nodeRef: getNodeAt(x, y) });
  }
  const recipe = CONFIG.FACTORIES[type];
  if (recipe && recipe.inputType) {
    return Object.assign(base, { progress: 0, working: false, inputBuffer: 0, outputBuffer: 0 });
  }
  if (type === 'power_plant') {
    return Object.assign(base, { pulse: 0 });
  }
  if (type === 'gun_turret' || type === 'missile_turret') {
    return Object.assign(base, { cooldown: 0, target: null, aimAngle: 0, firing: false, ammoBuffer: 0 });
  }
  if (type === 'laser_turret') {
    return Object.assign(base, { cooldown: 0, target: null, aimAngle: 0, firing: false });
  }
  if (type === 'splitter') {
    return Object.assign(base, { dir: 'E', item: null, nextOutput: 0 });
  }
  return base;
}

function demolishAt(x, y) {
  const b = getBuildingAt(x, y);
  if (b) {
    refund(CONFIG.COSTS[b.type] || {}, 0.5);
    State.buildings = State.buildings.filter(x => x !== b);
    if (b.type === 'power_plant') recomputePowerMax();
    if (getNodeAt(x, y)) Grid.setKey(x, y, 'node');
    else Grid.clearKey(x, y);
    addFloater(x + 0.5, y + 0.4, 'X', CONFIG.COLORS.blocked);
    return true;
  }
  const c = getConveyorAt(x, y);
  if (c) {
    refund({ ore: 1 }, 0.5);
    State.conveyors = State.conveyors.filter(x => x !== c);
    Grid.clearKey(x, y);
    return true;
  }
  if (Grid.byKey(x, y) === 'obstacle') {
    addFloater(x + 0.5, y + 0.4, 'INDESTRUCTIBLE', '#aa8888');
    return false;
  }
  return false;
}

// ---------- CONVEYOR PLACEMENT ----------
function buildConveyorPath(ax, ay, bx, by) {
  // L-shape: horizontal first then vertical
  const path = [];
  let cx = ax, cy = ay;
  const sx = Math.sign(bx - ax);
  while (cx !== bx) { path.push({ x: cx, y: cy }); cx += sx; }
  const sy = Math.sign(by - ay);
  while (cy !== by) { path.push({ x: cx, y: cy }); cy += sy; }
  path.push({ x: bx, y: by });
  return path;
}

// Returns array of {x,y,dir,placeable,reason} for preview/placement
function planConveyorPlacement(path) {
  const result = [];
  for (let i = 0; i < path.length; i++) {
    const cur = path[i];
    const next = path[i + 1];
    const prev = path[i - 1];
    let dir;
    if (next) dir = dirBetween(cur.x, cur.y, next.x, next.y);
    else if (prev) dir = dirBetween(prev.x, prev.y, cur.x, cur.y);
    else dir = 'E';
    const existing = Grid.byKey(cur.x, cur.y);
    let placeable = true;
    let action = 'place';
    let reason = '';
    if (!inBounds(cur.x, cur.y)) { placeable = false; reason = 'out of bounds'; action = 'skip'; }
    else if (existing === 'hq' || existing === 'node' || existing === 'building' || existing === 'obstacle') { placeable = false; reason = 'occupied'; action = 'skip'; }
    else if (existing === 'conveyor') { action = 'rotate'; }
    result.push({ x: cur.x, y: cur.y, dir, placeable, action, reason });
  }
  return result;
}

function placeConveyors(plan) {
  let placedCost = 0;
  const oreAvail = State.inventory.ore;
  for (const step of plan) {
    if (step.action === 'skip') continue;
    if (step.action === 'rotate') {
      const c = getConveyorAt(step.x, step.y);
      if (c) c.dir = step.dir;
      continue;
    }
    if (placedCost + 1 > oreAvail) break;
    State.conveyors.push({ x: step.x, y: step.y, dir: step.dir, item: null, type: 'conveyor' });
    Grid.setKey(step.x, step.y, 'conveyor');
    placedCost++;
  }
  if (placedCost > 0) {
    State.inventory.ore -= placedCost;
    Sound.placed();
  }
  return placedCost;
}

// ---------- UPDATE TICK ----------

// Find a conveyor adjacent to (x,y) that accepts items from (x,y).
// Rule: conveyor accepts on any side except its output side (= its dir).
function findOutputConveyor(x, y) {
  // (dx,dy): direction from source tile to conveyor. The side of conveyor facing source = OPPOSITE(dir-from-source-to-conveyor).
  // Conveyor accepts when that side != conveyor.dir.
  const adj = [
    { dx: 0, dy: -1, srcSide: 'S' }, // conveyor north of source — source on S side of conveyor
    { dx: 0, dy: 1,  srcSide: 'N' },
    { dx: 1, dy: 0,  srcSide: 'W' },
    { dx: -1, dy: 0, srcSide: 'E' },
  ];
  for (const a of adj) {
    const c = getConveyorAt(x + a.dx, y + a.dy);
    if (c && c.dir !== a.srcSide && !c.item) return c;
  }
  return null;
}

// ---------- MODIFIERS (roguelike per-wave perks) ----------
// Multiplicative aggregator: multiply contributions from every active modifier
// for a given stat-key (e.g. 'enemy.hpMul'). Returns 1 when no modifier touches it.
function modMul(statKey) {
  let mul = 1;
  const mods = State.modifiers;
  if (!mods) return mul;
  for (const id in mods) {
    const lvl = mods[id];
    if (!lvl) continue;
    const def = CONFIG.MODIFIERS[id];
    if (def && def.mults && typeof def.mults[statKey] === 'function') {
      mul *= def.mults[statKey](lvl);
    }
  }
  return mul;
}
// Additive aggregator for stats that should add, not scale (e.g. ammo capacity).
function modAdd(statKey) {
  let sum = 0;
  const mods = State.modifiers;
  if (!mods) return sum;
  for (const id in mods) {
    const lvl = mods[id];
    if (!lvl) continue;
    const def = CONFIG.MODIFIERS[id];
    if (def && def.mults && typeof def.mults[statKey] === 'function') {
      sum += def.mults[statKey](lvl);
    }
  }
  return sum;
}

// Apply a chosen modifier: bump its level, fire one-shot effect if any.
function applyModifier(id) {
  const def = CONFIG.MODIFIERS[id];
  if (!def) return;
  const prev = State.modifiers[id] || 0;
  State.modifiers[id] = prev + 1;
  if (typeof def.onApply === 'function') def.onApply(prev);
}

// Choose two distinct random modifiers, pause the game, and stash them in
// State.modifierPick for the UI to render. UI clears modifierPick + unpauses
// once the player chooses (or skips).
function triggerModifierPick() {
  const ids = Object.keys(CONFIG.MODIFIERS);
  // Fisher–Yates shuffle
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const picks = ids.slice(0, Math.min(CONFIG.MODIFIERS_PER_PICK || 2, ids.length));
  State.modifierPick = picks;
  State.paused = true;
}

// ---------- UPGRADES ----------

function upgradeKey(b) {
  // HQ has type='hq', other buildings use their type directly.
  return b === State.hq ? 'hq' : b.type;
}

function getTier(b, key) {
  return (b.upgrades && b.upgrades[key]) || 0;
}

function upgradeCost(b, key) {
  const def = CONFIG.UPGRADES[upgradeKey(b)] && CONFIG.UPGRADES[upgradeKey(b)][key];
  if (!def) return null;
  const tier = getTier(b, key);
  if (tier >= def.maxTier) return null;
  return Math.floor(def.baseCost * Math.pow(CONFIG.UPGRADE_COST_MUL, tier));
}

function canUpgrade(b, key) {
  const cost = upgradeCost(b, key);
  return cost !== null && (State.inventory.ore || 0) >= cost;
}

function applyUpgrade(b, key) {
  const cost = upgradeCost(b, key);
  if (cost === null || (State.inventory.ore || 0) < cost) return false;
  State.inventory.ore -= cost;
  b.upgrades = b.upgrades || {};
  b.upgrades[key] = (b.upgrades[key] || 0) + 1;
  if (b.type === 'power_plant' || b === State.hq) recomputePowerMax();
  addFloater(b.x + (b.size || 1) / 2, b.y - 0.3, '★', CONFIG.COLORS.selected);
  return true;
}

// Effective stat helpers — fall back to base when no upgrade defined.
function effectiveRecipeTime(b) {
  const recipe = (b === State.hq) ? CONFIG.HQ_RECIPE : CONFIG.FACTORIES[b.type];
  const def = CONFIG.UPGRADES[upgradeKey(b)] && CONFIG.UPGRADES[upgradeKey(b)].speed;
  const delta = def && def.perTier.time ? def.perTier.time * getTier(b, 'speed') : 0;
  let val = recipe.time + delta;
  val *= modMul(b === State.hq ? 'hq.timeMul' : 'factory.timeMul');
  return Math.max(0.2, val);
}

function effectiveBufferMax(b, key /* 'inputBufferMax' | 'outputBufferMax' */) {
  const recipe = (b === State.hq) ? CONFIG.HQ_RECIPE : CONFIG.FACTORIES[b.type];
  const def = CONFIG.UPGRADES[upgradeKey(b)] && CONFIG.UPGRADES[upgradeKey(b)].storage;
  const delta = def && def.perTier[key] ? def.perTier[key] * getTier(b, 'storage') : 0;
  let max = (recipe[key] || 0) + delta;
  // Modifier: Bulk Storage scales plant buffers
  if (b !== State.hq) max *= modMul('factory.bufferMul');
  return Math.max(1, Math.round(max));
}

// Effective output amount per cycle (modifiers can scale plant output).
function effectiveFactoryOutput(f) {
  const recipe = CONFIG.FACTORIES[f.type];
  if (!recipe || !recipe.outputAmount) return 0;
  return Math.max(1, Math.round(recipe.outputAmount * modMul('factory.outputMul')));
}

function effectiveTurretCooldown(t) {
  const def = CONFIG.TURRETS[t.type];
  const upg = CONFIG.UPGRADES[t.type] && CONFIG.UPGRADES[t.type].speed;
  const delta = upg && upg.perTier.cooldown ? upg.perTier.cooldown * getTier(t, 'speed') : 0;
  let cd = def.cooldown + delta;
  cd *= modMul('turret.cooldownMul');
  return Math.max(0.05, cd);
}

function effectiveTurretAmmoMax(t) {
  const upg = CONFIG.UPGRADES[t.type] && CONFIG.UPGRADES[t.type].storage;
  const delta = upg && upg.perTier.ammoMax ? upg.perTier.ammoMax * getTier(t, 'storage') : 0;
  return Math.max(1, Math.round((CONFIG.TURRET_AMMO_MAX + delta) * modMul('turret.ammoMaxMul')));
}

function effectiveTurretRange(t) {
  const def = CONFIG.TURRETS[t.type];
  const upg = CONFIG.UPGRADES[t.type] && CONFIG.UPGRADES[t.type].storage;
  const delta = upg && upg.perTier.range ? upg.perTier.range * getTier(t, 'storage') : 0;
  return (def.range + delta) * modMul('turret.rangeMul');
}

function effectiveTurretDamage(t) {
  const def = CONFIG.TURRETS[t.type];
  return def.damage * modMul('turret.damageMul');
}

function effectiveHarvesterRate(h) {
  const upg = CONFIG.UPGRADES.harvester.speed;
  let rate = CONFIG.HARVESTER.RATE + upg.perTier.rate * getTier(h, 'speed');
  rate *= modMul('harvester.rateMul');
  return Math.max(0.2, rate);
}

function effectiveHarvesterBuffer(h) {
  return CONFIG.HARVESTER.BUFFER + CONFIG.UPGRADES.harvester.storage.perTier.buffer * getTier(h, 'storage');
}

function effectivePowerPlantMax(p) {
  const base = CONFIG.FACTORIES.power_plant.output.power_max + CONFIG.UPGRADES.power_plant.storage.perTier.maxPower * getTier(p, 'storage');
  return base * modMul('power.maxMul');
}

function effectivePowerPlantRegen(p) {
  const base = CONFIG.POWER_BASE_REGEN_PER_PLANT + CONFIG.UPGRADES.power_plant.speed.perTier.regen * getTier(p, 'speed');
  return base * modMul('power.regenMul');
}

function effectiveConveyorSpeed() {
  return CONFIG.CONVEYOR.SPEED * modMul('conveyor.speedMul');
}

function recomputePowerMax() {
  let total = 0;
  for (const b of State.buildings) {
    if (b.type === 'power_plant') total += effectivePowerPlantMax(b);
  }
  State.power.max = total;
  State.power.stored = Math.min(State.power.stored, State.power.max);
}

// Clockwise output rotation for single-tile producers (harvester, plants).
// Each call starts from the building's current cursor, tries N→E→S→W; on the
// first successful push the cursor advances past that side so the next item
// goes to a different conveyor when one is available. Falls back to the next
// clockwise side immediately if the current one is full or absent, so a single
// blocked belt never stalls output when others are free.
const CW_DIRS = ['N', 'E', 'S', 'W'];
function pushToOutputConveyor(b, itemType) {
  if (b._outputCursor == null) b._outputCursor = 0;
  for (let i = 0; i < 4; i++) {
    const idx = (b._outputCursor + i) % 4;
    if (tryPushToTransport(b.x, b.y, CW_DIRS[idx], itemType)) {
      b._outputCursor = (idx + 1) % 4;
      return true;
    }
  }
  return false;
}

// HQ is multi-tile so we walk the perimeter clockwise (top→right→bot→left).
// For a size N HQ that's 4N candidate slots — each gets its own slot in the
// rotation, so item distribution stays uniform across every connected belt.
function hqPerimeterCandidates() {
  const h = State.hq;
  const out = [];
  const s = h.size;
  for (let dx = 0; dx < s; dx++)        out.push({ x: h.x + dx,     y: h.y,         dir: 'N' });
  for (let dy = 0; dy < s; dy++)        out.push({ x: h.x + s - 1, y: h.y + dy,    dir: 'E' });
  for (let dx = s - 1; dx >= 0; dx--)   out.push({ x: h.x + dx,     y: h.y + s - 1, dir: 'S' });
  for (let dy = s - 1; dy >= 0; dy--)   out.push({ x: h.x,          y: h.y + dy,    dir: 'W' });
  return out;
}
function pushFromHQ(itemType) {
  const h = State.hq;
  if (h._outputCursor == null) h._outputCursor = 0;
  const cands = hqPerimeterCandidates();
  for (let i = 0; i < cands.length; i++) {
    const idx = (h._outputCursor + i) % cands.length;
    const c = cands[idx];
    if (tryPushToTransport(c.x, c.y, c.dir, itemType)) {
      h._outputCursor = (idx + 1) % cands.length;
      return true;
    }
  }
  return false;
}

function updateHarvesters(dt) {
  for (const h of State.buildings) {
    if (h.type !== 'harvester') continue;
    if (!h.nodeRef || h.nodeRef.reserves <= 0) continue;
    const bufMax = effectiveHarvesterBuffer(h);
    if (h.buffer < bufMax) {
      h.cooldown -= dt;
      if (h.cooldown <= 0) {
        h.cooldown = effectiveHarvesterRate(h);
        h.buffer++;
        reduceNodeReserves(h.nodeRef, 1);
      }
    }
    if (h.buffer > 0 && pushToOutputConveyor(h, 'ore')) {
      h.buffer--;
    }
  }
}

function tryTransferConveyorItem(c) {
  const dv = DIRS[c.dir];
  const nx = c.x + dv.dx;
  const ny = c.y + dv.dy;
  // HQ accepts ore (manual harvest deposits)
  if (isHQTile(nx, ny)) {
    if (c.item.type === 'ore') {
      State.inventory.ore = (State.inventory.ore || 0) + 1;
      addFloater(c.x + 0.5, c.y + 0.3, '+1◆', CONFIG.COLORS.hq);
      c.item = null;
      return true;
    }
    return false;
  }
  // Buildings accept matching items into buffers
  const b = getBuildingAt(nx, ny);
  if (b) {
    if (deliverToBuilding(b, c.item.type, c.x, c.y)) {
      c.item = null;
      return true;
    }
    return false;
  }
  // Conveyor chain
  const nextConv = getConveyorAt(nx, ny);
  if (nextConv) {
    const sideFacingC = OPPOSITE[c.dir];
    if (nextConv.dir !== sideFacingC && !nextConv.item) {
      nextConv.item = { type: c.item.type, progress: 0 };
      c.item = null;
      return true;
    }
  }
  return false;
}

function deliverToBuilding(b, itemType, fromX, fromY) {
  const recipe = CONFIG.FACTORIES[b.type];
  if (recipe && recipe.inputType) {
    if (itemType !== recipe.inputType) return false;
    if ((b.inputBuffer || 0) >= effectiveBufferMax(b, 'inputBufferMax')) return false;
    b.inputBuffer = (b.inputBuffer || 0) + 1;
    return true;
  }
  if (b.type === 'gun_turret' || b.type === 'missile_turret') {
    const def = CONFIG.TURRETS[b.type];
    if (itemType !== def.ammo) return false;
    if ((b.ammoBuffer || 0) >= effectiveTurretAmmoMax(b)) return false;
    b.ammoBuffer = (b.ammoBuffer || 0) + 1;
    return true;
  }
  if (b.type === 'splitter') {
    // Accept only from the input side (opposite of dir)
    const side = sideOfBuilding(b, fromX, fromY);
    if (side !== OPPOSITE[b.dir]) return false;
    if (b.item) return false;
    b.item = { type: itemType };
    return true;
  }
  return false;
}

function updateConveyors(dt) {
  const S = State;
  const speed = effectiveConveyorSpeed();
  // Phase 1: advance progress once
  for (const c of S.conveyors) {
    if (c.item) c.item.progress = Math.min(1, c.item.progress + speed * dt);
  }
  // Phase 2: try transfers, multiple passes so chains resolve in one frame
  for (let pass = 0; pass < 6; pass++) {
    let any = false;
    for (const c of S.conveyors) {
      if (c.item && c.item.progress >= 1) {
        if (tryTransferConveyorItem(c)) any = true;
      }
    }
    if (!any) break;
  }
}

// Find a conveyor adjacent to ANY tile in `tiles` that accepts items.
function findOutputConveyorMulti(tiles) {
  for (const t of tiles) {
    const c = findOutputConveyor(t.x, t.y);
    if (c) return c;
  }
  return null;
}

function hqTiles() {
  const h = State.hq;
  const out = [];
  for (let dx = 0; dx < h.size; dx++)
    for (let dy = 0; dy < h.size; dy++)
      out.push({ x: h.x + dx, y: h.y + dy });
  return out;
}

function updateHQ(dt) {
  const h = State.hq;
  if (!h) return;
  // Field Repair modifier: passive HP regen
  const regen = modAdd('hq.regenRate');
  if (regen > 0 && h.hp > 0 && h.hp < h.maxHp) {
    h.hp = Math.min(h.maxHp, h.hp + regen * dt);
  }
  const r = CONFIG.HQ_RECIPE;
  const outputMax = effectiveBufferMax(h, 'outputBufferMax');
  if (h.plateBuffer == null) h.plateBuffer = 0;
  // Push plate to adjacent conveyor, rotating clockwise around the HQ perimeter
  if (h.plateBuffer > 0 && pushFromHQ(r.output)) {
    h.plateBuffer--;
  }
  // Process ore → plate
  if (!h.processing) {
    const canStart = (State.inventory.ore || 0) >= r.input.ore
      && h.plateBuffer < outputMax;
    if (canStart) {
      State.inventory.ore -= r.input.ore;
      h.processing = true;
      h.processTime = effectiveRecipeTime(h);
      h.totalTime = h.processTime;
    }
  } else {
    h.processTime -= dt;
    if (h.processTime <= 0) {
      h.plateBuffer = Math.min(outputMax, h.plateBuffer + r.outputAmount);
      h.processing = false;
    }
  }
}

function updateFactories(dt) {
  const S = State;
  for (const f of S.buildings) {
    const r = CONFIG.FACTORIES[f.type];
    if (r && r.inputType) {
      if (f.inputBuffer == null) f.inputBuffer = 0;
      if (f.outputBuffer == null) f.outputBuffer = 0;
      const outMax = effectiveBufferMax(f, 'outputBufferMax');
      // Push output to adjacent conveyor (one per tick), rotating clockwise
      if (f.outputBuffer > 0 && pushToOutputConveyor(f, r.outputType)) {
        f.outputBuffer--;
      }
      // Start a process if not working
      if (!f.working) {
        const canStart = f.inputBuffer >= r.inputAmount
          && f.outputBuffer + r.outputAmount <= outMax;
        if (canStart) {
          f.inputBuffer -= r.inputAmount;
          f.working = true;
          f.progress = effectiveRecipeTime(f);
          f.totalTime = f.progress;
        }
      } else {
        f.progress -= dt;
        if (f.progress <= 0) {
          const out = effectiveFactoryOutput(f);
          f.outputBuffer = Math.min(outMax, f.outputBuffer + out);
          f.working = false;
          f.progress = 0;
        }
      }
    } else if (f.type === 'power_plant') {
      // Only animate when actually contributing — pool not yet full.
      f._producing = S.power.stored < S.power.max && effectivePowerPlantRegen(f) > 0;
      if (f._producing) f.pulse = (f.pulse + dt) % 2.0;
    }
  }
  // Power regen: sum of per-plant regen, scaled by upgrades
  if (S.power.max > 0) {
    let totalRegen = 0;
    for (const b of S.buildings) {
      if (b.type === 'power_plant') totalRegen += effectivePowerPlantRegen(b);
    }
    if (totalRegen > 0) {
      S.power.stored = Math.min(S.power.max, S.power.stored + totalRegen * dt);
    }
  }
}

function updateLogistics(dt) {
  for (const b of State.buildings) {
    if (b.type === 'splitter') {
      if (!b.item) continue;
      const outs = perpendicularDirs(b.dir);
      // Try alternating output first, then fall back to the other
      for (let i = 0; i < 2; i++) {
        const dir = outs[(b.nextOutput + i) % 2];
        if (tryPushItem(b.x, b.y, dir, b.item.type)) {
          b.item = null;
          b.nextOutput = (b.nextOutput + i + 1) % 2;
          break;
        }
      }
    }
  }
}

// Replace a conveyor at the same tile with a splitter, preserving dir + carried item.
function convertConveyor(c, newType) {
  const cost = CONFIG.COSTS[newType];
  if (!canAfford(cost)) return false;
  spend(cost);
  State.conveyors = State.conveyors.filter(x => x !== c);
  const b = createBuilding(newType, c.x, c.y);
  b.dir = c.dir;
  if (c.item && newType === 'splitter') b.item = { type: c.item.type };
  State.buildings.push(b);
  Grid.setKey(c.x, c.y, 'building');
  State.selected = b;
  addFloater(c.x + 0.5, c.y + 0.4, '✓', CONFIG.COLORS.valid);
  Sound.placed();
  return true;
}

function updateTurrets(dt) {
  const S = State;
  for (const t of S.buildings) {
    const def = CONFIG.TURRETS[t.type];
    if (!def) continue;
    const tx = t.x + 0.5, ty = t.y + 0.5;
    const range = effectiveTurretRange(t);
    let nearest = null, nearestDist = Infinity;
    for (const e of S.enemies) {
      if (e._dead) continue;
      const dx = e.x - tx, dy = e.y - ty;
      const d = Math.hypot(dx, dy);
      if (d <= range && d < nearestDist) { nearest = e; nearestDist = d; }
    }
    t.target = nearest;
    if (nearest) t.aimAngle = Math.atan2(nearest.y - ty, nearest.x - tx);

    if (def.continuous) {
      if (nearest && S.power.stored >= def.ammoCost * dt) {
        S.power.stored -= def.ammoCost * dt;
        nearest.hp -= effectiveTurretDamage(t) * dt;
        t.firing = true;
        // Throttled laser buzz so the sound stays continuous-feeling but doesn't stack
        const nowSec = performance.now() / 1000;
        if (!t._soundT || nowSec - t._soundT > 0.13) {
          Sound.laserPulse();
          t._soundT = nowSec;
        }
        if (nearest.hp <= 0) killEnemy(nearest);
      } else {
        t.firing = false;
      }
    } else {
      if (t.ammoBuffer == null) t.ammoBuffer = 0;
      t.cooldown -= dt;
      if (nearest && t.cooldown <= 0 && t.ammoBuffer >= def.ammoCost) {
        t.ammoBuffer -= def.ammoCost;
        t.cooldown = effectiveTurretCooldown(t);
        if (t.type === 'gun_turret') Sound.gunShot();
        else if (t.type === 'missile_turret') Sound.missileShot();
        const angle = Math.atan2(nearest.y - ty, nearest.x - tx);
        const projSpeed = def.projectileSpeed * modMul('turret.projectileSpeedMul');
        S.projectiles.push({
          x: tx + Math.cos(angle) * 0.4,
          y: ty + Math.sin(angle) * 0.4,
          vx: Math.cos(angle) * projSpeed,
          vy: Math.sin(angle) * projSpeed,
          damage: effectiveTurretDamage(t),
          life: 3.0,
          color: def.projectileColor,
          target: def.homing ? nearest : null,
          homingSpeed: projSpeed,
          splash: def.splash || 0,
          trail: def.homing,
        });
      }
    }
  }
}

function updateProjectiles(dt) {
  const S = State;
  for (let i = S.projectiles.length - 1; i >= 0; i--) {
    const p = S.projectiles[i];
    if (p.target && !p.target._dead && p.target.hp > 0) {
      const dx = p.target.x - p.x, dy = p.target.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) {
        const desiredVx = (dx / d) * p.homingSpeed;
        const desiredVy = (dy / d) * p.homingSpeed;
        p.vx += (desiredVx - p.vx) * 5 * dt;
        p.vy += (desiredVy - p.vy) * 5 * dt;
      }
    } else {
      p.target = null;
    }
    if (p.trail && Math.random() < 0.6) {
      S.particles.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.3, color: p.color, size: 1.5 });
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;

    let hit = null;
    for (const e of S.enemies) {
      if (e._dead) continue;
      const dx = e.x - p.x, dy = e.y - p.y;
      if (Math.hypot(dx, dy) < e.size + 0.12) { hit = e; break; }
    }
    if (hit) {
      if (p.splash > 0) {
        for (const e of S.enemies) {
          if (e._dead) continue;
          const dx = e.x - p.x, dy = e.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d < p.splash) {
            const damage = p.damage * (1 - d / p.splash * 0.5);
            e.hp -= damage;
            if (e.hp <= 0) killEnemy(e);
          }
        }
        spawnParticles(p.x, p.y, p.color, 14, 4);
      } else {
        hit.hp -= p.damage;
        spawnParticles(p.x, p.y, p.color, 4, 2);
        if (hit.hp <= 0) killEnemy(hit);
      }
      S.projectiles.splice(i, 1);
    } else if (p.life <= 0 || !inBoundsWorld(p.x, p.y)) {
      S.projectiles.splice(i, 1);
    }
  }
}

function killEnemy(e) {
  if (e._dead) return;
  e._dead = true;
  const def = CONFIG.ENEMIES[e.type] || CONFIG.ENEMIES.grunt;
  spawnParticles(e.x, e.y, def.color, 12, 3);
  const reward = Math.max(1, Math.round(def.reward * modMul('enemy.rewardMul')));
  State.inventory.ore = (State.inventory.ore || 0) + reward;
  addFloater(e.x, e.y - 0.3, `+${reward}◆`, CONFIG.COLORS.node);
  Sound.enemyKilled();
}

function updateEnemies(dt) {
  const S = State;
  if (!S.hq) return;
  const hcx = S.hq.x + S.hq.size / 2;
  const hcy = S.hq.y + S.hq.size / 2;
  for (const e of S.enemies) {
    if (e._dead) continue;
    const def = CONFIG.ENEMIES[e.type] || CONFIG.ENEMIES.grunt;
    const dx = hcx - e.x, dy = hcy - e.y;
    const d = Math.hypot(dx, dy);
    if (d < S.hq.size / 2 + 0.3) {
      S.hq.hp -= def.damage * modMul('enemy.hqDamageMul');
      e._dead = true;
      spawnParticles(e.x, e.y, def.color, 14, 4);
      addFloater(hcx, hcy - 0.5, `-${def.damage}`, def.color);
      if (!S.gameOver) Sound.hqDamage();
      if (S.hq.hp <= 0) {
        S.hq.hp = 0;
        if (!S.gameOver) { S.gameOver = true; Sound.gameOver(); }
      }
      continue;
    }
    e.vx = (dx / d) * e.speed;
    e.vy = (dy / d) * e.speed;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }
  S.enemies = S.enemies.filter(e => !e._dead);
}

function updateParticles(dt) {
  const S = State;
  for (let i = S.particles.length - 1; i >= 0; i--) {
    const p = S.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= dt;
    if (p.life <= 0) S.particles.splice(i, 1);
  }
  for (let i = S.floaters.length - 1; i >= 0; i--) {
    const f = S.floaters[i];
    f.y += f.vy * dt;
    f.vy *= 0.95;
    f.life -= dt;
    if (f.life <= 0) S.floaters.splice(i, 1);
  }
}

function updatePickups(dt) {
  const S = State;
  for (let i = S.pickups.length - 1; i >= 0; i--) {
    const p = S.pickups[i];
    if (p.dragging) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.86;
    p.vy *= 0.86;
    if (p.life == null) p.life = 18;
    p.life -= dt;
    if (p.life <= 0) S.pickups.splice(i, 1);
  }
}

// ---------- WAVES ----------
function startWave() {
  const S = State;
  S.wavePhase = 'active';
  let count = CONFIG.WAVE.BASE_ENEMIES + (S.round - 1) * CONFIG.WAVE.ENEMIES_PER_ROUND;
  count = Math.max(1, Math.round(count * modMul('wave.enemyCountMul')));
  S.enemiesRemainingToSpawn = count;
  S.spawnTimer = 0;
  Sound.waveStart();
}

function pickEnemyType(round) {
  const eligible = [];
  for (const id in CONFIG.ENEMIES) {
    const def = CONFIG.ENEMIES[id];
    if (round >= def.unlockRound) eligible.push({ id, w: def.weight || 1 });
  }
  if (!eligible.length) return 'grunt';
  const total = eligible.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total;
  for (const e of eligible) {
    r -= e.w;
    if (r <= 0) return e.id;
  }
  return eligible[eligible.length - 1].id;
}

function spawnEnemy() {
  const S = State;
  const typeId = pickEnemyType(S.round);
  const def = CONFIG.ENEMIES[typeId];
  const baseHp = CONFIG.WAVE.BASE_HP + (S.round - 1) * CONFIG.WAVE.HP_PER_ROUND;
  const baseSpeed = CONFIG.WAVE.BASE_SPEED + (S.round - 1) * CONFIG.WAVE.SPEED_PER_ROUND;
  const hp = baseHp * def.hpMul * modMul('enemy.hpMul');
  // Round 1 grace: enemies crawl so new players have time to react
  const roundMul = S.round === 1 ? 0.4 : 1;
  const speed = baseSpeed * def.speedMul * modMul('enemy.speedMul') * roundMul;
  const size = CONFIG.WAVE.ENEMY_SIZE * def.sizeMul;
  const angle = Math.random() * Math.PI * 2;
  const r = S.mapRadius;
  const hcx = S.hq.x + S.hq.size / 2;
  const hcy = S.hq.y + S.hq.size / 2;
  S.enemies.push({
    type: typeId,
    x: hcx + Math.cos(angle) * r,
    y: hcy + Math.sin(angle) * r,
    hp, maxHp: hp, speed, size,
    vx: 0, vy: 0,
  });
}

function updateWaves(dt) {
  const S = State;
  if (S.gameOver) return;
  if (S.wavePhase === 'prep' || S.wavePhase === 'between') {
    S.waveTimer -= dt;
    if (S.waveTimer <= 0) startWave();
  } else if (S.wavePhase === 'active') {
    if (S.enemiesRemainingToSpawn > 0) {
      S.spawnTimer -= dt;
      if (S.spawnTimer <= 0) {
        spawnEnemy();
        S.enemiesRemainingToSpawn--;
        S.spawnTimer = Math.max(0.2, CONFIG.WAVE.SPAWN_INTERVAL * modMul('wave.spawnIntervalMul'));
      }
    } else if (S.enemies.length === 0) {
      // wave cleared
      S.round++;
      expandMap();
      S.wavePhase = 'between';
      S.waveTimer = CONFIG.WAVE.BETWEEN_TIME;
      const healAmt = Math.min(CONFIG.WAVE.HQ_HEAL_PER_WAVE, S.hq.maxHp - S.hq.hp);
      if (healAmt > 0) {
        S.hq.hp += healAmt;
        addFloater(S.hq.x + S.hq.size / 2, S.hq.y - 1.1, `+${healAmt} HP`, CONFIG.COLORS.valid);
      }
      addFloater(S.hq.x + S.hq.size / 2, S.hq.y - 0.5, `WAVE CLEAR`, CONFIG.COLORS.valid);
      Sound.waveClear();
      // Offer the player two random modifiers and pause the game until they choose
      triggerModifierPick();
    }
  }
}
