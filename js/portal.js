// Nether portals: an obsidian frame, lit with flint and steel.
const Portal = {
  MAX_CELLS: 64,

  // Try to light the empty space at (x,y,z). A portal stands in a flat plane, so
  // we flood the air in that plane and check obsidian encloses every edge of it.
  light(world, x, y, z) {
    return this.open(world, x, y, z, B.OBSIDIAN, B.PORTAL, null);
  },

  // The same frame trick, but built from glowstone and filled with water: the
  // water shivers and you are looking at somewhere a very long time ago.
  lightTime(world, x, y, z) {
    return this.open(world, x, y, z, B.GLOWSTONE, B.TIME_PORTAL, 'water');
  },

  // Darkstone for a frame and lava poured in: the rift that opens looks forward
  // instead of back, to a city that did not end well.
  lightFuture(world, x, y, z) {
    return this.open(world, x, y, z, B.DARKSTONE, B.FUTURE_PORTAL, 'lava');
  },

  // Reinforced deepslate, and a Heart of the Deep pressed into the gap.
  lightDeep(world, x, y, z) {
    return this.open(world, x, y, z, B.REINFORCED_DEEPSLATE, B.DEEP_PORTAL, null);
  },

  // Prismarine for a frame and a trident thrown through the gap.
  lightSea(world, x, y, z) {
    return this.open(world, x, y, z, B.PRISMARINE, B.SEA_PORTAL, null);
  },

  open(world, x, y, z, frame, fill, fluid) {
    for (const axis of [0, 2]) {
      const cells = this.region(world, x, y, z, axis, frame, fill, fluid);
      if (!cells) continue;
      for (const c of cells) world.setBlock(c[0], c[1], c[2], fill);
      return true;
    }
    return false;
  },

  region(world, x, y, z, axis, frame = B.OBSIDIAN, fill = B.PORTAL, fluid = null) {
    const hollow = id => id === 0 || id === fill || (fluid && BLOCKS[id].fluid === fluid);
    const here = world.getBlock(x, y, z);
    if (!hollow(here)) return null;
    const across = axis === 0 ? [1, 0, 0] : [0, 0, 1];
    const stack = [[x, y, z]];
    const seen = new Map();
    let minA = Infinity, maxA = -Infinity, minY = Infinity, maxY = -Infinity;
    while (stack.length) {
      const [cx, cy, cz] = stack.pop();
      const key = cx + ',' + cy + ',' + cz;
      if (seen.has(key)) continue;
      const id = world.getBlock(cx, cy, cz);
      if (id === frame) continue;                            // the frame: fine, stop here
      if (!hollow(id)) return null;                          // anything else leaks
      seen.set(key, [cx, cy, cz]);
      if (seen.size > this.MAX_CELLS) return null;
      const a = axis === 0 ? cx : cz;
      if (a < minA) minA = a; if (a > maxA) maxA = a;
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      stack.push([cx + across[0], cy, cz + across[2]]);
      stack.push([cx - across[0], cy, cz - across[2]]);
      stack.push([cx, cy + 1, cz]);
      stack.push([cx, cy - 1, cz]);
    }
    const width = maxA - minA + 1, height = maxY - minY + 1;
    if (width < 2 || width > 6 || height < 3 || height > 6) return null;
    if (seen.size !== width * height) return null;           // must be a solid rectangle
    return [...seen.values()];
  },

  // Break the frame (or a portal block) and the whole sheet winks out.
  extinguish(world, x, y, z) {
    const stack = [];
    for (let d = 0; d < 6; d++) stack.push([x + DIRS[d][0], y + DIRS[d][1], z + DIRS[d][2]]);
    const seen = new Set();
    while (stack.length) {
      const [cx, cy, cz] = stack.pop();
      const key = cx + ',' + cy + ',' + cz;
      if (seen.has(key)) continue;
      seen.add(key);
      const here2 = world.getBlock(cx, cy, cz);
      if (here2 !== B.PORTAL && here2 !== B.TIME_PORTAL && here2 !== B.FUTURE_PORTAL
          && here2 !== B.DEEP_PORTAL && here2 !== B.SEA_PORTAL && here2 !== B.HACK_PORTAL) continue;
      world.setBlock(cx, cy, cz, 0);
      for (let d = 0; d < 6; d++) stack.push([cx + DIRS[d][0], cy + DIRS[d][1], cz + DIRS[d][2]]);
    }
  },

  // Where you come out: Minecraft's eight-to-one scale between the worlds.
  linkedPosition(pos, toNether) {
    const f = toNether ? 1 / 8 : 8;
    return [Math.floor(pos[0] * f), Math.floor(pos[2] * f)];
  },

  // Look for a portal near the arrival point, and build one if there is none.
  findOrBuild(world, tx, tz, frame = B.OBSIDIAN, fill = B.PORTAL) {
    for (let dx = -12; dx <= 12; dx++) {
      for (let dz = -12; dz <= 12; dz++) {
        const x = tx + dx, z = tz + dz;
        if (!world.getChunk(x >> 4, z >> 4)) continue;
        for (let y = CY - 6; y > 2; y--) {
          if (world.getBlock(x, y, z) === fill) return [x + 0.5, y, z + 0.5];
        }
      }
    }
    return this.build(world, tx, tz, frame, fill);
  },

  // A fresh portal on the first solid ground with headroom.
  build(world, tx, tz, frame = B.OBSIDIAN, fill = B.PORTAL) {
    let base = -1;
    const ceiling = world.dimension === 'nether' ? 118 : (world.dimension === 'deep' ? DEEP_ROOF - 2 : CY - 8);
    for (let y = ceiling; y > 3; y--) {
      if (!isSolid(world.getBlock(tx, y, tz))) continue;
      let clear = true;
      for (let k = 1; k <= 5 && clear; k++) if (isSolid(world.getBlock(tx, y + k, tz))) clear = false;
      if (clear) { base = y + 1; break; }
    }
    if (base < 0) base = world.dimension === 'nether' ? 40 : (world.dimension === 'deep' ? DEEP_FLOOR + 1 : SEA_LEVEL + 4);

    // a small obsidian pad, then the frame around a 2 x 3 doorway
    for (let dx = -2; dx <= 3; dx++) for (let dz = -2; dz <= 2; dz++) {
      world.setBlock(tx + dx, base - 1, tz + dz, frame);
      for (let k = 0; k < 5; k++) world.setBlock(tx + dx, base + k, tz + dz, 0);
    }
    for (let dx = -1; dx <= 2; dx++) {
      world.setBlock(tx + dx, base - 1, tz, frame);
      world.setBlock(tx + dx, base + 3, tz, frame);
    }
    for (let k = 0; k <= 3; k++) {
      world.setBlock(tx - 1, base + k, tz, frame);
      world.setBlock(tx + 2, base + k, tz, frame);
    }
    for (let dx = 0; dx <= 1; dx++) for (let k = 0; k <= 2; k++) {
      world.setBlock(tx + dx, base + k, tz, fill);
    }
    return [tx + 0.5, base, tz + 0.5];
  },
};
