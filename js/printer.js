// The 3D printer. Feed it the blocks a thing is made of and it assembles the
// thing in the clear space in front of it, one print at a time.
const Printer = {
  _models: null,

  // Built lazily: the block table does not exist until the game starts.
  models() {
    if (this._models) return this._models;
    const P = B.PLANKS, S = B.STONE_BRICKS, G = B.GLASS, W = B.WOOL, L = B.GLOWSTONE, K = B.PUMPKIN;

    const table = [];
    for (const [x, z] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { table.push([x, 0, z, P]); table.push([x, 1, z, P]); }

    const arch = [];
    for (let y = 0; y < 3; y++) { arch.push([-2, y, 0, S]); arch.push([2, y, 0, S]); }
    for (let x = -2; x <= 2; x++) arch.push([x, 3, 0, S]);
    arch.push([-1, 2, 0, S]); arch.push([1, 2, 0, S]);

    const hut = [];
    for (let x = -2; x <= 2; x++) for (let z = 0; z <= 4; z++) {
      hut.push([x, 0, z, P]);                                  // floor
      hut.push([x, 3, z, B.SPRUCE_PLANKS]);                    // roof
      const wall = Math.abs(x) === 2 || z === 0 || z === 4;
      if (!wall) continue;
      for (const y of [1, 2]) {
        if (x === 0 && z === 0) continue;                      // the doorway
        const window = y === 2 && ((Math.abs(x) === 2 && z === 2) || (z === 4 && x === 0));
        hut.push([x, y, z, window ? G : P]);
      }
    }
    hut.push([0, 2, 2, L]);                                    // a light inside

    this._models = [
      { key: 'chair', name: 'Chair', blurb: 'Somewhere to sit down', parts: [[0, 0, 0, P], [0, 0, 1, P], [0, 1, 1, P]] },
      { key: 'table', name: 'Table', blurb: 'Four legs and a top', parts: table },
      { key: 'lamp', name: 'Lamp post', blurb: 'Light for a path', parts: [[0, 0, 0, S], [0, 1, 0, S], [0, 2, 0, S], [0, 3, 0, L]] },
      { key: 'scarecrow', name: 'Scarecrow', blurb: 'Wool, and a pumpkin for a head',
        parts: [[0, 0, 0, S], [0, 1, 0, W], [0, 2, 0, W], [-1, 2, 0, W], [1, 2, 0, W], [0, 3, 0, K]] },
      { key: 'arch', name: 'Arch', blurb: 'A stone arch to walk through', parts: arch },
      { key: 'hut', name: 'Hut', blurb: 'A little house, window, door and a light', parts: hut },
    ];
    return this._models;
  },

  // What a print costs, counted by block.
  cost(model) {
    const need = new Map();
    for (const [, , , id] of model.parts) need.set(id, (need.get(id) || 0) + 1);
    return need;
  },

  missing(model) {
    const out = [];
    for (const [id, n] of this.cost(model)) if (Inventory.count(id) < n) out.push([id, n - Inventory.count(id)]);
    return out;
  },

  // Where each block of a print lands: out in front of the printer, which is the
  // face with the window in it.
  cells(at, model) {
    return model.parts.map(([dx, dy, dz, id]) => [at[0] + dx, at[1] + dy, at[2] - 1 - dz, id]);
  },

  room(world, at, model) {
    for (const [x, y, z] of this.cells(at, model)) {
      if (y < 0 || y >= CY) return false;
      const there = world.getBlock(x, y, z);
      if (there && !isLiquid(there)) return false;
    }
    return true;
  },

  print(game, model, at) {
    if (!this.room(game.world, at, model)) return 'No room in front of the printer';
    if (game.survivalRules()) {
      const short = this.missing(model);
      if (short.length) return 'Short of ' + short.map(m => m[1] + ' × ' + thingName(m[0])).join(', ');
      for (const [id, n] of this.cost(model)) Inventory.take(id, n);
    }
    for (const [x, y, z, id] of this.cells(at, model)) {
      game.world.setBlock(x, y, z, id);
      BedWars.notePlaced(x, y, z);
    }
    return true;
  },
};
