// World generation: HQ placement and resource node distribution

function generateWorld() {
  const S = State;
  S.hq = {
    type: 'hq',
    x: -1, y: -1,
    hp: CONFIG.HQ_HP, maxHp: CONFIG.HQ_HP, size: CONFIG.HQ_SIZE,
    plateBuffer: CONFIG.HQ_RECIPE.startingPlates,
    processing: false, processTime: 0,
    upgrades: { speed: 0, storage: 0 },
  };
  S.resourceNodes = [];
  S.obstacles = [];
  S.buildings = [];
  S.conveyors = [];
  S.enemies = [];
  S.projectiles = [];
  S.pickups = [];
  S.particles = [];
  S.floaters = [];
  S.inventory = { ore: 0 };
  S.power = { stored: 0, max: 0, drawRate: 0 };
  S.mapRadius = CONFIG.INITIAL_RADIUS;
  S.round = 1;
  S.wavePhase = 'prep';
  S.waveTimer = CONFIG.WAVE.PREP_TIME;
  S.enemiesRemainingToSpawn = 0;
  S.spawnTimer = 0;
  S.tool = null;
  S.selected = null;
  S.gameOver = false;
  S.paused = false;
  S.camera.manual = false;
  S.modifiers = {};
  S.modifierPick = null;
  S.devInvincible = false;
  S.devUsed = false;
  if (typeof Input !== 'undefined' && Input.refreshDevBadge) Input.refreshDevBadge();

  spawnInitialNodes(CONFIG.RESOURCE_NODE.INITIAL);
  for (let i = 0; i < CONFIG.OBSTACLE.INITIAL; i++) addRandomObstacle();
  Grid.rebuild();
}

function spawnInitialNodes(count) {
  for (let i = 0; i < count; i++) addRandomResourceNode();
}

function addRandomObstacle() {
  const S = State;
  const O = CONFIG.OBSTACLE;
  for (let t = 0; t < 40; t++) {
    const r = O.MIN_DIST_FROM_HQ + Math.random() * (S.mapRadius - O.MIN_DIST_FROM_HQ);
    const a = Math.random() * Math.PI * 2;
    const cx = S.hq.x + S.hq.size / 2;
    const cy = S.hq.y + S.hq.size / 2;
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    if (!inBounds(x, y)) continue;
    if (Grid.byKey(x, y)) continue;
    let bad = false;
    for (const n of S.resourceNodes) {
      if (Math.hypot(n.x - x, n.y - y) < O.MIN_DIST_FROM_NODE) { bad = true; break; }
    }
    if (bad) continue;
    for (const o of S.obstacles) {
      if (Math.hypot(o.x - x, o.y - y) < O.MIN_DIST_FROM_OBSTACLE) { bad = true; break; }
    }
    if (bad) continue;
    S.obstacles.push({ x, y, seed: Math.random() });
    Grid.setKey(x, y, 'obstacle');
    return true;
  }
  return false;
}

function addRandomResourceNode() {
  const S = State;
  const tries = 40;
  for (let t = 0; t < tries; t++) {
    // pick random angle/radius within bounds
    const r = (CONFIG.RESOURCE_NODE.MIN_DIST_FROM_HQ + 0.5)
      + Math.random() * (S.mapRadius - CONFIG.RESOURCE_NODE.MIN_DIST_FROM_HQ - 1);
    const a = Math.random() * Math.PI * 2;
    const cx = S.hq.x + S.hq.size / 2;
    const cy = S.hq.y + S.hq.size / 2;
    const x = Math.round(cx + Math.cos(a) * r);
    const y = Math.round(cy + Math.sin(a) * r);
    if (!inBounds(x, y)) continue;
    if (Grid.byKey(x, y)) continue;
    // distance from other nodes
    let tooClose = false;
    for (const n of S.resourceNodes) {
      const dx = n.x - x, dy = n.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < CONFIG.RESOURCE_NODE.MIN_DIST_FROM_NODE) { tooClose = true; break; }
    }
    if (tooClose) continue;
    const cap = CONFIG.RESOURCE_NODE.CAPACITY * (typeof modMul === 'function' ? modMul('node.capacityMul') : 1);
    S.resourceNodes.push({ x, y, reserves: cap, maxReserves: cap });
    Grid.setKey(x, y, 'node');
    return true;
  }
  return false;
}

function expandMap() {
  State.mapRadius = Math.min(State.mapRadius + CONFIG.RADIUS_GROWTH, CONFIG.MAX_RADIUS);
  for (let i = 0; i < CONFIG.RESOURCE_NODE.PER_ROUND; i++) addRandomResourceNode();
  for (let i = 0; i < CONFIG.OBSTACLE.PER_ROUND; i++) addRandomObstacle();
}

// Auto-fit camera (no-op if user has taken manual control).
function computeCameraScale(canvasW, canvasH) {
  if (State.camera.manual) return;
  const margin = 80;
  const diameter = (State.mapRadius * 2 + 2) * CONFIG.TILE;
  const scaleX = (canvasW - margin) / diameter;
  const scaleY = (canvasH - margin * 2) / diameter;
  State.camera.scale = Math.max(0.4, Math.min(scaleX, scaleY, 1.8));
  if (State.hq) {
    State.camera.x = State.hq.x + State.hq.size / 2;
    State.camera.y = State.hq.y + State.hq.size / 2;
  }
}

function resetView() {
  State.camera.manual = false;
}

function worldToScreen(wx, wy, canvasW, canvasH) {
  const s = State.camera.scale * CONFIG.TILE;
  return {
    x: (wx - State.camera.x) * s + canvasW / 2,
    y: (wy - State.camera.y) * s + canvasH / 2,
  };
}

function screenToWorld(sx, sy, canvasW, canvasH) {
  const s = State.camera.scale * CONFIG.TILE;
  return {
    x: (sx - canvasW / 2) / s + State.camera.x,
    y: (sy - canvasH / 2) / s + State.camera.y,
  };
}

// Keep camera within a sensible bound around the HQ so the player can't pan to nowhere.
function clampCamera() {
  if (!State.hq) return;
  const hcx = State.hq.x + State.hq.size / 2;
  const hcy = State.hq.y + State.hq.size / 2;
  const maxDist = State.mapRadius + 6;
  const dx = State.camera.x - hcx;
  const dy = State.camera.y - hcy;
  const d = Math.hypot(dx, dy);
  if (d > maxDist) {
    State.camera.x = hcx + dx / d * maxDist;
    State.camera.y = hcy + dy / d * maxDist;
  }
  const c = State.camera;
  if (c.scale < c.minScale) c.scale = c.minScale;
  if (c.scale > c.maxScale) c.scale = c.maxScale;
}
