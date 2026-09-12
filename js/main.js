// Game loop, chunk streaming, input and HUD.
const SAVE_KEY = 'voxelcraft.save.v1';
const SETTINGS_KEY = 'voxelcraft.settings.v1';
const NEXT_SEED_KEY = 'voxelcraft.nextseed';

// Everything the home screen can change, and what it does when it changes.
const Settings = {
  values: { viewDist: 8, sensitivity: 1, fov: 70, volume: 35, dayLength: 600, outfit: 'none' },
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
// The modes that take you out of your world and into an arena of their own.
let ARENA_MODES = {};
function defineArenas() { ARENA_MODES = { bedwars: bwMode('classic'), rush: bwMode('rush'), hunger: Hunger }; }

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
    defineBots();
    defineTributes();
    defineSpawnEggs();
    buildMobSkins();
    defineArenas();
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
      bedwars: new World(1, 'bedwars'),
      rush: new World(2, 'rush'),
      hunger: new World((seed ^ 0x11a6e2) | 0, 'hunger'),
      dinos: new World((seed ^ 0x0d1105) | 0, 'dinos'),
      halloween: new World((seed ^ 0x4a11ee) | 0, 'halloween'),
      future: new World((seed ^ 0x2f0704) | 0, 'future'),
      deep: new World((seed ^ 0x0deec0) | 0, 'deep'),
      hacker: new World((seed ^ 0x4ac3ed) | 0, 'hacker'),
      sea: new World((seed ^ 0x5ea90d) | 0, 'sea'),
    };
    if (save) for (const [k, v] of save.edits) this.worlds.overworld.edits.set(k, v);
    if (save && save.netherEdits) for (const [k, v] of save.netherEdits) this.worlds.nether.edits.set(k, v);
    if (save && save.endEdits) for (const [k, v] of save.endEdits) this.worlds.end.edits.set(k, v);
    if (save && save.dinoEdits) for (const [k, v] of save.dinoEdits) this.worlds.dinos.edits.set(k, v);
    if (save && save.hallowEdits) for (const [k, v] of save.hallowEdits) this.worlds.halloween.edits.set(k, v);
    if (save && save.futureEdits) for (const [k, v] of save.futureEdits) this.worlds.future.edits.set(k, v);
    if (save && save.dragonSlain) this.worlds.end.dragonSlain = true;
    // You always start at home. Coming back to a saved game in the Deep Lands,
    // or the Nether, or inside a pumpkin, is not a kindness to anybody.
    this.dimension = 'overworld';
    this.world = this.worlds[this.dimension];
    this.player = new Player(this.world);

    this.buildHotbarUI();
    this.buildInventoryUI();
    this.bindInput();

    // spawn: generate the home chunk first so we can stand on the surface
    const spawn = save ? (save.overPos || (save.dimension === 'overworld' || !save.dimension ? save.pos : null)) : null;
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
      if (save.mode) this.mode = ARENA_MODES[save.mode] ? 'creative' : save.mode;
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

    Outfits.worn = Settings.values.outfit || 'none';
    Outfits.buildCards(this);
    Outfits.refreshHud();

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
          if (this.player && this.player.onGround) Deep.stir(this, 8);
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
        if (this.storeOpen) this.closeStore();
        else if (this.shopOpen) this.closeShop();
        else if (this.printerAt) this.closePrinter();
        else if (this.chestAt) this.closeChest();
        else if (this.trading) this.closeTrading();
        else if (this.furnaceOpen) this.closeFurnace();
        else this.toggleInventory();
      }
      else if (e.code === 'KeyG') { if (!this.paused && this.ready) Outfits.use(this); }
      else if (e.code === 'KeyF') this.toggleFly();
      else if (e.code === 'KeyR') { if (!this.paused && this.ready && !this.solytraBoost()) this.toast('That needs a Solytra on your back'); }
      else if (e.code === 'F3') { e.preventDefault(); this.showDebug = !this.showDebug; document.getElementById('debug').classList.toggle('hidden', !this.showDebug); }
      else if (e.code === 'KeyT') { this.timeFlow = !this.timeFlow; this.toast(this.timeFlow ? 'Time flowing' : 'Time frozen'); }
      else if (e.code === 'KeyN') { this.time = (this.time + 0.5) % 1; this.toast('Time skipped'); }
      else if (e.code === 'Escape') {
        if (this.storeOpen) this.closeStore();
        else if (this.shopOpen) this.closeShop();
        else if (this.printerAt) this.closePrinter();
        else if (this.chestAt) this.closeChest();
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
        if (this.held) {
          // it thought you were mining; you are actually looking around
          this.heldMoved = (this.heldMoved || 0) + Math.abs(e.movementX) + Math.abs(e.movementY);
          if (this.heldMoved < 10) return;
          this.holdBreak();
        }
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
        // No pointer lock here (an artifact frame will not grant it), so the
        // same button has to do two jobs: drag it to look, hold it still to
        // mine or build. Which one it is falls out of what you do next.
        if (!this.dragLook || this.paused) return;
        this.dragging = true; this.dragMoved = 0;
        this.dragButton = e.button;
        this.dragSince = performance.now();
        this.held = false;
        return;
      }
      if (e.button === 0) { this.mouse.left = true; this.startBreak(); }
      if (e.button === 2) { this.mouse.right = true; this.placeBlock(); this.placeTimer = 0.28; }
      if (e.button === 1) { e.preventDefault(); this.pickBlock(); }
    });
    addEventListener('mouseup', e => {
      if (this.dragging || this.held) {
        const wasHeld = this.held, moved = this.dragMoved;
        this.dragging = false; this.held = false;
        if (!wasHeld && moved < 8) {          // a tap: one break, or one block laid
          if (e.button === 2) this.placeBlock(); else if (e.button === 0) this.startBreak();
        }
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
      // We let go of the pointer on purpose to open a window. Pause, but leave
      // the menu where it is, or it lands on top of the window you just opened.
      if (!locked && this.panelOpen()) {
        this.paused = true;
        for (const k in this.input) this.input[k] = 0;
        this.mouse.left = this.mouse.right = false;
        this.keyBreak = this.keyPlace = false;
        return;
      }
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
    this.canvas.addEventListener('click', () => { if (this.paused && !this.panelOpen()) play(); });
    document.getElementById('newworld').addEventListener('click', () => {
      if (!confirm('Discard this world and generate a new one?')) return;
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    });
    document.getElementById('savebtn').addEventListener('click', () => this.save());
    document.getElementById('arenaend-again').addEventListener('click', () => {
      document.getElementById('arenaend').classList.add('hidden');
      this.enterMatch(this.mode);
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.paused = false; });
    });
    document.getElementById('arenaend-leave').addEventListener('click', () => {
      document.getElementById('arenaend').classList.add('hidden');
      this.setMode('creative');
    });
  },

  // Hold the button still for a moment and it stops being a look-drag and starts
  // being a mine or a build, which then repeats for as long as you hold it.
  holdCheck() {
    if (!this.dragLook || this.held || !this.dragging) return;
    if (this.dragMoved >= 8) return;
    if (performance.now() - this.dragSince < 220) return;
    this.held = true;
    this.dragging = false;
    this.heldMoved = 0;
    if (this.dragButton === 2) { this.mouse.right = true; this.placeBlock(); this.placeTimer = 0.28; }
    else { this.mouse.left = true; this.startBreak(); }
  },

  // Once it has decided you are mining, moving the pointer changes its mind
  // again: looking around always wins over digging.
  holdBreak() {
    this.held = false;
    this.dragging = true;
    this.mouse.left = this.mouse.right = false;
    this.mining = null;
  },

  // Is one of the game's own windows open? Opening any of them releases pointer
  // lock, and without this the pointer-lock handler would take that as "the
  // player has stepped away" and put the main menu up over the top of it.
  panelOpen() {
    return !!(this.inventoryOpen || this.chestAt || this.furnaceOpen || this.printerAt
              || this.trading || this.shopOpen || this.storeOpen);
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
    const was = this.mode;
    this.mode = ARENA_MODES[mode] || mode === 'survival' ? mode : 'creative';
    if (ARENA_MODES[was] && this.mode !== was) this.leaveMatch();
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
    if (ARENA_MODES[this.mode] && was !== this.mode) { this.enterMatch(this.mode); return; }
    if (!quiet) this.toast(creative ? 'Creative mode' : 'Survival mode');
  },

  // Blocks are spent everywhere except creative.
  survivalRules() { return this.mode !== 'creative'; },

  // ---- Bed Wars --------------------------------------------------------
  // Starting a match parks the overworld where it stands and drops you into the
  // arena; leaving puts you back exactly where you were.
  enterMatch(kind) {
    kind = kind || this.mode;
    const arena = ARENA_MODES[kind];
    if (!arena) return;
    if (!ARENA_MODES[this.dimension]) {
      // A match is a place you visit: what you were carrying waits for you at home.
      this.homePos = {
        dimension: this.dimension, pos: this.player.pos.slice(),
        yaw: this.player.yaw, pitch: this.player.pitch,
        inventory: Inventory.serialize(), equipment: Equipment.serialize(),
        hotbar: this.hotbar.slice(), slot: this.slot,
      };
    }
    this.dimension = kind;
    const world = this.worlds[kind];
    this.world = world;
    this.player.world = world;
    Animals.reset();
    Drops.reset();
    Thrown.reset();
    arena.start(this);
    const spot = arena.spawnPoint(world);
    this.player.spawn = spot.slice();
    this.player.pos = spot.slice();
    this.player.vel = [0, 0, 0];
    this.player.flying = false;
    this.player.fallFrom = null;
    this.player.hp = this.player.maxHp;
    this.player.dead = false;
    this.dying = false;
    this.lastChunk = null;
    this.mining = null;
    Animals.cap = 0; Animals.hostileCap = 0;        // no wildlife in an arena
    arena.ensureArena(world);
    if (arena.kit) arena.kit(this);
    arena.refreshBoard();
    this.time = 0.3;
    this.timeFlow = false;
    document.getElementById('died').classList.add('hidden');
    document.getElementById('arenaend').classList.add('hidden');
    this.updateHotbarUI();
    this.renderer.buildHandMesh(this.hotbar[this.slot]);
  },

  leaveMatch() {
    for (const k in ARENA_MODES) ARENA_MODES[k].stop();
    Animals.cap = 26; Animals.hostileCap = 12;
    Animals.reset();
    Drops.reset();
    Thrown.reset();
    this.timeFlow = true;
    const home = this.homePos;
    this.dimension = (home && home.dimension) || 'overworld';
    if (ARENA_MODES[this.dimension]) this.dimension = 'overworld';
    this.world = this.worlds[this.dimension];
    this.player.world = this.world;
    if (home) {
      this.player.pos = home.pos.slice();
      this.player.yaw = home.yaw; this.player.pitch = home.pitch;
      Inventory.load(home.inventory || []);
      Equipment.load(home.equipment || { head: 0, chest: 0, legs: 0, feet: 0 });
      if (home.hotbar) this.hotbar = home.hotbar.slice();
      if (home.slot != null) this.slot = home.slot;
    }
    this.player.vel = [0, 0, 0];
    this.player.fallFrom = null;
    this.player.spawn = this.player.pos.slice();
    this.player.hp = this.player.maxHp;
    this.player.dead = false;
    this.dying = false;
    this.lastChunk = null;
    this._hudArmour = null;
    this.updateHotbarUI();
    this.renderer.buildHandMesh(this.hotbar[this.slot]);
  },

  // ---- the shop --------------------------------------------------------
  openStore() {
    this.storeOpen = true;
    this.storeTab = this.storeTab || 'Weapons';
    document.getElementById('store').classList.add('open');
    document.exitPointerLock();
    document.getElementById('menu').classList.add('hidden');   // never behind a window
    if (this.dragLook) this.paused = true;
    this.refreshStore();
    Sound.animal('hmm', 1);
  },
  closeStore() {
    this.storeOpen = false;
    document.getElementById('store').classList.remove('open');
    if (this.dragLook) { this.paused = false; return; }
    const p = this.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => this.enterDragLook());
    setTimeout(() => {
      if (document.pointerLockElement !== this.canvas && !this.panelOpen()) this.enterDragLook();
    }, 400);
  },
  refreshStore() {
    if (!this.storeOpen) return;
    const stock = Store.stock();
    document.getElementById('store-purse').innerHTML =
      '<img src="' + thingIcon(I.EMERALD) + '" alt=""> ' + Inventory.count(I.EMERALD) + ' emeralds';
    const tabs = document.getElementById('store-tabs');
    tabs.innerHTML = '';
    for (const name in stock) {
      const b = document.createElement('button');
      b.className = 'chip' + (name === this.storeTab ? ' active' : '');
      b.textContent = name;
      b.addEventListener('click', () => { this.storeTab = name; this.refreshStore(); });
      tabs.appendChild(b);
    }
    const list = document.getElementById('store-list');
    list.innerHTML = '';
    for (const o of stock[this.storeTab] || []) {
      const b = document.createElement('button');
      b.className = 'deal';
      if (o.sellId) {
        b.innerHTML =
          '<span class="side"><img src="' + thingIcon(o.sellId) + '" alt="">' +
            '<span class="qty">' + o.sellN + ' ' + thingName(o.sellId) + '</span></span>' +
          '<span class="to">&rarr;</span>' +
          '<span class="side"><img src="' + thingIcon(I.EMERALD) + '" alt="">' +
            '<span class="qty">' + o.pay + ' emerald' + (o.pay === 1 ? '' : 's') + '</span></span>' +
          '<span class="left">you have ' + Inventory.count(o.sellId) + '</span>';
      } else {
        b.innerHTML =
          '<span class="side"><img src="' + thingIcon(I.EMERALD) + '" alt="">' +
            '<span class="qty">' + o.cost + ' emerald' + (o.cost === 1 ? '' : 's') + '</span></span>' +
          '<span class="to">&rarr;</span>' +
          '<span class="side"><img src="' + thingIcon(o.id) + '" alt="">' +
            '<span class="qty">' + (o.n > 1 ? o.n + ' ' : '') + thingName(o.id) + '</span></span>' +
          '<span class="left">' + o.note + '</span>';
      }
      b.disabled = !Store.affordable(o);
      b.addEventListener('click', () => {
        if (!Store.deal(o, this)) return;
        Sound.place();
        this.updateHotbarUI();
        this.refreshStore();
      });
      list.appendChild(b);
    }
  },

  openShop() {
    this.shopOpen = true;
    document.getElementById('shop').classList.add('open');
    document.exitPointerLock();
    document.getElementById('menu').classList.add('hidden');   // never behind a window
    if (this.dragLook) this.paused = true;
    this.refreshShop();
    Sound.animal('hmm', 1);
  },
  closeShop() {
    this.shopOpen = false;
    document.getElementById('shop').classList.remove('open');
    if (this.dragLook) { this.paused = false; return; }
    const p = this.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => this.enterDragLook());
    setTimeout(() => {
      if (document.pointerLockElement !== this.canvas && !this.panelOpen()) this.enterDragLook();
    }, 400);
  },
  refreshShop() {
    if (!this.shopOpen) return;
    const purse = [I.IRON_INGOT, I.GOLD_INGOT, I.DIAMOND, I.EMERALD]
      .map(id => '<img src="' + thingIcon(id) + '" alt=""> ' + Inventory.count(id)).join(' &nbsp; ');
    document.getElementById('shop-purse').innerHTML = purse;
    const list = document.getElementById('shop-list');
    list.innerHTML = '';
    for (const offer of BedWars.offers()) {
      const gives = BedWars.giveLabel(offer);
      const b = document.createElement('button');
      b.className = 'deal';
      b.innerHTML =
        '<span class="side"><img src="' + thingIcon(offer.cost[0]) + '" alt="">' +
          '<span class="qty">' + offer.cost[1] + ' ' + thingName(offer.cost[0]) + '</span></span>' +
        '<span class="to">&rarr;</span>' +
        '<span class="side"><img src="' + thingIcon(gives.icon) + '" alt="">' +
          '<span class="qty">' + gives.text + '</span></span>' +
        '<span class="left">' + offer.note + '</span>';
      b.disabled = !BedWars.affordable(offer);
      b.addEventListener('click', () => {
        if (!BedWars.buy(offer, this)) return;
        this.toast('Bought ' + gives.text);
        this.hotbarCheck();
        this.refreshShop();
      });
      list.appendChild(b);
    }
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
      if (res.killed && mob.def.bot) BedWars.botDied(mob, 'you');
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
    if (BedWars.active) {
      const bed = BedWars.bedAt(hit.x, hit.y, hit.z);
      if (bed) {
        if (bed === BedWars.you) { this.toast('That is your own bed'); return; }
        BedWars.breakBed(bed, 'you');
        return;
      }
      if (!BedWars.canBreak(hit.x, hit.y, hit.z, hit.id)) {
        this.toast('Only blocks placed during the match can be broken');
        return;
      }
      BedWars.placed.delete(BedWars.key(hit.x, hit.y, hit.z));
    }
    Sound.dig(hit.id);
    Deep.stir(this, BLOCKS[hit.id].sensor ? 30 : 10);     // a sensor screams when you break it
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
      const leafy = hit.id === B.LEAVES || hit.id === B.BIRCH_LEAVES || hit.id === B.SPRUCE_LEAVES;
      const gives = hit.id === B.GRAVEL && Math.random() < 0.2 ? I.FLINT
        : (leafy && Math.random() < 0.06 ? I.APPLE : drop);
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
      if (mob && mob.bwShop) { this.openShop(); return; }
      if (mob && mob.def.villager) { this.openTrading(mob); return; }

      // then whatever you are pointing at, whatever you happen to be holding
      if (hit && !this.input.sneak) {
        const id = hit.id;
        if (id === B.CRAFTING_TABLE) { this.openCrafting(3); return; }
        if (id === B.CHEST) { this.openChest(hit); return; }
        if (BLOCKS[id].door) { this.toggleDoor(hit); return; }
        if (id === B.BED_HEAD || id === B.BED_FOOT) { this.useBed(hit); return; }
        if (id === B.FURNACE) { this.openFurnace(); return; }
        if (id === B.PRINTER) { this.openPrinter(hit); return; }
        if (BLOCKS[id].tv !== undefined) { this.switchTv(hit); return; }
        if (BLOCKS[id].explosive) { Boom.prime(this, hit.x, hit.y, hit.z); return; }
        if (BLOCKS[id].shop) { this.openStore(); return; }
      }
    }

    const held = this.hotbar[this.slot];
    if (isItem(held)) {
      const hd = itemDef(held);
      // an automatic weapon keeps going while the button is down; everything else
      // waits for you to click again
      if (hd && hd.gun && (!fromRepeat || GUNS[hd.gun].auto)) { Guns.fire(this, hd.gun); return; }
      if (!fromRepeat) this.useItem(held);
      return;
    }
    if (held && this.bridging()) { this.bridgeAssist(held); return; }
    // Aiming out into open air: lay the next plank of a bridge instead of nothing.
    if (!hit) { if (held) this.bridgeAssist(held); return; }
    const [x, y, z] = hit.place;
    if (y < 0 || y >= CY) return;
    const existing = this.world.getBlock(x, y, z);
    if (existing && !isLiquid(existing)) return;
    const id = this.hotbar[this.slot];
    if (!id) return;
    if (isSolid(id) && this.player.intersectsBlock(x, y, z)) return;
    if (BLOCKS[id].ladder) {                       // hung on the wall you clicked
      const side = hit.normal[2] < 0 ? 0 : hit.normal[0] > 0 ? 1 : hit.normal[2] > 0 ? 2 : hit.normal[0] < 0 ? 3 : -1;
      if (side < 0) { this.toast('A ladder needs a wall'); return; }
      if (this.survivalRules() && Inventory.count(id) <= 0) { this.toast('You have no ladders left'); return; }
      if (this.world.setBlock(x, y, z, BLOCKS[id].turns[side])) {
        BedWars.notePlaced(x, y, z);
        Sound.place();
        if (this.survivalRules()) { Inventory.take(id, 1); this.updateHotbarUI(); }
      }
      return;
    }
    if (BLOCKS[id].stairs) {                       // laid facing the way you are looking
      const facing = BLOCKS[id].turns;
      const turn = ((Math.round(this.player.yaw / (Math.PI / 2)) % 4) + 4) % 4;
      if (this.survivalRules() && Inventory.count(id) <= 0) { this.toast('You have no stairs left'); return; }
      if (this.world.setBlock(x, y, z, facing[turn])) {
        BedWars.notePlaced(x, y, z);
        Sound.place();
        if (this.survivalRules()) { Inventory.take(id, 1); this.updateHotbarUI(); }
      }
      return;
    }
    if (BLOCKS[id].torch) {
      const onFloor = hit.normal[1] === 1;
      const onWall = hit.normal[0] !== 0 || hit.normal[2] !== 0;
      if (!onFloor && !onWall) { this.toast('A torch will not hang from that'); return; }
      if (!isSolid(hit.id)) { this.toast('A torch needs something solid to sit on'); return; }
      if (this.survivalRules() && Inventory.count(id) <= 0) { this.toast('You have no torches left'); return; }
      if (this.world.setBlock(x, y, z, onFloor ? B.TORCH : B.TORCH_WALL)) {
        BedWars.notePlaced(x, y, z);
        Sound.place();
        if (this.survivalRules()) { Inventory.take(id, 1); this.updateHotbarUI(); }
      }
      return;
    }
    if (this.survivalRules() && Inventory.count(id) <= 0) {
      this.toast('You have no ' + thingName(id) + ' left');
      return;
    }
    if (id === B.DOOR_LOWER) {
      if (this.world.getBlock(x, y + 1, z) !== 0) { this.toast('No headroom for a door'); return; }
      if (this.survivalRules() && Inventory.count(id) <= 0) { this.toast('You have no doors left'); return; }
      this.world.setBlock(x, y, z, B.DOOR_LOWER);
      this.world.setBlock(x, y + 1, z, B.DOOR_UPPER);
      Sound.place();
      if (this.survivalRules()) { Inventory.take(id, 1); this.updateHotbarUI(); }
      return;
    }
    if (this.world.setBlock(x, y, z, id)) {
      BedWars.notePlaced(x, y, z);
      if (isWaterBlock(id) && Portal.lightTime(this.world, x, y, z)) {
        Sound.burst({ dur: 0.9, freq: 520, gain: 0.4, sweep: 3 });
        this.toast('The water shivers — something very old is on the other side');
      }
      if (isLavaBlock(id) && Portal.lightFuture(this.world, x, y, z)) {
        Sound.burst({ dur: 1.1, freq: 260, gain: 0.45, sweep: 4 });
        this.toast('The lava tears open — something very late is on the other side');
      }
      if (id === B.CHEST) this.world.chests.set(x + ',' + y + ',' + z, []);
      Sound.place();
      Deep.stir(this, 6);
      Hacker.tryOpen(this, x, y, z);        // did that finish the square?
      if (this.survivalRules()) { Inventory.take(id, 1); this.updateHotbarUI(); }
    }
  },
  // Looking well down while on the move means you are running a bridge out, not
  // building: every click then goes into the walkway, never on top of it.
  bridging() {
    const p = this.player;
    if (p.flying || p.groundY === null || p.pitch > -0.7) return false;
    return !!(this.input.forward || this.input.back || this.input.left || this.input.right);
  },

  // God bridging: look down over the drop, run, and keep clicking — each click
  // lays the block you are about to land on. It only ever fills a gap at the
  // level you last walked on, and only beside something solid, so it extends a
  // walkway and can never be used to build out in mid-air.
  // Where the next plank would go, if you asked for one. Returns null when there
  // is nowhere sensible — which is also what stops the outline being drawn.
  bridgeTarget(id) {
    const p = this.player;
    if (!id || isItem(id) || p.flying) return null;
    if (p.pitch > -0.35) return null;                        // you have to be looking down
    const y = p.groundY;
    if (y === null || p.pos[1] > y + 1.7 || p.pos[1] < y - 2.5) return null;
    const s = Math.sin(p.yaw), c = Math.cos(p.yaw);
    const spots = [
      [Math.floor(p.pos[0]), Math.floor(p.pos[2])],                    // under your feet
      [Math.floor(p.pos[0] + s * 0.8), Math.floor(p.pos[2] - c * 0.8)], // the step ahead
    ];
    for (const [x, z] of spots) {
      if (this.world.getBlock(x, y, z)) continue;                      // something already there
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (isSolid(this.world.getBlock(x + dx, y, z + dz))) return [x, y, z];
      }
    }
    return null;                                                       // never a block in thin air
  },

  bridgeAssist(id) {
    const spot = this.bridgeTarget(id);
    if (!spot) return false;
    if (this.survivalRules() && Inventory.count(id) <= 0) {
      this.toast('You have no ' + thingName(id) + ' left');
      return false;
    }
    const [x, y, z] = spot;
    if (!this.world.setBlock(x, y, z, id)) return false;
    BedWars.notePlaced(x, y, z);
    Sound.place();
    if (this.survivalRules()) { Inventory.take(id, 1); this.updateHotbarUI(); }
    return true;
  },

  toggleFly() {
    if (this.survivalRules()) {
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

  // A television has four states and a button: off, colour bars, a view, and snow.
  switchTv(hit) {
    const chans = [B.TV, B.TV_BARS, B.TV_VIEW, B.TV_STATIC];
    const next = chans[(chans.indexOf(hit.id) + 1) % chans.length];
    this.world.setBlock(hit.x, hit.y, hit.z, next);
    Sound.burst({ dur: 0.07, freq: 900, gain: 0.22, sweep: 1.4 });
    this.toast(next === B.TV ? 'Television off' : 'Channel ' + BLOCKS[next].tv);
  },

  openPrinter(hit) {
    this.printerAt = hit;
    document.getElementById('printer').classList.add('open');
    document.exitPointerLock();
    document.getElementById('menu').classList.add('hidden');   // never behind a window
    if (this.dragLook) this.paused = true;
    this.refreshPrinter();
    Sound.burst({ dur: 0.2, freq: 520, gain: 0.25, sweep: 0.7 });
  },
  closePrinter() {
    this.printerAt = null;
    document.getElementById('printer').classList.remove('open');
    if (this.dragLook) { this.paused = false; return; }
    const p = this.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => this.enterDragLook());
    setTimeout(() => {
      if (document.pointerLockElement !== this.canvas && !this.panelOpen()) this.enterDragLook();
    }, 400);
  },
  refreshPrinter() {
    const at = this.printerAt;
    if (!at) return;
    const spot = [at.x, at.y, at.z];
    document.getElementById('printer-note').innerHTML = this.survivalRules()
      ? 'It uses the blocks the thing is made of, out of your own bag.'
      : 'Creative: prints cost nothing.';
    const list = document.getElementById('printer-list');
    list.innerHTML = '';
    for (const model of Printer.models()) {
      const cost = [...Printer.cost(model)].map(([id, n]) => n + ' × ' + thingName(id)).join(', ');
      const short = this.survivalRules() ? Printer.missing(model) : [];
      const room = Printer.room(this.world, spot, model);
      const b = document.createElement('button');
      b.className = 'deal';
      b.innerHTML =
        '<span class="side"><img src="' + thingIcon(model.parts[0][3]) + '" alt="">' +
          '<span class="qty">' + model.name + '</span></span>' +
        '<span class="to">&rarr;</span>' +
        '<span class="side"><span class="qty">' + model.blurb + '<br>' + cost + '</span></span>' +
        '<span class="left">' + (!room ? 'no room' : short.length ? 'short' : 'print') + '</span>';
      b.disabled = !room || short.length > 0;
      b.addEventListener('click', () => {
        const res = Printer.print(this, model, spot);
        if (res !== true) { this.toast(res); return; }
        Sound.place();
        this.toast('Printed a ' + model.name.toLowerCase());
        this.updateHotbarUI();
        this.refreshPrinter();
      });
      list.appendChild(b);
    }
  },

  openFurnace() {
    this.furnaceOpen = true;
    document.getElementById('furnace').classList.add('open');
    document.exitPointerLock();
    document.getElementById('menu').classList.add('hidden');   // never behind a window
    if (this.dragLook) this.paused = true;
    this.refreshFurnace();
  },
  closeFurnace() {
    this.furnaceOpen = false;
    document.getElementById('furnace').classList.remove('open');
    if (this.dragLook) { this.paused = false; return; }
    const p = this.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => this.enterDragLook());
    setTimeout(() => {
      if (document.pointerLockElement !== this.canvas && !this.panelOpen()) this.enterDragLook();
    }, 400);
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
      if (this.dimension === 'future') {
        stacks = Future.loot(this.world, key, rnd);
        this.world.chests.set(key, stacks);
        return stacks;
      }
      if (this.dimension === 'sea') {
        // the two chests behind the throne are the ones worth swimming for
        const palace = Sea.palace(this.world, Math.floor(hit.x / SEA_CITY), Math.floor(hit.z / SEA_CITY));
        const inPalace = !!(palace && Math.abs(palace.x - hit.x) <= palace.r && Math.abs(palace.z - hit.z) <= palace.r);
        stacks = Sea.loot(rnd, inPalace);
        this.world.chests.set(key, stacks);
        return stacks;
      }
      if (this.dimension === 'hacker') {
        stacks = Hacker.loot(rnd);
        this.world.chests.set(key, stacks);
        return stacks;
      }
      if (this.dimension === 'deep') {
        stacks = Deep.loot(rnd, false);
        this.world.chests.set(key, stacks);
        return stacks;
      }
      // An Ancient City chest. The first one anybody opens in a given city has
      // the heart in it, because a city with no heart in it is a dead end.
      const city = Deep.cityHeart(this.world, hit.x, hit.y, hit.z);
      if (city) {
        stacks = Deep.loot(rnd, true);
        if (city.heart) stacks.unshift([I.HEART_OF_THE_DEEP, 1]);
        this.world.chests.set(key, stacks);
        return stacks;
      }
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
    document.getElementById('menu').classList.add('hidden');   // never behind a window
    if (this.dragLook) this.paused = true;
    this.refreshChest();
    Sound.burst({ dur: 0.18, freq: 620, gain: 0.3, sweep: 0.5 });
  },
  closeChest() {
    this.chestAt = null;
    document.getElementById('chest').classList.remove('open');
    if (this.dragLook) { this.paused = false; return; }
    const p = this.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => this.enterDragLook());
    setTimeout(() => {
      if (document.pointerLockElement !== this.canvas && !this.panelOpen()) this.enterDragLook();
    }, 400);
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
    if (def && def.spawnEgg) {
      const hit = this.player.raycast();
      if (!hit) { this.toast('Point at the ground first'); return; }
      const [x, y, z] = hit.place;
      if (this.survivalRules() && !Inventory.take(id, 1)) { this.toast('You have none left'); return; }
      const mob = new Mob(def.spawnEgg, x + 0.5, y, z + 0.5, Math.random() * Math.PI * 2);
      Animals.list.push(mob);
      Sound.animal(mob.def.call, 1);
      this.toast('Out comes a ' + mob.def.label.toLowerCase());
      this.hotbarCheck();
      return;
    }
    if (def && def.bucket) {
      const hit = this.player.raycast();
      if (def.bucket === 'empty') {
        // The raycast goes straight through water, so walk the line ourselves and
        // take the first liquid it passes into.
        const o = this.player.eye, d = this.player.dir;
        let found = null;
        for (let t = 0; t <= this.player.reach && !found; t += 0.2) {
          const cx = Math.floor(o[0] + d[0] * t), cy = Math.floor(o[1] + d[1] * t), cz = Math.floor(o[2] + d[2] * t);
          const there = this.world.getBlock(cx, cy, cz);
          if (isLiquid(there)) found = [cx, cy, cz];
          else if (isSolid(there)) break;
        }
        if (!found) { this.toast('Point at water or lava'); return; }
        const fluid = BLOCKS[this.world.getBlock(found[0], found[1], found[2])].fluid;
        this.world.setBlock(found[0], found[1], found[2], 0);
        Inventory.take(id, 1);
        Inventory.add(fluid === 'lava' ? I.LAVA_BUCKET : I.WATER_BUCKET, 1);
        this.toast('Filled the bucket with ' + fluid);
      } else {
        if (!hit) { this.toast('Point where it should go'); return; }
        const [px, py, pz] = hit.place;
        this.world.setBlock(px, py, pz, def.bucket === 'lava' ? B.LAVA : B.WATER);
        Inventory.take(id, 1);
        Inventory.add(I.BUCKET, 1);
        this.toast('Poured out the ' + def.bucket);
        if (def.bucket === 'water' && Portal.lightTime(this.world, px, py, pz)) {
          this.toast('The water shivers — something very old is on the other side');
        }
        if (def.bucket === 'lava' && Portal.lightFuture(this.world, px, py, pz)) {
          this.toast('The lava tears open — something very late is on the other side');
        }
      }
      Sound.splash();
      this.hotbarCheck();
      return;
    }
    if (def && def.bow) {
      if (this.survivalRules() && !Inventory.take(I.ARROW, 1)) { this.toast('You have no arrows'); return; }
      Thrown.shoot(this.world, this.player, I.ARROW);
      Sound.burst({ dur: 0.14, freq: 1400, gain: 0.25, sweep: 0.5 });
      this.hotbarCheck();
      return;
    }
    if (def && def.pearl) {
      if (!Inventory.take(id, 1)) return;
      Thrown.throwPearl(this.world, this.player, id);
      this.hotbarCheck();
      Sound.burst({ dur: 0.12, freq: 900, gain: 0.25, sweep: 1.6 });
      return;
    }
    // The heart goes into the empty middle of a reinforced frame, and stays there.
    if (def && def.deepKey) {
      // You can see straight through an unlit frame, so a raycast alone is no
      // use: walk the line you are looking down and try to open every gap in it.
      const o = this.player.eye, d = this.player.dir;
      let opened = false, sawFrame = false;
      const tried = new Set();
      for (let t = 0; t <= this.player.reach + 1 && !opened; t += 0.2) {
        const x = Math.floor(o[0] + d[0] * t), y = Math.floor(o[1] + d[1] * t), z = Math.floor(o[2] + d[2] * t);
        const key = x + ',' + y + ',' + z;
        if (tried.has(key)) continue;
        tried.add(key);
        const there = this.world.getBlock(x, y, z);
        if (there === B.REINFORCED_DEEPSLATE) { sawFrame = true; continue; }
        if (there) continue;
        if (Portal.lightDeep(this.world, x, y, z)) opened = true;
      }
      if (!opened) {
        this.toast(sawFrame ? 'The frame is the wrong shape — two across and three high'
                            : 'That needs a frame of reinforced deepslate around it');
        return;
      }
      if (this.survivalRules()) Inventory.take(id, 1);
      this.hotbarCheck();
      Sound.burst({ dur: 1.4, freq: 80, gain: 0.45, sweep: 6 });
      this.toast('The frame drinks the heart — the floor of the world opens');
      return;
    }
    // The Sonic Cannon. It fires a line rather than a projectile, hits everything
    // standing in it, and is the single loudest thing you can do down there.
    if (def && def.gun) { Guns.fire(this, def.gun); return; }

    // A bottle: fill it at any water, and drink it anywhere.
    if (def && def.bottle === 'empty') {
      const o = this.player.eye, d = this.player.dir;
      let found = null;
      for (let t = 0; t <= this.player.reach && !found; t += 0.2) {
        const cx = Math.floor(o[0] + d[0] * t), cy = Math.floor(o[1] + d[1] * t), cz = Math.floor(o[2] + d[2] * t);
        const there = this.world.getBlock(cx, cy, cz);
        if (isWaterBlock(there)) found = [cx, cy, cz];
        else if (isSolid(there)) break;
      }
      if (!found) { this.toast('Point at some water'); return; }
      if (!Inventory.take(id, 1)) return;
      Inventory.add(I.WATER_BOTTLE, 1);
      this.hotbarStow(I.WATER_BOTTLE);
      this.hotbarCheck();
      Sound.splash();
      this.toast('Filled the bottle');
      return;
    }

    // A stick with somebody else's client on it. Thirty seconds of flying, in a
    // mode that is not supposed to have any, and then it burns out.
    if (def && def.trident) {
      if (this.survivalRules() && !Inventory.take(id, 1)) { this.toast('You have none left'); return; }
      Thrown.hurl(this.world, this.player, id);
      this.hotbarCheck();
      Sound.burst({ dur: 0.2, freq: 700, gain: 0.3, sweep: 1.2 });
      return;
    }
    if (def && def.hack) {
      if (this.survivalRules() && !Inventory.take(id, 1)) { this.toast('You have none left'); return; }
      this.player.flying = true;
      this.hackFlight = 30;
      this.hotbarCheck();
      Sound.burst({ dur: 0.5, freq: 1700, gain: 0.35, sweep: 3 });
      this.toast('Flight enabled — 30 seconds before the anticheat catches up');
      return;
    }
    if (def && def.sonic) {
      if (this.survivalRules() && !Inventory.take(I.ECHO_SHARD, 1)) {
        this.toast('The cannon is out of echo — it needs a shard');
        return;
      }
      this.fireSonic();
      this.hotbarCheck();
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
    if (!def || (!def.food && !def.drink)) return;
    const p = this.player;
    const full = (!def.food || p.food >= p.maxFood) && (!def.drink || p.water >= p.maxWater);
    if (full && p.hp >= p.maxHp) { this.toast(def.drink && !def.food ? 'Not thirsty' : 'Not hungry'); return; }
    if (!Inventory.take(id, 1)) { this.toast('You have none left'); return; }
    if (def.food) p.food = Math.min(p.maxFood, p.food + def.food);
    if (def.drink) p.water = Math.min(p.maxWater, p.water + def.drink);
    if (def.bottle === 'water') { Inventory.add(I.BOTTLE, 1); this.hotbarStow(I.BOTTLE); }
    this.hotbarCheck();
    this._hudFood = null;
    Sound.burst({ dur: 0.2, freq: def.drink && !def.food ? 520 : 300, gain: 0.3, sweep: 0.6 });
    this.toast((def.drink && !def.food ? 'Drank ' : 'Ate ') + def.name);
  },

  // A shout along the line you are looking down: everything within half a block
  // of it takes the hit, and the noise carries a very long way.
  fireSonic() {
    const p = this.player, o = p.eye, d = p.dir;
    let hits = 0;
    for (const m of Animals.list.slice()) {
      if (m.dead) continue;
      const vx = m.x - o[0], vy = (m.y + m.def.height * 0.5) - o[1], vz = m.z - o[2];
      const t = vx * d[0] + vy * d[1] + vz * d[2];
      if (t < 0 || t > 32) continue;
      const px = vx - d[0] * t, py = vy - d[1] * t, pz = vz - d[2] * t;
      if (Math.hypot(px, py, pz) > Math.max(0.9, m.def.width)) continue;
      Animals.punch(m, [d[0], d[1], d[2]], 11, this.world);
      hits++;
    }
    Sound.burst({ dur: 0.55, freq: 140, gain: 0.45, sweep: 4 });
    Deep.stir(this, 45);
    this.toast(hits ? 'The shout tears through ' + hits + (hits === 1 ? ' of them' : ' of them') : 'The shout goes out into the dark');
  },

  // The Solytra's second trick: a kinetic shove that puts you back in the air
  // without needing anything to burn.
  solytraBoost() {
    const p = this.player;
    if (itemDef(Equipment.chest || 0) !== undefined && Equipment.chest && itemDef(Equipment.chest).glide) {
      if ((this.boostCd || 0) > 0) { this.toast('Solytra — ' + this.boostCd.toFixed(1) + 's'); return true; }
      this.boostCd = 4;
      p.vel[1] = 15;
      p.vel[0] += p.dir[0] * 6;
      p.vel[2] += p.dir[2] * 6;
      p.onGround = false;
      p.fallFrom = null;
      p.noFall = true;
      p.gliding = true;
      Sound.burst({ dur: 0.4, freq: 900, gain: 0.35, sweep: 2.4 });
      Deep.stir(this, 14);
      return true;
    }
    return false;
  },

  // A picked-up thing takes the first empty hotbar slot, so it is ready to use
  // without opening the bag. Anything already on the bar stays where it is.
  hotbarStow(id) {
    if (!id) return false;
    for (let i = 0; i < 9; i++) if (this.hotbar[i] === id) return false;
    for (let i = 0; i < 9; i++) {
      if (this.hotbar[i]) continue;
      this.hotbar[i] = id;
      if (i === this.slot) this.renderer.buildHandMesh(id);
      return true;
    }
    return false;
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
        if (p.arrow) { Drops.spawn(this.world, p.x, p.y, p.z, I.ARROW, 1, 0.2); return; }
        if (p.hitId === B.PUMPKIN_RED) { this.travelPumpkin(); return; }
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
        this.hotbarStow(d.id);
        Sound.burst({ dur: 0.07, freq: 1100, gain: 0.18, sweep: 1.4 });
        this.toast('Picked up ' + thingName(d.id) + (d.count > 1 ? ' \u00d7' + d.count : ''));
        this.updateHotbarUI();
        if (this.inventoryOpen) this.refreshCraft();
      });
      BedWars.update(dt, this);
      Hunger.update(dt, this);
      Deep.update(dt, this);
      Guns.update(dt, this);
      Boom.update(dt, this);
      if (this.dimension === 'overworld') this.overPos = this.player.pos;   // where home is
      if (this.hackFlight > 0) {
        this.hackFlight -= dt;
        if (this.hackFlight <= 0 && this.mode !== 'creative') {
          this.hackFlight = 0;
          this.player.flying = false;
          this.toast('The client is patched out from under you');
        }
      }
      this.boostCd = Math.max(0, (this.boostCd || 0) - dt);
      this.checkDeath();
      this.updatePortal(dt);
      if (this.player.inWater !== wasInWater) Sound.splash();
      this.stepAudio(dt, res);

      // A held mouse button counts in drag-look too: without pointer lock you
      // still have to be able to hold the button down and mine through a block.
      const locked = document.pointerLockElement === this.canvas || this.dragLook;
      this.holdCheck();
      const breaking = (this.mouse.left && locked) || this.keyBreak;
      if (breaking && this.mode === 'creative') {
        this.breakTimer -= dt;
        if (this.breakTimer <= 0) { this.breakBlock(); this.breakTimer = 0.22; }
      } else if (breaking) {
        this.updateMining(dt);
      } else this.mining = null;
      if ((this.mouse.right && locked) || this.keyPlace) {
        this.placeTimer -= dt;
        if (this.placeTimer <= 0) {
          const fast = this.bridging();          // keep up with a sprint
          this.placeBlock(true);
          this.placeTimer = fast ? 0.08 : 0.22;
        }
      }
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
    } else if (this.dimension === 'future') {
      zenith = [0.10, 0.11, 0.12];
      horizon = [0.28, 0.27, 0.24];
      fogColor = [0.22, 0.22, 0.20];
      fogRange = [this.viewDist * CX * 0.25, this.viewDist * CX * 0.8];   // smog
      ambient = 0.13;
      day = 0.45;
      stars = 0;
    } else if (this.dimension === 'halloween') {
      zenith = [0.03, 0.02, 0.04];
      horizon = [0.16, 0.07, 0.02];
      fogColor = [0.10, 0.045, 0.02];
      fogRange = [this.viewDist * CX * 0.35, this.viewDist * CX * 0.9];
      ambient = 0.16;                 // the flesh of the thing glows a little
      day = 0.35;
      stars = 0;
    } else if (this.dimension === 'dinos') {
      zenith = mix([0.05, 0.07, 0.12], [0.36, 0.55, 0.72], dayN);
      horizon = mix([0.10, 0.10, 0.12], [0.86, 0.79, 0.58], dayN);
      fogColor = mix(horizon, zenith, 0.3);
      fogRange = [this.viewDist * CX * 0.30, this.viewDist * CX * 0.85];   // thick prehistoric haze
      ambient = 0.10;
    } else if (this.dimension === 'sea') {
      // Everything is seen through a great deal of water, so everything is blue.
      zenith = [0.03, 0.16, 0.30];
      horizon = [0.05, 0.28, 0.42];
      fogColor = [0.04, 0.24, 0.38];
      fogRange = [this.viewDist * CX * 0.18, this.viewDist * CX * 0.7];
      ambient = 0.22;
      day = 0.5;
      stars = 0;
    } else if (this.dimension === 'hacker') {
      // Black, with the green of a terminal bleeding into the bottom of it.
      zenith = [0.01, 0.02, 0.02];
      horizon = [0.02, 0.10, 0.05];
      fogColor = [0.02, 0.07, 0.04];
      fogRange = [this.viewDist * CX * 0.55, this.viewDist * CX * 1.1];
      ambient = 0.22;
      day = 0.45;
      stars = 0;
    } else if (this.dimension === 'deep') {
      // No sky at all: what light there is comes off the sculk and the crystals,
      // and the fog closes in hard, which is most of what makes it frightening.
      zenith = [0.01, 0.02, 0.03];
      horizon = [0.02, 0.05, 0.06];
      fogColor = [0.015, 0.035, 0.045];
      fogRange = [this.viewDist * CX * 0.14, this.viewDist * CX * 0.62];
      ambient = 0.085;
      day = 0.2;
      stars = 0;
    } else if (this.dimension === 'nether') {
      zenith = [0.09, 0.02, 0.02];
      horizon = [0.34, 0.08, 0.05];
      fogColor = [0.20, 0.05, 0.04];
      fogRange = [this.viewDist * CX * 0.28, this.viewDist * CX * 0.8];
      ambient = 0.17;                 // the Nether glows faintly all over
      day = 0.35;
      stars = 0;
    }
    // A torch in your hand cannot light the world properly — the light in this
    // engine is baked into the blocks — but carrying one should still help you see.
    const inHand = this.hotbar[this.slot];
    if (inHand && !isItem(inHand) && BLOCKS[inHand].torch) {
      ambient = Math.min(1, ambient + 0.16);
      day = Math.max(day, 0.5);
    }

    const underwater = p.headInWater;
    // Everything in Poseidon's realm is underwater, so the usual "your head has
    // gone under" fog would leave you looking at nothing but blue all day.
    if (underwater && this.dimension === 'sea') { fogColor = [0.05, 0.24, 0.40]; fogRange = [6, this.viewDist * CX * 0.75]; }
    else if (underwater) { fogColor = [0.08, 0.26, 0.45]; fogRange = [0.5, 20]; }
    if (p.inLava) { fogColor = [0.55, 0.16, 0.03]; fogRange = [0.2, 3]; }

    const hit = this.ready ? p.raycast() : null;
    this.lastHit = hit;

    // The outline of the block you are about to lay, shown exactly when a click
    // would actually lay it there.
    let ghost = null;
    const held = this.hotbar[this.slot];
    if (this.ready && held && !isItem(held) && (this.bridging() || !hit)) ghost = this.bridgeTarget(held);

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
      ghost,
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
      const showCount = id && (isItem(id) || this.survivalRules());
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

  // ---- Dragging a stack out of the inventory ---------------------------
  // Grab a slot, pull it off the window and let go: the stack sails out in
  // front of you as a real dropped item. Shift while letting go throws one.
  stackDragInit() {
    if (this.stackDragReady) return;
    this.stackDragReady = true;
    document.addEventListener('pointermove', e => this.stackDragMove(e));
    document.addEventListener('pointerup', e => this.stackDragEnd(e));
    document.addEventListener('pointercancel', () => this.stackDragCancel());
  },

  // Mark a slot as something you can pull out. `src` says where the stack lives.
  makeDraggable(el, src) {
    if (!src.id) return el;
    el.classList.add('draggable');
    // without this the browser runs off with its own image drag and cancels ours
    el.addEventListener('dragstart', e => e.preventDefault());
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      this.stackDragInit();
      this.stackDrag = { src, x0: e.clientX, y0: e.clientY, live: false, ghost: null };
      if (el.setPointerCapture) { try { el.setPointerCapture(e.pointerId); } catch (err) {} }
    });
    return el;
  },

  stackDragMove(e) {
    const d = this.stackDrag;
    if (!d) return;
    if (!d.live) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 16) return;   // a wobble is still a click
      d.live = true;
      d.ghost = document.createElement('div');
      d.ghost.className = 'drag-ghost';
      d.ghost.innerHTML = '<img src="' + thingIcon(d.src.id) + '" alt="" draggable="false">';
      document.body.appendChild(d.ghost);
      document.body.classList.add('dragging-stack');
    }
    d.ghost.style.left = e.clientX + 'px';
    d.ghost.style.top = e.clientY + 'px';
    const out = this.overDropTarget(e);
    d.ghost.classList.toggle('over-world', out);
    document.getElementById('dropzone').classList.toggle('hot', out);
  },

  // Where a release counts as throwing the stack away: the drop bar along the
  // bottom, or anywhere clear of the open window. The bar is hit-tested by its
  // rectangle because it does not take pointer events itself.
  overDropTarget(e) {
    const zone = document.getElementById('dropzone').getBoundingClientRect();
    if (zone.height && e.clientY >= zone.top) return true;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    return !(el && el.closest && el.closest('.panel'));
  },

  stackDragCancel() {
    const d = this.stackDrag;
    this.stackDrag = null;
    if (!d) return;
    if (d.ghost) d.ghost.remove();
    document.body.classList.remove('dragging-stack');
    document.getElementById('dropzone').classList.remove('hot');
  },

  stackDragEnd(e) {
    const d = this.stackDrag;
    if (!d) return;
    const live = d.live, src = d.src;
    this.stackDragCancel();
    if (!live) return;                       // a plain click: leave it to the slot
    // swallow the click this pointerup is about to produce
    const eat = ev => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', eat, true);
    setTimeout(() => window.removeEventListener('click', eat, true), 0);
    if (!this.overDropTarget(e)) return;      // let go inside the window: nothing happens
    this.dropFrom(src, e.shiftKey ? 1 : Infinity);
  },

  // Throw `want` of a stack away, taking it from wherever the slot was fed from.
  dropFrom(src, want) {
    const id = src.id;
    if (!id) return;
    if (src.kind === 'armour') {
      if (Equipment[src.slot] !== id || !Equipment.unequip(src.slot)) return;
      want = 1;                              // the piece you were wearing, not your spares
    }
    let have = Inventory.count(id);
    if (src.kind === 'hotbar' && have <= 0) {
      this.hotbar[src.slot] = 0;             // a creative block with nothing behind it
      this.toast('Cleared slot ' + (src.slot + 1));
      this.updateHotbarUI();
      this.renderer.buildHandMesh(this.hotbar[this.slot]);
      this.refreshCraft();
      return;
    }
    const n = Math.min(have, want);
    if (n <= 0) return;
    Inventory.take(id, n);
    this.dropStack(id, n);
    if (src.kind === 'hotbar' && (want === Infinity || Inventory.count(id) <= 0)) this.hotbar[src.slot] = 0;
    this.toast('Dropped ' + thingName(id) + (n > 1 ? ' \u00d7' + n : ''));
    this.hotbarCheck();
    this.refreshCraft();
  },

  // The stack leaves your hands and arcs out in front of you.
  dropStack(id, n) {
    const eye = this.player.eye, dir = this.player.dir;
    const d = Drops.spawn(this.world, eye[0] + dir[0] * 0.6, eye[1] + dir[1] * 0.6 - 0.2, eye[2] + dir[2] * 0.6, id, n, 0);
    if (!d) return;
    d.vx = dir[0] * 6; d.vy = dir[1] * 6 + 1.8; d.vz = dir[2] * 6;
    d.delay = 1.6;                           // so you do not scoop it straight back up
    Sound.burst({ dur: 0.11, freq: 360, gain: 0.18, sweep: 0.7 });
  },

  // One inventory slot: an icon, a stack count, and a name on hover.
  slotEl(id, count, onClick, opts = {}) {
    const el = document.createElement('div');
    el.className = 'mcslot' + (id ? '' : ' empty') + (opts.className ? ' ' + opts.className : '');
    if (id) {
      el.innerHTML = '<img src="' + thingIcon(id) + '" alt="" draggable="false">' +
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
      if (count > 1 || this.survivalRules()) Inventory.add(id, count);
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
    document.getElementById('menu').classList.add('hidden');   // never behind a window
    if (this.dragLook) this.paused = true;
    this.refreshCraft();
  },

  closeCrafting() {
    document.getElementById('inventory').classList.remove('open');
    this.inventoryOpen = false;
    if (this.dragLook) { this.paused = false; return; }
    const p = this.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => this.enterDragLook());
    setTimeout(() => {
      if (document.pointerLockElement !== this.canvas && !this.panelOpen()) this.enterDragLook();
    }, 400);
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
      if (worn) {
        cell.title = thingName(worn) + ' — click to take off, drag out to drop';
        this.makeDraggable(cell, { kind: 'armour', slot: slotName, id: worn });
      }
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
      this.makeDraggable(cell, { kind: 'inv', id });
      cell.title += ' — drag out of the window to drop it';
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
      const cell = this.slotEl(id, isItem(id) || this.survivalRules() ? count : 1,
        () => { this.selectSlot(i); this.refreshCraft(); },
        { placeholder: String(i + 1), title: 'Hotbar slot ' + (i + 1) });
      if (i === this.slot) cell.classList.add('current');
      if (id) this.makeDraggable(cell, { kind: 'hotbar', slot: i, id });
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
    const food = Math.round(p.food * 5), water = Math.round(p.water * 5);
    if (hp === this._hudHp && armour === this._hudArmour && air === this._hudAir
        && food === this._hudFood && water === this._hudWater) return;
    this._hudHp = hp; this._hudArmour = armour; this._hudAir = air;
    this._hudFood = food; this._hudWater = water;

    const needs = document.getElementById('needs');
    if (needs) {
      needs.style.display = this.mode === 'creative' ? 'none' : 'flex';
      const fb = document.getElementById('foodbar'), wb = document.getElementById('waterbar');
      fb.style.setProperty('--v', (p.food / p.maxFood * 100).toFixed(0) + '%');
      wb.style.setProperty('--v', (p.water / p.maxWater * 100).toFixed(0) + '%');
      fb.classList.toggle('low', p.food <= 6);
      wb.classList.toggle('low', p.water <= 6);
      fb.title = 'Food'; wb.title = 'Water';
    }

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
    if (BedWars.active && BedWars.phase === 'playing') { BedWars.playerDied(this); return; }
    if (Hunger.active && Hunger.phase !== 'over') { Hunger.playerDied(this); return; }
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
    document.getElementById('menu').classList.add('hidden');   // never behind a window
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
    if (p && p.catch) p.catch(() => this.enterDragLook());
    setTimeout(() => {
      if (document.pointerLockElement !== this.canvas && !this.panelOpen()) this.enterDragLook();
    }, 400);
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
    const inSea = feet === B.SEA_PORTAL || head === B.SEA_PORTAL;
    if (inSea) {
      this.portalFx = Math.min(1, (this.portalFx || 0) + dt * 1.6);
      const fx7 = document.getElementById('portalfx');
      if (fx7) fx7.style.opacity = (this.portalFx * 0.55).toFixed(2);
      if (!this.portalArmed) return;
      this.portalTime = (this.portalTime || 0) + dt;
      if (this.portalTime > 1.1 && this.portalCooldown <= 0) this.travelSea();
      return;
    }
    const inHack = feet === B.HACK_PORTAL || head === B.HACK_PORTAL;
    if (inHack) {
      this.portalFx = Math.min(1, (this.portalFx || 0) + dt * 1.6);
      const fx6 = document.getElementById('portalfx');
      if (fx6) fx6.style.opacity = (this.portalFx * 0.55).toFixed(2);
      if (!this.portalArmed) return;
      this.portalTime = (this.portalTime || 0) + dt;
      if (this.portalTime > 1.1 && this.portalCooldown <= 0) this.travelHacker();
      return;
    }
    const inDeep = feet === B.DEEP_PORTAL || head === B.DEEP_PORTAL;
    if (inDeep) {
      this.portalFx = Math.min(1, (this.portalFx || 0) + dt * 1.6);
      const fx5 = document.getElementById('portalfx');
      if (fx5) fx5.style.opacity = (this.portalFx * 0.55).toFixed(2);
      if (!this.portalArmed) return;
      this.portalTime = (this.portalTime || 0) + dt;
      if (this.portalTime > 1.1 && this.portalCooldown <= 0) this.travelDeep();
      return;
    }
    const inRift = feet === B.FUTURE_PORTAL || head === B.FUTURE_PORTAL;
    if (inRift) {
      this.portalFx = Math.min(1, (this.portalFx || 0) + dt * 1.6);
      const fx4 = document.getElementById('portalfx');
      if (fx4) fx4.style.opacity = (this.portalFx * 0.55).toFixed(2);
      if (!this.portalArmed) return;
      this.portalTime = (this.portalTime || 0) + dt;
      if (this.portalTime > 1.1 && this.portalCooldown <= 0) this.travelFuture();
      return;
    }
    const inTime = feet === B.TIME_PORTAL || head === B.TIME_PORTAL;
    if (inTime) {
      this.portalFx = Math.min(1, (this.portalFx || 0) + dt * 1.6);
      const fx3 = document.getElementById('portalfx');
      if (fx3) fx3.style.opacity = (this.portalFx * 0.55).toFixed(2);
      if (!this.portalArmed) return;
      this.portalTime = (this.portalTime || 0) + dt;
      if (this.portalTime > 1.1 && this.portalCooldown <= 0) this.travelTime();
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

  // Down to Poseidon. You keep your breath in his water; that is his doing, not
  // yours, and it stops the moment you leave.
  travelSea() {
    const going = this.dimension !== 'sea';
    const target = going ? 'sea' : ((this.seaReturn && this.seaReturn.dimension) || 'overworld');
    if (going) this.seaReturn = { dimension: this.dimension, pos: this.player.pos.slice() };
    const world = this.worlds[target];
    const tx = Math.floor(this.player.pos[0]), tz = Math.floor(this.player.pos[2]);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (!world.getChunk((tx >> 4) + dx, (tz >> 4) + dz)) world.generateChunk((tx >> 4) + dx, (tz >> 4) + dz);
    }
    let spot;
    if (going) {
      spot = Portal.findOrBuild(world, tx, tz, B.PRISMARINE, B.SEA_PORTAL);
    } else {
      spot = (this.seaReturn && this.seaReturn.pos.slice()) || [tx + 0.5, 80, tz + 0.5];
    }
    this.dimension = target;
    this.world = world;
    this.player.world = world;
    this.player.pos = [spot[0], spot[1], spot[2]];
    this.player.vel = [0, 0, 0];
    this.player.fallFrom = null;
    this.player.air = this.player.maxAir;
    this.portalTime = 0;
    this.portalArmed = false;
    this.portalCooldown = 1;
    this.lastChunk = null;
    this.mining = null;
    Animals.reset();
    Drops.reset();
    Thrown.reset();
    if (going) Sea.seedGuard(world, this, tx, tz);
    this.toast(going ? "Poseidon's realm — you can breathe down here" : 'Back on dry land');
    Sound.burst({ dur: 1.4, freq: going ? 300 : 620, gain: 0.45, sweep: 4 });
  },

  // Through the breach, into whatever is left of the server.
  travelHacker() {
    const going = this.dimension !== 'hacker';
    const target = going ? 'hacker' : ((this.hackReturn && this.hackReturn.dimension) || 'overworld');
    if (going) this.hackReturn = { dimension: this.dimension, pos: this.player.pos.slice() };
    const world = this.worlds[target];
    let spot;
    if (going) {
      const tx = Math.floor(this.player.pos[0]), tz = Math.floor(this.player.pos[2]);
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        if (!world.getChunk((tx >> 4) + dx, (tz >> 4) + dz)) world.generateChunk((tx >> 4) + dx, (tz >> 4) + dz);
      }
      spot = Hacker.arrival(world, tx, tz);
      // and the way home, laid out in the floor where you land
      const bx = Math.floor(spot[0]), bz = Math.floor(spot[2]) + 2;
      for (const [dx, dz, letter] of Hacker.PATTERN) {
        world.setBlock(bx + dx, HK_FLOOR, bz + dz, Hacker.want(letter));
      }
      world.setBlock(bx, HK_FLOOR, bz, B.HACK_PORTAL);
    } else {
      spot = (this.hackReturn && this.hackReturn.pos.slice()) || [0.5, 80, 0.5];
      const hx = Math.floor(spot[0]), hz = Math.floor(spot[2]);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!world.getChunk((hx >> 4) + dx, (hz >> 4) + dz)) world.generateChunk((hx >> 4) + dx, (hz >> 4) + dz);
      }
      spot[1] += 1;                          // step up out of the square, not into it
    }
    this.dimension = target;
    this.world = world;
    this.player.world = world;
    this.player.pos = [spot[0], spot[1], spot[2]];
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
    this.toast(going ? 'Inside the server. Somebody has been in here.' : 'Logged back out');
    Sound.burst({ dur: 1.2, freq: going ? 1800 : 700, gain: 0.45, sweep: 5 });
  },

  // Down past the deepslate. You come back out of the frame you went in by.
  travelDeep() {
    const going = this.dimension !== 'deep';
    const target = going ? 'deep' : ((this.deepReturn && this.deepReturn.dimension) || 'overworld');
    if (going) this.deepReturn = { dimension: this.dimension, pos: this.player.pos.slice() };
    const world = this.worlds[target];
    let tx = Math.floor(this.player.pos[0]), tz = Math.floor(this.player.pos[2]);
    // Coming down, put the way home in a chamber with room to stand up in it,
    // not wherever the frame upstairs happened to be.
    if (going) {
      const near = Deep.arrivalNear(world, tx, tz);
      tx = Math.floor(near[0]); tz = Math.floor(near[2]);
    }
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      if (!world.getChunk((tx >> 4) + dx, (tz >> 4) + dz)) world.generateChunk((tx >> 4) + dx, (tz >> 4) + dz);
    }
    const spot = Portal.findOrBuild(world, tx, tz, B.REINFORCED_DEEPSLATE, B.DEEP_PORTAL);
    this.dimension = target;
    this.world = world;
    this.player.world = world;
    this.player.pos = [spot[0], spot[1], spot[2]];
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
    Deep.reset();
    this.toast(going ? 'The Deep Lands — be quiet' : 'Back up into the light');
    Sound.burst({ dur: 1.6, freq: going ? 70 : 500, gain: 0.45, sweep: 5 });
  },

  // Forward, into whatever is left of the place.
  travelFuture() {
    const going = this.dimension !== 'future';
    const target = going ? 'future' : 'overworld';
    const world = this.worlds[target];
    const tx = Math.floor(this.player.pos[0]), tz = Math.floor(this.player.pos[2]);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!world.getChunk((tx >> 4) + dx, (tz >> 4) + dz)) world.generateChunk((tx >> 4) + dx, (tz >> 4) + dz);
    }
    const spot = Portal.findOrBuild(world, tx, tz, B.DARKSTONE, B.FUTURE_PORTAL);
    this.dimension = target;
    this.world = world;
    this.player.world = world;
    this.player.pos = [spot[0], spot[1], spot[2]];
    this.player.vel = [0, 0, 0];
    this.player.fallFrom = null;
    this.portalTime = 0;
    this.portalArmed = false;
    this.portalCooldown = 1;
    this.lastChunk = null;
    this.mining = null;
    Animals.reset();
    Drops.reset();
    this.toast(going ? 'The city, long after' : 'Back to your own time');
    Sound.burst({ dur: 1.2, freq: going ? 900 : 420, gain: 0.45, sweep: 0.2 });
  },

  // A pearl against those red eyes and you are inside the thing, in a world the
  // shape of the pumpkin itself.
  travelPumpkin() {
    const going = this.dimension !== 'halloween';
    const target = going ? 'halloween' : ((this.pumpkinReturn && this.pumpkinReturn.dimension) || 'overworld');
    if (going) this.pumpkinReturn = { dimension: this.dimension, pos: this.player.pos.slice() };
    const world = this.worlds[target];
    let spot;
    if (going) {
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!world.getChunk(dx, dz)) world.generateChunk(dx, dz);
      }
      spot = Halloween.arrival();
    } else {
      spot = (this.pumpkinReturn && this.pumpkinReturn.pos.slice()) || [0.5, 90, 0.5];
      const hx = Math.floor(spot[0]), hz = Math.floor(spot[2]);
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!world.getChunk((hx >> 4) + dx, (hz >> 4) + dz)) world.generateChunk((hx >> 4) + dx, (hz >> 4) + dz);
      }
    }
    this.dimension = target;
    this.world = world;
    this.player.world = world;
    this.player.pos = spot.slice();
    this.player.vel = [0, 0, 0];
    this.player.fallFrom = null;
    this.lastChunk = null;
    this.mining = null;
    Animals.reset();
    Drops.reset();
    Thrown.reset();
    this.toast(going ? 'Inside the pumpkin' : 'Back outside');
    Sound.burst({ dur: 1.1, freq: going ? 180 : 420, gain: 0.45, sweep: 4 });
  },

  // Through the water and out the other side, a hundred million years earlier.
  travelTime() {
    const toPast = this.dimension !== 'dinos';
    const target = toPast ? 'dinos' : 'overworld';
    const world = this.worlds[target];
    const tx = Math.floor(this.player.pos[0]), tz = Math.floor(this.player.pos[2]);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!world.getChunk((tx >> 4) + dx, (tz >> 4) + dz)) world.generateChunk((tx >> 4) + dx, (tz >> 4) + dz);
    }
    const spot = Portal.findOrBuild(world, tx, tz, B.GLOWSTONE, B.TIME_PORTAL);

    this.dimension = target;
    this.world = world;
    this.player.world = world;
    this.player.pos = [spot[0], spot[1], spot[2]];
    this.player.vel = [0, 0, 0];
    this.player.fallFrom = null;
    this.portalTime = 0;
    this.portalArmed = false;
    this.portalCooldown = 1;
    this.lastChunk = null;
    this.mining = null;
    Animals.reset();
    Drops.reset();
    this.toast(toPast ? 'The age of the dinosaurs' : 'Back to your own time');
    Sound.burst({ dur: 1.2, freq: 220, gain: 0.45, sweep: 5 });
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
    Outfits.update(dt);
    if (!this.paused && this.ready) Outfits.tick(this);
    if (Outfits.cooldown > 0 || Outfits.ready) { Outfits.ready = 0; Outfits.refreshHud(); }
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
    if (ARENA_MODES[this.dimension]) return;       // a match is not a world worth keeping
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
        dinoEdits: [...this.worlds.dinos.edits.entries()].slice(0, 20000),
        hallowEdits: [...this.worlds.halloween.edits.entries()].slice(0, 20000),
        futureEdits: [...this.worlds.future.edits.entries()].slice(0, 20000),
        dragonSlain: !!this.worlds.end.dragonSlain,
        dimension: this.dimension,
        overPos: (this.overPos || (this.dimension === 'overworld' ? this.player.pos : null) || [0, 80, 0]).slice(),
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
  ['armour', 'Armour'], ['food', 'Food'], ['materials', 'Materials'], ['eggs', 'Spawn eggs'],
];
function thingCategory(id) {
  if (!isItem(id)) return 'blocks';
  const def = itemDef(id);
  if (def.spawnEgg) return 'eggs';
  if (def.armour) return 'armour';
  if (def.tool) return 'tools';
  if (def.damage) return 'weapons';
  if (def.food) return 'food';
  return 'materials';
}
function catalogue() {
  const out = [];
  for (let id = 1; id < BLOCKS.length; id++) {
    if (BLOCKS[id].flowing || BLOCKS[id].tv || id === B.TORCH_WALL) continue;
    if (id === B.CRYSTAL_ROUSED || id === B.CRYSTAL_ALARMED) continue;   // one entry for the crystal
    if (BLOCKS[id].stairs && id !== B.STAIRS_N) continue;      // one entry for all four ways round
    out.push(id);
  }
  out.push(B.TV);
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
