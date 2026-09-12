// Poseidon's realm. A whole world with the sea over the top of it: reefs, kelp,
// the ruins of a city that was never on land, and, somewhere out there, the
// palace of the man himself with his guard swimming laps around it.
//
// The way in is a nether portal built out of prismarine, with a trident thrown
// through the gap instead of a flint struck in it.

const SEA_FLOOR = 30;           // the sea bed
const SEA_TOP = 96;             // and the surface, a long way over your head
const SEA_CITY = 96;            // the palace grid, in blocks

const Sea = {
  // The one mercy of the place: down here you do not drown.
  breathes(dimension) { return dimension === 'sea'; },

  // The shape of the bed: dunes, with reefs standing up off them.
  floorAt(world, wx, wz) {
    const n = world.nBase.nfbm2(wx * 0.006 + 300, wz * 0.006 - 200, 4);
    const d = world.nDetail.nfbm2(wx * 0.03, wz * 0.03, 3);
    return Math.round(SEA_FLOOR + n * 14 + d * 3);
  },

  reefAt(world, wx, wz) {
    return world.nStone.nfbm2(wx * 0.018 - 700, wz * 0.018 + 900, 3);
  },

  // Where the palace stands, and how far its walls reach.
  palace(world, cx, cz) {
    if (hash3(cx, 31, cz, world.seed + 701) > 0.30) return null;
    return {
      x: cx * SEA_CITY + 20 + Math.floor(hash3(cx, 32, cz, world.seed + 702) * (SEA_CITY - 40)),
      z: cz * SEA_CITY + 20 + Math.floor(hash3(cx, 33, cz, world.seed + 703) * (SEA_CITY - 40)),
      r: 14,
    };
  },

  generateChunk(world, cx, cz) {
    const c = new Chunk(cx, cz);
    world.chunks.set(world.key(cx, cz), c);
    const bx = cx * CX, bz = cz * CZ;
    const blocks = c.blocks;
    const put = (lx, y, lz, id) => { if (y >= 0 && y < CY) blocks[colOffset(lx, lz) + y * CX * CZ] = id; };

    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      const wx = bx + lx, wz = bz + lz;
      let h = this.floorAt(world, wx, wz);
      const reef = this.reefAt(world, wx, wz);
      if (reef > 0.30) h += Math.round((reef - 0.30) * 26);        // reefs rise off the bed

      put(lx, 0, lz, B.BEDROCK);
      for (let y = 1; y <= h; y++) {
        let id = B.STONE;
        if (y > h - 3) id = reef > 0.34 ? B.PRISMARINE : B.SAND;
        if (y === h && reef > 0.34) {
          const pick = hash3(wx, 41, wz, world.seed + 704);
          id = pick < 0.34 ? B.CORAL_PINK : pick < 0.67 ? B.CORAL_BLUE : B.CORAL_GOLD;
        }
        if (y < 6) id = B.DEEPSLATE;
        put(lx, y, lz, id);
      }
      for (let y = h + 1; y <= SEA_TOP; y++) put(lx, y, lz, B.WATER);   // and the sea on top of it

      // what grows on the bed
      const g = hash3(wx, 42, wz, world.seed + 705);
      if (g < 0.055 && reef <= 0.34) {
        const kelp = 2 + ((hash3(wx, 43, wz, world.seed + 706) * 7) | 0);
        for (let k = 1; k <= kelp; k++) put(lx, h + k, lz, B.SEAGRASS);
      } else if (g < 0.060) {
        put(lx, h + 1, lz, B.SEA_LANTERN);                          // a lantern on the sand
      } else if (g < 0.064 && reef > 0.36) {
        put(lx, h + 1, lz, hash3(wx, 44, wz, world.seed) < 0.5 ? B.CORAL_PINK : B.CORAL_GOLD);
      }
    }

    this.buildPalaces(world, c, bx, bz);
    this.buildRuins(world, c, bx, bz);

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

  // Bits of a drowned city, scattered over the sand: a floor, some columns, and
  // whatever was left in the strongroom.
  buildRuins(world, c, bx, bz) {
    for (let ox = -16; ox <= 16; ox += 16) for (let oz = -16; oz <= 16; oz += 16) {
      const rx = Math.floor((bx + ox) / 32) * 32 + 16, rz = Math.floor((bz + oz) / 32) * 32 + 16;
      if (hash3(rx, 45, rz, world.seed + 707) > 0.10) continue;
      if (Math.abs(rx - (bx + 8)) > 22 || Math.abs(rz - (bz + 8)) > 22) continue;
      const base = this.floorAt(world, rx, rz) + 1;
      const R = 5;
      for (let x = rx - R; x <= rx + R; x++) for (let z = rz - R; z <= rz + R; z++) {
        world.put(c, x, base - 1, z, B.MARBLE);
        const broke = hash3(x, 46, z, world.seed + 708);
        if (broke < 0.14) world.put(c, x, base, z, B.PRISMARINE_BRICKS);
      }
      for (const [dx, dz] of [[-R, -R], [R, -R], [-R, R], [R, R], [0, -R], [0, R]]) {
        const h = 2 + ((hash3(rx + dx, 47, rz + dz, world.seed + 709) * 5) | 0);
        for (let k = 0; k < h; k++) world.put(c, rx + dx, base + k, rz + dz, B.MARBLE);
        if (h > 4) world.put(c, rx + dx, base + h, rz + dz, B.SEA_LANTERN);
      }
      world.put(c, rx, base, rz, B.CHEST);
    }
  },

  // The palace: a walled square of dark prismarine, lanterns down every wall, a
  // throne room in the middle, and the god of the place standing in it.
  buildPalaces(world, c, bx, bz) {
    const gcx = Math.floor(bx / SEA_CITY), gcz = Math.floor(bz / SEA_CITY);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const p = this.palace(world, gcx + dx, gcz + dz);
      if (!p) continue;
      if (Math.abs(p.x - (bx + 8)) > p.r + 20 || Math.abs(p.z - (bz + 8)) > p.r + 20) continue;
      const base = this.floorAt(world, p.x, p.z) + 1, R = p.r;

      for (let x = p.x - R; x <= p.x + R; x++) for (let z = p.z - R; z <= p.z + R; z++) {
        const d = Math.max(Math.abs(x - p.x), Math.abs(z - p.z));
        if (d > R) continue;
        for (let k = 0; k <= 14; k++) world.put(c, x, base + k, z, 0);      // clear the water out
        world.put(c, x, base - 1, z, (x + z) % 2 ? B.DARK_PRISMARINE : B.PRISMARINE_BRICKS);
        if (d === R) {
          const gate = z === p.z + R && Math.abs(x - p.x) <= 1;
          for (let k = 0; k <= 12; k++) {
            if (gate && k <= 3) continue;
            world.put(c, x, base + k, z, k === 6 ? B.SEA_LANTERN : B.DARK_PRISMARINE);
          }
        } else if (d === R - 1 && (x + z) % 7 === 0) {
          for (let k = 0; k <= 8; k++) world.put(c, x, base + k, z, B.MARBLE);   // colonnade
          world.put(c, x, base + 9, z, B.SEA_LANTERN);
        } else {
          world.put(c, x, base + 14, z, B.PRISMARINE);                      // the roof
        }
      }
      // the throne, and what is kept behind it
      for (let k = 0; k <= 4; k++) world.put(c, p.x, base + k, p.z - 4, B.MARBLE);
      world.put(c, p.x, base + 1, p.z - 3, B.MARBLE);
      world.put(c, p.x, base + 5, p.z - 4, B.SEA_LANTERN);
      world.put(c, p.x - 3, base, p.z - 3, B.CHEST);
      world.put(c, p.x + 3, base, p.z - 3, B.CHEST);
      for (const [ox, oz] of [[-5, 2], [5, 2], [-5, -2], [5, -2]]) {
        world.put(c, p.x + ox, base, p.z + oz, B.CORAL_GOLD);
      }
    }
  },

  // Where you come out: a pocket of air cut into the sea bed, so arriving is not
  // the same as arriving in the middle of a wall.
  arrival(world, tx, tz) {
    const h = this.floorAt(world, tx, tz);
    return [tx + 0.5, h + 2, tz + 0.5];
  },

  // Poseidon himself, put in the palace nearest wherever you turned up.
  seedGuard(world, game, px, pz) {
    const gcx = Math.floor(px / SEA_CITY), gcz = Math.floor(pz / SEA_CITY);
    let best = null, bestD = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const p = this.palace(world, gcx + dx, gcz + dz);
      if (!p) continue;
      const d = Math.hypot(p.x - px, p.z - pz);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (!best || bestD > 200) return null;
    const base = this.floorAt(world, best.x, best.z) + 1;
    if (!world.getChunk(best.x >> 4, best.z >> 4)) return best;      // it will be seeded on arrival
    Animals.list.push(new Mob('poseidon', best.x + 0.5, base, best.z - 1.5, 0));
    for (const [ox, oz] of [[-6, 4], [6, 4], [0, 7]]) {
      Animals.list.push(new Mob('guardian', best.x + ox + 0.5, base + 3, best.z + oz + 0.5, 0));
    }
    return best;
  },

  loot(rnd, palace) {
    const table = palace
      ? [[I.TRIDENT, 1, 1], [I.HEART_OF_THE_SEA, 1, 1], [I.PRISMARINE_SHARD, 3, 8],
         [B.SEA_LANTERN, 2, 5], [I.DIAMOND, 1, 3], [I.GOLD_INGOT, 3, 8]]
      : [[I.PRISMARINE_SHARD, 2, 6], [B.PRISMARINE, 4, 10], [B.SEA_LANTERN, 1, 3],
         [I.IRON_INGOT, 2, 5], [I.GOLD_INGOT, 1, 4], [I.COOKED_CHICKEN, 1, 3], [I.EMERALD, 1, 2]];
    const stacks = [];
    const picks = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < picks; i++) {
      const [id, min, max] = table[Math.floor(rnd() * table.length)];
      stacks.push([id, min + Math.floor(rnd() * (max - min + 1))]);
    }
    return stacks;
  },
};
