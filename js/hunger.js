// Hunger Games — one island, chests worth dying for, and no way back.
// Every tribute starts on a pedestal around the cornucopia. When the countdown
// ends the others go for the middle, and from then on the ring of safe ground
// closes in until one of you is left standing.

const HG_Y = 66;              // roughly where the ground sits
const HG_R = 52;              // how far the island reaches
const HG_RING = 12;           // the pedestals stand this far out
const HG_TRIBUTES = 8;        // you and seven others
const HG_COUNTDOWN = 10;      // seconds on the pedestal before it begins
const HG_CLOSE_AT = 150;      // seconds of open play before the ring starts closing
const HG_CLOSE_RATE = 0.9;    // blocks per second it draws in
const HG_MIN_RING = 12;      // the last stand is the cornucopia and a little air

const HG_NAMES = ['Ash', 'Bram', 'Cato', 'Delly', 'Finch', 'Gale', 'Hazel', 'Juniper',
                  'Kestrel', 'Lark', 'Marlow', 'Nell', 'Orin', 'Rue', 'Sable', 'Thorn'];

const Hunger = {
  active: false,
  phase: 'idle',              // idle | countdown | open | over
  clock: 0,
  radius: HG_R,
  bots: [],
  chestSpots: [],
  pedestals: [],
  you: 0,                     // which pedestal is yours
  alive: 0,

  // ---- the island ------------------------------------------------------
  surfaceAt(world, wx, wz) {
    const d = Math.hypot(wx, wz);
    if (d > HG_R) return null;
    const n = world.nStone.nfbm2(wx * 0.021, wz * 0.021, 3);
    const flat = d < HG_RING + 5 ? 0 : Math.min(1, (d - HG_RING - 5) / 12);   // level ground in the middle
    return Math.round(HG_Y + n * 3.5 * flat);
  },

  // Everything the map needs, worked out once so generation and the bots agree.
  layOut(seed) {
    const rnd = mulberry32(seed | 0);
    this.chestSpots = [];
    for (let i = 0; i < 8; i++) {                      // the cornucopia hoard
      const a = i / 8 * Math.PI * 2;
      this.chestSpots.push({ x: Math.round(Math.cos(a) * 4), z: Math.round(Math.sin(a) * 4), tier: 'middle', gone: false });
    }
    for (let i = 0; i < 28; i++) {                     // and what is scattered out in the trees
      const a = rnd() * Math.PI * 2;
      const r = HG_RING + 6 + rnd() * (HG_R - HG_RING - 14);
      this.chestSpots.push({ x: Math.round(Math.cos(a) * r), z: Math.round(Math.sin(a) * r), tier: 'outer', gone: false });
    }
    this.pedestals = [];
    for (let i = 0; i < HG_TRIBUTES; i++) {
      const a = i / HG_TRIBUTES * Math.PI * 2;
      this.pedestals.push([Math.round(Math.cos(a) * HG_RING), Math.round(Math.sin(a) * HG_RING)]);
    }
  },

  nearPedestal(wx, wz) {
    for (const [px, pz] of this.pedestals) if (Math.abs(px - wx) <= 1 && Math.abs(pz - wz) <= 1) return true;
    return false;
  },
  chestAtSpot(wx, wz) {
    for (const s of this.chestSpots) if (s.x === wx && s.z === wz) return s;
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
      const top = this.surfaceAt(world, wx, wz);
      if (top === null) continue;
      const d = Math.hypot(wx, wz);
      const thick = 6 + 14 * Math.sqrt(Math.max(0, 1 - d / HG_R));    // tapers to nothing at the rim
      const bottom = Math.round(top - thick);
      for (let y = bottom; y <= top; y++) {
        let id = B.STONE;
        if (y === top) id = B.GRASS;
        else if (y > top - 4) id = B.DIRT;
        else if (hash3(wx, y, wz, world.seed + 3) < 0.02) id = B.COAL_ORE;
        else if (hash3(wx, y, wz, world.seed + 4) < 0.008) id = B.IRON_ORE;
        put(lx, y, lz, id);
      }
      // the cornucopia: a stone floor with a lip around it
      if (d <= 7) put(lx, top, lz, d > 6 ? B.STONE_BRICKS : B.POLISHED_ANDESITE);
    }

    // pedestals, one per tribute
    for (const [px, pz] of this.pedestals) {
      const lx = px - bx, lz = pz - bz;
      if (lx < 0 || lz < 0 || lx >= CX || lz >= CZ) continue;
      const top = this.surfaceAt(world, px, pz);
      if (top === null) continue;
      put(lx, top, lz, B.IRON_BLOCK);
    }

    // chests, standing on the surface
    for (const spot of this.chestSpots) {
      const lx = spot.x - bx, lz = spot.z - bz;
      if (lx < 0 || lz < 0 || lx >= CX || lz >= CZ) continue;
      const top = this.surfaceAt(world, spot.x, spot.z);
      if (top === null) continue;
      put(lx, top + 1, lz, B.CHEST);
    }

    // a scattering of trees, well clear of the middle
    for (let lz = -3; lz < CZ + 3; lz++) for (let lx = -3; lx < CX + 3; lx++) {
      const wx = bx + lx, wz = bz + lz;
      const d = Math.hypot(wx, wz);
      if (d < HG_RING + 6 || d > HG_R - 4) continue;
      if (this.chestAtSpot(wx, wz) || this.nearPedestal(wx, wz)) continue;
      const r = hash3(wx, 7, wz, world.seed + 99);
      if (r > 0.035) continue;
      let best = true;                                  // thin them out so it reads as woodland
      for (let dz = -2; dz <= 2 && best; dz++) for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dz) continue;
        if (hash3(wx + dx, 7, wz + dz, world.seed + 99) < r) { best = false; break; }
      }
      if (!best) continue;
      const top = this.surfaceAt(world, wx, wz);
      if (top === null) continue;
      const roll = hash3(wx, 3, wz, world.seed + 12);
      world.placeTree(c, wx, top + 1, wz, roll, roll < 0.25 ? 'birch' : roll < 0.4 ? 'spruce' : 'oak');
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

  // ---- loot ------------------------------------------------------------
  LOOT: {
    middle: [
      [() => I.IRON_SWORD, 1, 1], [() => I.DIAMOND_SWORD, 1, 1], [() => I.IRON_CHESTPLATE, 1, 1],
      [() => I.IRON_HELMET, 1, 1], [() => I.IRON_LEGGINGS, 1, 1], [() => I.COOKED_BEEF, 2, 4],
      [() => I.ENDER_PEARL, 1, 1], [() => I.IRON_PICKAXE, 1, 1], [() => I.IRON_AXE, 1, 1],
      [() => B.PLANKS, 8, 16], [() => I.GOLD_INGOT, 1, 3],
    ],
    outer: [
      [() => I.WOOD_SWORD, 1, 1], [() => I.STONE_SWORD, 1, 1], [() => I.LEATHER_HELMET, 1, 1],
      [() => I.LEATHER_CHESTPLATE, 1, 1], [() => I.LEATHER_BOOTS, 1, 1], [() => I.PORKCHOP, 1, 2],
      [() => I.COOKED_CHICKEN, 1, 2], [() => B.PLANKS, 4, 10], [() => I.STICK, 2, 5],
      [() => I.FLINT, 1, 2], [() => B.COBBLESTONE, 4, 12], [() => I.WOODEN_AXE, 1, 1],
      [() => I.STONE_PICKAXE, 1, 1],
    ],
  },

  fillChests(world) {
    for (const spot of this.chestSpots) {
      const top = this.surfaceAt(world, spot.x, spot.z);
      if (top === null) continue;
      const rnd = mulberry32((hash3(spot.x, 5, spot.z, world.seed) * 4294967296) | 0);
      const table = this.LOOT[spot.tier];
      const picks = spot.tier === 'middle' ? 3 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 2);
      const stacks = [];
      for (let i = 0; i < picks; i++) {
        const [id, min, max] = table[Math.floor(rnd() * table.length)];
        stacks.push([id(), min + Math.floor(rnd() * (max - min + 1))]);
      }
      spot.y = top + 1;
      world.chests.set(spot.x + ',' + (top + 1) + ',' + spot.z, stacks);
    }
  },

  // ---- the match -------------------------------------------------------
  start(game) {
    const world = game.worlds.hunger;
    this.layOut(world.seed + 77);
    this.active = true;
    this.phase = 'countdown';
    this.clock = 0;
    this.radius = HG_R;
    this.bots.length = 0;
    this.you = Math.floor(Math.random() * HG_TRIBUTES);
    this.alive = HG_TRIBUTES;

    world.edits.clear();
    world.chests.clear();
    for (const c of world.chunks.values()) {
      if (c.mesh) { game.renderer.freeMesh(c.mesh.solid); game.renderer.freeMesh(c.mesh.fluid); }
    }
    world.chunks.clear();
    this.fillChests(world);
    this.ensureArena(world);

    const names = HG_NAMES.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < HG_TRIBUTES; i++) {
      if (i === this.you) continue;
      const [px, pz] = this.pedestals[i];
      const top = this.surfaceAt(world, px, pz);
      const mob = new Mob('tribute_' + (i % 6), px + 0.5, top + 1, pz + 0.5, 0);
      mob.hgName = names[i % names.length];
      mob.hgGear = 0;
      mob.hgAggro = 6 + Math.random() * 9;              // how readily it picks a fight
      mob.hgSpeed = mob.def.speed * (0.85 + Math.random() * 0.4);
      mob.hgGreed = Math.random();                      // how much it wants the cornucopia
      mob.hgWander = null;
      mob.attackCd = 0;
      mob.yaw = Math.atan2(-px, pz);                    // facing the middle, as you do
      this.bots.push(mob);
      Animals.list.push(mob);
    }
    this.announce('The tributes take their places…');
  },

  // You arrive with nothing. Everything you fight with comes out of a chest.
  kit(game) {
    Inventory.counts.clear();
    Equipment.load({ head: 0, chest: 0, legs: 0, feet: 0 });
    game.hotbar = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    game.slot = 0;
  },

  ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  },

  stop() {
    this.active = false;
    this.phase = 'idle';
    this.bots.length = 0;
    document.getElementById('arenaboard').classList.add('hidden');
    document.getElementById('arenaend').classList.add('hidden');
  },

  spawnPoint(world) {
    const [px, pz] = this.pedestals[this.you];
    return [px + 0.5, this.surfaceAt(world, px, pz) + 1, pz + 0.5];
  },

  ensureArena(world) {
    const n = Math.ceil(HG_R / CX) + 1;
    for (let cx = -n; cx <= n; cx++) for (let cz = -n; cz <= n; cz++) {
      if (!world.getChunk(cx, cz)) world.generateChunk(cx, cz);
    }
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

  // ---- per-frame -------------------------------------------------------
  update(dt, game) {
    if (!this.active || this.phase === 'over') return;
    const p = game.player;
    this.clock += dt;

    if (this.phase === 'countdown') {
      const spot = this.spawnPoint(game.world);
      p.pos[0] = spot[0]; p.pos[2] = spot[2];            // held on the pedestal
      p.vel[0] = p.vel[2] = 0;
      if (this.clock >= HG_COUNTDOWN) {
        this.phase = 'open';
        this.clock = 0;
        this.announce('Go!');
        Sound.burst({ dur: 0.5, freq: 900, gain: 0.5, sweep: 0.4 });
      } else {
        const left = Math.ceil(HG_COUNTDOWN - this.clock);
        if (left !== this._lastCount) { this._lastCount = left; Sound.burst({ dur: 0.1, freq: 700, gain: 0.3, sweep: 1 }); }
      }
      this.refreshBoard();
      return;
    }

    // the ring closes in, and standing outside it costs you
    if (this.clock > HG_CLOSE_AT) {
      this.radius = Math.max(HG_MIN_RING, this.radius - HG_CLOSE_RATE * dt);
      if (!this._closing) { this._closing = true; this.announce('The ring is closing — get to the middle'); }
    }
    const pd = Math.hypot(p.pos[0], p.pos[2]);
    if (pd > this.radius) {
      this.burn = (this.burn || 0) + dt;
      if (this.burn > 1) {
        this.burn = 0;
        p.invuln = 0;
        p.damage(3, 'the closing ring');
        Game.toast('Outside the ring — get to the middle');
      }
    } else this.burn = 0;

    if (p.pos[1] < HG_Y - 40) { p.invuln = 0; p.damage(40, 'the fall'); }

    // anyone who died, however they died, is out for good
    for (let i = this.bots.length - 1; i >= 0; i--) {
      if (this.bots[i].dead) this.tributeDied(this.bots[i], 'the arena');
    }

    this.sweepTimer = (this.sweepTimer || 0) - dt;
    if (this.sweepTimer <= 0) {
      this.sweepTimer = 1;
      for (const spot of this.chestSpots) {
        if (spot.gone || spot.y === undefined) continue;
        if (game.world.getBlock(spot.x, spot.y, spot.z) !== B.CHEST) spot.gone = true;
      }
    }
    this.boardTimer = (this.boardTimer || 0) - dt;
    if (this.boardTimer <= 0) { this.boardTimer = 0.4; this.refreshBoard(); }
    this.arenaTimer = (this.arenaTimer || 0) - dt;
    if (this.arenaTimer <= 0) { this.arenaTimer = 1; this.ensureArena(game.world); }
  },

  tributeDied(mob, by) {
    if (mob.hgGone) return;
    mob.hgGone = true;
    mob.dead = true;
    const i = this.bots.indexOf(mob);
    if (i >= 0) this.bots.splice(i, 1);
    this.alive = Math.max(0, this.alive - 1);
    this.announce(mob.hgName + ' was killed by ' + by + ' — ' + this.alive + ' left');
    this.refreshBoard();
    if (this.bots.length === 0) this.finish('You are the last one standing', true);
  },

  playerDied(game) {
    this.alive = Math.max(0, this.alive - 1);
    this.refreshBoard();
    this.finish('You placed ' + this.ordinal(this.bots.length + 1) + ' of ' + HG_TRIBUTES, false);
    return true;
  },

  finish(text, won) {
    if (this.phase === 'over') return;
    this.phase = 'over';
    document.getElementById('arenaend-title').textContent = won ? 'Victory' : 'You died';
    document.getElementById('arenaend-sub').textContent = text;
    document.getElementById('arenaend').classList.remove('hidden');
    document.exitPointerLock();
    Game.paused = true;
    Sound.burst({ dur: 0.9, freq: won ? 620 : 200, gain: 0.5, sweep: won ? 0.4 : 3 });
  },

  // ---- the other tributes ----------------------------------------------
  // They break for the middle, loot what they can carry, and go looking for
  // whoever is nearest once they feel armed enough.
  nearestFoe(mob, player) {
    let foe = null;
    if (!player.dead) {
      const pd = Math.hypot(player.pos[0] - mob.x, player.pos[2] - mob.z);
      if (Math.abs(player.pos[1] - mob.y) < 5) foe = { d: pd, x: player.pos[0], z: player.pos[2], isPlayer: true };
    }
    for (const other of this.bots) {
      if (other === mob || other.dead) continue;
      if (Math.abs(other.y - mob.y) > 5) continue;
      const od = Math.hypot(other.x - mob.x, other.z - mob.z);
      if (!foe || od < foe.d) foe = { d: od, x: other.x, z: other.z, mob: other };
    }
    return foe;
  },

  // Arm yourself, then go looking for trouble — nobody picks a fight over a
  // cornucopia chest until they have something to fight with.
  botGoal(mob, player) {
    const d = Math.hypot(mob.x, mob.z);
    if (d > this.radius - 1) return { kind: 'move', at: [0, 0] };       // the ring drives everyone in

    const foe = this.nearestFoe(mob, player);
    if (mob.hp < 9 && foe && foe.d < 14) {                // badly hurt: get out of it
      const ax = mob.x - foe.x, az = mob.z - foe.z, l = Math.hypot(ax, az) || 1;
      return { kind: 'flee', at: [mob.x + ax / l * 14, mob.z + az / l * 14] };
    }
    if (foe && foe.d < 2.8) return { kind: 'foe', at: [foe.x, foe.z], foe };   // cornered: swing back

    const chest = this.nearestChest(mob);
    if (chest && mob.hgGear < 2) return { kind: 'chest', at: [chest.x, chest.z], chest };

    const bold = mob.hgAggro + mob.hgGear * 3;
    if (foe && foe.d < bold) return { kind: 'foe', at: [foe.x, foe.z], foe };
    if (chest && mob.hgGear < 4) return { kind: 'chest', at: [chest.x, chest.z], chest };
    if (foe) return { kind: 'foe', at: [foe.x, foe.z], foe };

    if (!mob.hgWander || Math.hypot(mob.hgWander[0] - mob.x, mob.hgWander[1] - mob.z) < 3) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * Math.max(6, this.radius - 6);
      mob.hgWander = [Math.cos(a) * r, Math.sin(a) * r];
    }
    return { kind: 'move', at: mob.hgWander };
  },

  nearestChest(mob) {
    let best = null, bd = 1e9;
    const shy = this.clock < 25 && mob.hgGreed < 0.5;      // not everyone fancies the bloodbath
    for (const s of this.chestSpots) {
      if (s.gone) continue;
      if (shy && s.tier === 'middle') continue;
      if (Math.hypot(s.x, s.z) > this.radius - 2) continue;
      const d = Math.hypot(s.x - mob.x, s.z - mob.z);
      const want = s.tier === 'middle' ? d * (1.2 - mob.hgGreed) : d;      // some of them fancy the middle
      if (want < bd) { bd = want; best = s; }
    }
    return best;
  },

  botUpdate(mob, dt, world, player) {
    if (!this.active || this.phase === 'over') { mob.walking = false; return; }
    mob.attackCd = Math.max(0, (mob.attackCd || 0) - dt);

    if (this.phase === 'countdown') {                    // still on the pedestal
      mob.walking = false; mob.vx = mob.vz = 0;
      mob.vy -= GRAVITY_MOB * dt;
      mob.moveAxis(world, 1, mob.vy * dt);
      const l0 = world.getLight(Math.floor(mob.x), Math.floor(mob.y + 1), Math.floor(mob.z));
      mob.sky = (l0 >> 4) / 15; mob.blk = (l0 & 15) / 15;
      return;
    }

    const goal = this.botGoal(mob, player);
    const dx = goal.at[0] - mob.x, dz = goal.at[1] - mob.z;
    const dist = Math.hypot(dx, dz);
    mob.targetYaw = Math.atan2(dx, -dz);
    let turn = mob.targetYaw - mob.yaw;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    mob.yaw += clamp(turn, -5 * dt, 5 * dt);
    mob.walking = dist > 1.2;

    const speed = (mob.hgSpeed || mob.def.speed) * (mob.walking ? 1 : 0);
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
    if (mob.y < HG_Y - 40) { this.tributeDied(mob, 'the fall'); return; }

    // out in the open ground beyond the ring, they burn like you do
    if (Math.hypot(mob.x, mob.z) > this.radius) {
      mob.hgBurn = (mob.hgBurn || 0) + dt;
      if (mob.hgBurn > 1) {
        mob.hgBurn = 0; mob.hp -= 3; mob.hurt = 0.3;
        if (mob.hp <= 0) { this.tributeDied(mob, 'the closing ring'); return; }
      }
    } else mob.hgBurn = 0;

    if (mob.hp < (mob.hgLastHp === undefined ? mob.hp : mob.hgLastHp)) mob.hgHurtAt = this.clock;
    mob.hgLastHp = mob.hp;
    if (mob.hp < 20 && this.clock - (mob.hgHurtAt || -99) > 6) {
      mob.hgRegen = (mob.hgRegen || 0) + dt;
      if (mob.hgRegen > 2) { mob.hgRegen = 0; mob.hp = Math.min(20, mob.hp + 1); }
    }

    const underfoot = this.nearestChest(mob);
    if (underfoot && Math.hypot(underfoot.x - mob.x, underfoot.z - mob.z) < 1.9) this.loot(mob, underfoot, world);
    else if (goal.kind === 'chest' && dist < 1.9) this.loot(mob, goal.chest, world);
    if (goal.kind === 'foe' && dist < 2.3 && mob.attackCd <= 0) {
      mob.attackCd = 0.7 + Math.random() * 0.6;
      mob.swing = 1;
      this.strike(mob, goal.foe, player);
    }

    const hspeed = Math.hypot(mob.vx, mob.vz);
    mob.walkPhase += dt * hspeed * 5.5;
    mob.swing = Math.min(1, hspeed / (mob.hgSpeed || mob.def.speed));
    mob.airborne = !mob.onGround;
    if (mob.hurt > 0) mob.hurt -= dt;
    const l = world.getLight(Math.floor(mob.x), Math.floor(mob.y + 1), Math.floor(mob.z));
    mob.sky = (l >> 4) / 15; mob.blk = (l & 15) / 15;
  },

  loot(mob, spot, world) {
    if (spot.gone) return;
    spot.gone = true;
    mob.hgGear = Math.min(5, mob.hgGear + (spot.tier === 'middle' ? 2 : 1));
    if (spot.y !== undefined) {
      world.setBlock(spot.x, spot.y, spot.z, 0);
      world.chests.delete(spot.x + ',' + spot.y + ',' + spot.z);
    }
    Sound.burst({ dur: 0.18, freq: 620, gain: 0.2, sweep: 0.5 });
  },

  strike(mob, foe, player) {
    const dmg = 2 + mob.hgGear;
    Sound.burst({ dur: 0.09, freq: 460, gain: 0.28, sweep: 0.5 });
    if (foe.isPlayer) {
      if (player.damage(dmg, mob.hgName)) {
        const dx = player.pos[0] - mob.x, dz = player.pos[2] - mob.z;
        const push = 3.2 / Math.max(0.7, Math.hypot(dx, dz));
        player.vel[0] += dx * push; player.vel[2] += dz * push; player.vel[1] = 3.2;
      }
    } else if (foe.mob) {
      const other = foe.mob;
      other.hp -= dmg;
      other.hurt = 0.3;
      const dx = other.x - mob.x, dz = other.z - mob.z;
      const push = 4 / Math.max(0.7, Math.hypot(dx, dz));
      other.vx += dx * push; other.vz += dz * push; other.vy = 3;
      if (other.hp <= 0) this.tributeDied(other, mob.hgName);
    }
  },

  // ---- scoreboard ------------------------------------------------------
  refreshBoard() {
    const el = document.getElementById('arenaboard');
    if (!el) return;
    if (!this.active) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    let head, rows;
    if (this.phase === 'countdown') {
      head = 'Starting in ' + Math.ceil(HG_COUNTDOWN - this.clock) + 's';
      rows = '<div class="bwrow"><span class="bwname">Stay on your pedestal</span></div>';
    } else {
      head = Math.floor(this.clock / 60) + ':' + String(Math.floor(this.clock % 60)).padStart(2, '0');
      rows = '<div class="bwrow you"><span class="bwname">Tributes left</span><span class="bwstate">' + this.alive + ' / ' + HG_TRIBUTES + '</span></div>' +
             '<div class="bwrow"><span class="bwname">Ring</span><span class="bwstate">' + Math.round(this.radius) + ' blocks</span></div>' +
             '<div class="bwrow"><span class="bwname">Chests left</span><span class="bwstate">' + this.chestSpots.filter(s => !s.gone).length + '</span></div>';
    }
    el.innerHTML = '<h4>Hunger Games</h4>' + rows + '<div class="bwclock">' + head + '</div>';
  },
};

// Seven other tributes, each in their own colours.
function defineTributes() {
  const PARTS = [
    { id: 'legL', size: [4, 12, 4], pos: [-2, 6, 0], pivot: [0, 6, 0], anim: 'legA', share: 'leg' },
    { id: 'legR', size: [4, 12, 4], pos: [2, 6, 0], pivot: [0, 6, 0], anim: 'legB', share: 'leg' },
    { id: 'body', size: [8, 12, 4], pos: [0, 18, 0] },
    { id: 'armL', size: [4, 12, 4], pos: [-6, 18, 0], pivot: [0, 5, 0], anim: 'legB', share: 'arm' },
    { id: 'armR', size: [4, 12, 4], pos: [6, 18, 0], pivot: [0, 5, 0], anim: 'legA', share: 'arm' },
    { id: 'head', size: [8, 8, 8], pos: [0, 28, 0], anim: 'head' },
  ];
  const KITS = [
    [[168, 84, 62], [92, 70, 58]], [[86, 122, 168], [58, 62, 84]], [[110, 150, 92], [64, 78, 56]],
    [[172, 154, 96], [96, 84, 58]], [[142, 96, 158], [78, 60, 88]], [[186, 186, 190], [96, 96, 102]],
  ];
  KITS.forEach(([shirt, trousers], i) => {
    defineMob('tribute_' + i, {
      label: 'Tribute', width: 0.6, height: 1.85, speed: 3.6, eyeH: 1.62,
      hp: 20, damage: 3, bot: true, arena: 'hunger',
      loot: () => [], spawn: {}, groupMax: 1, call: 'hmm',
      parts: PARTS.map(p => Object.assign({}, p)),
      paint(t, P) {
        const skin = [206, 168, 140], hair = [70, 52, 40];
        t.fill(shirt);
        t.part(P.body, shirt);
        t.part(P.legL, trousers);
        t.part(P.armL, shirt);
        for (const k of ['nx', 'px', 'nz', 'pz']) {
          const r = P.armL.rects[k];
          t.band(r, r[3] - 3, 3, skin, 4);
        }
        t.part(P.head, skin);
        t.face(P.head.rects.py, hair);
        const f = P.head.rects.nz;
        t.band(f, 0, 2, hair, 4);
        t.eyes(f, 2, [46, 52, 96], { y: 3 });
        t.rect(f, [168, 130, 104], 4, 2, 6, 4, 1);
      },
    });
  });
}
