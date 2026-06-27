// Global game state singleton + helpers
const State = {
  // Camera — view center in WORLD tile coords, scale is tiles-per-CONFIG.TILE-pixels
  // manual=true once user has panned/zoomed; suppresses auto-fit until they tap Reset View
  camera: { x: 0, y: 0, scale: 1, manual: false, minScale: 0.25, maxScale: 3.5 },

  // Map
  mapRadius: CONFIG.INITIAL_RADIUS,

  // Round / wave
  round: 1,
  wavePhase: 'prep',          // 'prep' | 'active' | 'between'
  waveTimer: CONFIG.WAVE.PREP_TIME,
  enemiesRemainingToSpawn: 0,
  spawnTimer: 0,

  // Player resources
  inventory: { ore: 20, bullet: 30, missile: 0 },
  power: { stored: 0, max: 0, drawRate: 0 }, // stored grows from generation, max from power_plants

  // Build/selection state
  tool: null,                  // string id or null
  selected: null,              // selected entity (for inspection / demolish)
  conveyorDrag: null,          // {startX, startY, currentX, currentY, path}

  // World entities — each carries its grid coords (x,y) for 1x1, plus 'tag' as the building type
  hq: null,                    // {x,y,hp,maxHp,size}
  resourceNodes: [],           // {x,y,reserves}
  obstacles: [],               // {x,y,seed}  indestructible terrain
  buildings: [],               // generic list of placed buildings: {x,y,type,...}
  conveyors: [],               // {x,y,dir,items:[{type,progress}]}  dir: 'N'|'S'|'E'|'W'
  enemies: [],                 // {x,y,hp,maxHp,speed,size,vx,vy}
  projectiles: [],             // {x,y,vx,vy,damage,target?,homing,splash}
  pickups: [],                 // {x,y,type,vx,vy,dragging}  world coords (float)
  particles: [],               // {x,y,vx,vy,life,color,size}
  floaters: [],                // {x,y,text,color,life,vy}

  // Input
  // wx/wy default to NaN so a phantom build-preview can't render before the pointer
  // has actually moved over the canvas.
  pointer: { x: 0, y: 0, wx: NaN, wy: NaN, down: false, draggingPickup: null, downAt: 0, overCanvas: false },

  // Flags
  gameOver: false,
  paused: false,
};

// Build a grid lookup that maps "x,y" → building/conveyor for fast tile checks.
// Rebuild on placement/demolish (small N so cheap).
const Grid = {
  occupied: new Map(),         // key "x,y" → 'building' | 'conveyor' | 'hq' | 'node'
  byKey(x, y) { return this.occupied.get(`${x},${y}`); },
  setKey(x, y, val) { this.occupied.set(`${x},${y}`, val); },
  clearKey(x, y) { this.occupied.delete(`${x},${y}`); },
  rebuild() {
    this.occupied.clear();
    const s = State;
    if (s.hq) {
      for (let dx = 0; dx < s.hq.size; dx++)
        for (let dy = 0; dy < s.hq.size; dy++)
          this.setKey(s.hq.x + dx, s.hq.y + dy, 'hq');
    }
    for (const o of s.obstacles) this.setKey(o.x, o.y, 'obstacle');
    for (const n of s.resourceNodes) this.setKey(n.x, n.y, 'node');
    for (const b of s.buildings) this.setKey(b.x, b.y, 'building');
    for (const c of s.conveyors) this.setKey(c.x, c.y, 'conveyor');
  },
};

// Helpers shared across modules
function inBounds(x, y) {
  const r = State.mapRadius;
  const cx = State.hq ? State.hq.x + 0.5 : 0;
  const cy = State.hq ? State.hq.y + 0.5 : 0;
  const dx = (x + 0.5) - cx;
  const dy = (y + 0.5) - cy;
  return Math.sqrt(dx * dx + dy * dy) <= r;
}

function inBoundsWorld(wx, wy) {
  const r = State.mapRadius;
  const cx = State.hq ? State.hq.x + State.hq.size / 2 : 0;
  const cy = State.hq ? State.hq.y + State.hq.size / 2 : 0;
  const dx = wx - cx;
  const dy = wy - cy;
  return Math.sqrt(dx * dx + dy * dy) <= r;
}

function canAfford(cost) {
  for (const k in cost) if ((State.inventory[k] || 0) < cost[k]) return false;
  return true;
}

function spend(cost) {
  for (const k in cost) State.inventory[k] = (State.inventory[k] || 0) - cost[k];
}

function refund(cost, fraction = 0.5) {
  for (const k in cost) State.inventory[k] = (State.inventory[k] || 0) + Math.floor(cost[k] * fraction);
}

function addFloater(x, y, text, color = '#fff') {
  State.floaters.push({ x, y, text, color, life: 1.2, vy: -1.0 });
}

function spawnParticles(x, y, color, count = 8, speed = 3) {
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = (0.3 + Math.random() * 0.7) * speed;
    State.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.4 + Math.random() * 0.4, color, size: 1 + Math.random() * 2,
    });
  }
}
