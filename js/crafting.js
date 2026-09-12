// Materials you have gathered, the recipe list, and the pattern matcher.
// A furnace turns one thing into another, and burns something to do it.
const SMELTING = [];
const FUELS = [];
function defineSmelting() {
  SMELTING.length = 0; FUELS.length = 0;
  const cook = (from, to) => SMELTING.push({ from, to });
  cook(B.IRON_ORE, I.IRON_INGOT);
  cook(B.GOLD_ORE, I.GOLD_INGOT);
  cook(B.SAND, B.GLASS);
  cook(B.CLAY, B.BRICK);
  cook(B.COBBLESTONE, B.STONE);
  cook(B.NETHERRACK, B.NETHER_BRICKS);
  cook(I.PORKCHOP, I.COOKED_PORKCHOP);
  cook(I.BEEF, I.COOKED_BEEF);
  cook(I.CHICKEN, I.COOKED_CHICKEN);
  cook(I.MUTTON, I.COOKED_MUTTON);
  FUELS.push(B.COAL_ORE, B.COAL_BLOCK, B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS, B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG, I.STICK);
}
function currentFuel() {
  for (const id of FUELS) if (Inventory.count(id) > 0) return id;
  return 0;
}

const Inventory = {
  counts: new Map(),
  add(id, n = 1) {
    if (!id || n <= 0) return;
    this.counts.set(id, (this.counts.get(id) || 0) + n);
  },
  take(id, n = 1) {
    const have = this.counts.get(id) || 0;
    if (have < n) return false;
    if (have === n) this.counts.delete(id); else this.counts.set(id, have - n);
    return true;
  },
  count(id) { return this.counts.get(id) || 0; },
  entries() { return [...this.counts.entries()].filter(e => e[1] > 0).sort((a, b) => a[0] - b[0]); },
  serialize() { return [...this.counts.entries()]; },
  load(list) { this.counts = new Map(list || []); },
};

// What a broken block leaves behind, Minecraft-style: stone crumbles, grass turns to dirt.
function blockDrop(id) {
  if (id === B.BEDROCK || isLiquid(id)) return 0;
  if (id === B.DOOR_UPPER || id === B.DOOR_UPPER_OPEN) return 0;      // the lower half carries the drop
  if (id === B.DOOR_LOWER_OPEN) return B.DOOR_LOWER;
  if (id === B.BED_FOOT) return B.BED_HEAD;
  if (BLOCKS[id].stairs || BLOCKS[id].ladder) return BLOCKS[id].turns[0];
  if (id === B.BERRY_BUSH) return I.BERRIES;                   // the fruit, not the bush
  if (BLOCKS[id].plant) return id;                            // however it was turned
  if (BLOCKS[id].torch) return B.TORCH;                                // however it was mounted
  if (BLOCKS[id].tv) return B.TV;                                     // a switched-on set is still a set
  if (id === B.STONE) return B.COBBLESTONE;
  if (id === B.GRASS) return B.DIRT;
  return id;
}

const RECIPES = [];

// An ingredient is a block id, or an array of ids when any of them will do.
function ingredientMatches(got, want) {
  return Array.isArray(want) ? want.includes(got) : got === want;
}
function repId(want) { return Array.isArray(want) ? want[0] : want; }

// pattern rows use keys from `key`; a space is an empty cell.
function defineRecipes() {
  RECIPES.length = 0;
  const shaped = (out, count, rows, key, note) => RECIPES.push({ out, count, rows, key, note });
  const shapeless = (out, count, ins, note) => RECIPES.push({ out, count, ins, note });
  const ANY_PLANKS = [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS];
  const ANY_LEAVES = [B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES];

  shapeless(B.PLANKS, 4, [B.LOG], 'Split an oak log');
  shapeless(B.BIRCH_PLANKS, 4, [B.BIRCH_LOG], 'Split a birch log');
  shapeless(B.SPRUCE_PLANKS, 4, [B.SPRUCE_LOG], 'Split a spruce log');
  shaped(B.CRAFTING_TABLE, 1, ['PP', 'PP'], { P: ANY_PLANKS }, 'Four planks of any wood');
  shaped(B.STONE_BRICKS, 4, ['CC', 'CC'], { C: B.COBBLESTONE }, 'Cut cobblestone into bricks');
  shaped(B.CHISELED_STONE_BRICKS, 4, ['SS', 'SS'], { S: B.STONE_BRICKS }, 'Carve the brickwork');
  shapeless(B.MOSSY_STONE_BRICKS, 1, [B.STONE_BRICKS, ANY_LEAVES], 'Let the bricks go mossy');
  shapeless(B.MOSSY_COBBLESTONE, 1, [B.COBBLESTONE, ANY_LEAVES], 'Let the cobble go mossy');
  shaped(B.SANDSTONE, 1, ['SS', 'SS'], { S: B.SAND }, 'Press sand into sandstone');
  shapeless(B.GLASS, 2, [B.SAND, B.GLOWSTONE], 'Melt sand with glowstone');
  shapeless(B.GRASS, 1, [B.DIRT, ANY_LEAVES], 'Seed dirt with leaves');
  shaped(B.LAMP, 4, ['GGG', 'GWG', 'GGG'], { G: B.GLASS, W: B.GLOWSTONE }, 'Glowstone caged in glass');

  // What the Deep Lands are actually for.
  shaped(B.DEEPSLATE_BRICKS, 4, ['DD', 'DD'], { D: B.DEEPSLATE }, 'Cut deepslate into bricks');
  shaped(I.SONIC_CANNON, 1, ['III', 'ESE', 'III'],
    { I: I.IRON_INGOT, E: I.ECHO_SHARD, S: I.STICK }, 'An echo shard braced in iron: it fires the noise itself');
  shaped(I.SOLYTRA, 1, ['E E', 'ECE', 'E E'],
    { E: I.ECHO_SHARD, C: I.LEATHER_CHESTPLATE }, 'Wings of echo — glide with jump, boost with R');

  // Poseidon's realm, and the server nobody is supposed to be able to reach.
  shaped(B.PRISMARINE, 1, ['PP', 'PP'], { P: I.PRISMARINE_SHARD }, 'Press four shards into prismarine');
  shaped(B.PRISMARINE_BRICKS, 4, ['PP', 'PP'], { P: B.PRISMARINE }, 'Cut prismarine into bricks');
  shaped(B.DARK_PRISMARINE, 1, ['PP', 'PC'], { P: B.PRISMARINE, C: B.COAL_ORE }, 'Darken prismarine with coal');
  shaped(B.SEA_LANTERN, 1, ['PP', 'PP'], { P: B.CORAL_GOLD }, 'Four gold corals make a lantern');
  shaped(I.TRIDENT, 1, ['PPP', ' H ', ' S '],
    { P: I.PRISMARINE_SHARD, H: I.HEART_OF_THE_SEA, S: I.STICK }, "Three prongs on a haft, round the heart of the sea");
  shaped(I.BAN_HAMMER, 1, ['DDD', 'DSD', ' S '],
    { D: I.DATA_SHARD, S: I.STICK }, 'Six data shards round a haft');
  shaped(B.SERVER_RACK, 1, ['CC', 'CC'], { C: B.CIRCUIT }, 'Four circuit boards racked up');

  // Guns, and what they eat. Gunpowder is coal ground up with gravel and sand.
  shapeless(I.GUNPOWDER, 2, [B.COAL_ORE, B.GRAVEL, B.SAND], 'Grind coal, gravel and sand together');
  shaped(I.BULLETS, 8, ['I', 'G'], { I: I.IRON_INGOT, G: I.GUNPOWDER }, 'Iron over a charge of powder');
  shaped(I.PISTOL, 1, ['II', ' S'], { I: I.IRON_INGOT, S: I.STICK }, 'A short barrel and a grip');
  shaped(I.RIFLE, 1, ['III', ' SS'], { I: I.IRON_INGOT, S: I.STICK }, 'A long barrel, a stock, and it does not stop');
  shaped(I.SHOTGUN, 1, ['III', 'S S'], { I: I.IRON_INGOT, S: I.STICK }, 'Wide barrel, wider spread');
  shaped(I.SNIPER, 1, ['IID', ' SS'], { I: I.IRON_INGOT, D: I.DIAMOND, S: I.STICK }, 'A diamond for the glass on top');

  // Things that go off.
  shaped(B.TNT, 1, ['GSG', 'SGS', 'GSG'], { G: I.GUNPOWDER, S: B.SAND }, 'Powder packed in sand');
  shaped(B.NUKE, 1, ['III', 'GDG', 'III'],
    { I: B.IRON_BLOCK, G: I.GUNPOWDER, D: B.DIAMOND_BLOCK }, 'Do not make this indoors');

  // Bottles, and the counter to sell things over.
  shaped(I.BOTTLE, 3, ['G G', ' G '], { G: B.GLASS }, 'Three bottles out of three panes');
  shaped(B.SHOP, 1, ['WWW', 'PPP'], { W: B.WOOL, P: ANY_PLANKS }, 'A counter with an awning over it');

  shaped(B.POLISHED_ANDESITE, 4, ['AA', 'AA'], { A: B.ANDESITE }, 'Grind andesite smooth');
  shaped(B.POLISHED_DIORITE, 4, ['DD', 'DD'], { D: B.DIORITE }, 'Grind diorite smooth');
  shaped(B.POLISHED_GRANITE, 4, ['GG', 'GG'], { G: B.GRANITE }, 'Grind granite smooth');
  shaped(B.BRICK, 4, ['CC', 'CC'], { C: B.CLAY }, 'Fire clay into bricks');
  shapeless(B.TERRACOTTA, 2, [B.CLAY, B.GLOWSTONE], 'Bake clay hard');
  shaped(B.PACKED_ICE, 1, ['II', 'II'], { I: B.ICE }, 'Squeeze ice together');

  // nine of an ore packs into a solid block — the classic 3x3
  const pack = (ore, out, name) => shaped(out, 1, ['OOO', 'OOO', 'OOO'], { O: ore }, 'Nine ' + name + ' packed solid');
  pack(B.COAL_ORE, B.COAL_BLOCK, 'coal ore');
  pack(B.IRON_ORE, B.IRON_BLOCK, 'iron ore');
  pack(B.GOLD_ORE, B.GOLD_BLOCK, 'gold ore');
  pack(B.DIAMOND_ORE, B.DIAMOND_BLOCK, 'diamond ore');
  pack(B.LAPIS_ORE, B.LAPIS_BLOCK, 'lapis ore');
  pack(B.EMERALD_ORE, B.EMERALD_BLOCK, 'emerald ore');
  pack(B.REDSTONE_ORE, B.REDSTONE_BLOCK, 'redstone ore');

  // dye wool with whatever is to hand
  const dye = (out, src, note) => shapeless(out, 1, [B.WOOL, src], note);
  dye(B.RED_WOOL, B.BRICK, 'Wool dyed with brick dust');
  dye(B.YELLOW_WOOL, B.SAND, 'Wool dyed sandy yellow');
  dye(B.GREEN_WOOL, [B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES], 'Wool dyed with leaves');
  dye(B.BLUE_WOOL, B.LAPIS_ORE, 'Wool dyed with lapis');
  dye(B.BLACK_WOOL, B.COAL_ORE, 'Wool dyed with soot');

  // --- tools and armour ------------------------------------------------
  shaped(I.STICK, 4, ['P', 'P'], { P: ANY_PLANKS }, 'Two planks, one on top of the other');
  shapeless(I.IRON_INGOT, 2, [B.IRON_ORE, B.GLOWSTONE], 'Melt iron out of the ore');
  shapeless(I.GOLD_INGOT, 2, [B.GOLD_ORE, B.GLOWSTONE], 'Melt gold out of the ore');
  shapeless(I.DIAMOND, 2, [B.DIAMOND_ORE], 'Crack the ore open');
  shapeless(I.EYE_OF_ENDER, 2, [I.ENDER_PEARL, B.GLOWSTONE], 'An eye that opens the way to the End');
  shapeless(I.EMERALD, 2, [B.EMERALD_ORE], 'Crack the ore open — villagers deal in these');
  shapeless(I.FLINT_AND_STEEL, 1, [I.FLINT, I.IRON_INGOT], 'Strikes a spark — lights a nether portal');

  const sword = (out, mat, note) =>
    shaped(out, 1, ['X', 'X', 'S'], { X: mat, S: I.STICK }, note);
  sword(I.WOOD_SWORD, ANY_PLANKS, 'Two planks on a stick');
  sword(I.STONE_SWORD, B.COBBLESTONE, 'Two cobbles on a stick');
  sword(I.IRON_SWORD, I.IRON_INGOT, 'Two iron ingots on a stick');
  sword(I.GOLD_SWORD, I.GOLD_INGOT, 'Soft, fast, and pretty');
  sword(I.DIAMOND_SWORD, I.DIAMOND, 'The sharpest thing you can make');

  const suit = (mat, name, helmet, chest, legs, boots) => {
    shaped(helmet, 1, ['XXX', 'X X'], { X: mat }, name + ' for your head');
    shaped(chest, 1, ['X X', 'XXX', 'XXX'], { X: mat }, name + ' across the chest');
    shaped(legs, 1, ['XXX', 'X X', 'X X'], { X: mat }, name + ' down the legs');
    shaped(boots, 1, ['X X', 'X X'], { X: mat }, name + ' on your feet');
  };
  suit(I.IRON_INGOT, 'Iron', I.IRON_HELMET, I.IRON_CHESTPLATE, I.IRON_LEGGINGS, I.IRON_BOOTS);
  suit(I.GOLD_INGOT, 'Gold', I.GOLD_HELMET, I.GOLD_CHESTPLATE, I.GOLD_LEGGINGS, I.GOLD_BOOTS);
  suit(I.DIAMOND, 'Diamond', I.DIAMOND_HELMET, I.DIAMOND_CHESTPLATE, I.DIAMOND_LEGGINGS, I.DIAMOND_BOOTS);

  shaped(B.DOOR_LOWER, 3, ['PP', 'PP', 'PP'], { P: ANY_PLANKS }, 'Six planks make three doors');

  // --- furniture ----------------------------------------------------------
  shaped(B.CHEST, 1, ['PPP', 'P P', 'PPP'], { P: ANY_PLANKS }, 'Eight planks around a hollow');
  shaped(B.FURNACE, 1, ['CCC', 'C C', 'CCC'], { C: B.COBBLESTONE }, 'Eight cobbles around a hollow');
  shaped(B.BED_HEAD, 1, ['WWW', 'PPP'], { W: [B.WOOL, B.RED_WOOL, B.BLUE_WOOL, B.GREEN_WOOL, B.YELLOW_WOOL, B.BLACK_WOOL], P: ANY_PLANKS }, 'Wool over planks');
  shaped(B.BED_FOOT, 1, ['PPP', 'WWW'], { W: [B.WOOL, B.RED_WOOL, B.BLUE_WOOL, B.GREEN_WOOL, B.YELLOW_WOOL, B.BLACK_WOOL], P: ANY_PLANKS }, 'The other end of the bed');
  shaped(I.BUCKET, 1, ['I I', ' I '], { I: I.IRON_INGOT }, 'Three iron folded into a pail');
  shaped(I.BOW, 1, [' SF', 'S F', ' SF'], { S: I.STICK, F: I.STRING_SUB || I.FEATHER }, 'Sticks strung with feather-fletch');
  shaped(I.ARROW, 4, ['F', 'S', 'T'], { F: I.FLINT, S: I.STICK, T: I.FEATHER }, 'Flint, a stick and a feather');
  shaped(B.LADDER, 3, ['S S', 'SSS', 'S S'], { S: I.STICK }, 'Seven sticks make three ladders');
  shaped(B.FENCE, 3, ['SSS', 'SSS'], { S: I.STICK }, 'Six sticks make three lengths of fence');
  shaped(B.SLAB_STONE, 6, ['SSS'], { S: B.STONE_BRICKS }, 'Bricks cut in half');
  shaped(B.SLAB_OAK, 6, ['PPP'], { P: B.PLANKS }, 'Planks cut in half');
  shaped(B.SLAB_COBBLE, 6, ['CCC'], { C: B.COBBLESTONE }, 'Cobbles cut in half');
  shaped(B.STAIRS_OAK, 4, ['P  ', 'PP ', 'PPP'], { P: B.PLANKS }, 'Six planks cut into four steps');
  shaped(B.STAIRS_COBBLE, 4, ['C  ', 'CC ', 'CCC'], { C: B.COBBLESTONE }, 'Six cobbles cut into four steps');
  shaped(B.STAIRS_N, 4, ['S  ', 'SS ', 'SSS'], { S: B.STONE_BRICKS }, 'Six bricks cut into four steps');
  shaped(B.TORCH, 4, ['C', 'S'], { C: B.COAL_ORE, S: I.STICK }, 'Coal on a stick, four at a time');
  shaped(B.PRINTER, 1, ['III', 'IGI', 'ICI'],
    { I: I.IRON_INGOT, G: B.GLOWSTONE, C: B.CRAFTING_TABLE }, 'A machine that builds what you feed it');
  shaped(B.TV, 1, ['III', 'IGI', 'III'],
    { I: I.IRON_INGOT, G: B.GLASS }, 'Eight iron around a pane of glass');
  shaped(B.BOOKSHELF, 1, ['PPP', 'LLL', 'PPP'], { P: ANY_PLANKS, L: I.LEATHER }, 'Planks and bound leather');
  shaped(B.BARREL, 1, ['PPP', 'P P', 'PLP'], { P: ANY_PLANKS, L: B.LOG }, 'Staves and a base');

  // --- tools --------------------------------------------------------------
  const toolSet = (mat, name, pick, axe, shovel) => {
    shaped(pick, 1, ['XXX', ' S ', ' S '], { X: mat, S: I.STICK }, name + ' pickaxe for stone and ore');
    shaped(axe, 1, ['XX', 'XS', ' S'], { X: mat, S: I.STICK }, name + ' axe for wood');
    shaped(shovel, 1, ['X', 'S', 'S'], { X: mat, S: I.STICK }, name + ' shovel for dirt and sand');
  };
  toolSet(ANY_PLANKS, 'A wooden', I.WOODEN_PICKAXE, I.WOODEN_AXE, I.WOODEN_SHOVEL);
  toolSet(B.COBBLESTONE, 'A stone', I.STONE_PICKAXE, I.STONE_AXE, I.STONE_SHOVEL);
  toolSet(I.IRON_INGOT, 'An iron', I.IRON_PICKAXE, I.IRON_AXE, I.IRON_SHOVEL);
  toolSet(I.GOLD_INGOT, 'A golden', I.GOLDEN_PICKAXE, I.GOLDEN_AXE, I.GOLDEN_SHOVEL);
  toolSet(I.DIAMOND, 'A diamond', I.DIAMOND_PICKAXE, I.DIAMOND_AXE, I.DIAMOND_SHOVEL);

  suit(I.LEATHER, 'Leather', I.LEATHER_HELMET, I.LEATHER_CHESTPLATE, I.LEATHER_LEGGINGS, I.LEATHER_BOOTS);

  for (const r of RECIPES) r.size = r.rows ? Math.max(r.rows.length, ...r.rows.map(x => x.length)) : 1;
}

function recipeInputs(r) {
  if (r.ins) return r.ins.map(repId);
  const out = [];
  for (const row of r.rows) for (const ch of row) if (ch !== ' ') out.push(repId(r.key[ch]));
  return out;
}

// The grid the player laid out is a plan: a flat array of block ids, 0 for empty.
function planBounds(plan, size) {
  let r0 = 99, r1 = -1, c0 = 99, c1 = -1, n = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (!plan[r * size + c]) continue;
    n++;
    if (r < r0) r0 = r; if (r > r1) r1 = r;
    if (c < c0) c0 = c; if (c > c1) c1 = c;
  }
  return { r0, r1, c0, c1, n };
}

function matchRecipe(plan, size) {
  const b = planBounds(plan, size);
  if (!b.n) return null;
  for (const r of RECIPES) {
    if (r.ins) {
      const have = [];
      for (const v of plan) if (v) have.push(v);
      if (have.length !== r.ins.length) continue;
      if (matchShapeless(have, r.ins)) return r;
      continue;
    }
    const h = r.rows.length, w = Math.max(...r.rows.map(x => x.length));
    if (b.r1 - b.r0 + 1 !== h || b.c1 - b.c0 + 1 !== w) continue;
    let ok = true;
    for (let r2 = 0; r2 < h && ok; r2++) {
      for (let c2 = 0; c2 < w; c2++) {
        const ch = r.rows[r2][c2] || ' ';
        const got = plan[(b.r0 + r2) * size + (b.c0 + c2)];
        if (ch === ' ' ? got !== 0 : !ingredientMatches(got, r.key[ch])) { ok = false; break; }
      }
    }
    if (ok) return r;
  }
  return null;
}

// Pair every item in the grid with a distinct ingredient (order does not matter).
function matchShapeless(items, ins) {
  const used = new Array(ins.length).fill(false);
  const assign = i => {
    if (i === items.length) return true;
    for (let j = 0; j < ins.length; j++) {
      if (used[j] || !ingredientMatches(items[i], ins[j])) continue;
      used[j] = true;
      if (assign(i + 1)) return true;
      used[j] = false;
    }
    return false;
  };
  return assign(0);
}

// Everything the plan asks for, and whether the inventory can pay for it.
function planCost(plan) {
  const need = new Map();
  for (const id of plan) if (id) need.set(id, (need.get(id) || 0) + 1);
  const missing = [];
  for (const [id, n] of need) if (Inventory.count(id) < n) missing.push([id, n - Inventory.count(id)]);
  return { need, missing };
}

function craftPlan(plan, size) {
  const recipe = matchRecipe(plan, size);
  if (!recipe) return null;
  const { need, missing } = planCost(plan);
  if (missing.length) return null;
  for (const [id, n] of need) Inventory.take(id, n);
  Inventory.add(recipe.out, recipe.count);
  return recipe;
}
