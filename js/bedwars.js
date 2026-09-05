// Bed Wars — four teams on floating islands, the way the Hive's Treasure Wars
// plays. Generators tick out iron and gold at every base, the shop turns that
// into blocks and gear, and a team stops respawning the moment its bed goes.
// You are one player; the other seats are filled by bots that farm their island,
// bridge across the void and come for your bed.

const BW_Y = 64;              // the surface of every base island
const BW_R = 46;              // how far each base sits from the middle
const BW_PREP = 24;           // seconds of quiet before the bots set off
const BW_TEAM_SIZE = 2;       // players per team, you included

const BW_TEAMS = [
  { key: 'red',    name: 'Red',    at: [-BW_R, 0], wool: 'RED_WOOL',    css: '#e0574f' },
  { key: 'blue',   name: 'Blue',   at: [BW_R, 0],  wool: 'BLUE_WOOL',   css: '#5b8bea' },
  { key: 'green',  name: 'Green',  at: [0, -BW_R], wool: 'GREEN_WOOL',  css: '#5ec06a' },
  { key: 'yellow', name: 'Yellow', at: [0, BW_R],  wool: 'YELLOW_WOOL', css: '#e3c34a' },
];

// Where each side sits, for however many sides are playing.
const BW_ANGLES = [Math.PI, 0, -Math.PI / 2, Math.PI / 2];

// Two ways to play the same game: the long version on four islands, and Rush —
// two sides close enough to be at each other's beds inside a minute.
const BW_VARIANTS = {
  classic: { label: 'Bed Wars', R: BW_R, prep: BW_PREP, sides: 4, size: 2,
             iron: 1.6, gold: 9, mid: 30, diamonds: true, midY: BW_Y + 1,
             roles: ['rusher', 'rusher', 'raider', 'collector', 'defender', 'duelist'] },
  rush:    { label: 'Rush', R: 24, prep: 5, sides: 2, size: 2,
             iron: 0.8, gold: 4.5, mid: 14, diamonds: false, midY: BW_Y,
             roles: ['rusher', 'rusher', 'rusher', 'raider', 'duelist'] },
};

const BedWars = {
  v: null,                    // the variant being played
  variantKey: 'classic',
  active: false,
  phase: 'idle',              // idle | playing | over
  teams: [],
  islands: [],
  bots: [],
  placed: new Set(),          // "x,y,z" of everything put down during the match
  queue: [],                  // bots waiting to come back, by match time
  clock: 0,
  you: null,                  // the team you are on
  result: '',

  // ---- setup -----------------------------------------------------------
  // One team object per colour: where it spawns, where its bed lies, and which
  // way it faces the middle.
  // The islands, as squares: bases spaced around the middle, one shared island
  // at the centre and, in the long game, diamond islands on the diagonals.
  islandList() {
    const v = this.v;
    const list = this.teams.map(t => ({ x: t.home[0], z: t.home[1], half: 7, y: BW_Y, block: B.SANDSTONE, base: t.key }));
    list.push({ x: 0, z: 0, half: 6, y: v.midY, block: B.STONE_BRICKS, middle: true });
    if (v.diamonds) {
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        list.push({ x: sx * 30, z: sz * 30, half: 3, y: BW_Y + 2, block: B.STONE_BRICKS, diamond: true });
      }
    }
    return list;
  },

  buildTeams() {
    const v = this.v;
    this.teams = BW_TEAMS.slice(0, v.sides).map((def, i) => {
      const a = BW_ANGLES[i];
      const hx = Math.round(Math.cos(a) * v.R), hz = Math.round(Math.sin(a) * v.R);
      const len = Math.hypot(hx, hz) || 1;
      const toC = [-hx / len, -hz / len];                 // unit vector towards the middle
      const perp = [-toC[1], toC[0]];
      const r = (v, s) => Math.round(v * s);
      const bedX = hx + r(toC[0], -4), bedZ = hz + r(toC[1], -4);
      return {
        key: def.key, name: def.name, css: def.css, wool: B[def.wool],
        home: [hx, hz], toC, perp,
        spawn: [hx + 0.5, BW_Y + 1, hz + 0.5],
        bed: [bedX, BW_Y + 1, bedZ],                       // the foot; the head is one further out
        bedHead: [bedX + r(toC[0], -1), BW_Y + 1, bedZ + r(toC[1], -1)],
        gen: [hx + r(toC[0], 3), BW_Y + 1, hz + r(toC[1], 3)],
        shop: [hx + r(perp[0], 4), BW_Y + 1, hz + r(perp[1], 4)],
        bedAlive: true, alive: v.size, out: false,
        ironTimer: 0, goldTimer: 4, tier: 0,
      };
    });
    this.islands = this.islandList();
  },

  teamAt(key) { return this.teams.find(t => t.key === key); },

  // ---- world generation ------------------------------------------------
  islandAt(wx, wz) {
    for (const isl of this.islands) {
      const dx = Math.abs(wx - isl.x), dz = Math.abs(wz - isl.z);
      if (dx > isl.half || dz > isl.half) continue;
      // thicker in the middle, so each island reads as something floating
      const inset = isl.half - Math.max(dx, dz);
      return { isl, top: isl.y, thick: Math.min(5, 2 + inset) };
    }
    return null;
  },

  generateChunk(world, cx, cz) {
    const c = new Chunk(cx, cz);
    world.chunks.set(world.key(cx, cz), c);
    const bx = cx * CX, bz = cz * CZ;
    const blocks = c.blocks;
    const put = (lx, y, lz, id) => { if (y >= 0 && y < CY) blocks[colOffset(lx, lz) + y * CX * CZ] = id; };

    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      const wx = bx + lx, wz = bz + lz;
      const hit = this.islandAt(wx, wz);
      if (!hit) continue;
      for (let y = hit.top - hit.thick + 1; y <= hit.top; y++) put(lx, y, lz, hit.isl.block);
      // every base wears its colour in the middle, so you always know whose island you are on
      if (hit.isl.base) {
        const t = this.teamAt(hit.isl.base);
        if (t && Math.abs(wx - t.home[0]) <= 2 && Math.abs(wz - t.home[1]) <= 2) put(lx, hit.top, lz, t.wool);
      }
    }

    // beds and generator markers, placed from the team table so every chunk agrees
    for (const t of this.teams) {
      const mark = (p, id) => {
        const lx = p[0] - bx, lz = p[2] - bz;
        if (lx < 0 || lz < 0 || lx >= CX || lz >= CZ) return;
        put(lx, p[1], lz, id);
      };
      if (t.bedAlive) { mark(t.bed, B.BED_FOOT); mark(t.bedHead, B.BED_HEAD); }
      mark([t.gen[0], BW_Y, t.gen[2]], B.IRON_ORE);
      mark([t.shop[0], BW_Y, t.shop[2]], B.PLANKS);
    }
    for (const isl of this.islands) {
      if (!isl.diamond && !isl.middle) continue;
      const lx = isl.x - bx, lz = isl.z - bz;
      if (lx < 0 || lz < 0 || lx >= CX || lz >= CZ) continue;
      put(lx, isl.y, lz, isl.diamond ? B.DIAMOND_ORE : B.EMERALD_ORE);
    }

    if (world.edits.size) {
      for (const [k, id] of world.edits) {
        const p = k.split(',');
        const x = +p[0], y = +p[1], z = +p[2];
        if ((x >> 4) === cx && (z >> 4) === cz) blocks[idx(x & 15, y, z & 15)] = id;
      }
    }
    world.rebuildHeightmap(c);
    c.empty = !blocks.some(v => v !== 0);
    world.initLight(c);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nb = world.getChunk(cx + dx, cz + dz);
      if (nb) nb.dirty = true;
    }
    return c;
  },

  // ---- the match -------------------------------------------------------
  start(game, variant) {
    this.v = BW_VARIANTS[variant || this.variantKey || 'classic'];
    this.variantKey = variant || this.variantKey || 'classic';
    this.buildTeams();
    this.placed.clear();
    this.bots.length = 0;
    this.queue.length = 0;
    this.clock = 0;
    this.phase = 'playing';
    this.active = true;
    this.result = '';
    this.hintDone = false;
    this.you = this.teams[0];                       // you are always Red

    const world = game.worlds.bedwars;
    world.edits.clear();
    for (const c of world.chunks.values()) {                 // a rematch rebuilds the arena from scratch
      if (c.mesh) { game.renderer.freeMesh(c.mesh.solid); game.renderer.freeMesh(c.mesh.fluid); }
    }
    world.chunks.clear();
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const [hx, hz] = this.you.home;
      world.generateChunk((hx >> 4) + dx, (hz >> 4) + dz);
    }

    // your ally guards home; every other team fields a full side
    for (const t of this.teams) {
      const bots = t === this.you ? this.v.size - 1 : this.v.size;
      for (let i = 0; i < bots; i++) Animals.list.push(this.spawnBot(t, i === 0 && t === this.you));
    }
    for (const t of this.teams) {                    // a shopkeeper at every base
      const shop = new Mob('bw_shop', t.shop[0] + 0.5, t.shop[1], t.shop[2] + 0.5, 0);
      shop.bwShop = t.key;
      Animals.list.push(shop);
    }
    this.announce(this.v.label + ' — protect your bed');
  },

  spawnPoint() { return this.you.spawn.slice(); },

  stop() {
    this.active = false;
    this.phase = 'idle';
    this.bots.length = 0;
    this.placed.clear();
    document.getElementById('arenaboard').classList.add('hidden');
    document.getElementById('arenaend').classList.add('hidden');
  },

  spawnBot(team, keeper) {
    const jitter = () => (Math.random() - 0.5) * 3;
    const mob = new Mob('bot_' + team.key, team.spawn[0] + jitter(), team.spawn[1], team.spawn[2] + jitter(), 0);
    mob.bwTeam = team.key;
    mob.bwKeeper = !!keeper;                        // an ally who never leaves home
    mob.bwBlocks = 220;
    mob.attackCd = 0;
    mob.bwSpeed = mob.def.speed * (0.8 + Math.random() * 0.5);   // none of them move alike
    mob.bwPrep = this.v.prep * (0.55 + Math.random() * 0.9);         // and none set off together
    this.rollPlan(mob, team);
    this.bots.push(mob);
    return mob;
  },

  // Bots are not all the same player. Each picks a way of playing, someone to
  // pick on and a line to come in on, and thinks better of it every so often —
  // so a match is never the same three raiders walking the same path twice.
  ROLES: ['rusher', 'rusher', 'raider', 'collector', 'defender', 'duelist'],

  rollPlan(mob, team) {
    mob.bwPlan = 14 + Math.random() * 22;           // seconds before it reconsiders
    if (mob.bwKeeper) { mob.bwRole = 'defender'; return; }
    const roles = this.v.roles || this.ROLES;
    mob.bwRole = roles[(Math.random() * roles.length) | 0];
    // a side always has somebody actually going for a bed, however the dice fell
    const pushing = this.bots.some(b => b !== mob && b.bwTeam === team.key && !b.bwKeeper &&
                                        (b.bwRole === 'rusher' || b.bwRole === 'raider'));
    if (!pushing) mob.bwRole = 'rusher';
    const others = this.teams.filter(t => t !== team && !t.out);
    mob.bwTarget = others.length ? others[(Math.random() * others.length) | 0].key : null;
    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 8;
    mob.bwSwing = [Math.cos(a) * r, Math.sin(a) * r];             // comes in off to one side
  },

  // The middle and the diamond islands, for whoever fancies gathering first.
  nearestShared(mob) {
    let best = null, bd = 1e9;
    for (const isl of this.islands) {
      if (!isl.diamond && !isl.middle) continue;
      const d = Math.hypot(isl.x - mob.x, isl.z - mob.z);
      if (d < bd) { bd = d; best = isl; }
    }
    return best;
  },

  // ---- rules -----------------------------------------------------------
  key(x, y, z) { return x + ',' + y + ',' + z; },
  notePlaced(x, y, z) { if (this.active) this.placed.add(this.key(x, y, z)); },

  // Only what somebody put down during the match comes back up — and beds.
  canBreak(x, y, z, id) {
    if (!this.active) return true;
    if (id === B.BED_FOOT || id === B.BED_HEAD) return true;
    return this.placed.has(this.key(x, y, z));
  },

  // A bed is gone: that team is on its last life.
  bedAt(x, y, z) {
    for (const t of this.teams) {
      if (!t.bedAlive) continue;
      for (const p of [t.bed, t.bedHead]) {
        if (p[0] === x && p[1] === y && p[2] === z) return t;
      }
    }
    return null;
  },

  breakBed(team, byName) {
    if (!team.bedAlive) return;
    team.bedAlive = false;
    const w = Game.world;
    w.setBlock(team.bed[0], team.bed[1], team.bed[2], 0);
    w.setBlock(team.bedHead[0], team.bedHead[1], team.bedHead[2], 0);
    this.announce(team.name + '’s bed was destroyed by ' + byName);
    Sound.burst({ dur: 0.7, freq: 180, gain: 0.5, sweep: 0.25 });
    this.refreshBoard();
  },

  announce(text) {
    Game.toast(text);
    const el = document.getElementById('arenanews');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this._newsTimer);
    this._newsTimer = setTimeout(() => el.classList.add('hidden'), 4000);
  },

  // ---- generators ------------------------------------------------------
  runGenerators(dt, world, player) {
    for (const t of this.teams) {
      if (t.out) continue;
      t.ironTimer -= dt;
      if (t.ironTimer <= 0) {
        t.ironTimer = this.v.iron;
        Drops.spawn(world, t.gen[0] + 0.5, t.gen[1] + 0.4, t.gen[2] + 0.5, I.IRON_INGOT, 1, 0.4);
      }
      t.goldTimer -= dt;
      if (t.goldTimer <= 0) {
        t.goldTimer = this.v.gold;
        Drops.spawn(world, t.gen[0] + 0.5, t.gen[1] + 0.4, t.gen[2] + 0.5, I.GOLD_INGOT, 1, 0.4);
      }
    }
    this.midTimer = (this.midTimer === undefined ? 20 : this.midTimer) - dt;
    if (this.midTimer <= 0) {
      this.midTimer = this.v.mid;
      for (const isl of this.islands) {
        if (!isl.diamond && !isl.middle) continue;
        Drops.spawn(world, isl.x + 0.5, isl.y + 1.4, isl.z + 0.5,
          isl.diamond ? I.DIAMOND : I.EMERALD, 1, 0.4);
      }
    }
    // bots tidy up their own base, which is what farming looks like from outside
    for (let i = Drops.list.length - 1; i >= 0; i--) {
      const d = Drops.list[i];
      if (Math.hypot(d.x - player.pos[0], d.z - player.pos[2]) < 12) continue;
      for (const t of this.teams) {
        if (t === this.you || t.out) continue;
        if (Math.hypot(d.x - t.gen[0], d.z - t.gen[2]) < 4) { Drops.list.splice(i, 1); break; }
      }
    }
  },

  // ---- bot brains ------------------------------------------------------
  // Bots do three things: hold their island, walk a straight line at whoever
  // they are raiding, and lay a block under themselves when the floor runs out.
  botUpdate(mob, dt, world, player) {
    if (mob.bwShop) {                                  // a shopkeeper only turns to face you
      mob.walking = false;
      mob.vy -= GRAVITY_MOB * dt;
      mob.moveAxis(world, 1, mob.vy * dt);
      const dx = player.pos[0] - mob.x, dz = player.pos[2] - mob.z;
      if (dx * dx + dz * dz < 64) mob.yaw += clamp(Math.atan2(dx, -dz) - mob.yaw, -2 * dt, 2 * dt);
      mob.swing = 0; mob.airborne = false;
      const li = world.getLight(Math.floor(mob.x), Math.floor(mob.y + 1), Math.floor(mob.z));
      mob.sky = (li >> 4) / 15; mob.blk = (li & 15) / 15;
      return;
    }
    const team = this.teamAt(mob.bwTeam);
    if (!team || !this.active || this.phase !== 'playing') { mob.walking = false; return; }
    mob.attackCd = Math.max(0, (mob.attackCd || 0) - dt);
    mob.bwBreak = Math.max(0, (mob.bwBreak || 0) - dt * 0);

    mob.bwPlan = (mob.bwPlan || 0) - dt;
    if (mob.bwPlan <= 0) this.rollPlan(mob, team);

    const target = this.botTarget(mob, team, player);
    let goal = target ? target.at : null;
    if (!goal) goal = [team.spawn[0], team.spawn[2]];

    const dx = goal[0] - mob.x, dz = goal[1] - mob.z;
    const dist = Math.hypot(dx, dz);
    mob.targetYaw = Math.atan2(dx, -dz);
    let d = mob.targetYaw - mob.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    mob.yaw += clamp(d, -5 * dt, 5 * dt);
    mob.walking = dist > (target && target.kind === 'wander' ? 0.8 : 1.4);

    // bridging: if the next step is over nothing, put a block there first
    if (mob.walking && mob.onGround && mob.bwBlocks > 0) {
      const fy = Math.floor(mob.y) - 1;
      for (const ahead of [0.8, 1.5]) {
        const nx = Math.floor(mob.x + Math.sin(mob.yaw) * ahead);
        const nz = Math.floor(mob.z - Math.cos(mob.yaw) * ahead);
        if (isSolid(world.getBlock(nx, fy, nz))) continue;
        world.setBlock(nx, fy, nz, team.wool);
        this.notePlaced(nx, fy, nz);
        mob.bwBlocks--;
        mob.vx *= 0.6; mob.vz *= 0.6;
        break;
      }
    }
    // back on its own island it restocks, the way a player would
    if (Math.hypot(mob.x - team.home[0], mob.z - team.home[1]) < 8) mob.bwBlocks = 220;

    // walking, falling and stepping up, the same way the animals do it
    const speed = (mob.bwSpeed || mob.def.speed) * (mob.walking ? 1 : 0);
    const fx = Math.sin(mob.yaw) * speed, fz = -Math.cos(mob.yaw) * speed;
    const blend = 1 - Math.exp(-(mob.onGround ? 12 : 3) * dt);
    mob.vx += (fx - mob.vx) * blend;
    mob.vz += (fz - mob.vz) * blend;
    mob.vy -= GRAVITY_MOB * dt;
    if (mob.vy < -45) mob.vy = -45;
    mob.onGround = false;
    const steps = Math.max(1, Math.ceil(Math.hypot(mob.vx, mob.vy, mob.vz) * dt / 0.25));
    let blocked = false;
    for (let i = 0; i < steps; i++) {
      mob.moveAxis(world, 1, mob.vy * dt / steps);
      blocked = mob.moveAxis(world, 0, mob.vx * dt / steps) || blocked;
      blocked = mob.moveAxis(world, 2, mob.vz * dt / steps) || blocked;
    }
    if (blocked && mob.onGround) {
      const head = world.getBlock(Math.floor(mob.x), Math.floor(mob.y + mob.def.height + 0.6), Math.floor(mob.z));
      if (!isSolid(head)) mob.vy = 7.6;
    }
    if (mob.y < BW_Y - 24) { this.botDied(mob, 'the void'); return; }

    // what it does once it gets there
    if (target && target.kind === 'bed') {
      const bed = target.team.bed;
      if (Math.hypot(bed[0] - mob.x, bed[2] - mob.z) < 2.4) {
        mob.bwBreakTimer = (mob.bwBreakTimer || 0) + dt;
        if (mob.bwBreakTimer > 2.5 + Math.random()) {
          mob.bwBreakTimer = 0;
          this.breakBed(target.team, team.name);
        }
      } else mob.bwBreakTimer = 0;
    } else {
      mob.bwBreakTimer = 0;
      if (target && target.kind === 'foe' && dist < 2.4 && mob.attackCd <= 0) {
        mob.attackCd = 0.7 + Math.random() * 0.7;
        mob.swing = 1;
        this.botStrike(mob, team, target, player);
      }
    }

    // They never come looking for you — you are not on the list of things worth
    // walking towards — but get inside arm's reach of one and it will swing.
    if (team !== this.you && !player.dead && mob.attackCd <= 0) {
      const pdx = player.pos[0] - mob.x, pdz = player.pos[2] - mob.z;
      if (Math.hypot(pdx, pdz) < 2.3 && Math.abs(player.pos[1] - mob.y) < 2.3) {
        mob.attackCd = 0.7 + Math.random() * 0.7;
        mob.swing = 1;
        mob.targetYaw = Math.atan2(pdx, -pdz);          // turn on you as it hits
        this.strikePlayer(mob, team, player);
      }
    }

    const hspeed = Math.hypot(mob.vx, mob.vz);
    mob.walkPhase += dt * hspeed * 5.5;
    mob.swing = Math.min(1, hspeed / mob.def.speed);
    mob.airborne = !mob.onGround;
    if (mob.hurt > 0) mob.hurt -= dt;
    const l = world.getLight(Math.floor(mob.x), Math.floor(mob.y + 1), Math.floor(mob.z));
    mob.sky = (l >> 4) / 15; mob.blk = (l & 15) / 15;
  },

  // Nearest enemy first, then the bed it is trying to break, then home.
  botTarget(mob, team, player) {
    const chosen = mob.bwTarget ? this.teamAt(mob.bwTarget) : null;
    const aim = (chosen && chosen.bedAlive && !chosen.out) ? chosen : this.raidTarget(team);

    // once it is standing over a bed, nothing else matters
    if (aim && !mob.bwKeeper && Math.hypot(aim.bed[0] - mob.x, aim.bed[2] - mob.z) < 8) {
      return { kind: 'bed', at: [aim.bed[0], aim.bed[2]], team: aim };
    }

    // how far it will go out of its way for a fight depends on the sort it is
    const reach = mob.bwRole === 'duelist' ? 40 : mob.bwRole === 'defender' ? 20 : 9;
    const foe = this.nearestFoe(mob, team, player);

    // You are worth chasing too, though from closer in than they chase each
    // other: wander into their half and they will come, but they will not cross
    // the map for you.
    if (team !== this.you && !player.dead) {
      const pd = Math.hypot(player.pos[0] - mob.x, player.pos[2] - mob.z);
      const chase = mob.bwRole === 'duelist' ? 16 : mob.bwRole === 'defender' ? 12 : 7;
      if (pd < chase && Math.abs(player.pos[1] - mob.y) < 5 && (!foe || pd < foe.d)) {
        return { kind: 'foe', at: [player.pos[0], player.pos[2]] };
      }
    }

    if (foe && foe.d < reach) return { kind: 'foe', at: [foe.x, foe.z], mob: foe.mob };

    if (mob.bwRole === 'defender' || mob.bwKeeper) {
      const b = team.bed, a = this.clock * 0.5 + mob.x;
      return { kind: 'wander', at: [b[0] + Math.cos(a) * 3, b[2] + Math.sin(a) * 3] };
    }
    if (this.clock < (mob.bwPrep || this.v.prep)) {
      const a = (this.clock * 0.5) + (mob.x + mob.z);
      return { kind: 'wander', at: [team.home[0] + Math.cos(a) * 4, team.home[1] + Math.sin(a) * 4] };
    }
    if (mob.bwRole === 'collector') {
      const isl = this.nearestShared(mob);
      if (isl) return { kind: 'wander', at: [isl.x, isl.z] };
    }
    if (aim) {
      const sw = mob.bwSwing || [0, 0];
      const far = Math.hypot(aim.bed[0] - mob.x, aim.bed[2] - mob.z) > 16;
      return { kind: 'bed', team: aim,
               at: far ? [aim.bed[0] + sw[0], aim.bed[2] + sw[1]] : [aim.bed[0], aim.bed[2]] };
    }
    if (foe) return { kind: 'foe', at: [foe.x, foe.z], mob: foe.mob };
    return { kind: 'wander', at: [team.spawn[0], team.spawn[2]] };
  },

  raidTarget(team) {
    let best = null, bestD = 1e9;
    for (const t of this.teams) {
      if (t === team || t.out) continue;
      const d = Math.hypot(t.home[0] - team.home[0], t.home[1] - team.home[1]) + (t.bedAlive ? 0 : 200);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best && best.bedAlive ? best : null;
  },

  // Bots fight each other, never you: you are not on the list of enemies.
  nearestFoe(mob, team, player) {
    let best = null;
    for (const other of this.bots) {
      if (other === mob || other.dead || other.bwTeam === mob.bwTeam) continue;
      const d = Math.hypot(other.x - mob.x, other.z - mob.z);
      if (Math.abs(other.y - mob.y) > 4) continue;
      if (!best || d < best.d) best = { d, x: other.x, z: other.z, mob: other };
    }
    return best;
  },

  strikePlayer(mob, team, player) {
    Sound.burst({ dur: 0.09, freq: 460, gain: 0.3, sweep: 0.5 });
    if (player.damage(3 + team.tier, 'a ' + team.name + ' player')) {
      const dx = player.pos[0] - mob.x, dz = player.pos[2] - mob.z;
      const push = 3.4 / Math.max(0.7, Math.hypot(dx, dz));
      player.vel[0] += dx * push; player.vel[2] += dz * push; player.vel[1] = 3.2;
    }
  },

  botStrike(mob, team, target, player) {
    const dmg = 3 + team.tier;
    Sound.burst({ dur: 0.09, freq: 460, gain: 0.3, sweep: 0.5 });
    if (target.mob) {
      const foe = target.mob;
      foe.hp -= dmg;
      foe.hurt = 0.3;
      const dx = foe.x - mob.x, dz = foe.z - mob.z;
      const push = 4 / Math.max(0.7, Math.hypot(dx, dz));
      foe.vx += dx * push; foe.vz += dz * push; foe.vy = 3;
      if (foe.hp <= 0) this.botDied(foe, team.name);
    }
  },

  botDied(mob, by) {
    if (mob.bwGone) return;                    // dead is not the same as dealt with
    mob.bwGone = true;
    mob.dead = true;
    const team = this.teamAt(mob.bwTeam);
    const i = this.bots.indexOf(mob);
    if (i >= 0) this.bots.splice(i, 1);
    if (!team) return;
    if (team.bedAlive) {
      this.queue.push({ team: team.key, keeper: mob.bwKeeper, at: this.clock + 6 });
    } else {
      team.alive = Math.max(0, team.alive - 1);
      this.checkOut(team, by);
    }
  },

  checkOut(team, by) {
    if (team.out || team.bedAlive || team.alive > 0) return;
    team.out = true;
    this.announce(team.name + ' has been eliminated');
    this.refreshBoard();
    this.checkWin();
  },

  checkWin() {
    const left = this.teams.filter(t => !t.out);
    if (left.length > 1) return;
    this.finish(left[0] === this.you ? 'You won the match' : (left[0] ? left[0].name + ' won the match' : 'Nobody survived'),
      left[0] === this.you);
  },

  finish(text, won) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.result = text;
    document.getElementById('arenaend-title').textContent = won ? 'Victory' : 'Game over';
    document.getElementById('arenaend-sub').textContent = text;
    document.getElementById('arenaend').classList.remove('hidden');
    document.exitPointerLock();
    Game.paused = true;
    Sound.burst({ dur: 0.9, freq: won ? 620 : 200, gain: 0.5, sweep: won ? 0.4 : 3 });
  },

  // ---- the player ------------------------------------------------------
  kit(game) {
    Inventory.counts.clear();
    Equipment.load({ head: 0, chest: 0, legs: 0, feet: 0 });
    Inventory.add(I.WOOD_SWORD, 1);
    Inventory.add(this.you.wool, 64);          // enough to reach the middle island
    game.hotbar = [this.you.wool, I.WOOD_SWORD, 0, 0, 0, 0, 0, 0, 0];
    game.selectSlot(0);                        // blocks in hand, so the first click builds
  },

  // Death is only the end once your bed has gone.
  playerDied(game) {
    if (this.you.bedAlive) {
      this.announce('You were killed — back at your base');
      game.player.spawn = this.you.spawn.slice();
      game.player.respawn();
      this.kit(game);
      return true;                                   // handled: no death screen
    }
    // No bed means no way back, whatever the rest of your team is still doing:
    // your team-mate's life is not yours to spend.
    this.you.alive = 0;
    this.you.out = true;
    this.refreshBoard();
    this.finish('Your bed was gone, and so are you', false);
    return true;
  },

  update(dt, game) {
    if (!this.active || this.phase !== 'playing') return;
    this.clock += dt;
    this.runGenerators(dt, game.world, game.player);
    for (let i = this.bots.length - 1; i >= 0; i--) {
      if (this.bots[i].dead) this.botDied(this.bots[i], 'the match');
    }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if (this.clock < q.at) continue;
      this.queue.splice(i, 1);
      const team = this.teamAt(q.team);
      if (!team) continue;
      if (team.bedAlive && !team.out) { Animals.list.push(this.spawnBot(team, q.keeper)); continue; }
      team.alive = Math.max(0, team.alive - 1);      // the bed went while they were waiting to come back
      this.checkOut(team, 'the match');
    }
    if (game.player.pos[1] < BW_Y - 26) {
      game.player.invuln = 0;
      game.player.damage(40, 'the void');
    }
    if (!this.hintDone && this.clock > 5) {
      this.hintDone = true;
      this.announce('Hold Shift at the edge to bridge out over the void');
    }
    this.arenaTimer = (this.arenaTimer || 0) - dt;
    if (this.arenaTimer <= 0) { this.arenaTimer = 1; this.ensureArena(game.world); }
    this.boardTimer = (this.boardTimer || 0) - dt;
    if (this.boardTimer <= 0) { this.boardTimer = 0.5; this.refreshBoard(); }
  },

  // Chunk unloading follows the player, but the bots are fighting on the far
  // side of the arena, so the whole map is kept in memory for the match.
  ensureArena(world) {
    const n = Math.ceil((this.v.R + 10) / CX);
    for (let cx = -n; cx <= n; cx++) for (let cz = -n; cz <= n; cz++) {
      if (!world.getChunk(cx, cz)) world.generateChunk(cx, cz);
    }
  },

  // ---- the shop --------------------------------------------------------
  offers() {
    const wool = this.you ? this.you.wool : B.WOOL;
    const iron = I.IRON_INGOT, gold = I.GOLD_INGOT, dia = I.DIAMOND, eme = I.EMERALD;
    return [
      { cost: [iron, 4], give: [wool, 16], note: 'Bridging blocks in your colour' },
      { cost: [iron, 12], give: [B.STONE_BRICKS, 12], note: 'Tougher than wool' },
      { cost: [gold, 4], give: [B.PLANKS, 8], note: 'Quick cover' },
      { cost: [eme, 4], give: [B.OBSIDIAN, 4], note: 'What a bed defence is made of' },
      { cost: [iron, 10], give: [I.STONE_SWORD, 1], note: 'A step up from wood' },
      { cost: [gold, 7], give: [I.IRON_SWORD, 1], note: 'Hits for three hearts' },
      { cost: [eme, 4], give: [I.DIAMOND_SWORD, 1], note: 'The best blade here' },
      { cost: [iron, 12], give: 'armour-leather', note: 'A full leather set, worn at once' },
      { cost: [gold, 12], give: 'armour-iron', note: 'A full iron set, worn at once' },
      { cost: [eme, 6], give: 'armour-diamond', note: 'A full diamond set, worn at once' },
      { cost: [iron, 10], give: [I.IRON_PICKAXE, 1], note: 'Breaks blocks properly' },
      { cost: [dia, 3], give: [I.DIAMOND_PICKAXE, 1], note: 'Through obsidian in seconds' },
      { cost: [iron, 6], give: [I.COOKED_BEEF, 2], note: 'Eat to heal' },
      { cost: [eme, 4], give: [I.ENDER_PEARL, 1], note: 'Throw it and land where it lands' },
    ];
  },

  ARMOUR_SETS: {
    'armour-leather': ['LEATHER_HELMET', 'LEATHER_CHESTPLATE', 'LEATHER_LEGGINGS', 'LEATHER_BOOTS'],
    'armour-iron': ['IRON_HELMET', 'IRON_CHESTPLATE', 'IRON_LEGGINGS', 'IRON_BOOTS'],
    'armour-diamond': ['DIAMOND_HELMET', 'DIAMOND_CHESTPLATE', 'DIAMOND_LEGGINGS', 'DIAMOND_BOOTS'],
  },

  affordable(offer) { return Inventory.count(offer.cost[0]) >= offer.cost[1]; },

  buy(offer, game) {
    if (!this.affordable(offer)) return false;
    Inventory.take(offer.cost[0], offer.cost[1]);
    if (typeof offer.give === 'string') {
      for (const name of this.ARMOUR_SETS[offer.give]) {
        const id = I[name];
        Inventory.add(id, 1);
        Equipment.equip(id);
      }
    } else {
      const [id, n] = offer.give;
      Inventory.add(id, n);
      game.hotbarStow(id);
    }
    Sound.place();
    return true;
  },

  giveLabel(offer) {
    if (typeof offer.give === 'string') {
      const first = I[this.ARMOUR_SETS[offer.give][0]];
      return { icon: first, text: offer.give.split('-')[1].replace(/^./, c => c.toUpperCase()) + ' armour' };
    }
    return { icon: offer.give[0], text: thingName(offer.give[0]) + (offer.give[1] > 1 ? ' ×' + offer.give[1] : '') };
  },

  // ---- scoreboard ------------------------------------------------------
  refreshBoard() {
    const el = document.getElementById('arenaboard');
    if (!el) return;
    if (!this.active) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const rows = this.teams.map(t => {
      const state = t.out ? 'out' : t.bedAlive ? 'bed' : t.alive + ' left';
      return '<div class="bwrow' + (t === this.you ? ' you' : '') + (t.out ? ' gone' : '') + '">' +
        '<i style="background:' + t.css + '"></i>' +
        '<span class="bwname">' + t.name + (t === this.you ? ' (you)' : '') + '</span>' +
        '<span class="bwstate">' + (t.out ? '✖' : t.bedAlive ? '✔ bed' : state) + '</span></div>';
    }).join('');
    const clock = this.clock < this.v.prep
      ? 'Raiders set off in ' + Math.ceil(this.v.prep - this.clock) + 's'
      : Math.floor(this.clock / 60) + ':' + String(Math.floor(this.clock % 60)).padStart(2, '0');
    el.innerHTML = '<h4>' + this.v.label + '</h4>' + rows + '<div class="bwclock">' + clock + '</div>';
  },
};

// The menu sees two modes; underneath, both are this one game with its dials set
// differently. Only the frame's single BedWars.update drives it, so these are
// deliberately thin.
function bwMode(variant) {
  return {
    start(game) { BedWars.start(game, variant); },
    stop() { BedWars.stop(); },
    spawnPoint() { return BedWars.spawnPoint(); },
    ensureArena(world) { BedWars.ensureArena(world); },
    kit(game) { BedWars.kit(game); },
    refreshBoard() { BedWars.refreshBoard(); },
  };
}

// Four team-coloured players, built on the same boxy humanoid the villagers use.
function defineBots() {
  const PARTS = [
    { id: 'legL', size: [4, 12, 4], pos: [-2, 6, 0], pivot: [0, 6, 0], anim: 'legA', share: 'leg' },
    { id: 'legR', size: [4, 12, 4], pos: [2, 6, 0], pivot: [0, 6, 0], anim: 'legB', share: 'leg' },
    { id: 'body', size: [8, 12, 4], pos: [0, 18, 0] },
    { id: 'armL', size: [4, 12, 4], pos: [-6, 18, 0], pivot: [0, 5, 0], anim: 'legB', share: 'arm' },
    { id: 'armR', size: [4, 12, 4], pos: [6, 18, 0], pivot: [0, 5, 0], anim: 'legA', share: 'arm' },
    { id: 'head', size: [8, 8, 8], pos: [0, 28, 0], anim: 'head' },
  ];
  const RGB = { red: [212, 70, 62], blue: [72, 116, 220], green: [76, 176, 88], yellow: [226, 190, 60] };
  defineMob('bw_shop', {
    label: 'Shopkeeper', width: 0.6, height: 1.95, speed: 0, eyeH: 1.7,
    hp: 400, bot: true, loot: () => [], spawn: {}, groupMax: 1, call: 'hmm',
    parts: PARTS.map(p => Object.assign({}, p)),
    paint(t2, P) {
      const robe = [86, 132, 108], skin = [206, 168, 140];
      t2.fill(robe);
      t2.part(P.body, robe);
      t2.part(P.legL, [58, 46, 38]);
      t2.part(P.armL, robe);
      for (const k of ['nx', 'px', 'nz', 'pz']) {
        const r = P.armL.rects[k];
        t2.band(r, r[3] - 3, 3, skin, 4);
      }
      t2.part(P.head, skin);
      t2.face(P.head.rects.py, [64, 48, 36]);
      const f = P.head.rects.nz;
      t2.band(f, 0, 2, [64, 48, 36], 4);
      t2.eyes(f, 2, [46, 52, 96], { y: 3 });
      t2.rect(f, [168, 130, 104], 4, 2, 6, 4, 1);
    },
  });
  for (const t of BW_TEAMS) {
    const kit = RGB[t.key];
    defineMob('bot_' + t.key, {
      label: t.name + ' player', width: 0.6, height: 1.85, speed: 3.4, eyeH: 1.62,
      hp: 20, damage: 3, bot: true, team: t.key,
      loot: () => [], spawn: {}, groupMax: 1, call: 'hmm',
      parts: PARTS.map(p => Object.assign({}, p)),
      paint(t2, P) {
        const skin = [206, 168, 140], dark = kit.map(v => Math.round(v * 0.7));
        t2.fill(kit);
        t2.part(P.body, kit);
        t2.part(P.legL, dark);
        t2.part(P.armL, kit);
        for (const k of ['nx', 'px', 'nz', 'pz']) {
          const r = P.armL.rects[k];
          t2.band(r, r[3] - 3, 3, skin, 4);                    // bare hands below the sleeve
        }
        t2.part(P.head, skin);
        t2.face(P.head.rects.py, [70, 52, 40]);                // hair
        const f = P.head.rects.nz;
        t2.band(f, 0, 2, [70, 52, 40], 4);
        t2.eyes(f, 2, [46, 52, 96], { y: 3 });
        t2.rect(f, [168, 130, 104], 4, 2, 6, 4, 1);            // mouth
      },
    });
  }
}
