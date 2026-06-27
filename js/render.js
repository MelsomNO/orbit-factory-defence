// Canvas rendering
const Render = {
  canvas: null,
  ctx: null,
  dpr: 1,
  w: 0, h: 0,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    this.dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    this.w = this.canvas.clientWidth;
    this.h = this.canvas.clientHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    computeCameraScale(this.w, this.h);
  },

  // Convert world tile (x,y) to screen pixel
  wts(wx, wy) { return worldToScreen(wx, wy, this.w, this.h); },
  tile() { return State.camera.scale * CONFIG.TILE; },

  drawFrame() {
    const ctx = this.ctx;
    const W = this.w, H = this.h;
    computeCameraScale(W, H);

    ctx.clearRect(0, 0, W, H);
    this.drawPlayfield();
    this.drawGrid();
    this.drawObstacles();
    this.drawResourceNodes();
    this.drawConveyors();
    this.drawHQ();
    this.drawBuildings();
    this.drawProjectiles();
    this.drawEnemies();
    this.drawLasers();
    this.drawPickups();
    this.drawParticles();
    this.drawBuildPreview();
    this.drawFloaters();
    this.drawRangeOverlay();
    this.drawSelectionHighlight();
  },

  drawSelectionHighlight() {
    const sel = State.selected;
    if (!sel) return;
    const ctx = this.ctx;
    const t = this.tile();
    let x, y, w, h;
    if (sel === State.hq) { x = sel.x; y = sel.y; w = sel.size; h = sel.size; }
    else if (sel.type) { x = sel.x; y = sel.y; w = 1; h = 1; }
    else return;
    const p = this.wts(x, y);
    ctx.save();
    ctx.strokeStyle = CONFIG.COLORS.selected;
    ctx.lineWidth = 2;
    ctx.shadowColor = CONFIG.COLORS.selected;
    ctx.shadowBlur = 8;
    const dash = (performance.now() / 90) % 12;
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -dash;
    ctx.strokeRect(p.x + 1, p.y + 1, w * t - 2, h * t - 2);
    ctx.restore();
  },

  drawPlayfield() {
    const ctx = this.ctx;
    const r = State.mapRadius * this.tile();
    const c = this.wts(State.hq.x + State.hq.size / 2, State.hq.y + State.hq.size / 2);
    // outer ring
    ctx.save();
    const grd = ctx.createRadialGradient(c.x, c.y, r * 0.3, c.x, c.y, r);
    grd.addColorStop(0, 'rgba(40, 50, 100, 0.18)');
    grd.addColorStop(0.7, 'rgba(15, 20, 50, 0.12)');
    grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    // boundary
    ctx.strokeStyle = 'rgba(90, 247, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  },

  drawGrid() {
    const ctx = this.ctx;
    const t = this.tile();
    const c = this.wts(State.hq.x + State.hq.size / 2, State.hq.y + State.hq.size / 2);
    const r = State.mapRadius;
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * t, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = CONFIG.COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -r; i <= r + 1; i++) {
      const p1 = this.wts(State.hq.x + i, State.hq.y - r);
      const p2 = this.wts(State.hq.x + i, State.hq.y + r + 1);
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      const p3 = this.wts(State.hq.x - r, State.hq.y + i);
      const p4 = this.wts(State.hq.x + r + 1, State.hq.y + i);
      ctx.moveTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
    }
    ctx.stroke();
    ctx.restore();
  },

  drawHQ() {
    const ctx = this.ctx;
    const h = State.hq;
    const t = this.tile();
    const p = this.wts(h.x + h.size / 2, h.y + h.size / 2);
    const s = h.size * t;
    ctx.save();
    // glow
    const grd = ctx.createRadialGradient(p.x, p.y, s * 0.2, p.x, p.y, s * 0.9);
    grd.addColorStop(0, 'rgba(90,247,255,0.5)');
    grd.addColorStop(1, 'rgba(90,247,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2);
    // body
    ctx.fillStyle = '#1a2540';
    ctx.strokeStyle = CONFIG.COLORS.hq;
    ctx.lineWidth = 2;
    roundRect(ctx, p.x - s * 0.45, p.y - s * 0.45, s * 0.9, s * 0.9, 4, true, true);
    // inner cross / star
    ctx.fillStyle = CONFIG.COLORS.hq;
    ctx.beginPath();
    ctx.arc(p.x, p.y, s * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = CONFIG.COLORS.hqCore;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x - s * 0.3, p.y); ctx.lineTo(p.x + s * 0.3, p.y);
    ctx.moveTo(p.x, p.y - s * 0.3); ctx.lineTo(p.x, p.y + s * 0.3);
    ctx.stroke();
    // HP bar above
    const barW = s * 0.85;
    const barH = 4;
    const bx = p.x - barW / 2;
    const by = p.y - s * 0.5 - barH - 4;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle = h.hp > h.maxHp * 0.4 ? CONFIG.COLORS.valid : (h.hp > h.maxHp * 0.2 ? CONFIG.COLORS.node : CONFIG.COLORS.blocked);
    ctx.fillRect(bx, by, barW * (h.hp / h.maxHp), barH);
    // upgrade stars (above HP bar)
    this.drawUpgradeStars(ctx, p.x, by - 6, h);
    // plate output buffer indicator (vertical stack on right side of HQ)
    const plateMax = effectiveBufferMax(h, 'outputBufferMax');
    drawBufferPips(ctx, p.x + s * 0.32, p.y - s * 0.36, h.plateBuffer || 0, plateMax, CONFIG.ITEMS.plate.color, 5, true);
    // processing pulse
    if (h.processing) {
      const frac = h.totalTime ? 1 - h.processTime / h.totalTime : 0;
      ctx.strokeStyle = CONFIG.ITEMS.plate.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, s * 0.55, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  },

  drawObstacles() {
    const ctx = this.ctx;
    const t = this.tile();
    for (const o of State.obstacles) {
      const p = this.wts(o.x + 0.5, o.y + 0.5);
      const sz = t * 0.46;
      ctx.save();
      // Irregular rock polygon — vertex radii vary deterministically by seed
      const verts = 8;
      ctx.fillStyle = '#3a3a48';
      ctx.strokeStyle = '#1a1a24';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < verts; i++) {
        const a = (i / verts) * Math.PI * 2;
        const r = sz * (0.72 + 0.22 * Math.sin(o.seed * 60 + i * 1.7) + 0.08 * Math.cos(o.seed * 30 - i * 0.9));
        const x = p.x + Math.cos(a) * r;
        const y = p.y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Inner highlight (faceted rock face)
      ctx.fillStyle = '#54546a';
      ctx.beginPath();
      ctx.moveTo(p.x - sz * 0.35, p.y - sz * 0.05);
      ctx.lineTo(p.x - sz * 0.05, p.y - sz * 0.4);
      ctx.lineTo(p.x + sz * 0.25, p.y - sz * 0.1);
      ctx.lineTo(p.x + sz * 0.0,  p.y + sz * 0.2);
      ctx.closePath();
      ctx.fill();
      // Crack line
      ctx.strokeStyle = '#15151e';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(p.x - sz * 0.3, p.y + sz * 0.1);
      ctx.lineTo(p.x - sz * 0.05, p.y + sz * 0.05);
      ctx.lineTo(p.x + sz * 0.15, p.y + sz * 0.32);
      ctx.stroke();
      ctx.restore();
    }
  },

  drawResourceNodes() {
    const ctx = this.ctx;
    const t = this.tile();
    for (const n of State.resourceNodes) {
      const p = this.wts(n.x + 0.5, n.y + 0.5);
      const sz = t * 0.42;
      ctx.save();
      // diamond cluster
      ctx.fillStyle = CONFIG.COLORS.node;
      ctx.strokeStyle = '#603018';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - sz);
      ctx.lineTo(p.x + sz, p.y);
      ctx.lineTo(p.x, p.y + sz);
      ctx.lineTo(p.x - sz, p.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // inner glow
      ctx.fillStyle = '#fff8e0';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(p.x - sz * 0.2, p.y - sz * 0.2, sz * 0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      // reserve indicator below
      const frac = n.reserves / (n.maxReserves || CONFIG.RESOURCE_NODE.CAPACITY);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(p.x - sz, p.y + sz + 2, sz * 2, 2);
      ctx.fillStyle = CONFIG.COLORS.node;
      ctx.fillRect(p.x - sz, p.y + sz + 2, sz * 2 * frac, 2);
      ctx.restore();
    }
  },

  drawConveyors() {
    const ctx = this.ctx;
    const t = this.tile();
    const beltHalf = t * 0.36;            // half-width of the belt surface
    const outerHalf = beltHalf + Math.max(2, t * 0.06); // dark border / rail
    if (!State._chevronT) State._chevronT = 0;
    if (!State.paused && !State.gameOver) State._chevronT += (performance.now() - (State._chevronLast || performance.now())) / 1000;
    State._chevronLast = performance.now();
    const scroll = (State._chevronT * CONFIG.CONVEYOR.SPEED * 0.35) % 1;
    ctx.save();
    // PASS 1: tracks + chevrons. Compute connectivity / corner-pair once and stash so PASS 2
    // doesn't redo the work.
    const isCorner = new Array(State.conveyors.length);
    const sidesArr = new Array(State.conveyors.length);
    for (let i = 0; i < State.conveyors.length; i++) {
      const c = State.conveyors[i];
      const p = this.wts(c.x + 0.5, c.y + 0.5);
      const conn = getConveyorConnections(c);
      const sides = ['N', 'S', 'E', 'W'].filter(s => conn[s]);
      sidesArr[i] = sides;
      const corner = sides.length === 2 && OPPOSITE[sides[0]] !== sides[1];
      isCorner[i] = corner;
      if (corner) {
        this.drawCornerConveyorBg(p, t, beltHalf, outerHalf, sides, c, scroll);
      } else {
        ctx.fillStyle = '#16162a';
        this.fillConveyorArms(p, t, outerHalf, conn);
        ctx.fillStyle = '#34344c';
        this.fillConveyorArms(p, t, beltHalf, conn);
        this.drawConveyorChevrons(p, t, c.dir, beltHalf, scroll);
      }
    }
    // PASS 2: items drawn last so the neighbor's track never paints over them as they
    // cross the tile boundary mid-transfer.
    for (let i = 0; i < State.conveyors.length; i++) {
      const c = State.conveyors[i];
      if (!c.item) continue;
      const p = this.wts(c.x + 0.5, c.y + 0.5);
      if (isCorner[i]) {
        this.drawCornerConveyorItem(p, t, sidesArr[i], c);
      } else {
        const dv = DIRS[c.dir];
        // travel from -halfTile to +halfTile (full tile edge to edge) so the position is
        // continuous across the A.front → B.back hand-off
        const ix = p.x + dv.dx * (c.item.progress - 0.5) * t;
        const iy = p.y + dv.dy * (c.item.progress - 0.5) * t;
        const angle = Math.atan2(dv.dy, dv.dx);
        Render.drawItem(ctx, ix, iy, c.item.type, t * 0.2, angle);
      }
    }
    ctx.restore();
  },

  // Quarter-circle corner geometry — shared between bg/chevron pass and item pass.
  cornerArcGeom(p, tilePx, sides, outputDir) {
    const halfTile = tilePx / 2;
    const dvA = DIRS[sides[0]];
    const dvB = DIRS[sides[1]];
    const cornerX = p.x + (dvA.dx + dvB.dx) * halfTile;
    const cornerY = p.y + (dvA.dy + dvB.dy) * halfTile;
    const angleA = Math.atan2(-dvB.dy, -dvB.dx);
    const angleB = Math.atan2(-dvA.dy, -dvA.dx);
    const inputSide = sides[0] === outputDir ? sides[1] : sides[0];
    const dvIn  = DIRS[inputSide];
    const dvOut = DIRS[outputDir];
    const angleIn  = Math.atan2(-dvOut.dy, -dvOut.dx);
    const angleOut = Math.atan2(-dvIn.dy,  -dvIn.dx);
    let sweep = angleOut - angleIn;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;
    return { halfTile, cornerX, cornerY, angleA, angleB, angleIn, sweep, tangentSign: sweep > 0 ? 1 : -1 };
  },

  drawCornerConveyorBg(p, tilePx, beltHalf, outerHalf, sides, c, scroll) {
    const ctx = this.ctx;
    const g = this.cornerArcGeom(p, tilePx, sides, c.dir);
    const diff = ((g.angleB - g.angleA) + 2 * Math.PI) % (2 * Math.PI);
    const ccw = diff > Math.PI;
    const drawBand = (rOuter, rInner, fill) => {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.arc(g.cornerX, g.cornerY, rOuter, g.angleA, g.angleB, ccw);
      ctx.arc(g.cornerX, g.cornerY, Math.max(0.5, rInner), g.angleB, g.angleA, !ccw);
      ctx.closePath();
      ctx.fill();
    };
    drawBand(g.halfTile + outerHalf, g.halfTile - outerHalf, '#16162a');
    drawBand(g.halfTile + beltHalf,  g.halfTile - beltHalf,  '#34344c');

    const chevW = beltHalf * 0.6;
    const chevD = beltHalf * 0.4;
    ctx.strokeStyle = '#8aa0c4';
    ctx.lineWidth = Math.max(1.4, tilePx * 0.05);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const count = 3;
    for (let i = 0; i < count; i++) {
      const f = ((i / count) + scroll) % 1;
      const angle = g.angleIn + g.sweep * f;
      const cx = g.cornerX + g.halfTile * Math.cos(angle);
      const cy = g.cornerY + g.halfTile * Math.sin(angle);
      const fx = -Math.sin(angle) * g.tangentSign;
      const fy =  Math.cos(angle) * g.tangentSign;
      const perpX = -fy, perpY = fx;
      ctx.beginPath();
      ctx.moveTo(cx - fx * chevD + perpX * chevW, cy - fy * chevD + perpY * chevW);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx - fx * chevD - perpX * chevW, cy - fy * chevD - perpY * chevW);
      ctx.stroke();
    }
  },

  drawCornerConveyorItem(p, tilePx, sides, c) {
    const ctx = this.ctx;
    const g = this.cornerArcGeom(p, tilePx, sides, c.dir);
    const angle = g.angleIn + g.sweep * c.item.progress;
    const ix = g.cornerX + g.halfTile * Math.cos(angle);
    const iy = g.cornerY + g.halfTile * Math.sin(angle);
    const fx = -Math.sin(angle) * g.tangentSign;
    const fy =  Math.cos(angle) * g.tangentSign;
    Render.drawItem(ctx, ix, iy, c.item.type, tilePx * 0.2, Math.atan2(fy, fx));
  },

  // Fill a center square + an arm extending from center to the tile edge for each connected side.
  // armLen is the distance from inner edge of center square to the tile edge so that two adjacent
  // conveyors using the same beltHalf produce a perfectly seamless joint.
  fillConveyorArms(p, tilePx, halfWidth, conn) {
    const ctx = this.ctx;
    const armLen = tilePx / 2 - halfWidth;
    ctx.fillRect(p.x - halfWidth, p.y - halfWidth, halfWidth * 2, halfWidth * 2);
    if (conn.E) ctx.fillRect(p.x + halfWidth, p.y - halfWidth, armLen, halfWidth * 2);
    if (conn.W) ctx.fillRect(p.x - halfWidth - armLen, p.y - halfWidth, armLen, halfWidth * 2);
    if (conn.S) ctx.fillRect(p.x - halfWidth, p.y + halfWidth, halfWidth * 2, armLen);
    if (conn.N) ctx.fillRect(p.x - halfWidth, p.y - halfWidth - armLen, halfWidth * 2, armLen);
  },

  // Three chevrons scrolling along the flow direction from back of the tile to the front.
  drawConveyorChevrons(p, tilePx, dir, halfWidth, scroll) {
    const ctx = this.ctx;
    const dv = DIRS[dir];
    const perp = { dx: -dv.dy, dy: dv.dx };
    const chevW = halfWidth * 0.7;
    const chevD = halfWidth * 0.45;
    ctx.strokeStyle = '#8aa0c4';
    ctx.lineWidth = Math.max(1.4, tilePx * 0.05);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const count = 3;
    for (let i = 0; i < count; i++) {
      let f = (i / count + scroll) % 1;          // 0 = back edge, 1 = front edge
      const along = (f - 0.5) * tilePx;          // distance from center along flow axis
      const cx = p.x + dv.dx * along;
      const cy = p.y + dv.dy * along;
      ctx.beginPath();
      ctx.moveTo(cx - dv.dx * chevD + perp.dx * chevW, cy - dv.dy * chevD + perp.dy * chevW);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx - dv.dx * chevD - perp.dx * chevW, cy - dv.dy * chevD - perp.dy * chevW);
      ctx.stroke();
    }
  },

  drawBuildings() {
    const ctx = this.ctx;
    const t = this.tile();
    for (const b of State.buildings) {
      const p = this.wts(b.x + 0.5, b.y + 0.5);
      const sz = t * 0.42;
      ctx.save();
      switch (b.type) {
        case 'harvester': this.drawHarvester(ctx, p, sz, b); break;
        case 'refinery': this.drawFactory(ctx, p, sz, b, 'R', '#80d0e0'); break;
        case 'bullet_plant': this.drawFactory(ctx, p, sz, b, 'B', '#c0c0d0'); break;
        case 'missile_plant': this.drawFactory(ctx, p, sz, b, 'M', '#ff8050'); break;
        case 'power_plant': this.drawPowerPlant(ctx, p, sz, b); break;
        case 'gun_turret': this.drawTurret(ctx, p, sz, b, '#c0c0d0', 'gun'); break;
        case 'missile_turret': this.drawTurret(ctx, p, sz, b, '#ff8050', 'missile'); break;
        case 'laser_turret': this.drawTurret(ctx, p, sz, b, '#ffe040', 'laser'); break;
        case 'splitter': this.drawSplitter(ctx, p, sz, b); break;
      }
      this.drawUpgradeStars(ctx, p.x, p.y - sz - 3, b);
      ctx.restore();
    }
  },

  // Cyan stars above building: speed (filled cyan) + storage (filled amber). One color per upgrade type so you can read tier breakdown at a glance.
  drawUpgradeStars(ctx, cx, bottomY, b) {
    const key = b === State.hq ? 'hq' : b.type;
    const def = CONFIG.UPGRADES[key];
    if (!def || !b.upgrades) return;
    const speed = b.upgrades.speed || 0;
    const storage = b.upgrades.storage || 0;
    if (speed + storage === 0) return;
    const fontSize = Math.max(8, this.tile() * 0.24);
    ctx.save();
    ctx.font = `bold ${fontSize}px "Segoe UI Symbol", "Apple Color Emoji", monospace`;
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 3;
    const speedStr = '★'.repeat(speed);
    const storageStr = '★'.repeat(storage);
    const speedW = ctx.measureText(speedStr).width;
    const storageW = ctx.measureText(storageStr).width;
    const gap = (speed && storage) ? fontSize * 0.25 : 0;
    const totalW = speedW + storageW + gap;
    let x = cx - totalW / 2;
    ctx.textAlign = 'left';
    if (speed) {
      ctx.fillStyle = '#5af7ff';
      ctx.fillText(speedStr, x, bottomY);
      x += speedW + gap;
    }
    if (storage) {
      ctx.fillStyle = '#ffc850';
      ctx.fillText(storageStr, x, bottomY);
    }
    ctx.restore();
  },

  drawHarvester(ctx, p, sz, b) {
    // hexagon over the resource diamond
    ctx.strokeStyle = '#80c0ff';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(40,80,140,0.55)';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3 - Math.PI / 2;
      const x = p.x + Math.cos(a) * sz;
      const y = p.y + Math.sin(a) * sz;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // rotating internal cog
    const angle = (performance.now() / 800) % (Math.PI * 2);
    ctx.strokeStyle = '#a0d0ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = angle + i * (Math.PI * 2 / 3);
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(a) * sz * 0.5, p.y + Math.sin(a) * sz * 0.5);
    }
    ctx.stroke();
    // buffer indicator
    if (b.buffer > 0) {
      ctx.fillStyle = CONFIG.COLORS.node;
      ctx.font = `${Math.max(8, sz * 0.4)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${b.buffer}`, p.x + sz * 0.8, p.y - sz * 0.8);
    }
  },

  drawFactory(ctx, p, sz, b, letter, color) {
    ctx.fillStyle = '#1a1a30';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    roundRect(ctx, p.x - sz, p.y - sz, sz * 2, sz * 2, 3, true, true);
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.max(10, sz * 1.0)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, p.x, p.y);
    const recipe = CONFIG.FACTORIES[b.type];
    const inMax = effectiveBufferMax(b, 'inputBufferMax');
    const outMax = effectiveBufferMax(b, 'outputBufferMax');
    // input buffer pips (left edge)
    drawBufferPips(ctx, p.x - sz - 6, p.y - sz, b.inputBuffer || 0, inMax, CONFIG.ITEMS[recipe.inputType].color, 3, true);
    // output buffer pips (right edge)
    drawBufferPips(ctx, p.x + sz + 6, p.y - sz, b.outputBuffer || 0, outMax, CONFIG.ITEMS[recipe.outputType].color, 3, true);
    // progress bar
    if (b.working) {
      const w = sz * 1.6;
      const frac = b.totalTime ? 1 - b.progress / b.totalTime : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(p.x - w / 2, p.y + sz + 2, w, 3);
      ctx.fillStyle = color;
      ctx.fillRect(p.x - w / 2, p.y + sz + 2, w * frac, 3);
    }
  },

  drawPowerPlant(ctx, p, sz, b) {
    ctx.fillStyle = '#1a1a30';
    ctx.strokeStyle = CONFIG.COLORS.power;
    ctx.lineWidth = 2;
    roundRect(ctx, p.x - sz, p.y - sz, sz * 2, sz * 2, 3, true, true);
    // bolt
    ctx.fillStyle = CONFIG.COLORS.power;
    ctx.beginPath();
    ctx.moveTo(p.x - sz * 0.2, p.y - sz * 0.7);
    ctx.lineTo(p.x + sz * 0.3, p.y - sz * 0.05);
    ctx.lineTo(p.x - sz * 0.05, p.y - sz * 0.05);
    ctx.lineTo(p.x + sz * 0.2, p.y + sz * 0.7);
    ctx.lineTo(p.x - sz * 0.3, p.y + sz * 0.05);
    ctx.lineTo(p.x + sz * 0.05, p.y + sz * 0.05);
    ctx.closePath();
    ctx.fill();
    // pulse ring
    const pulse = (Math.sin(b.pulse * Math.PI) + 1) / 2;
    ctx.strokeStyle = `rgba(255, 224, 64, ${pulse * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, sz * (1.0 + pulse * 0.3), 0, Math.PI * 2);
    ctx.stroke();
  },

  drawTurret(ctx, p, sz, b, color, kind) {
    // base
    ctx.fillStyle = '#1a1a30';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    roundRect(ctx, p.x - sz, p.y - sz, sz * 2, sz * 2, 3, true, true);
    // ammo bar (gun/missile only — laser uses global power)
    if (kind !== 'laser') {
      const w = sz * 1.6;
      const max = effectiveTurretAmmoMax(b);
      const cur = b.ammoBuffer || 0;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(p.x - w / 2, p.y + sz + 2, w, 3);
      ctx.fillStyle = color;
      ctx.fillRect(p.x - w / 2, p.y + sz + 2, w * (cur / max), 3);
      // tick marks
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (let i = 1; i < max; i++) {
        ctx.fillRect(p.x - w / 2 + (w / max) * i, p.y + sz + 2, 1, 3);
      }
    }
    // turret head pointing at target (or last aim angle)
    const angle = b.aimAngle || 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    if (kind === 'gun') {
      // long thin barrel
      ctx.fillRect(0, -sz * 0.15, sz * 1.0, sz * 0.3);
      // dome
      ctx.beginPath(); ctx.arc(0, 0, sz * 0.4, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'missile') {
      // square launcher with two tubes
      ctx.fillRect(-sz * 0.1, -sz * 0.5, sz * 0.7, sz * 0.4);
      ctx.fillRect(-sz * 0.1, sz * 0.1, sz * 0.7, sz * 0.4);
      ctx.fillStyle = '#000';
      ctx.fillRect(sz * 0.55, -sz * 0.42, sz * 0.05, sz * 0.25);
      ctx.fillRect(sz * 0.55, sz * 0.17, sz * 0.05, sz * 0.25);
    } else if (kind === 'laser') {
      // disc with focused emitter
      ctx.beginPath(); ctx.arc(0, 0, sz * 0.45, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(sz * 0.35, 0, sz * 0.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  drawSplitter(ctx, p, sz, b) {
    const t = this.tile();
    const beltHalf = t * 0.36;
    const outerHalf = beltHalf + Math.max(2, t * 0.06);
    const inputSide = OPPOSITE[b.dir];
    const outputs = (b.dir === 'N' || b.dir === 'S') ? ['E', 'W'] : ['N', 'S'];
    // Same belt-style track as conveyors so adjacent ones merge seamlessly.
    // Slight cyan tint on inner surface to distinguish from a regular straight belt.
    const conn = { N: false, S: false, E: false, W: false };
    conn[inputSide] = true;
    for (const s of outputs) conn[s] = true;
    ctx.fillStyle = '#16162a';
    this.fillConveyorArms(p, t, outerHalf, conn);
    ctx.fillStyle = '#324560';
    this.fillConveyorArms(p, t, beltHalf, conn);
    const scroll = (State._chevronT * CONFIG.CONVEYOR.SPEED * 0.35) % 1;
    // Input arm: chevrons scroll edge → center (inward)
    this.drawArmChevrons(p, t, inputSide, beltHalf, scroll, true);
    // Output arms: chevrons scroll center → edge (outward)
    for (const s of outputs) this.drawArmChevrons(p, t, s, beltHalf, scroll, false);
    // Next-output marker — small cyan dot on the side that will receive the next item
    const nextDv = DIRS[outputs[b.nextOutput]];
    ctx.fillStyle = CONFIG.COLORS.selected;
    ctx.shadowColor = CONFIG.COLORS.selected;
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(p.x + nextDv.dx * (beltHalf + outerHalf) * 0.5, p.y + nextDv.dy * (beltHalf + outerHalf) * 0.5, Math.max(2, t * 0.07), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    if (b.item) Render.drawItem(ctx, p.x, p.y, b.item.type, t * 0.2, 0);
  },

  // Chevrons scrolling along one arm of a junction.
  // side = which arm (N/S/E/W). isInput = true: chevrons flow toward center; false: flow toward edge.
  drawArmChevrons(p, tilePx, side, halfWidth, scroll, isInput) {
    const ctx = this.ctx;
    const dv = DIRS[side];
    const flowDv = isInput ? { dx: -dv.dx, dy: -dv.dy } : dv;
    const perp = { dx: -dv.dy, dy: dv.dx };
    const chevW = halfWidth * 0.65;
    const chevD = halfWidth * 0.4;
    ctx.strokeStyle = '#8aa0c4';
    ctx.lineWidth = Math.max(1.4, tilePx * 0.05);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const halfTile = tilePx / 2;
    const count = 2;
    for (let i = 0; i < count; i++) {
      const f = (i / count + scroll) % 1;
      // f traverses 0→1; for output that maps center→edge, for input edge→center
      const dist = (isInput ? (1 - f) : f) * halfTile;
      const cx = p.x + dv.dx * dist;
      const cy = p.y + dv.dy * dist;
      ctx.beginPath();
      ctx.moveTo(cx - flowDv.dx * chevD + perp.dx * chevW, cy - flowDv.dy * chevD + perp.dy * chevW);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx - flowDv.dx * chevD - perp.dx * chevW, cy - flowDv.dy * chevD - perp.dy * chevW);
      ctx.stroke();
    }
  },

  drawEnemies() {
    const ctx = this.ctx;
    const t = this.tile();
    for (const e of State.enemies) {
      if (e._dead) continue;
      const def = CONFIG.ENEMIES[e.type] || CONFIG.ENEMIES.grunt;
      const p = this.wts(e.x, e.y);
      const sz = e.size * t;
      const angle = Math.atan2(e.vy, e.vx);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      // body triangle
      ctx.fillStyle = def.color;
      ctx.strokeStyle = def.shield;
      ctx.lineWidth = def.hpMul >= 3 ? 2.5 : 1.5; // thicker outline for tanky enemies
      ctx.beginPath();
      ctx.moveTo(sz, 0);
      ctx.lineTo(-sz * 0.7, sz * 0.8);
      ctx.lineTo(-sz * 0.4, 0);
      ctx.lineTo(-sz * 0.7, -sz * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // extra armor plate for tank/brute (visible inner triangle)
      if (def.hpMul >= 3) {
        ctx.fillStyle = def.shield;
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.moveTo(sz * 0.4, 0);
        ctx.lineTo(-sz * 0.2, sz * 0.4);
        ctx.lineTo(-sz * 0.2, -sz * 0.4);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // speed streaks for scouts
      if (def.speedMul >= 1.5) {
        ctx.strokeStyle = def.shield;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(-sz * 0.7, sz * 0.5);
        ctx.lineTo(-sz * 1.4, sz * 0.5);
        ctx.moveTo(-sz * 0.7, -sz * 0.5);
        ctx.lineTo(-sz * 1.4, -sz * 0.5);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      // HP bar (always shown for tanky types so the player notices them)
      if (e.hp < e.maxHp || def.hpMul >= 3) {
        const w = sz * 2.2;
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(p.x - w / 2, p.y - sz - 6, w, 3);
        ctx.fillStyle = def.color;
        ctx.fillRect(p.x - w / 2, p.y - sz - 6, w * (e.hp / e.maxHp), 3);
      }
    }
  },

  drawProjectiles() {
    const ctx = this.ctx;
    const t = this.tile();
    for (const p of State.projectiles) {
      const s = this.wts(p.x, p.y);
      ctx.fillStyle = p.color || '#fff';
      ctx.strokeStyle = p.color || '#fff';
      if (p.splash > 0) {
        const angle = Math.atan2(p.vy, p.vx);
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(t * 0.18, 0);
        ctx.lineTo(-t * 0.15, t * 0.07);
        ctx.lineTo(-t * 0.15, -t * 0.07);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(s.x, s.y, Math.max(1.5, t * 0.07), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  },

  drawLasers() {
    const ctx = this.ctx;
    const t = this.tile();
    for (const b of State.buildings) {
      if (b.type !== 'laser_turret' || !b.firing || !b.target) continue;
      const start = this.wts(b.x + 0.5, b.y + 0.5);
      const end = this.wts(b.target.x, b.target.y);
      ctx.save();
      ctx.strokeStyle = CONFIG.COLORS.power;
      ctx.lineWidth = 3;
      ctx.shadowColor = CONFIG.COLORS.power;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.restore();
    }
  },

  drawPickups() {
    const ctx = this.ctx;
    const t = this.tile();
    for (const p of State.pickups) {
      const s = this.wts(p.x, p.y);
      const sz = (p.dragging ? 0.45 : 0.32) * t;
      ctx.save();
      if (p.dragging) { ctx.shadowColor = '#fff'; ctx.shadowBlur = 8; }
      Render.drawItem(ctx, s.x, s.y, p.type, sz, 0, p.dragging);
      ctx.restore();
    }
  },

  // Per-item geometry — called from conveyors, pickups, and (future) floating ammo previews.
  // angle orients elongated shapes (bullet, missile) along belt direction.
  drawItem(ctx, x, y, type, size, angle, emphasized) {
    const meta = CONFIG.ITEMS[type] || CONFIG.ITEMS.ore;
    ctx.fillStyle = meta.color;
    ctx.strokeStyle = emphasized ? CONFIG.COLORS.dragging : meta.outline;
    ctx.lineWidth = emphasized ? 2 : 1;
    if (type === 'ore') {
      ctx.beginPath();
      ctx.moveTo(x, y - size);
      ctx.lineTo(x + size, y);
      ctx.lineTo(x, y + size);
      ctx.lineTo(x - size, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // inner highlight
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(x - size * 0.25, y - size * 0.25, size * 0.18, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'plate') {
      const s = size * 0.92;
      ctx.fillRect(x - s, y - s, s * 2, s * 2);
      ctx.strokeRect(x - s, y - s, s * 2, s * 2);
      // inset detail to make it read as a refined plate
      ctx.strokeStyle = meta.outline;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - s * 0.55, y - s * 0.55, s * 1.1, s * 1.1);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(x - s * 0.7, y - s * 0.8, s * 0.5, s * 0.15);
    } else if (type === 'bullet') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle || 0);
      const w = size * 1.6, h = size * 0.7;
      const tip = w * 0.45;
      // body (capsule with pointed nose)
      ctx.beginPath();
      ctx.moveTo(-w / 2, -h / 2);
      ctx.lineTo(w / 2 - tip, -h / 2);
      ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, 0);
      ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - tip, h / 2);
      ctx.lineTo(-w / 2, h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // casing rim (darker rear band)
      ctx.fillStyle = meta.outline;
      ctx.fillRect(-w / 2, -h / 2, w * 0.22, h);
      // highlight stripe
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(-w * 0.15, -h * 0.32, w * 0.5, h * 0.18);
      ctx.restore();
    } else if (type === 'missile') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle || 0);
      const w = size * 1.8, h = size * 0.7;
      // body: pointed nose, rectangular middle, finned tail
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);                     // nose tip
      ctx.lineTo(w * 0.18, -h / 2);             // nose shoulder upper
      ctx.lineTo(-w * 0.32, -h / 2);            // body upper-rear
      ctx.lineTo(-w / 2, -h * 0.85);            // tail fin tip upper
      ctx.lineTo(-w * 0.32, -h * 0.18);         // tail notch upper
      ctx.lineTo(-w * 0.32, h * 0.18);
      ctx.lineTo(-w / 2, h * 0.85);
      ctx.lineTo(-w * 0.32, h / 2);
      ctx.lineTo(w * 0.18, h / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // nose tip darker
      ctx.fillStyle = meta.outline;
      ctx.beginPath();
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w * 0.18, -h * 0.35);
      ctx.lineTo(w * 0.18, h * 0.35);
      ctx.closePath();
      ctx.fill();
      // window stripe
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillRect(-w * 0.05, -h * 0.15, w * 0.18, h * 0.3);
      ctx.restore();
    } else {
      // fallback: circle
      ctx.beginPath();
      ctx.arc(x, y, size * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  },

  drawParticles() {
    const ctx = this.ctx;
    const t = this.tile();
    for (const p of State.particles) {
      const s = this.wts(p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.5));
      ctx.beginPath();
      ctx.arc(s.x, s.y, p.size * (State.camera.scale * 0.8 + 0.2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  drawFloaters() {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of State.floaters) {
      const s = this.wts(f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
      ctx.font = `bold ${Math.max(10, this.tile() * 0.35)}px monospace`;
      ctx.fillText(f.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;
  },

  drawBuildPreview() {
    const S = State;
    if (!S.tool) return;
    if (!S.pointer.overCanvas) return;
    const ctx = this.ctx;
    const t = this.tile();
    // Conveyor drag uses its own start/current coords, so render it BEFORE the
    // pointer-finite check (a touch tap-down can hand off valid drag coords
    // even before the next pointermove updates pointer.wx/wy).
    if (S.tool === 'conveyor' && S.conveyorDrag) {
      const plan = planConveyorPlacement(buildConveyorPath(
        S.conveyorDrag.startX, S.conveyorDrag.startY,
        S.conveyorDrag.currentX, S.conveyorDrag.currentY));
      let cost = 0;
      for (const step of plan) if (step.action === 'place') cost++;
      for (const step of plan) {
        const p = this.wts(step.x + 0.5, step.y + 0.5);
        ctx.save();
        const sz = t * 0.45;
        const color = step.placeable && cost <= S.inventory.ore ?
          (step.action === 'rotate' ? CONFIG.COLORS.selected : CONFIG.COLORS.valid) :
          CONFIG.COLORS.blocked;
        ctx.strokeStyle = color;
        ctx.fillStyle = color + '33';
        ctx.lineWidth = 2;
        ctx.fillRect(p.x - sz, p.y - sz, sz * 2, sz * 2);
        ctx.strokeRect(p.x - sz, p.y - sz, sz * 2, sz * 2);
        // small arrow
        const dv = DIRS[step.dir];
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - dv.dx * sz * 0.4, p.y - dv.dy * sz * 0.4);
        ctx.lineTo(p.x + dv.dx * sz * 0.4, p.y + dv.dy * sz * 0.4);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }
    // Below paths (demolish hover, single-tile build preview) read pointer.wx/wy
    if (!Number.isFinite(S.pointer.wx) || !Number.isFinite(S.pointer.wy)) return;
    if (S.tool === 'demolish') { this.drawDemolishHover(); return; }
    if (S.tool !== 'conveyor') {
      // single tile preview at pointer location
      const tx = Math.floor(S.pointer.wx);
      const ty = Math.floor(S.pointer.wy);
      const p = this.wts(tx + 0.5, ty + 0.5);
      const ok = canPlaceBuilding(S.tool, tx, ty) && canAfford(CONFIG.COSTS[S.tool]);
      const sz = t * 0.45;
      ctx.save();
      const color = ok ? CONFIG.COLORS.valid : CONFIG.COLORS.blocked;
      ctx.strokeStyle = color;
      ctx.fillStyle = color + '22';
      ctx.lineWidth = 2;
      ctx.fillRect(p.x - sz, p.y - sz, sz * 2, sz * 2);
      ctx.strokeRect(p.x - sz, p.y - sz, sz * 2, sz * 2);
      // range overlay for turret
      const def = CONFIG.TURRETS[S.tool];
      if (def && ok) {
        ctx.strokeStyle = CONFIG.COLORS.rangeIndicator;
        ctx.fillStyle = CONFIG.COLORS.rangeIndicator;
        ctx.beginPath();
        ctx.arc(p.x, p.y, def.range * t, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  },

  drawDemolishHover() {
    const ctx = this.ctx;
    const t = this.tile();
    const tx = Math.floor(State.pointer.wx);
    const ty = Math.floor(State.pointer.wy);
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;
    const has = getBuildingAt(tx, ty) || getConveyorAt(tx, ty);
    if (!has) return;
    const p = this.wts(tx + 0.5, ty + 0.5);
    const sz = t * 0.5;
    ctx.save();
    ctx.strokeStyle = CONFIG.COLORS.blocked;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - sz, p.y - sz); ctx.lineTo(p.x + sz, p.y + sz);
    ctx.moveTo(p.x + sz, p.y - sz); ctx.lineTo(p.x - sz, p.y + sz);
    ctx.stroke();
    ctx.restore();
  },

  drawRangeOverlay() {
    // Show range for all turrets, faint
    const ctx = this.ctx;
    const t = this.tile();
    ctx.save();
    for (const b of State.buildings) {
      const def = CONFIG.TURRETS[b.type];
      if (!def) continue;
      const p = this.wts(b.x + 0.5, b.y + 0.5);
      const curR = effectiveTurretRange(b);
      ctx.setLineDash([]);
      ctx.strokeStyle = b === State.selected ? 'rgba(90,247,255,0.5)' : 'rgba(90,247,255,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, curR * t, 0, Math.PI * 2);
      ctx.stroke();

      // Preview of what the next range-upgrade tier would buy — only on selected turret
      if (b === State.selected) {
        const upg = CONFIG.UPGRADES[b.type] && CONFIG.UPGRADES[b.type].storage;
        const tier = (b.upgrades && b.upgrades.storage) || 0;
        if (upg && upg.perTier.range && tier < upg.maxTier) {
          const nextR = curR + upg.perTier.range;
          ctx.strokeStyle = 'rgba(80,255,128,0.55)';
          ctx.lineWidth = 1.3;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.arc(p.x, p.y, nextR * t, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }
    ctx.restore();
  },
};

// Vertical column of small filled squares showing current/max fill of a buffer.
// vertical=true stacks downward from (x,y); false stacks rightward.
function drawBufferPips(ctx, x, y, cur, max, color, pipSize, vertical) {
  if (!max) return;
  const gap = 1;
  const step = pipSize + gap;
  ctx.save();
  for (let i = 0; i < max; i++) {
    const px = vertical ? x : x + i * step;
    const py = vertical ? y + i * step : y;
    if (i < cur) {
      ctx.fillStyle = color;
      ctx.fillRect(px, py, pipSize, pipSize);
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, pipSize - 1, pipSize - 1);
    }
  }
  ctx.restore();
}

// Draw a 'V' arrowhead at (x,y) pointing in direction vector dv.
function drawArrow(ctx, x, y, dv, size) {
  const perp = { dx: -dv.dy, dy: dv.dx };
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - dv.dx * size + perp.dx * size * 0.55, y - dv.dy * size + perp.dy * size * 0.55);
  ctx.moveTo(x, y);
  ctx.lineTo(x - dv.dx * size - perp.dx * size * 0.55, y - dv.dy * size - perp.dy * size * 0.55);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}
