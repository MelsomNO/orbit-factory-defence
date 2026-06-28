// Unified pointer input + tool selection + camera pan/zoom

const Input = {
  canvas: null,
  touches: new Map(),     // pointerId → { clientX, clientY } for active touches (multi-touch tracking)
  mousePan: null,         // {startClientX, startClientY, startCamX, startCamY} while middle/right-drag panning
  pinch: null,            // {cx, cy, dist, camX, camY, camScale} initial state of a 2-finger gesture
  gameActionActive: false,
  gameActionPointerId: null,

  init(canvas) {
    this.canvas = canvas;
    canvas.addEventListener('pointerdown', e => this.onDown(e));
    canvas.addEventListener('pointermove', e => this.onMove(e));
    canvas.addEventListener('pointerup', e => this.onUp(e));
    canvas.addEventListener('pointercancel', e => this.onUp(e));
    canvas.addEventListener('pointerenter', () => { State.pointer.overCanvas = true; });
    canvas.addEventListener('pointerleave', () => {
      State.pointer.overCanvas = false;
      // Clear world coords so any subsequent preview-render bails until the pointer
      // is actually back over the canvas.
      State.pointer.wx = NaN;
      State.pointer.wy = NaN;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => this.onWheel(e), { passive: false });

    // Build menu buttons
    document.querySelectorAll('.build-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        Input.setTool(State.tool === tool ? null : tool);
      });
    });

    // Start wave button
    const startBtn = document.getElementById('start-wave-btn');
    startBtn.addEventListener('click', () => {
      if (State.wavePhase === 'prep' || State.wavePhase === 'between') {
        State.waveTimer = 0; // triggers immediate wave start
      }
    });

    // Pause
    document.getElementById('pause-btn').addEventListener('click', () => Input.togglePause());
    document.getElementById('resume-btn').addEventListener('click', () => Input.togglePause(false));

    // Mute
    document.getElementById('mute-btn').addEventListener('click', () => Input.refreshMuteUI(Sound.toggle()));
    Input.refreshMuteUI(true); // sync initial UI; will read enabled state once Sound.init runs

    // Lazy-init audio on first user gesture (autoplay policy)
    const initAudio = () => { Sound.init(); Input.refreshMuteUI(Sound.enabled); };
    window.addEventListener('pointerdown', initAudio, { once: true });
    window.addEventListener('keydown',     initAudio, { once: true });

    // Build the digit→tool lookup from data-hotkey attributes on the build menu buttons
    const hotkeyToTool = {};
    document.querySelectorAll('.build-btn').forEach(btn => {
      const key = btn.dataset.hotkey;
      if (key) hotkeyToTool[key] = btn.dataset.tool;
    });

    // Keyboard: hotkeys, Escape clears tool, Space toggles pause
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') { Input.setTool(null); return; }
      if (e.code === 'Space') { e.preventDefault(); Input.togglePause(); return; }
      // Number keys 1-9 → buildables
      if (hotkeyToTool[e.key]) {
        const tool = hotkeyToTool[e.key];
        Input.setTool(State.tool === tool ? null : tool);
        return;
      }
      // X / Delete → demolish
      if (e.key === 'x' || e.key === 'X' || e.key === 'Delete') {
        Input.setTool(State.tool === 'demolish' ? null : 'demolish');
        return;
      }
      // M → mute
      if (e.key === 'm' || e.key === 'M') {
        Input.refreshMuteUI(Sound.toggle());
        return;
      }
    });

    // The Restart / Play Again button and the score form are wired up in
    // js/scoreboard.js (Scoreboard.init), so the game-over flow lives in one place.

    document.getElementById('intro-close').addEventListener('click', () => {
      document.getElementById('intro').hidden = true;
      // Game was held in a paused state while the intro was up; resume it now.
      State.paused = false;
    });

    // Info panel close / demolish / conveyor → splitter
    document.getElementById('info-close').addEventListener('click', () => { State.selected = null; });
    document.getElementById('info-demolish').addEventListener('click', () => {
      const sel = State.selected;
      if (!sel || sel === State.hq) return;
      demolishAt(sel.x, sel.y);
      State.selected = null;
    });
    document.getElementById('info-to-splitter').addEventListener('click', () => {
      const sel = State.selected;
      if (!sel || sel.type !== 'conveyor') return;
      convertConveyor(sel, 'splitter');
    });
    document.getElementById('upg-speed-btn').addEventListener('click', () => {
      if (State.selected) applyUpgrade(State.selected, 'speed');
    });
    document.getElementById('upg-storage-btn').addEventListener('click', () => {
      if (State.selected) applyUpgrade(State.selected, 'storage');
    });

    // Reset view button — clears manual camera flag so auto-fit takes over
    document.getElementById('reset-view-btn').addEventListener('click', () => resetView());
  },

  refreshMuteUI(enabled) {
    const btn = document.getElementById('mute-btn');
    if (!btn) return;
    btn.textContent = enabled ? '🔊' : '🔇';
    btn.title = enabled ? 'Mute (M)' : 'Unmute (M)';
  },

  togglePause(force) {
    if (State.gameOver) return;
    // While the intro modal is up the game must stay paused — pause button
    // and Space-key shouldn't be able to "Resume" the game until the player
    // dismisses the intro.
    const intro = document.getElementById('intro');
    if (intro && !intro.hidden) return;
    State.paused = (force === undefined) ? !State.paused : !!force;
    document.getElementById('pause-overlay').hidden = !State.paused;
    const btn = document.getElementById('pause-btn');
    btn.textContent = State.paused ? '▶' : '⏸';
    btn.classList.toggle('paused', State.paused);
    btn.title = State.paused ? 'Resume (Space)' : 'Pause (Space)';
    // Refresh the pause-screen leaderboard each time the player pauses
    if (State.paused && typeof Scoreboard !== 'undefined' && Scoreboard.loadInto) {
      const wrap = document.getElementById('pause-leaderboard');
      const list = document.getElementById('pause-leaderboard-list');
      Scoreboard.loadInto(list).then(ok => { if (wrap) wrap.hidden = !ok; });
    }
  },

  setTool(tool) {
    State.tool = tool;
    State.selected = null;
    State.conveyorDrag = null;
    // Discard any stale canvas pointer position (e.g. the tile where the previous
    // building was placed) so the new tool doesn't immediately highlight it.
    State.pointer.wx = NaN;
    State.pointer.wy = NaN;
    document.querySelectorAll('.build-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === tool);
    });
    this.updateHint();
  },

  updateHint() {
    const hint = document.getElementById('tool-hint');
    if (!State.tool) { hint.classList.remove('visible'); return; }
    const map = {
      harvester: 'Tap a resource node (◆) — auto-harvests ore',
      conveyor: 'Drag to lay belt — 1◆ per tile',
      refinery: 'Convey ◆ ore IN, ▣ plates OUT (small buffers)',
      bullet_plant: 'Convey ▣ plates IN, ● bullets OUT',
      missile_plant: 'Convey ▣ plates IN, ▲ missiles OUT',
      power_plant: 'Adds to global ⚡ power capacity',
      gun_turret: 'Convey ● bullets IN (max 10)',
      missile_turret: 'Convey ▲ missiles IN (max 10)',
      laser_turret: 'Draws ⚡ power directly',
      demolish: 'Tap building/belt to remove (50% refund)',
    };
    hint.textContent = map[State.tool] || '';
    hint.classList.add('visible');
  },

  // Convert client coords → world coords
  toWorld(e) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    return screenToWorld(sx, sy, Render.w, Render.h);
  },

  onDown(e) {
    e.preventDefault();
    // Track touch pointers for multi-touch pinch detection
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
      if (this.touches.size >= 2) {
        if (this.gameActionActive) this.cancelGameAction();
        this.startPinch();
        return;
      }
    }
    // Mouse middle/right button → camera pan, never a game action
    if (e.pointerType !== 'touch' && (e.button === 1 || e.button === 2)) {
      this.startMousePan(e);
      return;
    }

    this.canvas.setPointerCapture && this.canvas.setPointerCapture(e.pointerId);
    this.gameActionActive = true;
    this.gameActionPointerId = e.pointerId;
    const w = this.toWorld(e);
    const S = State;
    S.pointer.wx = w.x; S.pointer.wy = w.y;
    const rect = this.canvas.getBoundingClientRect();
    S.pointer.x = e.clientX - rect.left;
    S.pointer.y = e.clientY - rect.top;
    S.pointer.down = true;
    S.pointer.downAt = performance.now();

    const tx = Math.floor(w.x);
    const ty = Math.floor(w.y);

    // CONVEYOR DRAG START
    if (S.tool === 'conveyor') {
      S.conveyorDrag = { startX: tx, startY: ty, currentX: tx, currentY: ty };
      return;
    }

    // DEMOLISH
    if (S.tool === 'demolish') {
      demolishAt(tx, ty);
      return;
    }

    // PLACE BUILDING (single-tap)
    if (S.tool) {
      if (placeBuilding(S.tool, tx, ty)) {
        if (!canAfford(CONFIG.COSTS[S.tool])) {
          // de-select if can't afford more
          this.setTool(null);
        }
      } else {
        // failed: small feedback
        addFloater(tx + 0.5, ty + 0.5, !inBounds(tx,ty) ? 'OUT' : (canAfford(CONFIG.COSTS[S.tool]) ? 'BLOCKED' : 'NO ORE'), CONFIG.COLORS.blocked);
      }
      return;
    }

    // NO TOOL: harvest / pickup / select
    // 1) Is there a pickup very near pointer?
    const pickupGrab = this.findPickupAt(w.x, w.y);
    if (pickupGrab) {
      pickupGrab.dragging = true;
      pickupGrab.x = w.x; pickupGrab.y = w.y;
      S.pointer.draggingPickup = pickupGrab;
      Sound.pickupOre();
      return;
    }

    // 2) Is there a resource node at the tile?
    const node = getNodeAt(tx, ty);
    if (node && node.reserves > 0) {
      const pickup = {
        x: tx + 0.5, y: ty + 0.5, type: 'ore', dragging: true, vx: 0, vy: 0, life: 18,
      };
      S.pickups.push(pickup);
      reduceNodeReserves(node, CONFIG.HARVEST.CLICK_AMOUNT);
      S.pointer.draggingPickup = pickup;
      pickup.x = w.x; pickup.y = w.y;
      Sound.pickupOre();
      return;
    }

    // 3) Building / HQ / conveyor → select for info panel
    const b = getBuildingAt(tx, ty);
    if (b) S.selected = b;
    else if (isHQTile(tx, ty)) S.selected = S.hq;
    else {
      const c = getConveyorAt(tx, ty);
      S.selected = c || null;
    }
  },

  onMove(e) {
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    }
    // Pinch update on any move while in pinch mode
    if (this.pinch) { this.updatePinch(); return; }
    // Mouse pan update
    if (this.mousePan) { this.updateMousePan(e); return; }

    // Always update the pointer's world position so the hover preview tracks
    // desktop mouse movement even when no button is held.
    const w = this.toWorld(e);
    const S = State;
    S.pointer.wx = w.x; S.pointer.wy = w.y;
    const rect = this.canvas.getBoundingClientRect();
    S.pointer.x = e.clientX - rect.left;
    S.pointer.y = e.clientY - rect.top;

    // Only the active game-action pointer drives drag updates
    if (!this.gameActionActive || e.pointerId !== this.gameActionPointerId) return;
    if (S.pointer.draggingPickup) {
      S.pointer.draggingPickup.x = w.x;
      S.pointer.draggingPickup.y = w.y;
    }
    if (S.conveyorDrag) {
      S.conveyorDrag.currentX = Math.floor(w.x);
      S.conveyorDrag.currentY = Math.floor(w.y);
    }
  },

  onUp(e) {
    if (e.pointerType === 'touch') this.touches.delete(e.pointerId);
    // Drop out of pinch when only one (or zero) fingers remain
    if (this.pinch && this.touches.size < 2) { this.pinch = null; }
    // End mouse pan when its button releases
    if (this.mousePan && e.pointerType !== 'touch' && (e.button === 1 || e.button === 2)) {
      this.mousePan = null;
      return;
    }
    if (!this.gameActionActive || e.pointerId !== this.gameActionPointerId) return;

    const w = this.toWorld(e);
    const S = State;
    S.pointer.down = false;

    // PICKUP RELEASE
    if (S.pointer.draggingPickup) {
      const p = S.pointer.draggingPickup;
      p.dragging = false;
      if (S.hq) {
        const hcx = S.hq.x + S.hq.size / 2;
        const hcy = S.hq.y + S.hq.size / 2;
        const d = Math.hypot(p.x - hcx, p.y - hcy);
        if (d <= CONFIG.HQ_ACCEPT_RADIUS) {
          S.inventory[p.type] = (S.inventory[p.type] || 0) + 1;
          addFloater(hcx, hcy - 0.5, `+1${p.type==='ore'?'◆':''}`, CONFIG.COLORS.hq);
          S.pickups.splice(S.pickups.indexOf(p), 1);
          Sound.depositOre();
        } else {
          p.vx = 0; p.vy = 0; p.life = 18;
        }
      }
      S.pointer.draggingPickup = null;
    }

    // CONVEYOR DRAG RELEASE
    if (S.conveyorDrag) {
      const cd = S.conveyorDrag;
      cd.currentX = Math.floor(w.x);
      cd.currentY = Math.floor(w.y);
      const path = buildConveyorPath(cd.startX, cd.startY, cd.currentX, cd.currentY);
      const plan = planConveyorPlacement(path);
      placeConveyors(plan);
      S.conveyorDrag = null;
    }
    this.gameActionActive = false;
    this.gameActionPointerId = null;
  },

  // -------- camera pan / zoom helpers --------

  cancelGameAction() {
    if (State.pointer.draggingPickup) {
      State.pointer.draggingPickup.dragging = false;
      State.pointer.draggingPickup = null;
    }
    State.conveyorDrag = null;
    State.pointer.down = false;
    this.gameActionActive = false;
    this.gameActionPointerId = null;
  },

  startMousePan(e) {
    this.mousePan = {
      startClientX: e.clientX, startClientY: e.clientY,
      startCamX: State.camera.x, startCamY: State.camera.y,
    };
  },

  updateMousePan(e) {
    if (!this.mousePan) return;
    const dx = e.clientX - this.mousePan.startClientX;
    const dy = e.clientY - this.mousePan.startClientY;
    const s = State.camera.scale * CONFIG.TILE;
    State.camera.x = this.mousePan.startCamX - dx / s;
    State.camera.y = this.mousePan.startCamY - dy / s;
    State.camera.manual = true;
    clampCamera();
  },

  startPinch() {
    const arr = Array.from(this.touches.values());
    if (arr.length < 2) return;
    const [a, b] = arr;
    this.pinch = {
      cx: (a.clientX + b.clientX) / 2,
      cy: (a.clientY + b.clientY) / 2,
      dist: Math.max(1, Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)),
      camX: State.camera.x,
      camY: State.camera.y,
      camScale: State.camera.scale,
    };
  },

  updatePinch() {
    if (!this.pinch) return;
    const arr = Array.from(this.touches.values());
    if (arr.length < 2) return;
    const [a, b] = arr;
    const cx = (a.clientX + b.clientX) / 2;
    const cy = (a.clientY + b.clientY) / 2;
    const dist = Math.max(1, Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY));
    const zoomRatio = dist / this.pinch.dist;
    const newScale = Math.max(State.camera.minScale, Math.min(State.camera.maxScale, this.pinch.camScale * zoomRatio));

    const rect = this.canvas.getBoundingClientRect();
    const scxStart = this.pinch.cx - rect.left;
    const scyStart = this.pinch.cy - rect.top;
    const scxCurr  = cx - rect.left;
    const scyCurr  = cy - rect.top;

    // World-space anchor was under the starting midpoint at the starting camera.
    const startPx = this.pinch.camScale * CONFIG.TILE;
    const anchorX = (scxStart - Render.w / 2) / startPx + this.pinch.camX;
    const anchorY = (scyStart - Render.h / 2) / startPx + this.pinch.camY;

    State.camera.scale = newScale;
    const newPx = newScale * CONFIG.TILE;
    State.camera.x = anchorX - (scxCurr - Render.w / 2) / newPx;
    State.camera.y = anchorY - (scyCurr - Render.h / 2) / newPx;
    State.camera.manual = true;
    clampCamera();
  },

  onWheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const worldBefore = screenToWorld(sx, sy, Render.w, Render.h);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    State.camera.scale = Math.max(State.camera.minScale, Math.min(State.camera.maxScale, State.camera.scale * factor));
    State.camera.manual = true;
    const worldAfter = screenToWorld(sx, sy, Render.w, Render.h);
    State.camera.x += worldBefore.x - worldAfter.x;
    State.camera.y += worldBefore.y - worldAfter.y;
    clampCamera();
  },

  findPickupAt(wx, wy) {
    // pixel-radius based
    const radius = 0.6; // world tiles
    let nearest = null, nd = Infinity;
    for (const p of State.pickups) {
      if (p.dragging) continue;
      const d = Math.hypot(p.x - wx, p.y - wy);
      if (d < radius && d < nd) { nearest = p; nd = d; }
    }
    return nearest;
  },
};
