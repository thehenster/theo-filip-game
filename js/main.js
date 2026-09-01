// Game loop, chunk streaming, input and HUD.
const SAVE_KEY = 'voxelcraft.save.v1';
const SETTINGS_KEY = 'voxelcraft.settings.v1';
const NEXT_SEED_KEY = 'voxelcraft.nextseed';

// Everything the home screen can change, and what it does when it changes.
const Settings = {
  values: { viewDist: 8, sensitivity: 1, fov: 70, volume: 35, dayLength: 600 },
  load() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) Object.assign(this.values, JSON.parse(raw));
    } catch (e) { /* defaults are fine */ }
    return this.values;
  },
  save() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.values)); } catch (e) { /* ignore */ }
  },
  set(key, value) {
    this.values[key] = value;
    this.save();
    if (key === 'viewDist') { Game.viewDist = value; Game.lastChunk = null; }
    if (key === 'volume' && Sound.master) Sound.master.gain.value = value / 100;
  },
};
const VIEW_DIST = 8;              // chunks in each direction
const DAY_LENGTH = 600;           // seconds for a full day/night cycle

const Game = {
  input: { forward: 0, back: 0, left: 0, right: 0, jump: 0, sneak: 0, sprint: 0 },
  hotbar: [],
  slot: 0,
  time: 0.24,
  timeFlow: true,
  viewDist: VIEW_DIST,
  ready: false,
  paused: true,
  showDebug: false,
  genQueue: [],
  lastChunk: null,
  breakTimer: 0, placeTimer: 0,
  mouse: { left: false, right: false },
  craftSize: 2,
  paletteFilter: 'all',
  mining: null,
  portalArmed: true,
  plan: [0, 0, 0, 0],
  brush: 0,
  keyBreak: false, keyPlace: false,
  fov: 70,
  waterScroll: 0,
  lastSpace: 0,
  fpsSamples: [],
  mode: 'creative',
  dragLook: false,      // pointer lock unavailable (e.g. embedded in a frame)
  dragging: false,
  dragMoved: 0,

  init() {
    buildTextures();
    buildBlocks();
    defineItems();
    defineAnimals();
    buildMobSkins();
    defineRecipes();
    defineTrades();
    defineSmelting();
    this.hotbar = [B.GRASS, B.DIRT, B.STONE, B.COBBLESTONE, B.PLANKS, B.LOG, B.LEAVES, B.GLASS, B.GLOWSTONE];
    Settings.load();
    this.viewDist = Settings.values.viewDist;

    this.canvas = document.getElementById('gl');
    try {
      this.renderer = new Renderer(this.canvas);
    } catch (e) {
      document.getElementById('loading').innerHTML =
        '<div class="panel"><h1>Cannot start</h1><p>' + e.message + '</p></div>';
      throw e;
    }

    const save = this.loadSave();
    let seed = save ? save.seed : (Math.random() * 1e9) | 0;
    if (!save) {
      const wanted = localStorage.getItem(NEXT_SEED_KEY);
      if (wanted) {
        seed = /^-?\d+$/.test(wanted.trim()) ? parseInt(wanted, 10) | 0 : hashString(wanted);
        localStorage.removeItem(NEXT_SEED_KEY);
      }
    }
    this.worlds = {
      overworld: new World(seed),
      nether: new World((seed ^ 0x5eed5eed) | 0, 'nether'),
      end: new World((seed ^ 0x3e4d11) | 0, 'end'),
    };
    if (save) for (const [k, v] of save.edits) this.worlds.overworld.edits.set(k, v);
    if (save && save.netherEdits) for (const [k, v] of save.netherEdits) this.worlds.nether.edits.set(k, v);
    if (save && save.endEdits) for (const [k, v] of save.endEdits) this.worlds.end.edits.set(k, v);
    if (save && save.dragonSlain) this.worlds.end.dragonSlain = true;
    this.dimension = (save && save.dimension) || 'overworld';
    this.world = this.worlds[this.dimension];
    this.player = new Player(this.world);

    this.buildHotbarUI();
    this.buildInventoryUI();
    this.bindInput();

    // spawn: generate the home chunk first so we can stand on the surface
    const spawn = save ? save.pos : null;
    const home = spawn ? [Math.floor(spawn[0]), Math.floor(spawn[2])] : this.findSpawn();
    const sx = home[0], sz = home[1];
    this.world.generateChunk(sx >> 4, sz >> 4);
    if (spawn) {
      this.player.pos = spawn.slice();
      this.player.yaw = save.yaw; this.player.pitch = save.pitch;
      this.player.flying = save.flying;
      this.time = save.time;
      if (save.hotbar) this.hotbar = save.hotbar;
      if (save.inventory) Inventory.load(save.inventory);
      if (save.equipment) Equipment.load(save.equipment);
      if (save.chests) this.worlds.overworld.chests = new Map(save.chests);
      if (save.hp) this.player.hp = save.hp;
      if (save.slot != null) this.slot = save.slot;
      if (save.mode) this.mode = save.mode;
    } else {
      let y = CY - 1;
      while (y > 0 && !isSolid(this.world.getBlock(sx, y, sz))) y--;
      this.player.pos = [sx + 0.5, y + 1.2, sz + 0.5];
      this.player.flying = false;
    }
    this.setMode(this.mode, true);
    this.renderer.buildHandMesh(this.hotbar[this.slot]);
    this.updateHotbarUI();
    this.buildMenuUI();

    this.player.spawn = this.player.pos.slice();
    document.getElementById('respawn').addEventListener('click', () => {
      this.player.respawn();
      this.dying = false;
      document.getElementById('died').classList.add('hidden');
      const pl = this.canvas.requestPointerLock();
      if (pl && pl.catch) pl.catch(() => { this.paused = false; });
    });
    window.addEventListener('beforeunload', () => this.save());
    setInterval(() => { if (!this.paused) this.save(true); }, 20000);

    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
  },

  // The home screen: tabs, mode cards and the settings sliders.
  buildMenuUI() {
    for (const tab of document.querySelectorAll('.tab')) {
      tab.addEventListener('click', () => {
        for (const t of document.querySelectorAll('.tab')) t.classList.toggle('active', t === tab);
        for (const p of document.querySelectorAll('.tab-page')) p.hidden = p.dataset.page !== tab.dataset.tab;
      });
    }
    for (const card of document.querySelectorAll('.mode-card')) {
      card.addEventListener('click', () => this.setMode(card.dataset.mode));
    }

    const v = Settings.values;
    const bind = (id, out, key, toValue, format) => {
      const input = document.getElementById(id), label = document.getElementById(out);
      input.value = key === 'sensitivity' ? Math.round(v[key] * 100) : v[key];
      label.textContent = format(v[key]);
      input.addEventListener('input', () => {
        const value = toValue(+input.value);
        Settings.set(key, value);
        label.textContent = format(value);
      });
    };
    bind('set-view', 'out-view', 'viewDist', n => n, n => n + ' chunks');
    bind('set-fov', 'out-fov', 'fov', n => n, n => n + '\u00b0');
    bind('set-sens', 'out-sens', 'sensitivity', n => n / 100, n => (n).toFixed(2) + '\u00d7');
    bind('set-vol', 'out-vol', 'volume', n => n, n => n + '%');
    bind('set-day', 'out-day', 'dayLength', n => n, n => Math.round(n / 60) + ' min');

    const seed = document.getElementById('set-seed');
    seed.value = localStorage.getItem(NEXT_SEED_KEY) || '';
    seed.addEventListener('input', () => {
      const t = seed.value.trim();
      if (t) localStorage.setItem(NEXT_SEED_KEY, t); else localStorage.removeItem(NEXT_SEED_KEY);
    });
    seed.addEventListener('keydown', e => e.stopPropagation());
  },

  // Walk outwards from the origin until we find dry, gentle ground.
  findSpawn() {
    for (let r = 0; r < 600; r += 6) {
      for (let a = 0; a < Math.max(1, r); a += 6) {
        const t = a / Math.max(1, r) * Math.PI * 2;
        const x = Math.round(Math.cos(t) * r), z = Math.round(Math.sin(t) * r);
        const c = this.world.column(x, z);
        if (c.h > SEA_LEVEL + 2 && c.h < 84 && c.biome !== 'peaks') return [x, z];
      }
    }
    return [8, 8];
  },

  // ---- input -----------------------------------------------------------
  bindInput() {
    const keyMap = {
      ArrowUp: 'forward', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right',
      Space: 'jump', ShiftLeft: 'sneak', ShiftRight: 'sneak',
      KeyS: 'sprint',
    };
    addEventListener('keydown', e => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (keyMap[e.code]) {
        if (e.code === 'Space' && !e.repeat) {
          const now = performance.now();
          if (now - this.lastSpace < 300) this.toggleFly();
          this.lastSpace = now;
        }
        this.input[keyMap[e.code]] = 1;
        return;
      }
      if (e.code === 'KeyM' || e.code === 'KeyP') {
        if (this.paused || !this.ready) return;
        if (e.repeat) return;                       // our own timer drives the repeat
        if (e.code === 'KeyM') { this.keyBreak = true; this.startBreak(); }
        else { this.keyPlace = true; this.placeBlock(); this.placeTimer = 0.28; }
        return;
      }
      if (e.repeat) return;
      if (e.code.startsWith('Digit')) {
        const n = +e.code.slice(5);
        if (n >= 1 && n <= 9) this.selectSlot(n - 1);
      } else if (e.code === 'KeyE') {
        if (this.chestAt) this.closeChest();
        else if (this.trading) this.closeTrading();
        else if (this.furnaceOpen) this.closeFurnace();
        else this.toggleInventory();
      }
      else if (e.code === 'KeyF') this.toggleFly();
      else if (e.code === 'F3') { e.preventDefault(); this.showDebug = !this.showDebug; document.getElementById('debug').classList.toggle('hidden', !this.showDebug); }
      else if (e.code === 'KeyT') { this.timeFlow = !this.timeFlow; this.toast(this.timeFlow ? 'Time flowing' : 'Time frozen'); }
      else if (e.code === 'KeyN') { this.time = (this.time + 0.5) % 1; this.toast('Time skipped'); }
      else if (e.code === 'Escape') {
        if (this.chestAt) this.closeChest();
        else if (this.furnaceOpen) this.closeFurnace();
        else if (this.trading) this.closeTrading();
        else if (this.inventoryOpen) this.closeCrafting();
        else if (this.dragLook) this.exitDragLook();
      }
    });
    addEventListener('keyup', e => {
      if (keyMap[e.code]) this.input[keyMap[e.code]] = 0;
      if (e.code === 'KeyM') this.keyBreak = false;
      if (e.code === 'KeyP') this.keyPlace = false;
    });
    addEventListener('blur', () => {
      for (const k in this.input) this.input[k] = 0;
      this.keyBreak = this.keyPlace = false;
    });

    addEventListener('mousemove', e => {
      const locked = document.pointerLockElement === this.canvas;
      if (!locked) {
        if (!this.dragging) return;
        this.dragMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
      }
      const s = 0.0022 * Settings.values.sensitivity;
      this.player.yaw += e.movementX * s;
      this.player.pitch = clamp(this.player.pitch - e.movementY * s, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
      if (this.player.yaw > Math.PI * 2) this.player.yaw -= Math.PI * 2;
      if (this.player.yaw < 0) this.player.yaw += Math.PI * 2;
    });
    this.canvas.addEventListener('mousedown', e => {
      if (document.pointerLockElement !== this.canvas) {
        // drag to look; a click that barely moves still breaks or places
        if (!this.dragLook || this.paused) return;
        this.dragging = true; this.dragMoved = 0;
        return;
      }
      if (e.button === 0) { this.mouse.left = true; this.startBreak(); }
      if (e.button === 2) { this.mouse.right = true; this.placeBlock(); this.placeTimer = 0.28; }
      if (e.button === 1) { e.preventDefault(); this.pickBlock(); }
    });
    addEventListener('mouseup', e => {
      if (this.dragging) {
        this.dragging = false;
        if (this.dragMoved < 8) { if (e.button === 2) this.placeBlock(); else if (e.button === 0) this.startBreak(); }
      }
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('wheel', e => {
      if (this.paused) return;
      this.selectSlot((this.slot + (e.deltaY > 0 ? 1 : -1) + 9) % 9);
    }, { passive: true });

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (locked) this.dragLook = false;
      if (!locked && this.dragLook) return;      // fallback mode drives the menu itself
      this.paused = !locked;
      document.getElementById('menu').classList.toggle('hidden', locked);
      if (!locked) {
        for (const k in this.input) this.input[k] = 0;
        this.mouse.left = this.mouse.right = false;
        this.keyBreak = this.keyPlace = false;
      }
    });
    const play = () => {
      Sound.init(); Sound.resume();
      if (Sound.master) Sound.master.gain.value = Settings.values.volume / 100;
      let req;
      try { req = this.canvas.requestPointerLock(); } catch (err) { req = null; }
      if (req && req.catch) req.catch(() => this.enterDragLook());
      setTimeout(() => { if (document.pointerLockElement !== this.canvas) this.enterDragLook(); }, 500);
    };
    document.getElementById('play').addEventListener('click', play);
    this.canvas.addEventListener('click', () => { if (this.paused && !this.inventoryOpen && !this.trading) play(); });
    document.getElementById('newworld').addEventListener('click', () => {
      if (!confirm('Discard this world and generate a new one?')) return;
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    });
    document.getElementById('savebtn').addEventListener('click', () => this.save());
  },

  // Pointer lock is unavailable in some embeds; play with click-drag instead.
  enterDragLook() {
    if (this.dragLook || document.pointerLockElement === this.canvas) return;
    this.dragLook = true;
    this.paused = false;
    document.getElementById('menu').classList.add('hidden');
    this.toast('Drag to look \u00b7 Esc for the menu');
  },
  exitDragLook() {
    this.dragLook = false; this.dragging = false;
    this.paused = true;
    this.keyBreak = this.keyPlace = false;
    document.getElementById('menu').classList.remove('hidden');
    for (const k in this.input) this.input[k] = 0;
  },

  // Creative: fly, build from thin air, take no damage.
  // Survival: your hands, your stock, your health.
  setMode(mode, quiet) {
    this.mode = mode === 'survival' ? 'survival' : 'creative';
    const creative = this.mode === 'creative';
    this.player.invulnerable = creative;
    if (!creative && this.player.flying) this.player.flying = false;
    if (creative) { this.player.hp = this.player.maxHp; this.player.dead = false; }
    document.body.classList.toggle('survival', !creative);
    for (const el of document.querySelectorAll('.mode-card')) {
      el.classList.toggle('active', el.dataset.mode === this.mode);
    }
    this._hudHp = null;
    this.updateHotbarUI();
    if (!quiet) this.toast(creative ? 'Creative mode' : 'Survival mode');
  },

  selectSlot(i) {
    this.slot = i;
    this.updateHotbarUI();
    this.renderer.buildHandMesh(this.hotbar[this.slot]);
  },

  // ---- world interaction ----------------------------------------------
  // A press: hit an animal if one is in the way, otherwise start on the block.
  startBreak() {
    const hit = this.player.raycast();
    const mob = Animals.pick(this.player.eye, this.player.dir, hit ? hit.dist : this.player.reach);
    if (mob) {
      const weapon = heldWeapon(this.hotbar[this.slot]);
      const res = Animals.punch(mob, this.player.dir, weapon ? weapon.damage : 1, this.world);
      Sound.burst({ dur: 0.09, freq: weapon ? 520 : 380, gain: 0.35, sweep: 0.5 });
      if (res.killed && mob.def.boss) this.dragonSlain(mob);
      if (res.killed && res.drops && res.drops.length) {
        this.toast('Collected ' + res.drops.map(d => thingName(d[0]) + (d[1] > 1 ? ' \u00d7' + d[1] : '')).join(', '));
      }
      this.mining = null;
      return;
    }
    if (this.mode === 'creative') { this.breakBlock(); this.breakTimer = 0.28; return; }
    this.mining = null;                       // survival: the frame loop digs
  },

  // Survival digging: hardness and your tool decide how long it takes.
  updateMining(dt) {
    const hit = this.player.raycast();
    if (!hit) { this.mining = null; return; }
    const held = this.hotbar[this.slot];
    const m = this.mining;
    if (!m || m.x !== hit.x || m.y !== hit.y || m.z !== hit.z || m.held !== held) {
      this.mining = { x: hit.x, y: hit.y, z: hit.z, held, t: 0, sound: 0, total: breakTime(hit.id, held) };
      return;
    }
    if (!isFinite(m.total)) return;           // bedrock never gives
    m.t += dt;
    m.sound -= dt;
    if (m.sound <= 0) { Sound.dig(hit.id); m.sound = 0.33; }
    if (m.t >= m.total) { this.breakBlock(); this.mining = null; }
  },

  breakBlock() {
    const hit = this.player.raycast();
    // an animal standing in front of the block takes the hit instead
    const mob = Animals.pick(this.player.eye, this.player.dir, hit ? hit.dist : this.player.reach);
    if (mob) {
      const weapon = heldWeapon(this.hotbar[this.slot]);
      const res = Animals.punch(mob, this.player.dir, weapon ? weapon.damage : 1, this.world);
      Sound.burst({ dur: 0.09, freq: weapon ? 520 : 380, gain: 0.35, sweep: 0.5 });
      if (res.killed && mob.def.boss) this.dragonSlain(mob);
      if (res.killed && res.drops && res.drops.length) {
        this.toast('Collected ' + res.drops.map(d => thingName(d[0]) + (d[1] > 1 ? ' \u00d7' + d[1] : '')).join(', '));
      }
      return;
    }
    if (!hit) return;
    if (hit.id === B.BEDROCK) { this.toast('Bedrock cannot be broken'); return; }
    Sound.dig(hit.id);
    this.world.setBlock(hit.x, hit.y, hit.z, 0);

    // what you walk away with depends on the tool in your hand
    const tool = heldTool(this.hotbar[this.slot]);
    const needed = pickTier(hit.id);
    const have = tool && tool.tool === 'pickaxe' ? tool.tier : 0;
    const drop = blockDrop(hit.id);
    if (needed > have) {
      this.toast('That needs ' + TIER_NAMES[needed] + ' to collect');
    } else if (drop) {
      // gravel sometimes gives up a piece of flint instead
      const gives = hit.id === B.GRAVEL && Math.random() < 0.2 ? I.FLINT : drop;
      const n = gives === drop && tool && bestTool(hit.id) === tool.tool ? 2 : 1;
      Drops.spawn(this.world, hit.x + 0.5, hit.y + 0.4, hit.z + 0.5, gives, n, 0.5);
    }
    if (hit.id === B.OBSIDIAN || hit.id === B.PORTAL) Portal.extinguish(this.world, hit.x, hit.y, hit.z);
    if (hit.id === B.CHEST) {
      const key = hit.x + ',' + hit.y + ',' + hit.z;
      for (const [id, n] of this.world.chests.get(key) || [])
        Drops.spawn(this.world, hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, id, n, 0.8);
      this.world.chests.delete(key);
    }
    if (BLOCKS[hit.id].door) {                       // a door comes down in one piece
      const upper = hit.id === B.DOOR_UPPER || hit.id === B.DOOR_UPPER_OPEN;
      this.world.setBlock(hit.x, hit.y + (upper ? -1 : 1), hit.z, 0);
    }
  },
  placeBlock(fromRepeat) {
    const hit = this.player.raycast();

    if (!fromRepeat) {
      // an animal in the way comes first
      const mob = Animals.pick(this.player.eye, this.player.dir, hit ? hit.dist : this.player.reach);
      if (mob && mob.def.villager) { this.openTrading(mob); return; }

      // then whatever you are pointing at, whatever you happen to be holding
      if (hit && !this.input.sneak) {
        const id = hit.id;
        if (id === B.CRAFTING_TABLE) { this.openCrafting(3); return; }
        if (id === B.CHEST) { this.openChest(hit); return; }
        if (BLOCKS[id].door) { this.toggleDoor(hit); return; }
        if (id === B.BED_HEAD || id === B.BED_FOOT) { this.useBed(hit); return; }
        if (id === B.FURNACE) { this.openFurnace(); return; }
      }
    }

    const held = this.hotbar[this.slot];
    if (isItem(held)) { if (!fromRepeat) this.useItem(held); return; }
    if (!hit) return;
    const [x, y, z] = hit.place;
    if (y < 0 || y >= CY) return;
    const existing = this.world.getBlock(x, y, z);
    if (existing && !isLiquid(existing)) return;
    const id = this.hotbar[this.slot];
    if (!id) return;
    if (isSolid(id) && this.player.intersectsBlock(x, y, z)) return;
    if (this.mode === 'survival' && Inventory.count(id) <= 0) {
      this.toast('You have no ' + thingName(id) + ' left');
      return;
    }
    if (id === B.DOOR_LOWER) {
      if (this.world.getBlock(x, y + 1, z) !== 0) { this.toast('No headroom for a door'); return; }
      if (this.mode === 'survival' && Inventory.count(id) <= 0) { this.toast('You have no doors left'); return; }
      this.world.setBlock(x, y, z, B.DOOR_LOWER);
      this.world.setBlock(x, y + 1, z, B.DOOR_UPPER);
      Sound.place();
      if (this.mode === 'survival') { Inventory.take(id, 1); this.updateHotbarUI(); }
      return;
    }
    if (this.world.setBlock(x, y, z, id)) {
      if (id === B.CHEST) this.world.chests.set(x + ',' + y + ',' + z, []);
      Sound.place();
      if (this.mode === 'survival') { Inventory.take(id, 1); this.updateHotbarUI(); }
    }
  },
  toggleFly() {
    if (this.mode === 'survival') {
      this.player.flying = false;          // never leave survival airborne
      this.toast('Flying is creative only');
      return;
    }
    this.player.flying = !this.player.flying;
    this.player.vel[1] = 0;
    this.toast(this.player.flying ? 'Flying' : 'Walking');
  },

  // The dragon falls: an egg on the way home, and it stays dead.
  dragonSlain(mob) {
    this.world.dragonSlain = true;
    let y = CY - 1;
    while (y > 2 && this.world.getBlock(0, y, 0) !== B.END_PORTAL) y--;
    if (y > 2) this.world.setBlock(0, y + 1, 0, B.DRAGON_EGG);
    Sound.burst({ dur: 1.6, freq: 160, gain: 0.5, sweep: 0.2 });
    this.toast('The dragon falls. Its egg rests on the portal.');
  },

  // Twelve filled frames around a three by three opens the way to the End.
  tryOpenEndPortal(fx, fy, fz) {
    const w = this.world;
    for (let cx = fx - 2; cx <= fx + 2; cx++) {
      for (let cz = fz - 2; cz <= fz + 2; cz++) {
        let complete = true;
        for (let dx = -2; dx <= 2 && complete; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            const ring = (Math.abs(dx) === 2) !== (Math.abs(dz) === 2);
            if (!ring) continue;
            if (w.getBlock(cx + dx, fy, cz + dz) !== B.END_FRAME_FILLED) { complete = false; break; }
          }
        }
        if (!complete) continue;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          w.setBlock(cx + dx, fy, cz + dz, B.END_PORTAL);
        }
        Sound.burst({ dur: 1.0, freq: 300, gain: 0.45, sweep: 3 });
        return true;
      }
    }
    return false;
  },

  // Doors swing: the closed halves become the thin open ones, and back.
  toggleDoor(hit) {
    const w = this.world;
    const upper = hit.id === B.DOOR_UPPER || hit.id === B.DOOR_UPPER_OPEN;
    const y = upper ? hit.y - 1 : hit.y;
    const closed = w.getBlock(hit.x, y, hit.z) === B.DOOR_LOWER;
    w.setBlock(hit.x, y, hit.z, closed ? B.DOOR_LOWER_OPEN : B.DOOR_LOWER);
    w.setBlock(hit.x, y + 1, hit.z, closed ? B.DOOR_UPPER_OPEN : B.DOOR_UPPER);
    Sound.burst({ dur: 0.16, freq: closed ? 520 : 380, gain: 0.3, sweep: 0.6 });
  },

  // A bed sets where you wake up, and lets you sleep the night away.
  useBed(hit) {
    const w = this.world;
    let sx = hit.x, sz = hit.z;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!isSolid(w.getBlock(hit.x + dx, hit.y, hit.z + dz)) && !isSolid(w.getBlock(hit.x + dx, hit.y + 1, hit.z + dz))) {
        sx = hit.x + dx; sz = hit.z + dz; break;
      }
    }
    this.player.spawn = [sx + 0.5, hit.y, sz + 0.5];
    if (this.time > 0.5) {
      this.time = 0.01;
      this.player.heal(4);
      this.toast('You sleep until morning. You will wake up here.');
    } else {
      this.toast('You can only sleep at night. You will wake up here.');
    }
    Sound.burst({ dur: 0.3, freq: 300, gain: 0.25, sweep: 0.5 });
  },

  openFurnace() {
    this.furnaceOpen = true;
    document.getElementById('furnace').classList.add('open');
    document.exitPointerLock();
    if (this.dragLook) this.paused = true;
    this.refreshFurnace();
  },
  closeFurnace() {
    this.furnaceOpen = false;
    document.getElementById('furnace').classList.remove('open');
    if (this.dragLook) { this.paused = false; return; }
    const p = this.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  },
  refreshFurnace() {
    const fuel = currentFuel();
    document.getElementById('furnace-fuel').textContent =
      fuel ? thingName(fuel) + ' \u00d7' + Inventory.count(fuel) : 'none';
    const list = document.getElementById('furnace-list');
    list.innerHTML = '';
    for (const s of SMELTING) {
      const have = Inventory.count(s.from);
      const b = document.createElement('button');
      b.className = 'deal';
      b.innerHTML =
        '<span class="side"><img src="' + thingIcon(s.from) + '" alt=""><span class="qty">' +
          thingName(s.from) + (have ? ' \u00d7' + have : '') + '</span></span>' +
        '<span class="to">&rarr;</span>' +
        '<span class="side"><img src="' + thingIcon(s.to) + '" alt=""><span class="qty">' + thingName(s.to) + '</span></span>' +
        '<span class="left">' + (have ? (fuel ? 'smelt one' : 'no fuel') : 'none to smelt') + '</span>';
      b.disabled = !have || !fuel;
      b.addEventListener('click', () => {
        const f = currentFuel();
        if (!f || !Inventory.take(s.from, 1)) return;
        Inventory.take(f, 1);
        Inventory.add(s.to, 1);
        Sound.burst({ dur: 0.25, freq: 700, gain: 0.3, sweep: 0.4 });
        this.toast('Smelted ' + thingName(s.to));
        this.hotbarCheck();
        this.refreshFurnace();
      });
      list.appendChild(b);
    }
  },

  // A chest is a real container. Village ones start with something worth taking,
  // fixed by position; ones you place yourself start empty.
  chestContents(hit) {
    const key = hit.x + ',' + hit.y + ',' + hit.z;
    let stacks = this.world.chests.get(key);
    if (!stacks) {
      stacks = [];
      const rnd = mulberry32((hash3(hit.x, hit.y, hit.z, this.world.seed) * 4294967296) | 0);
      const table = [
        [I.IRON_INGOT, 1, 3], [I.EMERALD, 1, 2], [I.LEATHER, 1, 3], [I.FLINT, 1, 2],
        [I.STICK, 2, 6], [B.PLANKS, 4, 10], [I.BEEF, 1, 3], [B.COAL_ORE, 2, 5], [I.GOLD_INGOT, 1, 1],
      ];
      const picks = 2 + Math.floor(rnd() * 3);
      for (let i = 0; i < picks; i++) {
        const [id, min, max] = table[Math.floor(rnd() * table.length)];
        stacks.push([id, min + Math.floor(rnd() * (max - min + 1))]);
      }
      this.world.chests.set(key, stacks);
    }
    return stacks;
  },

  openChest(hit) {
    this.chestAt = hit;
    this.chestStacks = this.chestContents(hit);
    document.getElementById('chest').classList.add('open');
    document.exitPointerLock();
    if (this.dragLook) this.paused = true;
    this.refreshChest();
    Sound.burst({ dur: 0.18, freq: 620, gain: 0.3, sweep: 0.5 });
  },
  closeChest() {
    this.chestAt = null;
    document.getElementById('chest').classList.remove('open');
    if (this.dragLook) { this.paused = false; return; }
    const p = this.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  },
  refreshChest() {
    const stacks = this.chestStacks || [];
    const inside = document.getElementById('chest-slots');
    inside.innerHTML = '';
    for (let i = 0; i < Math.max(27, stacks.length); i++) {
      const st = stacks[i];
      inside.appendChild(this.slotEl(st ? st[0] : 0, st ? st[1] : 0, st ? () => {
        Inventory.add(st[0], st[1]);
        this.toast('Took ' + thingName(st[0]) + (st[1] > 1 ? ' \u00d7' + st[1] : ''));
        stacks.splice(stacks.indexOf(st), 1);
        this.updateHotbarUI();
        this.refreshChest();
      } : null));
    }
    const mine = document.getElementById('chest-inv');
    mine.innerHTML = '';
    const entries = Inventory.entries();
    for (const [id, n] of entries) {
      mine.appendChild(this.slotEl(id, n, () => {
        Inventory.take(id, n);
        stacks.push([id, n]);
        this.toast('Stored ' + thingName(id) + (n > 1 ? ' \u00d7' + n : ''));
        this.hotbarCheck();
        this.refreshChest();
      }));
    }
    for (let i = entries.length; i < 18; i++) mine.appendChild(this.slotEl(0, 0, null));
  },

  // Food heals; anything else you are holding just gets a swing.
  useItem(id) {
    const def = itemDef(id);
    if (def && def.pearl) {
      if (!Inventory.take(id, 1)) return;
      Thrown.throwPearl(this.world, this.player, id);
      this.hotbarCheck();
      Sound.burst({ dur: 0.12, freq: 900, gain: 0.25, sweep: 1.6 });
      return;
    }
    if (def && def.eye) {
      const hit = this.player.raycast();
      if (!hit || hit.id !== B.END_FRAME) { this.toast('That needs an empty portal frame'); return; }
      if (!Inventory.take(id, 1)) return;
      this.world.setBlock(hit.x, hit.y, hit.z, B.END_FRAME_FILLED);
      this.hotbarCheck();
      Sound.burst({ dur: 0.3, freq: 1400, gain: 0.3, sweep: 0.5 });
      const opened = this.tryOpenEndPortal(hit.x, hit.y, hit.z);
      this.toast(opened ? 'The frame completes — the way stands open' : 'The eye settles into the frame');
      return;
    }
    if (def && def.igniter) {
      const hit = this.player.raycast();
      if (!hit) { this.toast('Nothing to light'); return; }
      const [x, y, z] = hit.place;
      if (Portal.light(this.world, x, y, z)) {
        Sound.burst({ dur: 0.5, freq: 900, gain: 0.4, sweep: 0.25 });
        this.toast('The portal roars open');
      } else {
        this.toast('That needs an obsidian frame around it');
      }
      return;
    }
    if (!def || !def.food) return;
    if (this.player.hp >= this.player.maxHp) { this.toast('Not hungry'); return; }
    if (!Inventory.take(id, 1)) { this.toast('You have none left'); return; }
    this.player.heal(def.food);
    this.hotbarCheck();
    Sound.burst({ dur: 0.2, freq: 300, gain: 0.3, sweep: 0.6 });
    this.toast('Ate ' + def.name);
  },

  // Drop hotbar entries for items you no longer carry.
  hotbarCheck() {
    for (let i = 0; i < 9; i++) {
      const id = this.hotbar[i];
      if (isItem(id) && Inventory.count(id) <= 0) this.hotbar[i] = 0;
    }
    this.updateHotbarUI();
    this.renderer.buildHandMesh(this.hotbar[this.slot]);
  },

  pickBlock() {
    const hit = this.player.raycast();
    if (!hit) return;
    this.hotbar[this.slot] = hit.id;
    this.updateHotbarUI();
    this.renderer.buildHandMesh(hit.id);
  },

  // ---- chunk streaming -------------------------------------------------
  updateChunks() {
    const w = this.world;
    const pcx = Math.floor(this.player.pos[0] / CX), pcz = Math.floor(this.player.pos[2] / CZ);
    const key = pcx + ':' + pcz;
    if (key !== this.lastChunk) {
      this.lastChunk = key;
      const want = [];
      for (let dz = -this.viewDist; dz <= this.viewDist; dz++) {
        for (let dx = -this.viewDist; dx <= this.viewDist; dx++) {
          const d = dx * dx + dz * dz;
          if (d > (this.viewDist + 0.5) * (this.viewDist + 0.5)) continue;
          want.push({ cx: pcx + dx, cz: pcz + dz, d });
        }
      }
      want.sort((a, b) => a.d - b.d);
      this.genQueue = want;
      // drop chunks that fell out of range
      const maxD = (this.viewDist + 2) * (this.viewDist + 2);
      for (const c of [...w.chunks.values()]) {
        const dx = c.cx - pcx, dz = c.cz - pcz;
        if (dx * dx + dz * dz > maxD) {
          if (c.mesh) { this.renderer.freeMesh(c.mesh.solid); this.renderer.freeMesh(c.mesh.fluid); }
          w.unloadChunk(c.cx, c.cz);
        }
      }
    }

    let deadline = performance.now() + (this.ready ? 6 : 14);
    while (this.genQueue.length && performance.now() < deadline) {
      const n = this.genQueue[0];
      if (w.getChunk(n.cx, n.cz)) { this.genQueue.shift(); continue; }
      this.genQueue.shift();
      w.generateChunk(n.cx, n.cz);
    }

    // mesh the nearest dirty chunks whose neighbours are all present
    const dirty = [];
    for (const c of w.chunks.values()) {
      if (!c.dirty) continue;
      let ok = true;
      for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!w.getChunk(c.cx + dx, c.cz + dz)) { ok = false; break; }
      }
      if (!ok) continue;
      const dx = c.cx - pcx, dz = c.cz - pcz;
      dirty.push({ c, d: dx * dx + dz * dz });
    }
    dirty.sort((a, b) => a.d - b.d);
    deadline = performance.now() + (this.ready ? 7 : 16);
    let meshed = 0;
    for (const { c } of dirty) {
      if (performance.now() > deadline && meshed > 0) break;
      c.dirty = false;
      if (c.empty && !c.mesh) continue;
      this.renderer.uploadChunk(c, meshChunk(w, c));
      meshed++;
    }

    if (!this.ready) {
      const pending = this.genQueue.length + dirty.length;
      const total = this.genQueue.length + w.chunks.size;
      const pct = Math.min(99, Math.round(100 * (1 - pending / Math.max(1, total))));
      document.getElementById('loadbar').style.width = pct + '%';
      if (this.genQueue.length === 0 && dirty.length <= 1) {
        this.ready = true;
        document.getElementById('loading').classList.add('hidden');
        Animals.seed(w, this.player, this.viewDist);
      }
    }
  },

  // ---- frame -----------------------------------------------------------
  frame(now) {
    requestAnimationFrame(t => this.frame(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, 0.1);

    this.updateChunks();

    if (this.ready && !this.paused) {
      if (this.timeFlow) this.time = (this.time + dt / Settings.values.dayLength) % 1;
      const wasInWater = this.player.inWater;
      const res = this.player.update(dt, this.input);
      if (this.dimension !== 'nether') {
        Animals.update(dt, this.world, this.player, this.viewDist, this.dimension === 'overworld' && this.time < 0.5);
      }
      Fluid.update(dt, this.world);
      Thrown.update(dt, this.world, p => {
        // you go where the pearl went
        const px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
        let y = py;
        while (y < CY - 2 && isSolid(this.world.getBlock(px, y, pz))) y++;
        this.player.pos = [px + 0.5, y, pz + 0.5];
        this.player.vel = [0, 0, 0];
        this.player.fallFrom = null;
        this.player.damage(2, 'the leap');
        Sound.burst({ dur: 0.3, freq: 300, gain: 0.35, sweep: 2.4 });
        this.toast('You blink across');
      });
      Drops.update(dt, this.world, this.player, d => {
        Inventory.add(d.id, d.count);
        Sound.burst({ dur: 0.07, freq: 1100, gain: 0.18, sweep: 1.4 });
        this.toast('Picked up ' + thingName(d.id) + (d.count > 1 ? ' \u00d7' + d.count : ''));
        this.updateHotbarUI();
        if (this.inventoryOpen) this.refreshCraft();
      });
      this.checkDeath();
      this.updatePortal(dt);
      if (this.player.inWater !== wasInWater) Sound.splash();
      this.stepAudio(dt, res);

      const locked = document.pointerLockElement === this.canvas;
      const breaking = (this.mouse.left && locked) || this.keyBreak;
      if (breaking && this.mode === 'creative') {
        this.breakTimer -= dt;
        if (this.breakTimer <= 0) { this.breakBlock(); this.breakTimer = 0.22; }
      } else if (breaking) {
        this.updateMining(dt);
      } else this.mining = null;
      if ((this.mouse.right && locked) || this.keyPlace) { this.placeTimer -= dt; if (this.placeTimer <= 0) { this.placeBlock(true); this.placeTimer = 0.22; } }
    }

    this.waterScroll = (this.waterScroll + dt * 0.06) % 1;
    const targetFov = Settings.values.fov + (this.input.sprint && !this.paused ? 6 : 0);
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 8);

    this.renderer.render(this.buildScene());
    this.updateHUD(dt);
  },

  stepAudio(dt, res) {
    if (!res.landed || res.speed < 1.2 || this.player.flying) { this.stepAcc = 0; return; }
    this.stepAcc = (this.stepAcc || 0) + dt * res.speed;
    if (this.stepAcc > 2.1) { this.stepAcc = 0; Sound.step(); }
  },

  buildScene() {
    const p = this.player;
    const a = this.time * Math.PI * 2;
    const sun = [Math.cos(a), Math.sin(a), 0.25];
    const sl = Math.hypot(sun[0], sun[1], sun[2]);
    sun[0] /= sl; sun[1] /= sl; sun[2] /= sl;
    const dayN = clamp((sun[1] + 0.12) / 0.35, 0, 1);
    const dayFactor = 0.06 + 0.94 * dayN;
    const sunset = clamp(1 - Math.abs(sun[1]) / 0.3, 0, 1) * dayN;

    const mix = (a1, b1, t) => [lerp(a1[0], b1[0], t), lerp(a1[1], b1[1], t), lerp(a1[2], b1[2], t)];
    let zenith = mix([0.02, 0.03, 0.10], [0.30, 0.53, 0.92], dayN);
    let horizon = mix([0.05, 0.07, 0.16], [0.70, 0.83, 0.98], dayN);
    horizon = mix(horizon, [0.98, 0.55, 0.28], sunset * 0.75);
    zenith = mix(zenith, [0.35, 0.30, 0.62], sunset * 0.35);

    let fogColor = mix(horizon, zenith, 0.25);
    let fogRange = [this.viewDist * CX * 0.5, this.viewDist * CX * 0.98];
    let ambient = 0.055, day = dayFactor, stars = clamp(1 - dayN * 1.6, 0, 1);
    if (this.dimension === 'end') {
      zenith = [0.04, 0.02, 0.07];
      horizon = [0.14, 0.09, 0.20];
      fogColor = [0.07, 0.05, 0.11];
      fogRange = [this.viewDist * CX * 0.45, this.viewDist * CX * 0.95];
      ambient = 0.22;
      day = 0.5;
      stars = 0.7;
    } else if (this.dimension === 'nether') {
      zenith = [0.09, 0.02, 0.02];
      horizon = [0.34, 0.08, 0.05];
      fogColor = [0.20, 0.05, 0.04];
      fogRange = [this.viewDist * CX * 0.28, this.viewDist * CX * 0.8];
      ambient = 0.17;                 // the Nether glows faintly all over
      day = 0.35;
      stars = 0;
    }
    const underwater = p.headInWater;
    if (underwater) { fogColor = [0.08, 0.26, 0.45]; fogRange = [0.5, 20]; }
    if (p.inLava) { fogColor = [0.55, 0.16, 0.03]; fogRange = [0.2, 3]; }

    const hit = this.ready ? p.raycast() : null;
    this.lastHit = hit;

    return {
      eye: [p.pos[0], p.pos[1] + P_EYE + p.bob, p.pos[2]],
      dir: p.dir,
      fov: this.fov,
      dayFactor: day, ambient, sunDir: sun, zenith, horizon, fogColor, fogRange,
      stars,
      chunks: this.world.chunks.values(),
      mobs: Animals.list,
      drops: Drops.list.concat(Thrown.list),
      highlight: hit ? [hit.x, hit.y, hit.z] : null,
      breakPos: this.mining ? [this.mining.x, this.mining.y, this.mining.z] : null,
      breakStage: this.mining && isFinite(this.mining.total)
        ? Math.min(9, Math.floor(this.mining.t / this.mining.total * 10)) : -1,
      underwater,
      waterScroll: this.waterScroll,
      showHand: !!this.hotbar[this.slot],
      bob: p.bob * 1.6,
    };
  },

  // ---- UI --------------------------------------------------------------
  buildHotbarUI() {
    const el = document.getElementById('hotbar');
    el.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.innerHTML = '<img alt=""><span class="num">' + (i + 1) + '</span><span class="have"></span>';
      s.addEventListener('click', () => this.selectSlot(i));
      el.appendChild(s);
    }
  },
  updateHotbarUI() {
    const el = document.getElementById('hotbar');
    [...el.children].forEach((s, i) => {
      s.classList.toggle('active', i === this.slot);
      const id = this.hotbar[i];
      const img = s.querySelector('img');
      img.src = id ? thingIcon(id) : '';
      img.style.visibility = id ? 'visible' : 'hidden';
      const badge = s.querySelector('.have');
      const showCount = id && (isItem(id) || this.mode === 'survival');
      badge.textContent = showCount ? Inventory.count(id) : '';
      badge.classList.toggle('none', showCount && Inventory.count(id) === 0);
    });
    document.getElementById('slotnum').textContent = this.slot + 1;
    document.getElementById('blockname').textContent = this.hotbar[this.slot] ? thingName(this.hotbar[this.slot]) : '';
    document.getElementById('blockname').style.opacity = 1;
    clearTimeout(this._nameTimer);
    this._nameTimer = setTimeout(() => { document.getElementById('blockname').style.opacity = 0; }, 1400);
  },
  buildInventoryUI() {
    document.getElementById('craft-clear').addEventListener('click', () => {
      this.plan.fill(0); this.refreshCraft();
    });
    const filter = document.getElementById('recipe-filter');
    filter.addEventListener('input', () => { this.recipeQuery = filter.value; this.refreshCraft(); });
    filter.addEventListener('keydown', e => e.stopPropagation());
  },

  // One inventory slot: an icon, a stack count, and a name on hover.
  slotEl(id, count, onClick, opts = {}) {
    const el = document.createElement('div');
    el.className = 'mcslot' + (id ? '' : ' empty') + (opts.className ? ' ' + opts.className : '');
    if (id) {
      el.innerHTML = '<img src="' + thingIcon(id) + '" alt="">' +
        (count > 1 ? '<span class="n">' + count + '</span>' : '');
      el.title = thingName(id) + (count > 1 ? ' \u00d7' + count : '');
    } else if (opts.placeholder) {
      el.innerHTML = '<span class="ph">' + opts.placeholder + '</span>';
      el.title = opts.title || '';
    }
    if (onClick) el.addEventListener('click', onClick);
    return el;
  },

  // Creative hands you anything: blocks go straight to the hotbar, items into your bag
  // (and armour onto you), so they behave exactly as if you had made them.
  takeFromCatalogue(id, count) {
    if (isItem(id)) {
      Inventory.add(id, count);
      const def = itemDef(id);
      if (def.armour) {
        if (!Equipment[def.slot]) Equipment.equip(id);
      } else {
        this.hotbar[this.slot] = id;
        this.renderer.buildHandMesh(id);
      }
      this.toast('Took ' + thingName(id) + (count > 1 ? ' \u00d7' + count : ''));
    } else {
      this.hotbar[this.slot] = id;
      this.renderer.buildHandMesh(id);
      if (count > 1 || this.mode === 'survival') Inventory.add(id, count);
      this.toast(thingName(id) + ' in slot ' + (this.slot + 1));
    }
    this.updateHotbarUI();
    this.refreshCraft();
  },

  openCrafting(size) {
    this.craftSize = size;
    if (this.plan.length !== size * size) this.plan = new Array(size * size).fill(0);
    document.getElementById('craft-title').textContent = size === 3 ? 'Crafting Table' : 'Inventory';
    document.getElementById('craft-hint').textContent = size === 3
      ? 'Three by three. Click a material, then click a cell.'
      : 'Two by two. Stand at a crafting table for the bigger grid.';
    document.getElementById('inventory').classList.add('open');
    this.inventoryOpen = true;
    document.exitPointerLock();
    if (this.dragLook) this.paused = true;
    this.refreshCraft();
  },

  closeCrafting() {
    document.getElementById('inventory').classList.remove('open');
    this.inventoryOpen = false;
    if (this.dragLook) { this.paused = false; return; }
    const p = this.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  },

  toggleInventory() {
    if (this.inventoryOpen) this.closeCrafting(); else this.openCrafting(2);
  },

  refreshCraft() {
    const size = this.craftSize;

    // armour, down the left, with a figure showing what is covered
    const armourRow = document.getElementById('armour-slots');
    armourRow.innerHTML = '';
    const labels = { head: 'head', chest: 'body', legs: 'legs', feet: 'feet' };
    for (const slotName of Equipment.slots) {
      const worn = Equipment[slotName];
      const cell = this.slotEl(worn, 1, () => { if (Equipment.unequip(slotName)) this.refreshCraft(); },
        { placeholder: labels[slotName], title: 'Empty ' + labels[slotName] + ' slot' });
      if (worn) cell.title = thingName(worn) + ' — click to take off';
      armourRow.appendChild(cell);
    }
    for (const part of document.querySelectorAll('.doll-part')) {
      part.classList.toggle('worn', !!Equipment[part.dataset.slot]);
    }
    document.getElementById('armour-points').textContent = Equipment.points()
      ? Equipment.points() + ' armour, ' + Math.round(Math.min(0.8, Equipment.points() * 0.04) * 100) + '% off'
      : 'no armour';

    // the crafting grid
    const grid = document.getElementById('craft-grid');
    grid.style.gridTemplateColumns = 'repeat(' + size + ', 44px)';
    grid.innerHTML = '';
    for (let i = 0; i < size * size; i++) {
      const id = this.plan[i];
      grid.appendChild(this.slotEl(id, 1, () => {
        this.plan[i] = this.plan[i] ? 0 : this.brush;
        this.refreshCraft();
      }));
    }

    // the result
    const out = document.getElementById('craft-out');
    const recipe = matchRecipe(this.plan, size);
    const cost = planCost(this.plan);
    out.className = 'mcslot out';
    out.innerHTML = '';
    out.title = '';
    out.onclick = null;
    if (recipe && !cost.missing.length) {
      out.className = 'mcslot out ready';
      out.innerHTML = '<img src="' + thingIcon(recipe.out) + '" alt="">' +
        (recipe.count > 1 ? '<span class="n">' + recipe.count + '</span>' : '');
      out.title = 'Craft ' + thingName(recipe.out);
      out.onclick = () => {
        const made = craftPlan(this.plan, size);
        if (!made) return;
        this.justMade = made.out;
        Sound.place();
        this.toast('Crafted ' + thingName(made.out) + (made.count > 1 ? ' \u00d7' + made.count : ''));
        this.refreshCraft();
      };
    } else if (recipe) {
      out.title = 'You are short of: ' + cost.missing.map(m => m[1] + ' \u00d7 ' + thingName(m[0])).join(', ');
    }

    // what you are carrying, nine to a row like Minecraft
    const mats = document.getElementById('craft-mats');
    mats.innerHTML = '';
    const entries = Inventory.entries();
    for (const [id, n] of entries) {
      const cell = this.slotEl(id, n, e => {
        const def = isItem(id) ? itemDef(id) : null;
        const toHotbar = () => {
          this.hotbar[this.slot] = id;
          this.updateHotbarUI();
          this.renderer.buildHandMesh(id);
          this.toast('Holding ' + thingName(id) + ' in slot ' + (this.slot + 1));
          this.refreshCraft();
        };
        if (!e.shiftKey && def) {
          if (def.armour) {
            if (Equipment.equip(id)) { Sound.place(); this.refreshCraft(); }
            return;
          }
          if (def.tool || def.damage || def.food) { toHotbar(); return; }
        }
        if (e.shiftKey) { toHotbar(); return; }
        this.brush = this.brush === id ? 0 : id;
        this.refreshCraft();
      });
      if (this.brush === id) cell.classList.add('selected');
      if (id === this.justMade) {
        cell.classList.add('just-made');
        if (cell.scrollIntoView) cell.scrollIntoView({ block: 'nearest' });
      }
      mats.appendChild(cell);
    }
    for (let i = entries.length; i < 27; i++) mats.appendChild(this.slotEl(0, 0, null));

    // the hotbar, shown the way it sits on screen
    const bar = document.getElementById('hotbar-slots');
    bar.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const id = this.hotbar[i];
      const count = id ? Inventory.count(id) : 0;
      const cell = this.slotEl(id, isItem(id) || this.mode === 'survival' ? count : 1,
        () => { this.selectSlot(i); this.refreshCraft(); },
        { placeholder: String(i + 1), title: 'Hotbar slot ' + (i + 1) });
      if (i === this.slot) cell.classList.add('current');
      bar.appendChild(cell);
    }

    // the creative catalogue: every block and every item in the game
    const tabs = document.getElementById('palette-tabs');
    tabs.innerHTML = '';
    for (const [key, label] of PALETTE_TABS) {
      const chip = document.createElement('button');
      chip.className = 'chip' + (this.paletteFilter === key ? ' active' : '');
      chip.textContent = label;
      chip.addEventListener('click', () => { this.paletteFilter = key; this.refreshCraft(); });
      tabs.appendChild(chip);
    }

    const all = document.getElementById('invgrid');
    all.innerHTML = '';
    for (const id of catalogue()) {
      if (this.paletteFilter !== 'all' && thingCategory(id) !== this.paletteFilter) continue;
      all.appendChild(this.slotEl(id, 1, e => this.takeFromCatalogue(id, e && e.shiftKey ? 10 : 1)));
    }

    // the recipe book
    const list = document.getElementById('craft-recipes');
    list.innerHTML = '';
    const q = (this.recipeQuery || '').trim().toLowerCase();
    for (const r of RECIPES) {
      if (q && !(thingName(r.out) + ' ' + r.note).toLowerCase().includes(q)) continue;
      const b = document.createElement('button');
      b.className = 'recipe' + (r.size > size ? ' locked' : '');
      const cells = [];
      const w = r.rows ? Math.max(...r.rows.map(x => x.length)) : r.ins.length;
      const h = r.rows ? r.rows.length : 1;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const id = repId(r.rows ? (r.rows[y][x] && r.rows[y][x] !== ' ' ? r.key[r.rows[y][x]] : 0) : r.ins[x]);
        cells.push(id ? '<i class="on" style="background-image:url(' + thingIcon(id, 16) + ')"></i>' : '<i></i>');
      }
      b.innerHTML =
        '<span class="mini" style="grid-template-columns:repeat(' + w + ',11px)">' + cells.join('') + '</span>' +
        '<span class="txt"><b>' + thingName(r.out) + '</b><span>' + r.note + '</span></span>' +
        '<span class="yield">\u00d7' + r.count + '</span>';
      b.addEventListener('click', () => {
        if (r.size > size) { this.toast('That one needs a crafting table'); return; }
        const choose = want => {
          if (!Array.isArray(want)) return want;
          let best = want[0];
          for (const id of want) if (Inventory.count(id) > Inventory.count(best)) best = id;
          return best;
        };
        this.plan.fill(0);
        if (r.ins) r.ins.forEach((want, i) => { this.plan[i] = choose(want); });
        else {
          for (let y = 0; y < r.rows.length; y++)
            for (let x = 0; x < r.rows[y].length; x++) {
              const ch = r.rows[y][x];
              if (ch !== ' ') this.plan[y * size + x] = choose(r.key[ch]);
            }
        }
        this.refreshCraft();
      });
      list.appendChild(b);
    }
  },

  updateVitals() {
    const p = this.player;
    const hp = Math.max(0, Math.ceil(p.hp));
    const armour = Equipment.points();
    const air = p.headInWater ? Math.ceil(p.air) : -1;
    if (hp === this._hudHp && armour === this._hudArmour && air === this._hudAir) return;
    this._hudHp = hp; this._hudArmour = armour; this._hudAir = air;

    const hearts = document.getElementById('hearts');
    hearts.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const v = clamp(hp - i * 2, 0, 2);
      const img = document.createElement('img');
      img.src = tileIcon(v === 2 ? UI.heartFull : v === 1 ? UI.heartHalf : UI.heartEmpty, 18);
      hearts.appendChild(img);
    }
    const bar = document.getElementById('armorbar');
    bar.innerHTML = '';
    const shields = Math.round(armour / 2);
    for (let i = 0; i < 10 && armour > 0; i++) {
      const img = document.createElement('img');
      img.src = tileIcon(i < shields ? UI.armour : UI.armourEmpty, 16);
      bar.appendChild(img);
    }
    const airEl = document.getElementById('airbar');
    airEl.textContent = air >= 0 && air < p.maxAir ? 'air ' + Math.max(0, air) + 's' : '';
  },

  checkDeath() {
    if (!this.player.dead || this.dying) return;
    this.dying = true;
    const lost = this.dropEverything();
    document.getElementById('died-reason').textContent =
      'Killed by ' + (this.player.lastHurtReason || 'the world') + '.' +
      (lost ? ' You lost everything you were carrying \u2014 ' + lost + ' item' + (lost === 1 ? '' : 's') + '.' : '');
    document.getElementById('died').classList.remove('hidden');
    document.exitPointerLock();
    this.paused = true;
    Sound.burst({ dur: 0.7, freq: 200, gain: 0.5, sweep: 0.2 });
  },

  openTrading(mob) {
    this.trading = mob;
    Trading.villager = mob;
    document.getElementById('trade-title').textContent = mob.def.label;
    document.getElementById('trading').classList.add('open');
    document.exitPointerLock();
    if (this.dragLook) this.paused = true;
    this.refreshTrades();
    Sound.animal('hmm', 1);
  },

  closeTrading() {
    this.trading = null;
    Trading.villager = null;
    document.getElementById('trading').classList.remove('open');
    if (this.dragLook) { this.paused = false; return; }
    const p = this.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  },

  refreshTrades() {
    const mob = this.trading;
    if (!mob) return;
    document.getElementById('trade-emeralds').textContent = Inventory.count(I.EMERALD);
    const list = document.getElementById('trade-list');
    list.innerHTML = '';
    for (const offer of Trading.offersFor(mob)) {
      const b = document.createElement('button');
      b.className = 'deal';
      const side = pairs => pairs.map(([id, n]) =>
        '<img src="' + thingIcon(id) + '" alt=""><span class="qty">' + n + ' ' + thingName(id) + '</span>').join('');
      b.innerHTML = '<span class="side">' + side(offer.give) + '</span>' +
        '<span class="to">&rarr;</span>' +
        '<span class="side">' + side([offer.get]) + '</span>' +
        '<span class="left">' + (offer.left > 0 ? offer.left + ' left' : 'sold out') + '</span>';
      b.disabled = !Trading.affordable(offer);
      b.addEventListener('click', () => {
        if (!Trading.trade(offer)) return;
        Sound.place();
        this.toast('Traded for ' + thingName(offer.get[0]) + (offer.get[1] > 1 ? ' \u00d7' + offer.get[1] : ''));
        this.hotbarCheck();
        this.refreshTrades();
      });
      list.appendChild(b);
    }
  },

  // Stand in a portal for a moment and you are pulled through.
  updatePortal(dt) {
    this.portalCooldown = Math.max(0, (this.portalCooldown || 0) - dt);
    const p = this.player;
    const at = dy => this.world.getBlock(Math.floor(p.pos[0]), Math.floor(p.pos[1] + dy), Math.floor(p.pos[2]));
    const feet = at(0.2), head = at(P_EYE);
    const inside = feet === B.PORTAL || head === B.PORTAL;
    const inEnd = feet === B.END_PORTAL || head === B.END_PORTAL;
    if (inEnd) {
      this.portalFx = Math.min(1, (this.portalFx || 0) + dt * 1.6);
      const fx2 = document.getElementById('portalfx');
      if (fx2) fx2.style.opacity = (this.portalFx * 0.55).toFixed(2);
      if (!this.portalArmed) return;
      this.portalTime = (this.portalTime || 0) + dt;
      if (this.portalTime > 1.1 && this.portalCooldown <= 0) this.travelEnd();
      return;
    }
    this.portalFx = inside ? Math.min(1, (this.portalFx || 0) + dt * 1.6) : Math.max(0, (this.portalFx || 0) - dt * 3);
    const fx = document.getElementById('portalfx');
    if (fx) fx.style.opacity = (this.portalFx * 0.55).toFixed(2);
    // You arrive standing in the portal, so it stays disarmed until you step out.
    if (!inside) { this.portalTime = 0; this.portalArmed = true; return; }
    if (!this.portalArmed) return;
    this.portalTime = (this.portalTime || 0) + dt;
    if (this.portalTime > 1.1 && this.portalCooldown <= 0) this.travelDimension();
  },

  // Into the End, and back out again.
  travelEnd() {
    const toEnd = this.dimension !== 'end';
    const target = toEnd ? 'end' : 'overworld';
    const world = this.worlds[target];
    let spot;
    if (toEnd) {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!world.getChunk(dx, dz)) world.generateChunk(dx, dz);
      }
      // a small landing pad a few blocks clear of the way home
      let y = CY - 1;
      while (y > 2 && !isSolid(world.getBlock(8, y, 0))) y--;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        world.setBlock(8 + dx, y, dz, B.OBSIDIAN);
        world.setBlock(8 + dx, y + 1, dz, 0);
        world.setBlock(8 + dx, y + 2, dz, 0);
      }
      spot = [8.5, y + 1, 0.5];
    } else {
      const home = this.player.spawn || [0.5, 80, 0.5];
      const hx = Math.floor(home[0]), hz = Math.floor(home[2]);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!world.getChunk((hx >> 4) + dx, (hz >> 4) + dz)) world.generateChunk((hx >> 4) + dx, (hz >> 4) + dz);
      }
      let y = CY - 1;
      while (y > 2 && !isSolid(world.getBlock(hx, y, hz))) y--;
      spot = [hx + 0.5, y + 1, hz + 0.5];
    }
    this.dimension = target;
    this.world = world;
    this.player.world = world;
    this.player.pos = spot.slice();
    this.player.vel = [0, 0, 0];
    this.player.fallFrom = null;
    this.portalTime = 0;
    this.portalArmed = false;
    this.portalCooldown = 1;
    this.lastChunk = null;
    this.mining = null;
    Animals.reset();
    Drops.reset();
    Thrown.reset();
    if (toEnd && !world.dragonSlain) {
      const dragon = new Mob('dragon', 40, spot[1] + 26, 0, 0);
      dragon.baseY = spot[1] + 26;
      Animals.list.push(dragon);
    }
    this.toast(toEnd ? 'The End' : 'Home');
    Sound.burst({ dur: 1.0, freq: 260, gain: 0.45, sweep: 4 });
  },

  travelDimension() {
    const toNether = this.dimension === 'overworld';
    const target = toNether ? 'nether' : 'overworld';
    const world = this.worlds[target];
    const [tx, tz] = Portal.linkedPosition(this.player.pos, toNether);

    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!world.getChunk((tx >> 4) + dx, (tz >> 4) + dz)) world.generateChunk((tx >> 4) + dx, (tz >> 4) + dz);
    }
    const spot = Portal.findOrBuild(world, tx, tz);

    this.dimension = target;
    this.world = world;
    this.player.world = world;
    this.player.pos = [spot[0], spot[1], spot[2]];
    this.player.vel = [0, 0, 0];
    this.player.fallFrom = null;
    this.portalTime = 0;
    this.portalArmed = false;      // step clear of this one before it takes you back
    this.portalCooldown = 1;
    this.lastChunk = null;
    this.mining = null;
    Animals.reset();
    Drops.reset();
    this.toast(toNether ? 'The Nether' : 'The Overworld');
    Sound.burst({ dur: 0.8, freq: 420, gain: 0.4, sweep: 0.3 });
  },

  // Dying costs you the lot: your materials and the armour you were wearing.
  dropEverything() {
    let lost = 0;
    for (const [, n] of Inventory.entries()) lost += n;
    Inventory.counts.clear();
    for (const slot of Equipment.slots) {
      if (Equipment[slot]) { lost++; Equipment[slot] = 0; }
    }
    for (let i = 0; i < 9; i++) if (isItem(this.hotbar[i])) this.hotbar[i] = 0;
    this.updateHotbarUI();
    this.renderer.buildHandMesh(this.hotbar[this.slot]);
    this._hudArmour = null;
    return lost;
  },

  toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 1200);
  },
  updateBossBar() {
    const boss = Animals.boss();
    const bar = document.getElementById('bossbar');
    if (!boss) { bar.classList.remove('on'); return; }
    bar.classList.add('on');
    const frac = Math.max(0, boss.hp) / boss.def.hp;
    document.getElementById('bossfill').style.width = (frac * 100).toFixed(1) + '%';
    const crystals = Animals.crystalsLeft(this.world);
    document.getElementById('bossname').textContent = boss.def.label +
      (crystals ? '  \u2014 healed by ' + crystals + ' crystal' + (crystals === 1 ? '' : 's') : '');
  },

  updateHUD(dt) {
    this.updateBossBar();
    document.getElementById('underwater').classList.toggle('on', this.player.headInWater);
    this.updateVitals();
    const hurt = document.getElementById('hurt');
    hurt.style.opacity = Math.min(0.55, this.player.hurtFlash * 1.4).toFixed(2);
    if (!this.showDebug) return;
    this.fpsSamples.push(1 / Math.max(dt, 0.0001));
    if (this.fpsSamples.length > 30) this.fpsSamples.shift();
    const fps = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
    const p = this.player;
    const bx = Math.floor(p.pos[0]), by = Math.floor(p.pos[1]), bz = Math.floor(p.pos[2]);
    const col = this.world.column(bx, bz);
    const hit = this.lastHit;
    const light = this.world.getLight(bx, by + 1, bz);
    const hour = ((this.time * 24 + 6) % 24);
    document.getElementById('debug').innerHTML = [
      'Voxelcraft &mdash; ' + fps.toFixed(0) + ' fps',
      'xyz ' + p.pos.map(v => v.toFixed(2)).join(' / '),
      'chunk ' + (bx >> 4) + ' ' + (bz >> 4) + '  &nbsp; biome ' + col.biome + '  &nbsp; seed ' + this.world.seed,
      'light sky ' + (light >> 4) + ' block ' + (light & 15),
      'time ' + String(Math.floor(hour)).padStart(2, '0') + ':' + String(Math.floor(hour % 1 * 60)).padStart(2, '0'),
      this.mode + ' mode',
      'chunks ' + this.renderer.stats.chunks + '/' + this.world.chunks.size + '  &nbsp; tris ' + (this.renderer.stats.tris / 1000).toFixed(0) + 'k',
      'animals ' + this.renderer.stats.mobs + ' shown / ' + Animals.list.length + ' nearby'
        + '  &nbsp; drops ' + Drops.list.length,
      'looking at ' + (hit ? thingName(hit.id) + ' @ ' + hit.x + ' ' + hit.y + ' ' + hit.z : '—'),
      (p.flying ? 'flying' : (p.inWater ? 'swimming' : 'walking')),
    ].join('<br>');
  },

  // ---- persistence -----------------------------------------------------
  save(silent) {
    try {
      const edits = [...this.world.edits.entries()];
      if (edits.length > 120000) edits.length = 120000;
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        seed: this.world.seed, edits,
        pos: this.player.pos, yaw: this.player.yaw, pitch: this.player.pitch,
        flying: this.player.flying, time: this.time, hotbar: this.hotbar, slot: this.slot,
        inventory: Inventory.serialize(),
        netherEdits: [...this.worlds.nether.edits.entries()].slice(0, 60000),
        endEdits: [...this.worlds.end.edits.entries()].slice(0, 20000),
        dragonSlain: !!this.worlds.end.dragonSlain,
        dimension: this.dimension,
        chests: [...this.worlds.overworld.chests.entries()].slice(0, 4000),
        mode: this.mode,
        equipment: Equipment.serialize(),
        hp: this.player.hp,
      }));
      if (!silent) this.toast('World saved');
    } catch (e) {
      if (!silent) this.toast('Save failed: ' + e.message);
    }
  },
  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
};

// Any typed seed becomes a number, so "hello" always gives the same world.
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h | 0;
}

// The creative catalogue, in a sensible order, and how it is grouped.
const PALETTE_TABS = [
  ['all', 'Everything'], ['blocks', 'Blocks'], ['tools', 'Tools'], ['weapons', 'Swords'],
  ['armour', 'Armour'], ['food', 'Food'], ['materials', 'Materials'],
];
function thingCategory(id) {
  if (!isItem(id)) return 'blocks';
  const def = itemDef(id);
  if (def.armour) return 'armour';
  if (def.tool) return 'tools';
  if (def.damage) return 'weapons';
  if (def.food) return 'food';
  return 'materials';
}
function catalogue() {
  const out = [];
  for (let id = 1; id < BLOCKS.length; id++) { if (BLOCKS[id].flowing) continue; out.push(id); }
  for (let i = 0; i < ITEMS.length; i++) out.push(ITEM_BASE + i);
  return out;
}

function showFatal(msg) {
  const el = document.getElementById('loading');
  if (!el) return;
  el.classList.remove('hidden');
  el.innerHTML = '<div class="panel"><h1>Something broke</h1><p class="sub">' +
    String(msg).replace(/[<>]/g, '') + '</p><p class="foot">Details are in the browser console.</p></div>';
}
addEventListener('error', e => { if (!Game.ready) showFatal(e.message); });
function boot() {
  try { Game.init(); } catch (e) { showFatal(e.message); throw e; }
}
// start whether the scripts run before or after the document finishes parsing
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
