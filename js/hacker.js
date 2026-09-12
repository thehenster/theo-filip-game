// The Hacker Dimension. Somebody has got at the server, and this is where the
// damage went: a black grid with the wreckage of a stolen overworld hanging over
// it, half of it rendered as the magenta-and-black of a texture that is not
// there. It is not a place anybody built. It is a place somebody broke.
//
// The way in is nine blocks laid flat: circuit board at the corners, diamond
// along the edges, and a neon panel dropped in the middle to run it.

const HK_FLOOR = 48;            // the grid plane
const HK_CELL = 40;             // how far apart the floating wrecks sit

const Hacker = {
  // ---- the portal --------------------------------------------------------
  // C D C
  // D N D      laid flat on the ground, any way round
  // C D C
  PATTERN: [
    [-1, -1, 'C'], [0, -1, 'D'], [1, -1, 'C'],
    [-1, 0, 'D'], [0, 0, 'N'], [1, 0, 'D'],
    [-1, 1, 'C'], [0, 1, 'D'], [1, 1, 'C'],
  ],

  want(letter) {
    return letter === 'C' ? B.CIRCUIT : letter === 'D' ? B.DIAMOND_BLOCK : B.NEON;
  },

  matches(world, cx, y, cz) {
    for (const [dx, dz, letter] of this.PATTERN) {
      if (world.getBlock(cx + dx, y, cz + dz) !== this.want(letter)) return false;
    }
    return true;
  },

  // Called after any block is placed: if that block completed a square, the
  // middle of it stops being a neon panel and becomes a hole.
  tryOpen(game, x, y, z) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!this.matches(game.world, x + dx, y, z + dz)) continue;
      game.world.setBlock(x + dx, y, z + dz, B.HACK_PORTAL);
      Sound.burst({ dur: 1.0, freq: 1600, gain: 0.4, sweep: 5 });
      game.toast('The square lights up — something on the other side accepts the connection');
      return true;
    }
    return false;
  },

  // ---- generation --------------------------------------------------------
  // Which wreck, if any, hangs over this cell of the grid, and what it is made of.
  wreck(world, cx, cz) {
    const r = hash3(cx, 51, cz, world.seed + 601);
    if (r > 0.72) return null;                            // most of the grid is empty sky
    return {
      x: cx * HK_CELL + 8 + hash3(cx, 52, cz, world.seed + 602) * (HK_CELL - 16),
      z: cz * HK_CELL + 8 + hash3(cx, 53, cz, world.seed + 603) * (HK_CELL - 16),
      y: HK_FLOOR + 8 + Math.floor(hash3(cx, 54, cz, world.seed + 604) * 34),
      r: 5 + hash3(cx, 55, cz, world.seed + 605) * 9,
      rot: hash3(cx, 56, cz, world.seed + 606),           // how much of it came through corrupted
      kind: r < 0.16 ? 'vault' : r < 0.34 ? 'tower' : 'slab',
    };
  },

  // The blocks a wreck is made of: bits of a world that no longer exists, with
  // holes in it where the copy failed.
  fillFor(world, wx, wy, wz, w) {
    const r = hash3(wx, wy, wz, world.seed + 607);
    if (r < w.rot * 0.5) return B.CORRUPT;
    const pick = hash3(wx, wy + 17, wz, world.seed + 608);
    if (pick < 0.30) return B.STONE;
    if (pick < 0.46) return B.DIRT;
    if (pick < 0.58) return B.PLANKS;
    if (pick < 0.66) return B.LOG;
    if (pick < 0.74) return B.COBBLESTONE;
    if (pick < 0.80) return B.SAND;
    if (pick < 0.86) return B.GLASS;
    if (pick < 0.92) return B.LEAVES;
    return B.CORRUPT;
  },

  generateChunk(world, cx, cz) {
    const c = new Chunk(cx, cz);
    world.chunks.set(world.key(cx, cz), c);
    const bx = cx * CX, bz = cz * CZ;
    const blocks = c.blocks;
    const put = (lx, y, lz, id) => { if (y >= 0 && y < CY) blocks[colOffset(lx, lz) + y * CX * CZ] = id; };

    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      const wx = bx + lx, wz = bz + lz;
      // The grid: a solid plane with square holes punched through it where the
      // floor did not load.
      const hole = hash3(Math.floor(wx / 8), 9, Math.floor(wz / 8), world.seed + 609) < 0.14;
      if (!hole) {
        put(lx, HK_FLOOR - 1, lz, B.VOIDSTONE);
        put(lx, HK_FLOOR, lz, B.VOIDSTONE);
      }

      // Columns of falling code, standing in the empty air over the grid.
      if (hash3(wx, 10, wz, world.seed + 610) < 0.004) {
        const h = 8 + ((hash3(wx, 11, wz, world.seed + 611) * 26) | 0);
        for (let k = 1; k <= h; k++) put(lx, HK_FLOOR + k, lz, B.DATASTREAM);
      }

      // Server towers, standing on the grid where it is solid.
      if (!hole && hash3(wx, 12, wz, world.seed + 612) < 0.0016) {
        const h = 4 + ((hash3(wx, 13, wz, world.seed + 613) * 9) | 0);
        for (let k = 1; k <= h; k++) put(lx, HK_FLOOR + k, lz, B.SERVER_RACK);
        put(lx, HK_FLOOR + h + 1, lz, B.NEON);
      }
    }

    this.buildWrecks(world, c, bx, bz, put);

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

  buildWrecks(world, c, bx, bz, put) {
    const gcx = Math.floor(bx / HK_CELL), gcz = Math.floor(bz / HK_CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const w = this.wreck(world, gcx + dx, gcz + dz);
      if (!w) continue;
      if (Math.abs(w.x - (bx + 8)) > HK_CELL || Math.abs(w.z - (bz + 8)) > HK_CELL) continue;
      const px = Math.round(w.x), pz = Math.round(w.z), R = Math.round(w.r);

      for (let x = px - R; x <= px + R; x++) {
        const lx = x - bx;
        if (lx < 0 || lx >= CX) continue;
        for (let z = pz - R; z <= pz + R; z++) {
          const lz = z - bz;
          if (lz < 0 || lz >= CZ) continue;
          const d = Math.hypot(x - px, z - pz);
          if (d > R) continue;

          if (w.kind === 'tower') {
            // a stack of the same slice over and over, the way a copy loop goes wrong
            if (d > R * 0.6) continue;
            for (let k = 0; k < 26; k++) {
              if (k % 5 === 4) continue;                 // the gaps between the repeats
              put(lx, w.y + k, lz, this.fillFor(world, x, w.y + (k % 5), z, w));
            }
            continue;
          }

          // a slab of ground, thicker in the middle, sheared where it tore off
          const thick = Math.max(1, Math.round(4 * (1 - d / R)) + 1);
          const shear = Math.round(hash3(Math.floor(x / 5), 14, Math.floor(z / 5), world.seed + 614) * 5) - 2;
          for (let k = 0; k < thick; k++) {
            put(lx, w.y + shear - k, lz, this.fillFor(world, x, w.y - k, z, w));
          }
          if (hash3(x, 15, z, world.seed + 615) < 0.02) put(lx, w.y + shear + 1, lz, B.DATASTREAM);
        }
      }

      if (w.kind === 'vault') this.buildVault(world, c, w, put, bx, bz);
    }
  },

  // The one thing down here worth crossing the empty air for: whatever the
  // hacker was keeping, in a box of server racks with the door left open.
  buildVault(world, c, w, put, bx, bz) {
    const px = Math.round(w.x), pz = Math.round(w.z), base = w.y + 1, R = 4;
    for (let x = px - R; x <= px + R; x++) {
      const lx = x - bx;
      if (lx < 0 || lx >= CX) continue;
      for (let z = pz - R; z <= pz + R; z++) {
        const lz = z - bz;
        if (lz < 0 || lz >= CZ) continue;
        const edge = Math.abs(x - px) === R || Math.abs(z - pz) === R;
        for (let k = 0; k <= 5; k++) put(lx, base + k, lz, 0);
        put(lx, base - 1, lz, B.VOIDSTONE);
        if (edge) {
          const door = z === pz + R && Math.abs(x - px) <= 1;
          for (let k = 0; k <= 4; k++) if (!(door && k <= 2)) put(lx, base + k, lz, B.SERVER_RACK);
        } else {
          put(lx, base + 5, lz, B.VOIDSTONE);
        }
      }
    }
    const lx = px - bx, lz = pz - bz;
    if (lx >= 0 && lx < CX && lz >= 0 && lz < CZ) {
      put(lx, base, lz, B.CHEST);
      put(lx, base + 4, lz, B.NEON);
    }
    for (const [ox, oz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      const ax = px + ox - bx, az = pz + oz - bz;
      if (ax >= 0 && ax < CX && az >= 0 && az < CZ) put(ax, base, az, B.CORRUPT);
    }
  },

  // Somewhere with floor under it, so arriving is not the same as dying.
  arrival(world, tx, tz) {
    for (let r = 0; r <= 60; r += 2) {
      for (let a = 0; a < 12; a++) {
        const x = Math.round(tx + Math.cos(a / 12 * Math.PI * 2) * r);
        const z = Math.round(tz + Math.sin(a / 12 * Math.PI * 2) * r);
        if (!world.getChunk(x >> 4, z >> 4)) world.generateChunk(x >> 4, z >> 4);
        if (world.getBlock(x, HK_FLOOR, z) !== B.VOIDSTONE) continue;
        let clear = true;
        for (let k = 1; k <= 4; k++) if (isSolid(world.getBlock(x, HK_FLOOR + k, z))) clear = false;
        if (clear) return [x + 0.5, HK_FLOOR + 1, z + 0.5];
      }
    }
    return [tx + 0.5, HK_FLOOR + 1, tz + 0.5];
  },

  loot(rnd) {
    const table = [
      [I.DATA_SHARD, 2, 6], [I.HACKED_CLIENT, 1, 1], [I.DIAMOND, 1, 3], [B.CORRUPT, 2, 6],
      [B.SERVER_RACK, 2, 5], [I.IRON_INGOT, 3, 7], [B.NEON, 1, 3], [I.GOLD_INGOT, 2, 6],
      [I.COOKED_BEEF, 2, 4],
    ];
    const stacks = [];
    const picks = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < picks; i++) {
      const [id, min, max] = table[Math.floor(rnd() * table.length)];
      stacks.push([id, min + Math.floor(rnd() * (max - min + 1))]);
    }
    return stacks;
  },
};
