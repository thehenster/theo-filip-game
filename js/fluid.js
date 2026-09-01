// Water that flows. A source spreads seven blocks sideways and falls forever,
// and anything cut off from a source dries up again.
const Fluid = {
  timer: 0,
  TICK: 0.2,               // seconds between flow steps
  MAX_PER_TICK: 260,
  MAX_QUEUE: 20000,

  // Each world keeps its own queue, so the Nether and the overworld never mix.
  queueFor(world) {
    if (!world._fluid) world._fluid = { pending: new Map(), order: [] };
    return world._fluid;
  },
  reset(world) {
    if (world) { const q = this.queueFor(world); q.pending.clear(); q.order.length = 0; }
  },

  touch(world, x, y, z) {
    if (y < 0 || y >= CY) return;
    const q = this.queueFor(world);
    const k = x + ',' + y + ',' + z;
    if (q.pending.has(k) || q.order.length >= this.MAX_QUEUE) return;
    q.pending.set(k, [x, y, z]);
    q.order.push(k);
  },
  // A block changed here, so this cell and everything touching it may need to move.
  touchAround(world, x, y, z) {
    this.touch(world, x, y, z);
    for (let d = 0; d < 6; d++) this.touch(world, x + DIRS[d][0], y + DIRS[d][1], z + DIRS[d][2]);
  },

  update(dt, world) {
    this.timer += dt;
    let steps = 0;
    while (this.timer >= this.TICK && steps < 4) {
      this.timer -= this.TICK;
      steps++;
      this.tick(world);
    }
    if (this.timer > this.TICK) this.timer = 0;
  },

  tick(world) {
    const q = this.queueFor(world);
    const batch = q.order.splice(0, this.MAX_PER_TICK);
    for (const k of batch) {
      const cell = q.pending.get(k);
      q.pending.delete(k);
      if (cell) this.step(world, cell[0], cell[1], cell[2]);
    }
  },

  // Water and lava both flow; lava is slower and only reaches three blocks.
  family(id) { return BLOCKS[id].fluid; },

  // Water hitting lava sets it: a source turns to obsidian, flowing lava to cobble.
  quench(world, x, y, z, hitId) {
    world.setBlock(x, y, z, BLOCKS[hitId].level === 0 ? B.OBSIDIAN : B.COBBLESTONE);
    Sound.burst({ dur: 0.4, freq: 2200, gain: 0.28, sweep: 0.15 });
    return true;
  },

  step(world, x, y, z) {
    const id = world.getBlock(x, y, z);
    if (!isLiquid(id)) return;
    const kind = BLOCKS[id].fluid;
    const level = BLOCKS[id].level;
    const levels = kind === 'lava' ? B.LAVA_FLOW : B.WATER_FLOW;
    const maxLevel = levels.length - 1;

    // flowing water needs something feeding it: water above, or a shallower neighbour
    if (level > 0) {
      const above = world.getBlock(x, y + 1, z);
      let fed = isLiquid(above) && BLOCKS[above].fluid === kind;
      if (!fed) {
        for (let d = 0; d < 4; d++) {
          const n = world.getBlock(x + HORIZ[d][0], y, z + HORIZ[d][1]);
          if (isLiquid(n) && BLOCKS[n].fluid === kind && BLOCKS[n].level < level) { fed = true; break; }
        }
      }
      if (!fed) { world.setBlock(x, y, z, 0); return; }
    }

    // falling beats spreading, exactly as in Minecraft
    const below = world.getBlock(x, y - 1, z);
    if (below === 0) { world.setBlock(x, y - 1, z, levels[1]); return; }
    if (isLiquid(below) && BLOCKS[below].fluid !== kind) {
      this.quench(world, x, y - 1, z, kind === 'water' ? below : id);
      return;
    }
    if (isLiquid(below) && BLOCKS[below].level > 1) { world.setBlock(x, y - 1, z, levels[1]); return; }
    if (isLiquid(below)) return;

    if (level >= maxLevel) return;
    const next = levels[level + 1];
    for (let d = 0; d < 4; d++) {
      const nx = x + HORIZ[d][0], nz = z + HORIZ[d][1];
      const n = world.getBlock(nx, y, nz);
      if (n === 0) world.setBlock(nx, y, nz, next);
      else if (isLiquid(n) && BLOCKS[n].fluid !== kind) this.quench(world, nx, y, nz, kind === 'water' ? n : id);
      else if (isLiquid(n) && BLOCKS[n].level > level + 1) world.setBlock(nx, y, nz, next);
    }
  },
};

const HORIZ = [[1, 0], [-1, 0], [0, 1], [0, -1]];
