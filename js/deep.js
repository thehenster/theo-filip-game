// The Deep Lands. Below the deepslate there is a second world, and the way into
// it is a reinforced frame in an Ancient City, opened with a Heart of the Deep.
//
// Two rules govern the whole place. The first is that nothing down there can
// see: the stalkers on the ceiling and the Warden that follows them are blind.
// The second is that sound carries, so the only thing you have any control over
// is how much noise you make. Sneak and it is a quiet, luminous cave system.
// Run, dig, and shoot, and it comes for you.

const DEEP_FLOOR = 34;          // the floor of every chamber and every tunnel
const DEEP_ROOF = 96;           // solid deepslate above that
const DEEP_CELL = 64;           // chamber spacing
const DEEP_MAZE = 8;            // the lattice the tunnels run on

const DEEP_CITY_SPACING = 26;   // in chunks, in the overworld

const Deep = {
  // ---- how much noise you are making ------------------------------------
  // One number, 0 to 100, that everything down there reads off. It climbs while
  // you move loudly and falls the moment you stop.
  noise: 0,
  tier: 0,                      // 0 quiet, 1 stirring, 2 hunted, 3 the Warden
  shownTier: -1,
  crystalTier: -1,
  wardenOut: false,
  ping: 0,                      // brief flash on the meter when something hears you
  heard: null,                  // the last place that made a noise, which is what they hunt

  TIERS: [
    { at: 0, name: 'Quiet', hint: 'Nothing has noticed you' },
    { at: 26, name: 'Stirring', hint: 'Something on the ceiling is moving' },
    { at: 62, name: 'Hunted', hint: 'They know where you are' },
    { at: 92, name: 'The Warden', hint: 'Run' },
  ],

  reset() {
    this.noise = 0; this.tier = 0; this.shownTier = -1;
    this.crystalTier = -1; this.wardenOut = false; this.ping = 0; this.heard = null;
  },

  // Anything loud calls this. Sneaking makes no sound at all, which is the whole
  // point of sneaking.
  stir(game, amount) {
    if (!game || game.dimension !== 'deep') return;
    this.noise = Math.min(100, this.noise + amount);
    this.ping = 1;
    this.heard = game.player.pos.slice();
  },

  tierFor(n) {
    let t = 0;
    for (let i = 0; i < this.TIERS.length; i++) if (n >= this.TIERS[i].at) t = i;
    return t;
  },

  update(dt, game) {
    const meter = document.getElementById('noise');
    if (game.dimension !== 'deep') {
      if (meter) meter.classList.add('hidden');
      if (this.noise) this.reset();
      return;
    }
    const p = game.player;

    // moving about is what makes the noise; standing still and crouching do not
    const speed = Math.hypot(p.vel[0], p.vel[2]);
    if (!game.input.sneak && !p.flying) {
      if (speed > 5.4) { this.noise += 15 * dt; this.heard = p.pos.slice(); }
      else if (speed > 1.2) { this.noise += 5 * dt; this.heard = p.pos.slice(); }
    }
    this.noise = Math.max(0, Math.min(100, this.noise - 7 * dt));
    this.ping = Math.max(0, this.ping - dt * 2);

    const tier = this.tierFor(this.noise);
    if (tier !== this.tier) {
      const rising = tier > this.tier;
      this.tier = tier;
      if (rising && tier !== this.shownTier) {
        this.shownTier = tier;
        game.toast(this.TIERS[tier].name + ' — ' + this.TIERS[tier].hint);
        Sound.burst({ dur: 0.5, freq: 90 + tier * 40, gain: 0.3, sweep: 3 });
      }
      if (!rising) this.shownTier = -1;
    }
    if (tier !== this.crystalTier) { this.crystalTier = tier; this.tintCrystals(game); }

    // At the top of the scale the thing that has been listening comes up.
    if (tier >= 3 && !this.wardenOut) {
      this.wardenOut = true;
      this.summonWarden(game);
    }
    if (tier < 2 && this.wardenOut) {
      // go quiet for long enough and it loses you and sinks back into the floor
      const w = Animals.list.find(m => m.type === 'warden');
      if (w) { w.dead = true; game.toast('It sinks back into the sculk'); }
      this.wardenOut = false;
    }

    if (meter) {
      meter.classList.remove('hidden');
      const fill = document.getElementById('noisefill');
      const label = document.getElementById('noiselabel');
      if (fill) {
        fill.style.width = this.noise.toFixed(1) + '%';
        fill.className = 'tier' + tier;
      }
      if (label) label.textContent = this.TIERS[tier].name;
      meter.style.opacity = (0.55 + this.ping * 0.45).toFixed(2);
    }
  },

  // The crystals answer the room rather than the light: calm blue while nothing
  // is moving, then amber, then red.
  tintCrystals(game) {
    const want = [B.CRYSTAL_CALM, B.CRYSTAL_ROUSED, B.CRYSTAL_ALARMED][Math.min(2, this.tier)];
    const w = game.world, p = game.player;
    const px = Math.floor(p.pos[0]), py = Math.floor(p.pos[1]), pz = Math.floor(p.pos[2]);
    const R = 18;
    for (let y = Math.max(1, py - R); y <= Math.min(CY - 1, py + R); y++) {
      for (let z = pz - R; z <= pz + R; z++) {
        for (let x = px - R; x <= px + R; x++) {
          const id = w.getBlock(x, y, z);
          if (id === want || BLOCKS[id].crystal === undefined) continue;
          w.setBlock(x, y, z, want, false);       // not an edit: the room did it, not you
        }
      }
    }
  },

  summonWarden(game) {
    const p = game.player, w = game.world;
    for (let attempt = 0; attempt < 40; attempt++) {
      const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 10;
      const x = Math.floor(p.pos[0] + Math.cos(a) * r), z = Math.floor(p.pos[2] + Math.sin(a) * r);
      if (!w.getChunk(x >> 4, z >> 4)) continue;
      for (let y = DEEP_FLOOR + 1; y < DEEP_FLOOR + 26; y++) {
        if (!isSolid(w.getBlock(x, y - 1, z))) continue;
        let clear = true;
        for (let k = 0; k < 3; k++) if (isSolid(w.getBlock(x, y + k, z))) clear = false;
        if (!clear) continue;
        Animals.list.push(new Mob('warden', x + 0.5, y, z + 0.5, Math.random() * 6.28));
        game.toast('Something very large has heard you');
        Sound.burst({ dur: 1.6, freq: 60, gain: 0.5, sweep: 6 });
        return;
      }
    }
  },

  // ---- the dimension itself ---------------------------------------------
  // A chamber centre for the 64-block cell a column falls in, jittered so the
  // grid never reads as a grid.
  chamber(world, cx, cz) {
    const jx = hash3(cx, 61, cz, world.seed + 91);
    const jz = hash3(cx, 62, cz, world.seed + 92);
    return {
      x: cx * DEEP_CELL + 12 + jx * (DEEP_CELL - 24),
      z: cz * DEEP_CELL + 12 + jz * (DEEP_CELL - 24),
      r: 15 + hash3(cx, 63, cz, world.seed + 93) * 9,
      h: 13 + hash3(cx, 64, cz, world.seed + 94) * 11,
    };
  },

  // How much clear air stands above the floor at this column: the tallest of the
  // domed chamber it may be inside and the tunnel that may run through it.
  headroom(world, wx, wz) {
    let open = 0;
    const cx = Math.floor(wx / DEEP_CELL), cz = Math.floor(wz / DEEP_CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const ch = this.chamber(world, cx + dx, cz + dz);
      const d = Math.hypot(wx - ch.x, wz - ch.z);
      if (d >= ch.r) continue;
      const dome = Math.round(ch.h * Math.sqrt(Math.max(0, 1 - (d / ch.r) * (d / ch.r))));
      if (dome > open) open = dome;
    }

    // Between the chambers: two-wide, three-high corridors on a lattice, with
    // roughly half of the possible links missing, which is what makes it a maze.
    const gx = Math.floor(wx / DEEP_MAZE), gz = Math.floor(wz / DEEP_MAZE);
    const lx = ((wx % DEEP_MAZE) + DEEP_MAZE) % DEEP_MAZE;
    const lz = ((wz % DEEP_MAZE) + DEEP_MAZE) % DEEP_MAZE;
    const alongX = lz >= 3 && lz <= 4 && hash3(gx, 71, gz, world.seed + 95) < 0.62;
    const alongZ = lx >= 3 && lx <= 4 && hash3(gx, 72, gz, world.seed + 96) < 0.62;
    if ((alongX || alongZ) && open < 3) open = 3;
    return open;
  },

  generateChunk(world, cx, cz) {
    const c = new Chunk(cx, cz);
    world.chunks.set(world.key(cx, cz), c);
    const bx = cx * CX, bz = cz * CZ;
    const blocks = c.blocks;
    const put = (lx, y, lz, id) => { if (y >= 0 && y < CY) blocks[colOffset(lx, lz) + y * CX * CZ] = id; };

    const heads = new Int16Array(CX * CZ);
    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      const wx = bx + lx, wz = bz + lz;
      const open = this.headroom(world, wx, wz);
      heads[lz * CX + lx] = open;

      for (let y = 0; y <= DEEP_ROOF; y++) {
        if (y === 0) { put(lx, y, lz, B.BEDROCK); continue; }
        if (y > DEEP_FLOOR && y <= DEEP_FLOOR + open) continue;     // the air you walk in
        put(lx, y, lz, B.DEEPSLATE);
      }
      if (!open) continue;

      // the floor: sculk grows in wide patches, bare deepslate between them
      const g = hash3(wx, 81, wz, world.seed + 97);
      const sculky = world.nDetail.nfbm2(wx * 0.045 + 900, wz * 0.045 - 400, 2) > 0.02;
      if (sculky) put(lx, DEEP_FLOOR, lz, g < 0.06 ? B.SCULK_BLOOM : B.SCULK);
      else put(lx, DEEP_FLOOR, lz, B.DEEPSLATE);

      // echo ore lies in the last few blocks under the floor
      for (let y = DEEP_FLOOR - 5; y < DEEP_FLOOR; y++) {
        if (hash3(wx, y, wz, world.seed + 98) < 0.018) put(lx, y, lz, B.ECHO_ORE);
      }
    }

    // Standing things: crystals off the ceiling, blossoms hanging under it, and
    // the listeners on the floor.
    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      const open = heads[lz * CX + lx];
      if (!open) continue;
      const wx = bx + lx, wz = bz + lz;
      const ceil = DEEP_FLOOR + open;
      const r = hash3(wx, 82, wz, world.seed + 99);

      if (open >= 6 && r < 0.014) {                                  // a crystal cluster, growing down
        const n = 1 + ((hash3(wx, 83, wz, world.seed) * 4) | 0);
        for (let k = 0; k < n; k++) put(lx, ceil - k, lz, B.CRYSTAL_CALM);
      } else if (open >= 5 && r < 0.026) {
        put(lx, ceil, lz, B.SPORE_BLOSSOM);                          // a lamp of a flower
      } else if (r < 0.034) {
        put(lx, DEEP_FLOOR + 1, lz, B.SCULK_SENSOR);                 // one of the listeners
      } else if (open >= 8 && r < 0.040) {                           // a stalagmite of crystal
        const n = 1 + ((hash3(wx, 84, wz, world.seed + 1) * 3) | 0);
        for (let k = 1; k <= n; k++) put(lx, DEEP_FLOOR + k, lz, B.CRYSTAL_CALM);
      }
    }

    this.buildRuins(world, c, bx, bz, heads);

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

  // Whoever built the Ancient Cities built down here too, and stopped.
  buildRuins(world, c, bx, bz, heads) {
    const gcx = Math.floor(bx / DEEP_CELL), gcz = Math.floor(bz / DEEP_CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const ch = this.chamber(world, gcx + dx, gcz + dz);
      if (ch.r < 19) continue;                                       // only the big rooms
      const px = Math.round(ch.x), pz = Math.round(ch.z);
      if (Math.abs(px - (bx + 8)) > 24 || Math.abs(pz - (bz + 8)) > 24) continue;
      const R = 5;
      for (let x = px - R; x <= px + R; x++) for (let z = pz - R; z <= pz + R; z++) {
        const edge = Math.abs(x - px) === R || Math.abs(z - pz) === R;
        world.put(c, x, DEEP_FLOOR, z, B.DEEPSLATE_BRICKS);
        if (edge && (x + z) % 3 === 0) world.put(c, x, DEEP_FLOOR + 1, z, B.DEEPSLATE_BRICKS);
      }
      for (const [ox, oz] of [[-R, -R], [R, -R], [-R, R], [R, R]]) {   // four broken pillars
        const h = 3 + ((hash3(px + ox, 5, pz + oz, world.seed + 100) * 5) | 0);
        for (let k = 1; k <= h; k++) world.put(c, px + ox, DEEP_FLOOR + k, pz + oz, B.DEEPSLATE_BRICKS);
        world.put(c, px + ox, DEEP_FLOOR + h + 1, pz + oz, B.SCULK_BLOOM);
      }
      world.put(c, px, DEEP_FLOOR + 1, pz, B.CHEST);
    }
  },

  // Somewhere with a proper roof over it, and the same amount of room on every
  // side, so a portal built here is not half buried in a tunnel wall.
  arrivalNear(world, tx, tz) {
    let best = null, bestScore = -1;
    for (let r = 0; r <= 90; r += 2) {
      for (let a = 0; a < 16; a++) {
        const x = Math.round(tx + Math.cos(a / 16 * Math.PI * 2) * r);
        const z = Math.round(tz + Math.sin(a / 16 * Math.PI * 2) * r);
        const here = this.headroom(world, x, z);
        if (here < 7) continue;
        let low = here;
        for (const [ox, oz] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-3, -3], [3, 3]]) {
          low = Math.min(low, this.headroom(world, x + ox, z + oz));
        }
        if (low > bestScore) { bestScore = low; best = [x + 0.5, DEEP_FLOOR + 1, z + 0.5]; }
        if (low >= 7) return best;                    // good enough, stop looking
      }
    }
    return best || [tx + 0.5, DEEP_FLOOR + 1, tz + 0.5];
  },

  // What is in the chests down there, and in the Ancient Cities above.
  loot(rnd, city) {
    const table = city
      ? [[I.ECHO_SHARD, 1, 3], [I.IRON_INGOT, 2, 5], [I.DIAMOND, 1, 2], [I.GOLD_INGOT, 1, 4],
         [I.COOKED_BEEF, 2, 4], [I.IRON_CHESTPLATE, 1, 1], [B.DEEPSLATE_BRICKS, 4, 12]]
      : [[I.ECHO_SHARD, 2, 5], [I.DIAMOND, 1, 3], [I.IRON_INGOT, 3, 6], [B.CRYSTAL_CALM, 1, 3],
         [I.COOKED_BEEF, 2, 4], [I.GOLD_INGOT, 2, 5], [B.SCULK, 4, 10]];
    const stacks = [];
    const picks = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < picks; i++) {
      const [id, min, max] = table[Math.floor(rnd() * table.length)];
      stacks.push([id, min + Math.floor(rnd() * (max - min + 1))]);
    }
    return stacks;
  },

  // ---- the Ancient City, in the overworld -------------------------------
  cityFor(world, rx, rz) {
    const key = rx * 60013 + rz * 15486;
    if (!world.deepCities) world.deepCities = new Map();
    if (world.deepCities.has(key)) return world.deepCities.get(key);
    let city = null;
    if (hash3(rx, 77, rz, world.seed + 404) < 0.55) {
      const jx = (hash3(rx, 6, rz, world.seed + 405) * (DEEP_CITY_SPACING - 6)) | 0;
      const jz = (hash3(rx, 7, rz, world.seed + 406) * (DEEP_CITY_SPACING - 6)) | 0;
      const x = (rx * DEEP_CITY_SPACING + jx + 3) * CX + 8;
      const z = (rz * DEEP_CITY_SPACING + jz + 3) * CZ + 8;
      city = { x, z, y: 10 + ((hash3(rx, 8, rz, world.seed + 407) * 6) | 0) };
    }
    world.deepCities.set(key, city);
    return city;
  },

  buildCities(world, c) {
    const bx = c.cx * CX, bz = c.cz * CZ;
    const rx = Math.floor((bx + 8) / (DEEP_CITY_SPACING * CX));
    const rz = Math.floor((bz + 8) / (DEEP_CITY_SPACING * CZ));
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const city = this.cityFor(world, rx + dx, rz + dz);
      if (!city) continue;
      if (Math.abs(city.x - (bx + 8)) > 30 || Math.abs(city.z - (bz + 8)) > 30) continue;
      this.buildCity(world, c, city);
    }
  },

  // A sunk plaza of deepslate brick, sculk creeping over it, pillars around the
  // edge, and at the far end a frame of reinforced deepslate with nothing in it.
  buildCity(world, c, city) {
    const R = 13, base = city.y, put = (x, y, z, id) => world.put(c, x, y, z, id);
    for (let x = city.x - R; x <= city.x + R; x++) {
      for (let z = city.z - R; z <= city.z + R; z++) {
        const d = Math.max(Math.abs(x - city.x), Math.abs(z - city.z));
        for (let y = base; y <= base + 9; y++) put(x, y, z, 0);       // hollow it out
        const sculky = hash3(x, 3, z, world.seed + 408) < 0.30;
        put(x, base - 1, z, sculky ? B.SCULK : B.DEEPSLATE_BRICKS);
        if (d === R) for (let y = base; y <= base + 9; y++) put(x, y, z, B.DEEPSLATE_BRICKS);
        if (d < R) put(x, base + 10, z, B.DEEPSLATE_BRICKS);
        if (d < R && hash3(x, 4, z, world.seed + 409) < 0.012) put(x, base, z, B.SCULK_SENSOR);
        if (d < R && hash3(x, 5, z, world.seed + 410) < 0.010) put(x, base + 9, z, B.SCULK_BLOOM);
      }
    }
    // pillars, and a light on top of each
    for (const [ox, oz] of [[-8, -8], [8, -8], [-8, 8], [8, 8], [0, -10], [0, 10]]) {
      for (let y = base; y <= base + 9; y++) put(city.x + ox, y, city.z + oz, B.DEEPSLATE_BRICKS);
      put(city.x + ox, base + 5, city.z + oz, B.SCULK_BLOOM);
    }
    // the frame: two wide, three tall, waiting for a heart
    const fz = city.z - 9;
    for (let dx = -2; dx <= 1; dx++) {
      put(city.x + dx, base - 1, fz, B.REINFORCED_DEEPSLATE);
      put(city.x + dx, base + 3, fz, B.REINFORCED_DEEPSLATE);
    }
    for (let k = -1; k <= 3; k++) {
      put(city.x - 2, base + k, fz, B.REINFORCED_DEEPSLATE);
      put(city.x + 1, base + k, fz, B.REINFORCED_DEEPSLATE);
    }
    for (let dx = -1; dx <= 0; dx++) for (let k = 0; k <= 2; k++) put(city.x + dx, base + k, fz, 0);
    // and the chests, one of which has the heart in it
    put(city.x - 5, base, city.z + 5, B.CHEST);
    put(city.x + 5, base, city.z + 5, B.CHEST);
    put(city.x, base, city.z + 6, B.CHEST);

    // a shaft up towards the caves, so the place is findable at all
    for (let y = base + 10; y < base + 30; y++) {
      put(city.x, y, city.z, 0);
      put(city.x, y, city.z + 1, 0);
      if (y % 3 === 0) put(city.x + 1, y, city.z, B.SCULK_BLOOM);
    }
  },

  // Is this chest one of the three in an Ancient City, and is it the one with
  // the heart? The first chest a player opens in any given city carries it.
  cityHeart(world, x, y, z) {
    const rx = Math.floor(x / (DEEP_CITY_SPACING * CX)), rz = Math.floor(z / (DEEP_CITY_SPACING * CZ));
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const city = this.cityFor(world, rx + dx, rz + dz);
      if (!city) continue;
      if (Math.abs(city.x - x) > 14 || Math.abs(city.z - z) > 14 || Math.abs(city.y - y) > 12) continue;
      if (!world.heartsTaken) world.heartsTaken = new Set();
      const key = city.x + ',' + city.z;
      if (world.heartsTaken.has(key)) return { city, heart: false };
      world.heartsTaken.add(key);
      return { city, heart: true };
    }
    return null;
  },
};
