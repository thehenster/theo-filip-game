// Hallowe'en — the inside of the pumpkin you threw the pearl at. The whole world
// is one enormous hollow gourd: walk to the edge of it and the sky is pumpkin
// flesh, ribbed and curving away, with the carved face glowing back at you from
// the far wall.
const HW_CENTRE = 74;         // the middle of the gourd
const HW_R = 46;              // and how big it is
const HW_SHELL = 3;           // how thick the rind is
const HW_FLOOR = 58;          // the earth that settled inside it

const Halloween = {
  // Two triangular eyes and a jagged grin, cut into the wall you arrive facing.
  faceAt(x, y, z) {
    if (z > -HW_R * 0.5) return false;                  // only carved on the one side
    const ax = Math.abs(x), ey = y - HW_CENTRE - 2;
    if (ey >= 0 && ey <= 12 && ax >= 5 && ax <= 5 + (12 - ey)) return true;      // triangular eyes
    const my = y - HW_CENTRE + 12;
    if (my >= 0 && my <= 6 && ax <= 22 && (ax + my * 3) % 9 < 6) return true;    // a jagged grin
    return false;
  },

  floorTop(wx, wz) { return HW_FLOOR; },

  arrival() { return [0.5, HW_FLOOR + 1, 0.5]; },

  generateChunk(world, cx, cz) {
    const c = new Chunk(cx, cz);
    world.chunks.set(world.key(cx, cz), c);
    const bx = cx * CX, bz = cz * CZ;
    const blocks = c.blocks;
    const put = (lx, y, lz, id) => { if (y >= 0 && y < CY) blocks[colOffset(lx, lz) + y * CX * CZ] = id; };
    const outer = HW_R + HW_SHELL;

    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      const wx = bx + lx, wz = bz + lz;
      const flat = wx * wx + wz * wz;
      if (flat > outer * outer) continue;                        // beyond the gourd there is nothing
      const yLo = Math.max(0, HW_CENTRE - outer), yHi = Math.min(CY - 1, HW_CENTRE + outer);
      for (let y = yLo; y <= yHi; y++) {
        const dy = y - HW_CENTRE;
        const d = Math.sqrt(flat + dy * dy);
        if (d <= HW_R && d > HW_R - HW_SHELL) {
          // The eyes and the grin are cut clean through and lit, so from in here
          // they read as one face the size of the sky rather than a patterned wall.
          put(lx, y, lz, this.faceAt(wx, y, wz) ? B.GLOWSTONE : B.PUMPKIN);
        } else if (d <= HW_R - HW_SHELL && y <= HW_FLOOR) {
          put(lx, y, lz, y === HW_FLOOR ? B.GRASS : B.DIRT);      // the earth that gathered inside
        }
      }
    }

    // dead trees, lanterns, and the pumpkin that takes you home again
    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      const wx = bx + lx, wz = bz + lz;
      if (wx * wx + wz * wz > (HW_R - HW_SHELL - 2) * (HW_R - HW_SHELL - 2)) continue;
      if (blocks[colOffset(lx, lz) + HW_FLOOR * CX * CZ] !== B.GRASS) continue;
      const r = hash3(wx, 31, wz, world.seed + 5);
      if (Math.abs(wx) < 4 && Math.abs(wz) < 4) continue;        // keep the arrival clear
      if (r < 0.010) {                                            // a bare, dead trunk
        const h = 4 + ((hash3(wx, 32, wz, world.seed) * 4) | 0);
        for (let k = 1; k <= h; k++) put(lx, HW_FLOOR + k, lz, B.SPRUCE_LOG);
      } else if (r < 0.016) {
        put(lx, HW_FLOOR + 1, lz, B.PUMPKIN_LIT);                 // a lantern in the grass
      } else if (r < 0.0175) {
        put(lx, HW_FLOOR + 1, lz, B.PUMPKIN);
      }
    }

    // the way back: a red-eyed pumpkin beside where you land
    const home = [2, HW_FLOOR + 1, 0];
    const hx = home[0] - bx, hz = home[2] - bz;
    if (hx >= 0 && hz >= 0 && hx < CX && hz < CZ) put(hx, home[1], hz, B.PUMPKIN_RED);

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
};
