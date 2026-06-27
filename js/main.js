// Bootstrap & game loop

(function () {
  // Sync --vh to the actual visible viewport height. Some mobile browsers
  // (Vivaldi/Firefox with bottom toolbars) don't update dvh reliably, but
  // visualViewport.height is always the real visible-area height.
  function updateVH() {
    const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    document.documentElement.style.setProperty('--vh', h + 'px');
    if (typeof Render !== 'undefined' && Render.canvas) Render.resize();
  }
  updateVH();
  window.addEventListener('resize', updateVH);
  window.addEventListener('orientationchange', updateVH);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateVH);
    window.visualViewport.addEventListener('scroll', updateVH);
  }

  const canvas = document.getElementById('game-canvas');
  Render.init(canvas);
  generateWorld();
  Input.init(canvas);

  // Show intro on first launch (versioned key so updates re-show)
  const INTRO_KEY = 'orbit-intro-seen-v3';
  try {
    if (!localStorage.getItem(INTRO_KEY)) {
      document.getElementById('intro').hidden = false;
    }
  } catch (_) { document.getElementById('intro').hidden = false; }

  // HUD elements
  const els = {
    round: document.getElementById('round-display'),
    waveStatus: document.getElementById('wave-status'),
    waveTimer: document.getElementById('wave-timer'),
    hqHp: document.getElementById('hq-hp-display'),
    invOre: document.getElementById('inv-ore'),
    invPlate: document.getElementById('inv-plate'),
    invPower: document.getElementById('inv-power'),
    invPowerMax: document.getElementById('inv-power-max'),
    startBtn: document.getElementById('start-wave-btn'),
    gameOver: document.getElementById('game-over'),
    roundsSurvived: document.getElementById('rounds-survived'),
    resetViewBtn: document.getElementById('reset-view-btn'),
  };

  function updateHUD() {
    const S = State;
    els.round.textContent = S.round;
    els.waveStatus.textContent = S.wavePhase.toUpperCase();
    els.waveTimer.textContent = (S.wavePhase === 'active')
      ? `${S.enemiesRemainingToSpawn + S.enemies.length}🛸`
      : `${Math.max(0, Math.ceil(S.waveTimer))}s`;
    els.hqHp.textContent = S.hq ? `${Math.max(0, Math.ceil(S.hq.hp))}/${S.hq.maxHp}` : '0';
    els.invOre.textContent = Math.floor(S.inventory.ore || 0);
    els.invPlate.textContent = `${Math.floor(S.hq ? S.hq.plateBuffer || 0 : 0)}/${CONFIG.HQ_RECIPE.outputBufferMax}`;
    els.invPower.textContent = Math.floor(S.power.stored);
    els.invPowerMax.textContent = S.power.max;
    els.startBtn.hidden = !(S.wavePhase === 'prep' || S.wavePhase === 'between');
    els.resetViewBtn.hidden = !S.camera.manual;

    // disable build buttons we can't afford
    document.querySelectorAll('.build-btn').forEach(btn => {
      const tool = btn.dataset.tool;
      if (tool === 'demolish') return;
      const cost = CONFIG.COSTS[tool];
      if (!cost) return;
      btn.classList.toggle('disabled', !canAfford(cost));
    });

    if (S.gameOver) {
      els.gameOver.hidden = false;
      els.roundsSurvived.textContent = S.round;
    } else {
      els.gameOver.hidden = true;
    }
  }

  // Info panel — refreshed every frame so live values (ammo, progress, target) stay current
  const ipanel = {
    root: document.getElementById('info-panel'),
    title: document.getElementById('info-title'),
    body: document.getElementById('info-body'),
    demolish: document.getElementById('info-demolish'),
    conveyorActions: document.getElementById('info-conveyor-actions'),
    toSplitter: document.getElementById('info-to-splitter'),
    upgrades: document.getElementById('info-upgrades'),
    upgSpeedLabel: document.getElementById('upg-speed-label'),
    upgStorageLabel: document.getElementById('upg-storage-label'),
    upgSpeedTiers: document.getElementById('upg-speed-tiers'),
    upgStorageTiers: document.getElementById('upg-storage-tiers'),
    upgSpeedBtn: document.getElementById('upg-speed-btn'),
    upgStorageBtn: document.getElementById('upg-storage-btn'),
  };

  const UPG_DEFAULT_LABEL = { speed: 'Speed', storage: 'Storage' };

  function renderUpgradeRow(sel, upgKey, labelEl, tiersEl, btnEl, def) {
    const upgDef = def[upgKey];
    if (!upgDef) { labelEl.textContent = UPG_DEFAULT_LABEL[upgKey] || upgKey; tiersEl.textContent = '—'; btnEl.hidden = true; return; }
    labelEl.textContent = upgDef.label || UPG_DEFAULT_LABEL[upgKey] || upgKey;
    btnEl.hidden = false;
    const tier = (sel.upgrades && sel.upgrades[upgKey]) || 0;
    let stars = '';
    for (let i = 0; i < upgDef.maxTier; i++) stars += i < tier ? '★' : '☆';
    tiersEl.textContent = stars;
    const cost = upgradeCost(sel, upgKey);
    if (cost === null) {
      btnEl.textContent = 'MAX';
      btnEl.disabled = true;
      btnEl.classList.add('maxed');
    } else {
      btnEl.textContent = `${cost}◆`;
      btnEl.disabled = !canUpgrade(sel, upgKey);
      btnEl.classList.remove('maxed');
    }
  }

  function updateUpgradeRows() {
    const sel = State.selected;
    if (!sel) { ipanel.upgrades.hidden = true; return; }
    const key = sel === State.hq ? 'hq' : sel.type;
    const def = CONFIG.UPGRADES[key];
    if (!def) { ipanel.upgrades.hidden = true; return; }
    ipanel.upgrades.hidden = false;
    renderUpgradeRow(sel, 'speed',   ipanel.upgSpeedLabel,   ipanel.upgSpeedTiers,   ipanel.upgSpeedBtn,   def);
    renderUpgradeRow(sel, 'storage', ipanel.upgStorageLabel, ipanel.upgStorageTiers, ipanel.upgStorageBtn, def);
  }

  function row(label, value) {
    return `<div class="info-row"><span class="label">${label}</span><span class="value">${value}</span></div>`;
  }
  function bar(frac, color) {
    return `<div class="info-bar"><span style="width:${Math.max(0, Math.min(100, frac * 100))}%;background:${color}"></span></div>`;
  }
  function statusOK(text) { return `<span style="color:var(--ok)">${text}</span>`; }
  function statusWarn(text) { return `<span style="color:var(--warning)">${text}</span>`; }
  function statusBad(text) { return `<span style="color:var(--danger)">${text}</span>`; }

  function refundText(type) {
    const cost = CONFIG.COSTS[type];
    if (!cost) return '';
    return `Demolish (refund ${Math.floor(cost.ore * 0.5)}◆)`;
  }

  function updateInfoPanel() {
    const sel = State.selected;
    if (!sel) { ipanel.root.hidden = true; return; }
    ipanel.root.hidden = false;
    // Default: hide conveyor-only actions; re-enabled below when conveyor is selected
    ipanel.conveyorActions.hidden = true;
    const isHQ = sel === State.hq;
    let title = '', body = '';
    if (isHQ) {
      const r = CONFIG.HQ_RECIPE;
      const time = effectiveRecipeTime(sel);
      const outMax = effectiveBufferMax(sel, 'outputBufferMax');
      const hpFrac = sel.hp / sel.maxHp;
      const hpColor = hpFrac > 0.4 ? 'var(--ok)' : (hpFrac > 0.2 ? 'var(--warning)' : 'var(--danger)');
      title = 'HQ — Command';
      const status = sel.processing
        ? `${Math.floor((1 - sel.processTime / time) * 100)}%`
        : ((sel.plateBuffer >= outMax) ? statusWarn('output full') : (State.inventory.ore < r.input.ore ? statusBad('no ore') : 'idle'));
      body =
        row('HP', `${Math.ceil(sel.hp)}/${sel.maxHp}`) +
        bar(hpFrac, hpColor) +
        row('Plate buffer ▣', `${sel.plateBuffer || 0}/${outMax}`) +
        bar((sel.plateBuffer || 0) / outMax, 'var(--plate)') +
        row('Recipe', `1◆ → 1▣ / ${time.toFixed(2)}s`) +
        row('Status', status);
      ipanel.demolish.hidden = true;
    } else if (sel.type === 'harvester') {
      title = 'Harvester';
      const rate = effectiveHarvesterRate(sel);
      const bufMax = effectiveHarvesterBuffer(sel);
      const reserves = sel.nodeRef ? sel.nodeRef.reserves : 0;
      const resFrac = reserves / CONFIG.RESOURCE_NODE.CAPACITY;
      const status = reserves <= 0 ? statusBad('depleted') : (sel.buffer >= bufMax ? statusWarn('output full') : statusOK('mining'));
      body =
        row('Rate', `1◆ / ${rate.toFixed(2)}s`) +
        row('Buffer', `${sel.buffer}/${bufMax}`) +
        row('Node reserves', `${reserves}`) +
        bar(resFrac, 'var(--ore)') +
        row('Status', status);
      ipanel.demolish.hidden = false;
      ipanel.demolish.textContent = refundText('harvester');
    } else if (CONFIG.FACTORIES[sel.type] && CONFIG.FACTORIES[sel.type].inputType) {
      const r = CONFIG.FACTORIES[sel.type];
      const time = effectiveRecipeTime(sel);
      const inMax = effectiveBufferMax(sel, 'inputBufferMax');
      const outMax = effectiveBufferMax(sel, 'outputBufferMax');
      const titleMap = { refinery: 'Refinery', bullet_plant: 'Bullet Plant', missile_plant: 'Missile Plant' };
      title = titleMap[sel.type] || sel.type;
      const inIcon = CONFIG.ITEMS[r.inputType].symbol;
      const outIcon = CONFIG.ITEMS[r.outputType].symbol;
      const colorVar = { ore: 'var(--ore)', plate: 'var(--plate)', bullet: 'var(--bullet)', missile: 'var(--missile)' };
      const inputFrac = (sel.inputBuffer || 0) / inMax;
      const outputFrac = (sel.outputBuffer || 0) / outMax;
      let status;
      if (sel.working) status = `${Math.floor((1 - sel.progress / time) * 100)}%`;
      else if ((sel.inputBuffer || 0) < r.inputAmount) status = statusBad('waiting input');
      else if ((sel.outputBuffer || 0) + r.outputAmount > outMax) status = statusWarn('output full');
      else status = 'idle';
      body =
        row('Recipe', `${r.inputAmount}${inIcon} → ${r.outputAmount}${outIcon} / ${time.toFixed(2)}s`) +
        row(`Input ${inIcon}`, `${sel.inputBuffer || 0}/${inMax}`) +
        bar(inputFrac, colorVar[r.inputType] || 'var(--plate)') +
        row(`Output ${outIcon}`, `${sel.outputBuffer || 0}/${outMax}`) +
        bar(outputFrac, colorVar[r.outputType] || 'var(--bullet)') +
        row('Status', status);
      ipanel.demolish.hidden = false;
      ipanel.demolish.textContent = refundText(sel.type);
    } else if (sel.type === 'power_plant') {
      title = 'Power Plant';
      body =
        row('+Max ⚡', effectivePowerPlantMax(sel)) +
        row('Regen', `${effectivePowerPlantRegen(sel)} ⚡/s`) +
        row('Global ⚡', `${Math.floor(State.power.stored)}/${State.power.max}`) +
        bar(State.power.max ? State.power.stored / State.power.max : 0, 'var(--power)');
      ipanel.demolish.hidden = false;
      ipanel.demolish.textContent = refundText('power_plant');
    } else if (sel.type === 'gun_turret' || sel.type === 'missile_turret') {
      const def = CONFIG.TURRETS[sel.type];
      const cd = effectiveTurretCooldown(sel);
      const ammoMax = effectiveTurretAmmoMax(sel);
      const range = effectiveTurretRange(sel);
      title = sel.type === 'gun_turret' ? 'Gun Turret' : 'Missile Turret';
      const ammoIcon = CONFIG.ITEMS[def.ammo].symbol;
      const ammoColor = def.ammo === 'bullet' ? 'var(--bullet)' : 'var(--missile)';
      const ammoFrac = (sel.ammoBuffer || 0) / ammoMax;
      const damageText = def.splash ? `${def.damage} (splash ${def.splash})` : `${def.damage}`;
      const status = sel.target
        ? statusOK('firing')
        : ((sel.ammoBuffer || 0) < def.ammoCost ? statusBad('out of ammo') : 'no target');
      const dps = (def.damage / cd).toFixed(1);
      body =
        row('Damage', damageText) +
        row('DPS', dps) +
        row('Range', range.toFixed(1)) +
        row('Fire rate', `${(1 / cd).toFixed(2)}/s`) +
        row(`Ammo ${ammoIcon}`, `${sel.ammoBuffer || 0}/${ammoMax}`) +
        bar(ammoFrac, ammoColor) +
        row('Status', status);
      ipanel.demolish.hidden = false;
      ipanel.demolish.textContent = refundText(sel.type);
    } else if (sel.type === 'conveyor') {
      title = 'Conveyor';
      const itemText = sel.item
        ? `${CONFIG.ITEMS[sel.item.type].symbol} ${sel.item.type} (${Math.floor(sel.item.progress * 100)}%)`
        : statusOK('empty');
      body =
        row('Direction', `→ ${sel.dir}`) +
        row('Speed', `${CONFIG.CONVEYOR.SPEED} t/s`) +
        row('Carrying', itemText);
      ipanel.conveyorActions.hidden = false;
      ipanel.toSplitter.disabled = !canAfford(CONFIG.COSTS.splitter);
      ipanel.toSplitter.textContent = `⊥ Splitter (${CONFIG.COSTS.splitter.ore}◆)`;
      ipanel.demolish.hidden = false;
      ipanel.demolish.textContent = `Demolish (refund ${Math.floor(CONFIG.COSTS.conveyor.ore * 0.5)}◆)`;
    } else if (sel.type === 'splitter') {
      title = 'Splitter';
      const outs = (sel.dir === 'N' || sel.dir === 'S') ? 'E + W' : 'N + S';
      const inSide = ({ N: 'S', S: 'N', E: 'W', W: 'E' })[sel.dir];
      const next = (sel.dir === 'N' || sel.dir === 'S') ? ['E', 'W'][sel.nextOutput] : ['N', 'S'][sel.nextOutput];
      body =
        row('Input side', inSide) +
        row('Outputs', outs) +
        row('Next output', next) +
        row('Holding', sel.item ? CONFIG.ITEMS[sel.item.type].symbol + ' ' + sel.item.type : statusOK('empty'));
      ipanel.demolish.hidden = false;
      ipanel.demolish.textContent = `Demolish (refund ${Math.floor(CONFIG.COSTS.splitter.ore * 0.5)}◆)`;
    } else if (sel.type === 'laser_turret') {
      const def = CONFIG.TURRETS.laser_turret;
      title = 'Laser Turret';
      const enough = State.power.stored >= def.ammoCost * 0.1;
      const status = sel.firing ? statusOK('firing') : (sel.target ? statusBad('no power') : (enough ? 'no target' : statusBad('no power')));
      body =
        row('Damage', `${def.damage}/s`) +
        row('Range', def.range.toFixed(1)) +
        row('Power draw', `${def.ammoCost} ⚡/s`) +
        row('Global ⚡', `${Math.floor(State.power.stored)}/${State.power.max}`) +
        bar(State.power.max ? State.power.stored / State.power.max : 0, 'var(--power)') +
        row('Status', status);
      ipanel.demolish.hidden = false;
      ipanel.demolish.textContent = refundText('laser_turret');
    }
    ipanel.title.textContent = title;
    ipanel.body.innerHTML = body;
    updateUpgradeRows();
  }

  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.1) dt = 0.1; // clamp on tab switch

    if (!State.gameOver && !State.paused) {
      updateWaves(dt);
      updateHarvesters(dt);
      updateHQ(dt);
      updateFactories(dt);
      updateLogistics(dt);
      updateConveyors(dt);
      updateTurrets(dt);
      updateProjectiles(dt);
      updateEnemies(dt);
      updatePickups(dt);
      updateParticles(dt);
    }
    Render.drawFrame();
    updateHUD();
    updateInfoPanel();

    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
