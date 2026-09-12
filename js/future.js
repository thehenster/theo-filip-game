// The future, seen through a rift of lava in a darkstone frame: a grid city of
// steel and glass that nobody swept up after, lit by whatever neon still works,
// and thick with the dead. Nothing here spawns in daylight because there is not
// really any daylight left.
const FT_GROUND = 64;         // street level
const FT_BLOCK = 24;          // one city block, streets included
const FT_ROAD = 5;            // how wide the streets are

const Future = {
  // Which cell of the grid a column belongs to, and where it sits inside it.
  lot(wx, wz) {
    const lx = ((wx % FT_BLOCK) + FT_BLOCK) % FT_BLOCK;
    const lz = ((wz % FT_BLOCK) + FT_BLOCK) % FT_BLOCK;
    return { lx, lz, cx: Math.floor(wx / FT_BLOCK), cz: Math.floor(wz / FT_BLOCK),
             street: lx < FT_ROAD || lz < FT_ROAD };
  },

  // What got built on this block: mostly towers, but here and there somebody put
  // up a house worth the name, and it is still standing after a fashion.
  tower(world, cx, cz) {
    const r = hash3(cx, 41, cz, world.seed);
    const ruin = hash3(cx, 42, cz, world.seed);
    const grand = hash3(cx, 43, cz, world.seed) < 0.09;
    return { h: 7 + Math.floor(r * 26), ruined: ruin < 0.4, ruin, mansion: grand };
  },

  // A mansion: three tall storeys inside a walled plot, rooms off a cross
  // corridor, tall windows, a stepped roof, and things left in the rooms.
  MANSION_H: 6,          // how tall one storey is
  MANSION_FLOORS: 3,

  mansionColumn(world, put, lx, lz, cell, wx, wz) {
    const inset = 2;                                   // a walled garden around it
    const lo = FT_ROAD + inset, hi = FT_BLOCK - 1 - inset;
    const wallTop = FT_GROUND + this.MANSION_H * this.MANSION_FLOORS;

    // the garden wall, with a way in at the front
    if (cell.lx === FT_ROAD || cell.lz === FT_ROAD || cell.lx === FT_BLOCK - 1 || cell.lz === FT_BLOCK - 1) {
      const gate = cell.lz === FT_ROAD && Math.abs(cell.lx - FT_BLOCK / 2) < 2;
      if (!gate) for (let k = 1; k <= 2; k++) put(lx, FT_GROUND + k, lz, B.STONE_BRICKS);
      return;
    }
    if (cell.lx < lo || cell.lx > hi || cell.lz < lo || cell.lz > hi) {
      if (hash3(wx, 21, wz, world.seed + 6) < 0.03) put(lx, FT_GROUND + 1, lz, B.NEON);   // garden lights
      return;
    }

    const edge = cell.lx === lo || cell.lx === hi || cell.lz === lo || cell.lz === hi;
    const corner = (cell.lx === lo || cell.lx === hi) && (cell.lz === lo || cell.lz === hi);
    const midX = Math.abs(cell.lx - Math.round((lo + hi) / 2)) <= 1;
    const partition = cell.lx === Math.round((lo + hi) / 2) || cell.lz === Math.round((lo + hi) / 2);

    for (let f = 0; f < this.MANSION_FLOORS; f++) {
      const base = FT_GROUND + f * this.MANSION_H;
      put(lx, base, lz, B.STONE_BRICKS);                                  // the floor of each storey
      for (let k = 1; k < this.MANSION_H; k++) {
        const y = base + k;
        if (edge) {
          if (f === 0 && cell.lz === lo && midX && k < 4) {               // the front doorway
            if (k <= 2 && cell.lx === Math.round((lo + hi) / 2)) {
              put(lx, y, lz, k === 1 ? B.DOOR_LOWER : (k === 2 ? B.DOOR_UPPER : 0));
            }
            continue;
          }
          const tall = k >= 2 && k <= 4 && !corner && (cell.lx + cell.lz) % 3 !== 0;
          put(lx, y, lz, corner ? B.PLATING : (tall ? B.GLASS : B.STONE_BRICKS));
        } else if (partition && k < this.MANSION_H - 1) {
          const door = Math.abs(cell.lx - Math.round((lo + hi) / 2)) + Math.abs(cell.lz - Math.round((lo + hi) / 2)) > 3;
          if (door && k < 4 && (cell.lx + cell.lz) % 7 === 0) continue;   // doorways between rooms
          put(lx, y, lz, B.PLANKS);                                       // inner walls
        }
      }
      // what got left in the rooms
      if (!edge && !partition) {
        const r = hash3(wx, 22 + f, wz, world.seed + 7);
        if (r < 0.012) put(lx, base + 1, lz, B.CHEST);
        else if (r < 0.02) put(lx, base + 1, lz, B.CIRCUIT);
        else if (r < 0.026) put(lx, base + 1, lz, B.TORCH);
        else if (r < 0.03) put(lx, base + this.MANSION_H - 1, lz, B.NEON);
      }
    }

    // a step up to the front door
    if (cell.lz === lo - 1 && Math.abs(cell.lx - Math.round((lo + hi) / 2)) <= 1) {
      put(lx, FT_GROUND + 1, lz, B.STAIRS_N);
    }

    // a stepped roof over the top
    const shrink = Math.min(cell.lx - lo, hi - cell.lx, cell.lz - lo, hi - cell.lz);
    for (let k = 0; k <= Math.min(4, shrink); k++) put(lx, wallTop + k, lz, B.PLATING);
  },

  generateChunk(world, cx, cz) {
    const c = new Chunk(cx, cz);
    world.chunks.set(world.key(cx, cz), c);
    const bx = cx * CX, bz = cz * CZ;
    const blocks = c.blocks;
    const put = (lx, y, lz, id) => { if (y >= 0 && y < CY) blocks[colOffset(lx, lz) + y * CX * CZ] = id; };

    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      const wx = bx + lx, wz = bz + lz;
      const cell = this.lot(wx, wz);

      // the ground everything stands on
      for (let y = 40; y < FT_GROUND; y++) put(lx, y, lz, y > FT_GROUND - 4 ? B.DEEPSLATE : B.STONE);
      put(lx, FT_GROUND, lz, cell.street ? B.POLISHED_ANDESITE : B.STONE_BRICKS);

      if (cell.street) {
        const r = hash3(wx, 7, wz, world.seed + 2);
        if (r < 0.008) put(lx, FT_GROUND + 1, lz, B.COBBLESTONE);          // rubble in the road
        else if (r < 0.010) {                                              // a street light, mostly still on
          for (let k = 1; k <= 3; k++) put(lx, FT_GROUND + k, lz, B.PLATING);
          put(lx, FT_GROUND + 4, lz, hash3(wx, 8, wz, world.seed) < 0.7 ? B.NEON : B.PLATING);
        }
        continue;
      }

      const t = this.tower(world, cell.cx, cell.cz);
      if (t.mansion) { this.mansionColumn(world, put, lx, lz, cell, wx, wz); continue; }

      // a tower: walls with windows, a floor every four storeys, and holes in it
      const edge = cell.lx === FT_ROAD || cell.lx === FT_BLOCK - 1 || cell.lz === FT_ROAD || cell.lz === FT_BLOCK - 1;
      const top = FT_GROUND + t.h;
      for (let y = FT_GROUND + 1; y <= top; y++) {
        const storey = (y - FT_GROUND) % 4;
        const gone = t.ruined && y > FT_GROUND + 3 && hash3(wx, y, wz, world.seed + 9) < 0.30 * t.ruin * 2;
        if (gone) continue;
        if (edge) {
          const window = storey === 2 && (wx + wz) % 3 !== 0;
          put(lx, y, lz, window ? B.GLASS : B.PLATING);
        } else if (storey === 0) {
          put(lx, y, lz, B.STONE_BRICKS);                                  // the floor slabs
        }
      }
      if (!t.ruined) put(lx, top + 1, lz, edge ? B.PLATING : B.STONE_BRICKS);

      // a way in off the street: every tower gets a door on its south face
      if (edge && cell.lz === FT_ROAD && Math.abs(cell.lx - FT_BLOCK / 2) < 1.5) {
        put(lx, FT_GROUND + 1, lz, B.DOOR_LOWER);
        put(lx, FT_GROUND + 2, lz, B.DOOR_UPPER);
        put(lx, FT_GROUND + 3, lz, B.PLATING);
      }

      // signage, and the odd bank of machinery left running inside
      if (edge && hash3(wx, 11, wz, world.seed + 3) < 0.03) put(lx, FT_GROUND + 3, lz, B.NEON);
      if (!edge && hash3(wx, 12, wz, world.seed + 4) < 0.012) put(lx, FT_GROUND + 1, lz, B.CIRCUIT);
      if (!edge && hash3(wx, 13, wz, world.seed + 5) < 0.004) put(lx, FT_GROUND + 1, lz, B.CHEST);
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

  // What is worth taking out of a filing cabinet at the end of the world.
  loot(world, key, rnd) {
    const table = [
      [I.IRON_INGOT, 2, 5], [I.DIAMOND, 1, 2], [I.COOKED_BEEF, 1, 3], [I.IRON_SWORD, 1, 1],
      [I.IRON_HELMET, 1, 1], [I.IRON_CHESTPLATE, 1, 1], [B.NEON, 1, 4], [B.CIRCUIT, 1, 3],
      [B.PLATING, 4, 10], [I.ENDER_PEARL, 1, 1], [I.GOLD_INGOT, 1, 3],
    ];
    const stacks = [];
    const picks = 2 + Math.floor(rnd() * 3);
    for (let i = 0; i < picks; i++) {
      const [id, min, max] = table[Math.floor(rnd() * table.length)];
      stacks.push([id, min + Math.floor(rnd() * (max - min + 1))]);
    }
    return stacks;
  },
};
