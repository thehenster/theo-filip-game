// Items — things you carry rather than place: sticks, ingots, swords, armour, food.
// Their sprites live as extra layers in the same texture array as the block tiles.
const ITEM_BASE = 1000;
const ITEMS = [];

const isItem = id => id >= ITEM_BASE;
const itemDef = id => ITEMS[id - ITEM_BASE];
const thingName = id => (isItem(id) ? itemDef(id).name : BLOCKS[id].name);
const thingTile = id => (isItem(id) ? itemDef(id).tile : BLOCKS[id].faces[0]);
const thingIcon = (id, size = 48) => tileIcon(thingTile(id), size);

// 16x16 pixel-art masks. '.' is transparent, any other character indexes the palette.
function spriteTile(name, mask, palette) {
  return paintTile(name, t => {
    t.data.fill(0);
    const rows = mask;
    for (let y = 0; y < TILE; y++) {
      const row = rows[y] || '';
      for (let x = 0; x < TILE; x++) {
        const ch = row[x];
        if (!ch || ch === '.') continue;
        const c = palette[ch];
        if (!c) continue;                       // a letter with no colour draws nothing
        const v = c[3] ? (t.rnd() - 0.5) * c[3] : 0;
        t.px(x, y, c[0] + v, c[1] + v, c[2] + v, 255);
      }
    }
    // dark outline around the silhouette, the way item art usually reads
    const src = t.data.slice();
    const at = (x, y) => (y * TILE + x) * 4;
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (src[at(x, y) + 3]) continue;
      let r = 0, g = 0, b = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= TILE || ny >= TILE) continue;
        const i = at(nx, ny);
        if (!src[i + 3]) continue;
        r += src[i]; g += src[i + 1]; b += src[i + 2]; n++;
      }
      if (n) t.px(x, y, r / n * 0.35, g / n * 0.35, b / n * 0.35, 255);
    }
  });
}

const MASK_SWORD = [
  '.............LM.',
  '............LM..',
  '...........LM...',
  '..........LM....',
  '.........LM.....',
  '........LM......',
  '.......LM.......',
  '......LM........',
  '.....LM.........',
  '....LM..........',
  '..GGGG..........',
  '..GGG...........',
  '..Hh............',
  '.Hh.............',
  'Hh..............',
  'H...............',
];

const MASK_HELMET = [
  '................',
  '................',
  '...LLLLLLLLLL...',
  '..LLLLLLLLLLLL..',
  '..LMMMMMMMMMML..',
  '..MMMMMMMMMMMM..',
  '..MMDDDDDDDDMM..',
  '..MMDDDDDDDDMM..',
  '..MMMMMMMMMMMM..',
  '..MMMMMMMMMMMM..',
  '..DDDDDDDDDDDD..',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const MASK_CHEST = [
  '................',
  '................',
  '..LLL......LLL..',
  '.LLLLL....LLLLL.',
  '.LMMML....LMMML.',
  '.MMMMMLLLLMMMMM.',
  '.MMMMMMMMMMMMMM.',
  '.MMM.MMMMMM.MMM.',
  '.MMM.MMMMMM.MMM.',
  '.DDD.MMMMMM.DDD.',
  '.....MMMMMM.....',
  '.....DDDDDD.....',
  '................',
  '................',
  '................',
  '................',
];

const MASK_LEGS = [
  '................',
  '................',
  '..LLLLLLLLLLLL..',
  '..LMMMMMMMMMML..',
  '..MMMMMMMMMMMM..',
  '..MMMMM..MMMMM..',
  '..MMMM....MMMM..',
  '..MMMM....MMMM..',
  '..MMMM....MMMM..',
  '..MMMM....MMMM..',
  '..MMMM....MMMM..',
  '..DDDD....DDDD..',
  '................',
  '................',
  '................',
  '................',
];

const MASK_BOOTS = [
  '................',
  '................',
  '................',
  '................',
  '..LLLL....LLLL..',
  '..MMMM....MMMM..',
  '..MMMM....MMMM..',
  '..MMMM....MMMM..',
  '.MMMMM....MMMMM.',
  '.MMMMM....MMMMM.',
  '.DDDDD....DDDDD.',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const MASK_INGOT = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '....LLLLLLLL....',
  '...LLLLLLLLLL...',
  '..MMMMMMMMMMMM..',
  '..MMMMMMMMMMMM..',
  '..DDDDDDDDDDDD..',
  '...DDDDDDDDDD...',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const MASK_GEM = [
  '................',
  '................',
  '................',
  '......MM........',
  '.....MLLM.......',
  '....MLLLLM......',
  '...MLLLLLLM.....',
  '...MLLLLLLM.....',
  '....MLLLLM......',
  '.....MDDM.......',
  '......DD........',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const MASK_ORB = [
  '................',
  '................',
  '................',
  '................',
  '......MMMM......',
  '....MLLLLLLM....',
  '...MLLLLLLLLM...',
  '...MLLLLLLLLM...',
  '...MLLLLLLLLM...',
  '...MDLLLLLLDM...',
  '....MDDDDDDM....',
  '......DDDD......',
  '................',
  '................',
  '................',
  '................',
];

const MASK_STICK = [
  '................',
  '............Ss..',
  '...........Ss...',
  '..........Ss....',
  '.........Ss.....',
  '........Ss......',
  '.......Ss.......',
  '......Ss........',
  '.....Ss.........',
  '....Ss..........',
  '...Ss...........',
  '..Ss............',
  '.Ss.............',
  '................',
  '................',
  '................',
];

const MASK_FEATHER = [
  '................',
  '................',
  '...........LLM..',
  '..........LLLM..',
  '.........LLLM...',
  '........LLLLM...',
  '.......LLLLM....',
  '......LLLLM.....',
  '.....LLLLM......',
  '....LLLM........',
  '...LLM..........',
  '..LM............',
  '.M..............',
  '................',
  '................',
  '................',
];

const MASK_HIDE = [
  '................',
  '................',
  '................',
  '...LLLLLLLLLL...',
  '..LMMMMMMMMMML..',
  '..LMMMMMMMMMML..',
  '..MMMMMMMMMMMM..',
  '..MMMMMMMMMMMM..',
  '..MMMMMMMMMMMM..',
  '..DMMMMMMMMMMD..',
  '...DDDDDDDDDD...',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const MASK_MEAT = [
  '................',
  '................',
  '................',
  '.....MMMM.......',
  '...MMLLMMMM.....',
  '..MMLLLMMMMM..BB',
  '..MMLLMMMMMMMBB.',
  '..MMMMMMMMMMBB..',
  '...MMMMMMMMBB...',
  '....DDDDDDD.....',
  '.....DDDD.......',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const MASK_HEART = [
  '................',
  '................',
  '..HHH....HHH....',
  '.HHHHH..HHHHH...',
  'HHHHHHHHHHHHHH..',
  'HHHHHHHHHHHHHH..',
  'HHHHHHHHHHHHHH..',
  '.HHHHHHHHHHHH...',
  '..HHHHHHHHHH....',
  '...HHHHHHHH.....',
  '....HHHHHH......',
  '.....HHHH.......',
  '......HH........',
  '................',
  '................',
  '................',
];
const MASK_SHIELD = [
  '................',
  '................',
  '..AAAAAAAAAA....',
  '.AAAAAAAAAAAA...',
  '.AAAAAAAAAAAA...',
  '.AAAAAAAAAAAA...',
  '.AAAAAAAAAAAA...',
  '..AAAAAAAAAA....',
  '..AAAAAAAAAA....',
  '...AAAAAAAA.....',
  '....AAAAAA......',
  '.....AAAA.......',
  '................',
  '................',
  '................',
  '................',
];

// A drumstick and a droplet, so hunger and thirst are counted out in tens the
// way health and armour already are, instead of running down as strips.
const MASK_FOOD = [
  '................',
  '................',
  '.......MMM......',
  '......MMMMM.....',
  '.....MMMMMMM....',
  '.....MMMMMMM....',
  '....MMMMMMMM....',
  '....MMMMMMM.....',
  '.....MMMMM......',
  '......BBB.......',
  '.....BB.BB......',
  '....BB...BB.....',
  '...BB.....BB....',
  '................',
  '................',
  '................',
];
const MASK_DROP = [
  '................',
  '................',
  '.......W........',
  '.......WW.......',
  '......WWWW......',
  '......WWWW......',
  '.....WWWWWW.....',
  '.....WWWWWW.....',
  '....WWWWWWWW....',
  '....WWWWWWWW....',
  '....WWWWWWWW....',
  '.....WWWWWW.....',
  '......WWWW......',
  '................',
  '................',
  '................',
];

// Heads-up sprites, painted the same way as everything else.
let UI = {};
function defineUiSprites() {
  const red = [214, 48, 48], dark = [52, 40, 44];
  UI = {
    heartFull: spriteTile('ui_heart_full', MASK_HEART, { H: red }),
    heartEmpty: spriteTile('ui_heart_empty', MASK_HEART, { H: dark }),
    heartHalf: spriteTile('ui_heart_half', MASK_HEART.map((row, y) =>
      row.split('').map((ch, x) => (ch === 'H' && x >= 7 ? 'E' : ch)).join('')), { H: red, E: dark }),
    armour: spriteTile('ui_armour', MASK_SHIELD, { A: [206, 210, 220] }),
    armourEmpty: spriteTile('ui_armour_empty', MASK_SHIELD, { A: [56, 58, 66] }),
    foodFull: spriteTile('ui_food_full', MASK_FOOD, { M: [186, 122, 54], B: [226, 222, 206] }),
    foodEmpty: spriteTile('ui_food_empty', MASK_FOOD, { M: [52, 44, 38], B: [58, 56, 52] }),
    foodHalf: spriteTile('ui_food_half', MASK_FOOD.map((row, y) =>
      row.split('').map((ch, x) => (x >= 8 ? (ch === 'M' ? 'm' : ch === 'B' ? 'b' : ch) : ch)).join('')),
      { M: [186, 122, 54], B: [226, 222, 206], m: [52, 44, 38], b: [58, 56, 52] }),
    waterFull: spriteTile('ui_water_full', MASK_DROP, { W: [72, 150, 226] }),
    waterEmpty: spriteTile('ui_water_empty', MASK_DROP, { W: [38, 48, 60] }),
    waterHalf: spriteTile('ui_water_half', MASK_DROP.map(row =>
      row.split('').map((ch, x) => (ch === 'W' && x >= 8 ? 'E' : ch)).join('')),
      { W: [72, 150, 226], E: [38, 48, 60] }),
  };
}

const MASK_PICKAXE = [
  '................',
  '..LLL......LLL..',
  '.LMMMLLLLLLMMML.',
  '.LMMMMMMMMMMMML.',
  '.DDD..MMMM..DDD.',
  '........Ss......',
  '.......Ss.......',
  '......Ss........',
  '.....Ss.........',
  '....Ss..........',
  '...Ss...........',
  '..Ss............',
  '.Ss.............',
  'Ss..............',
  '................',
  '................',
];

const MASK_AXE = [
  '................',
  '..LLLLL.........',
  '..LMMMMM........',
  '..LMMMMMM..Ss...',
  '..LMMMMMMMSs....',
  '..LMMMMMMSs.....',
  '..DMMMMMSs......',
  '..DDDDDSs.......',
  '......Ss........',
  '.....Ss.........',
  '....Ss..........',
  '...Ss...........',
  '..Ss............',
  '.Ss.............',
  'Ss..............',
  '................',
];

const MASK_SHOVEL = [
  '................',
  '.....LLLLL......',
  '.....LMMML......',
  '.....LMMML......',
  '.....LMMML......',
  '.....LMMML......',
  '.....DMMMD......',
  '......DMD.......',
  '.......Ss.......',
  '......Ss........',
  '.....Ss.........',
  '....Ss..........',
  '...Ss...........',
  '..Ss............',
  '.Ss.............',
  'Ss..............',
];

const MASK_FLINT_STEEL = [
  '................',
  '................',
  '................',
  '.........MMMM...',
  '........MM..MM..',
  '.......MM....M..',
  '......MM.....M..',
  '..FF..MM....MM..',
  '.FFFF..MM.......',
  '.FFFf...........',
  '..ff............',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// Item art is shaded the way Minecraft's is: a lit edge, the body colour and a
// shadow, all struck from one base colour so every material stays recognisable.
const tone = (c, f) => c.map(v => Math.min(255, Math.round(v * f)));
const shades = c => ({ L: tone(c, 1.25), M: c, D: tone(c, 0.66) });
const HAFT = { S: [150, 110, 66], s: [104, 74, 44] };
const GRIP = { G: [128, 128, 136], H: [122, 86, 50], h: [86, 60, 34] };

const MASK_BUCKET = [
  '................',
  '................',
  '..BBBBBBBBBB....',
  '..BFFFFFFFFB....',
  '..BFFFFFFFFB....',
  '..BFFFFFFFFB....',
  '...BFFFFFFB.....',
  '...BFFFFFFB.....',
  '...BFFFFFFB.....',
  '....BFFFFB......',
  '....BFFFFB......',
  '.....BBBBB......',
  '................',
  '................',
  '................',
  '................',
];
const MASK_BOW = [
  '..........WWW...',
  '........WW...W..',
  '.......W......W.',
  '......W.S.....W.',
  '.....W..S.....W.',
  '.....W...S....W.',
  '....W....S....W.',
  '....W.....S...W.',
  '....W.....S...W.',
  '.....W.....S..W.',
  '.....W.....S..W.',
  '......W.....S.W.',
  '.......W......W.',
  '........WW...W..',
  '..........WWW...',
  '................',
];
const MASK_ARROW = [
  '..............HH',
  '.............HH.',
  '............HH..',
  '...........HH...',
  '..........HH....',
  '.........HH.....',
  '........SS......',
  '.......SS.......',
  '......SS........',
  '.....SS.........',
  '....FS..........',
  '...FFS..........',
  '..FF.S..........',
  '.FF.............',
  'FF..............',
  '................',
];
const MASK_APPLE = [
  '................',
  '................',
  '.......S........',
  '......LS........',
  '....AAAAAA......',
  '...AAAAAAAA.....',
  '..AAAAAAAAAA....',
  '..AAAAAAAAAA....',
  '..AAAAAAAAAA....',
  '..AAAAAAAAAA....',
  '...AAAAAAAA.....',
  '....AAAAAA......',
  '................',
  '................',
  '................',
  '................',
];

// A horn of coiled deepslate: the Sonic Cannon, which fires the noise itself.
const MASK_CANNON = [
  '................',
  '................',
  '.............CC.',
  '...........CCEE.',
  '.........CCEEEE.',
  '.......CCEEEEEE.',
  '.....CCEEEEEEEE.',
  '..GGCCEEEEEEEE..',
  '..GGCCEEEEEEEE..',
  '.....CCEEEEEEEE.',
  '.......CCEEEEEE.',
  '.........CCEEEE.',
  '...........CCEE.',
  '.............CC.',
  '................',
  '................',
];

// Guns. Four silhouettes, all built the same way: B is the body, G the grip,
// M the metal of the barrel and S the sight or stock.
const MASK_PISTOL = [
  '................',
  '................',
  '................',
  '....S...........',
  '...BBBBBBBB.....',
  '...BBBBBBBBM....',
  '...BBBB.........',
  '...BGGB.........',
  '....GGB.........',
  '....GGG.........',
  '.....GGG........',
  '.....GGG........',
  '................',
  '................',
  '................',
  '................',
];
const MASK_RIFLE = [
  '................',
  '................',
  '.......S........',
  '......SSS.......',
  '..BBBBBBBBBBBMM.',
  '..BBBBBBBBBBBMM.',
  'SSBBBB..BBBB....',
  'SSBGGB..........',
  '..GGG...........',
  '..GGG...........',
  '...GG...........',
  '................',
  '................',
  '................',
  '................',
  '................',
];
const MASK_SHOTGUN = [
  '................',
  '................',
  '................',
  '...BBBBBBBBBBMM.',
  '...BBBBBBBBBBMM.',
  '.SSBBBBBBBBBBMM.',
  '.SSBBBB.........',
  '.SSBGGB.........',
  '...GGG..........',
  '...GGG..........',
  '....GG..........',
  '................',
  '................',
  '................',
  '................',
  '................',
];
const MASK_SNIPER = [
  '................',
  '................',
  '.....SSSSSS.....',
  '.....SSSSSS.....',
  '..BBBBBBBBBBBBMM',
  '..BBBBBBBBBBBBMM',
  'SSBBBB...BBB....',
  'SSBGGB..........',
  '..GGG...........',
  '..GGG...........',
  '...GG...........',
  '................',
  '................',
  '................',
  '................',
  '................',
];
const MASK_BULLET = [
  '................',
  '................',
  '................',
  '..M..M..M..M....',
  '.MMM.MMM.MMM....',
  '.BBB.BBB.BBB....',
  '.BBB.BBB.BBB....',
  '.BBB.BBB.BBB....',
  '.BBB.BBB.BBB....',
  '.BBB.BBB.BBB....',
  '.BBB.BBB.BBB....',
  '.BBB.BBB.BBB....',
  '................',
  '................',
  '................',
  '................',
];
const MASK_BOTTLE = [
  '................',
  '.......CC.......',
  '.......CC.......',
  '......GGGG......',
  '.....GWWWWG.....',
  '....GWWWWWWG....',
  '....GWWWWWWG....',
  '....GWWWWWWG....',
  '....GWWWWWWG....',
  '....GWWWWWWG....',
  '....GWWWWWWG....',
  '.....GWWWWG.....',
  '......GGGG......',
  '................',
  '................',
  '................',
];
const MASK_BERRY = [
  '................',
  '................',
  '.......L........',
  '......LL........',
  '...RRR..RRR.....',
  '..RRRRR.RRRRR...',
  '..RRRRR.RRRRR...',
  '...RRR...RRR....',
  '.....RRRRR......',
  '....RRRRRRR.....',
  '....RRRRRRR.....',
  '.....RRRRR......',
  '................',
  '................',
  '................',
  '................',
];

// Three prongs on a long shaft. Thrown, mostly.
const MASK_TRIDENT = [
  '................',
  '.....P...P......',
  '.....P.P.P......',
  '.....P.P.P......',
  '.....PPPPP......',
  '.......P........',
  '.......S........',
  '.......S........',
  '......S.........',
  '......S.........',
  '.....S..........',
  '.....S..........',
  '....S...........',
  '....S...........',
  '................',
  '................',
];

// A hammer with a red band round the head, for removing people from a server.
const MASK_HAMMER = [
  '................',
  '................',
  '...HHHHHHHH.....',
  '..HRRHHHHRRH....',
  '..HRRHHHHRRH....',
  '..HHHHHHHHHH....',
  '.....HGGH.......',
  '.....HGGH.......',
  '.....GGGG.......',
  '.....GGGG.......',
  '....GGGG........',
  '....GGGG........',
  '...GGGG.........',
  '...GGGG.........',
  '................',
  '................',
];

// A USB stick with something on it that should not be on it.
const MASK_CHIP = [
  '................',
  '................',
  '................',
  '....SSSSSSSSSS..',
  '....SBBBBBBBBS..',
  '..MMSBEEEEEEBS..',
  '..MMSBEEEEEEBS..',
  '..MMSBEEEEEEBS..',
  '..MMSBBBBBBBBS..',
  '....SSSSSSSSSS..',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

// The Solytra: a pair of folded wings with an echo core between them.
const MASK_SOLYTRA = [
  '................',
  '..WW........WW..',
  '.WWWW......WWWW.',
  '.WWWWW....WWWWW.',
  '.WWWWWW..WWWWWW.',
  '.WWWWWWCCWWWWWW.',
  '.WWWWWWCCWWWWWW.',
  '..WWWWWEEWWWWW..',
  '..WWWWWEEWWWWW..',
  '...WWWWCCWWWW...',
  '....WWWCCWWW....',
  '.....WWCCWW.....',
  '......WCCW......',
  '.......CC.......',
  '................',
  '................',
];

const MASK_EGG = [
  '................',
  '................',
  '......EEE.......',
  '.....EEEEE......',
  '....EEEEEEE.....',
  '....EEEEEEE.....',
  '...EEEEEEEEE....',
  '...EEEEEEEEE....',
  '...EEEEEEEEE....',
  '...EEEEEEEEE....',
  '....EEEEEEE.....',
  '....EEEEEEE.....',
  '.....EEEEE......',
  '......EEE.......',
  '................',
  '................',
];

// Every egg is the same egg, spotted in the colours of whatever is inside it.
const EGG_COLOURS = {
  pig: [[240, 158, 156], [196, 108, 110]],
  cow: [[78, 62, 48], [230, 228, 222]],
  sheep: [[238, 236, 231], [186, 176, 166]],
  chicken: [[246, 246, 244], [240, 158, 50]],
  zombie: [[92, 142, 84], [58, 132, 130]],
  enderman: [[22, 20, 28], [188, 148, 236]],
  stegosaurus: [[96, 118, 74], [176, 122, 66]],
  raptor: [[148, 106, 62], [92, 62, 38]],
  tyrannosaur: [[86, 92, 78], [230, 176, 40]],
  sentry: [[138, 144, 152], [232, 64, 52]],
  scrapbot: [[176, 152, 84], [96, 226, 236]],
  villager_farmer: [[98, 70, 50], [118, 148, 60]],
  villager_butcher: [[98, 70, 50], [206, 206, 206]],
  villager_toolsmith: [[98, 70, 50], [88, 92, 104]],
  villager_armourer: [[98, 70, 50], [64, 74, 96]],
  villager_mason: [[98, 70, 50], [150, 128, 96]],
};

// Defined after the animals, because it needs to know what animals there are.
function defineSpawnEggs() {
  const rows = MASK_EGG.map(r => r.split(''));
  for (const [x, y] of [[6, 4], [9, 6], [5, 8], [9, 10], [6, 11], [10, 8]]) {
    if (rows[y] && rows[y][x] === 'E') rows[y][x] = 'S';
  }
  const mask = rows.map(r => r.join(''));
  for (const type of MOB_ORDER) {
    if (type.startsWith('bot_') || type.startsWith('tribute_') || type === 'bw_shop' || type === 'dragon') continue;
    const def = MOB_TYPES[type];
    const [base, spot] = EGG_COLOURS[type] || [[170, 170, 176], [220, 220, 226]];
    defItem(def.label + ' Egg', spriteTile('egg_' + type, mask, { E: base, S: spot }), { spawnEgg: type });
  }
}

function defItem(name, tile, opts = {}) {
  const id = ITEM_BASE + ITEMS.length;
  ITEMS.push(Object.assign({ id, name, tile }, opts));
  return id;
}

let I = {};
function defineItems() {
  ITEMS.length = 0;
  const sword = (name, blade) => defItem(name, spriteTile('sw_' + name.replace(/\s+/g, '_').toLowerCase(),
    MASK_SWORD, Object.assign(shades(blade), GRIP)));
  const armour = (name, mask, key, colour, slot, points) =>
    defItem(name, spriteTile(key, mask, shades(colour)), { slot, points, armour: true });

  I = {
    STICK: defItem('Stick', spriteTile('it_stick', MASK_STICK, HAFT)),
    IRON_INGOT: defItem('Iron Ingot', spriteTile('it_iron_ingot', MASK_INGOT, shades([206, 206, 212]))),
    GOLD_INGOT: defItem('Gold Ingot', spriteTile('it_gold_ingot', MASK_INGOT, shades([232, 196, 72]))),
    DIAMOND: defItem('Diamond', spriteTile('it_diamond', MASK_GEM, shades([104, 224, 222]))),
    EMERALD: defItem('Emerald', spriteTile('it_emerald', MASK_GEM, shades([64, 202, 96]))),

    WOOD_SWORD: sword('Wooden Sword', [162, 124, 74]),
    STONE_SWORD: sword('Stone Sword', [126, 126, 126]),
    IRON_SWORD: sword('Iron Sword', [206, 206, 212]),
    GOLD_SWORD: sword('Golden Sword', [230, 196, 76]),
    DIAMOND_SWORD: sword('Diamond Sword', [104, 224, 222]),

    IRON_HELMET: armour('Iron Helmet', MASK_HELMET, 'ar_iron_helmet', [206, 206, 212], 'head', 2),
    IRON_CHESTPLATE: armour('Iron Chestplate', MASK_CHEST, 'ar_iron_chest', [206, 206, 212], 'chest', 6),
    IRON_LEGGINGS: armour('Iron Leggings', MASK_LEGS, 'ar_iron_legs', [206, 206, 212], 'legs', 5),
    IRON_BOOTS: armour('Iron Boots', MASK_BOOTS, 'ar_iron_boots', [206, 206, 212], 'feet', 2),

    GOLD_HELMET: armour('Golden Helmet', MASK_HELMET, 'ar_gold_helmet', [230, 196, 76], 'head', 2),
    GOLD_CHESTPLATE: armour('Golden Chestplate', MASK_CHEST, 'ar_gold_chest', [230, 196, 76], 'chest', 5),
    GOLD_LEGGINGS: armour('Golden Leggings', MASK_LEGS, 'ar_gold_legs', [230, 196, 76], 'legs', 3),
    GOLD_BOOTS: armour('Golden Boots', MASK_BOOTS, 'ar_gold_boots', [230, 196, 76], 'feet', 1),

    DIAMOND_HELMET: armour('Diamond Helmet', MASK_HELMET, 'ar_dia_helmet', [104, 224, 222], 'head', 3),
    DIAMOND_CHESTPLATE: armour('Diamond Chestplate', MASK_CHEST, 'ar_dia_chest', [104, 224, 222], 'chest', 8),
    DIAMOND_LEGGINGS: armour('Diamond Leggings', MASK_LEGS, 'ar_dia_legs', [104, 224, 222], 'legs', 6),
    DIAMOND_BOOTS: armour('Diamond Boots', MASK_BOOTS, 'ar_dia_boots', [104, 224, 222], 'feet', 3),

    FLINT: defItem('Flint', spriteTile('it_flint', MASK_GEM, shades([88, 88, 94]))),
    FLINT_AND_STEEL: defItem('Flint and Steel',
      spriteTile('it_flint_steel', MASK_FLINT_STEEL, Object.assign(shades([206, 206, 212]), { F: [96, 96, 102], f: [64, 64, 70] })), { igniter: true }),

    LEATHER: defItem('Leather', spriteTile('it_leather', MASK_HIDE, shades([154, 110, 72]))),

    PORKCHOP: defItem('Raw Porkchop', spriteTile('it_porkchop', MASK_MEAT, Object.assign(shades([236, 148, 148]), { B: [232, 228, 214] })), { food: 4 }),
    BEEF: defItem('Raw Beef', spriteTile('it_beef', MASK_MEAT, Object.assign(shades([196, 78, 72]), { B: [232, 228, 214] })), { food: 4 }),
    CHICKEN: defItem('Raw Chicken', spriteTile('it_chicken', MASK_MEAT, Object.assign(shades([226, 178, 152]), { B: [232, 228, 214] })), { food: 3 }),
    MUTTON: defItem('Raw Mutton', spriteTile('it_mutton', MASK_MEAT, Object.assign(shades([214, 110, 100]), { B: [232, 228, 214] })), { food: 4 }),
    COOKED_PORKCHOP: defItem('Cooked Porkchop', spriteTile('it_cooked_pork', MASK_MEAT, Object.assign(shades([204, 132, 80]), { B: [232, 228, 214] })), { food: 8 }),
    COOKED_BEEF: defItem('Steak', spriteTile('it_steak', MASK_MEAT, Object.assign(shades([156, 82, 54]), { B: [232, 228, 214] })), { food: 8 }),
    COOKED_CHICKEN: defItem('Cooked Chicken', spriteTile('it_cooked_chicken', MASK_MEAT, Object.assign(shades([196, 146, 92]), { B: [232, 228, 214] })), { food: 6 }),
    COOKED_MUTTON: defItem('Cooked Mutton', spriteTile('it_cooked_mutton', MASK_MEAT, Object.assign(shades([176, 96, 68]), { B: [232, 228, 214] })), { food: 6 }),

    ENDER_PEARL: defItem('Ender Pearl', spriteTile('it_pearl', MASK_ORB, shades([46, 132, 122])), { pearl: true }),
    EYE_OF_ENDER: defItem('Eye of Ender', spriteTile('it_eye', MASK_ORB, shades([104, 214, 172])), { eye: true }),

    ROTTEN_FLESH: defItem('Rotten Flesh', spriteTile('it_rotten', MASK_MEAT, Object.assign(shades([126, 152, 96]), { B: [232, 228, 214] })), { food: 2 }),

    BUCKET: defItem('Bucket', spriteTile('it_bucket', MASK_BUCKET,
      { B: [176, 180, 188], F: [138, 142, 150] }), { bucket: 'empty' }),
    WATER_BUCKET: defItem('Water Bucket', spriteTile('it_bucket_water', MASK_BUCKET,
      { B: [176, 180, 188], F: [58, 118, 206] }), { bucket: 'water' }),
    LAVA_BUCKET: defItem('Lava Bucket', spriteTile('it_bucket_lava', MASK_BUCKET,
      { B: [176, 180, 188], F: [228, 118, 34] }), { bucket: 'lava' }),
    BOW: defItem('Bow', spriteTile('it_bow', MASK_BOW,
      { W: [140, 100, 58], S: [226, 226, 230] }), { bow: true, damage: 1 }),
    ARROW: defItem('Arrow', spriteTile('it_arrow', MASK_ARROW,
      { H: [222, 224, 228], S: [150, 112, 62], F: [232, 232, 236] }), { arrow: true }),
    APPLE: defItem('Apple', spriteTile('it_apple', MASK_APPLE,
      { A: [206, 52, 48], L: [86, 152, 66], S: [122, 88, 52] }), { food: 4 }),

    FEATHER: defItem('Feather', spriteTile('it_feather', MASK_FEATHER, shades([232, 232, 236]))),

    // ---- brought up out of the Deep Lands --------------------------------
    ECHO_SHARD: defItem('Echo Shard', spriteTile('it_echo_shard', MASK_GEM, shades([132, 232, 224]))),
    HEART_OF_THE_DEEP: defItem('Heart of the Deep',
      spriteTile('it_deep_heart', MASK_HEART, { H: [46, 176, 176] }), { deepKey: true }),
    SONIC_CANNON: defItem('Sonic Cannon', spriteTile('it_sonic_cannon', MASK_CANNON,
      { C: [58, 62, 72], E: [118, 226, 220], G: [40, 42, 50] }), { sonic: true, damage: 3 }),

    // ---- carried back out of the Hacker Dimension ------------------------
    // ---- out of Poseidon's realm -----------------------------------------
    PRISMARINE_SHARD: defItem('Prismarine Shard', spriteTile('it_prismarine_shard', MASK_GEM, shades([132, 202, 184]))),
    HEART_OF_THE_SEA: defItem('Heart of the Sea',
      spriteTile('it_sea_heart', MASK_HEART, { H: [72, 168, 208] }), { seaHeart: true }),
    TRIDENT: defItem('Trident', spriteTile('it_trident', MASK_TRIDENT,
      { P: [176, 216, 208], S: [92, 132, 128] }), { trident: true, damage: 9 }),

    // ---- guns, and what they eat ------------------------------------------
    GUNPOWDER: defItem('Gunpowder', spriteTile('it_gunpowder', MASK_GEM, shades([92, 92, 96]))),
    BULLETS: defItem('Bullets', spriteTile('it_bullets', MASK_BULLET,
      { M: [216, 190, 96], B: [178, 146, 66] }), { ammo: true }),
    PISTOL: defItem('Pistol', spriteTile('gn_pistol', MASK_PISTOL,
      { B: [58, 60, 68], G: [92, 68, 46], M: [176, 178, 186], S: [140, 142, 150] }),
      { gun: 'pistol', damage: 5 }),
    RIFLE: defItem('Rifle', spriteTile('gn_rifle', MASK_RIFLE,
      { B: [48, 50, 56], G: [80, 60, 42], M: [176, 178, 186], S: [66, 68, 76] }),
      { gun: 'rifle', damage: 6 }),
    SHOTGUN: defItem('Shotgun', spriteTile('gn_shotgun', MASK_SHOTGUN,
      { B: [70, 52, 38], G: [96, 72, 48], M: [186, 188, 196], S: [58, 44, 32] }),
      { gun: 'shotgun', damage: 4 }),
    SNIPER: defItem('Sniper Rifle', spriteTile('gn_sniper', MASK_SNIPER,
      { B: [42, 46, 44], G: [72, 56, 40], M: [176, 178, 186], S: [30, 32, 36] }),
      { gun: 'sniper', damage: 22 }),

    // ---- food and drink ----------------------------------------------------
    BOTTLE: defItem('Glass Bottle', spriteTile('it_bottle', MASK_BOTTLE,
      { G: [186, 214, 208], W: [222, 238, 236], C: [150, 176, 172] }), { bottle: 'empty' }),
    WATER_BOTTLE: defItem('Water Bottle', spriteTile('it_water_bottle', MASK_BOTTLE,
      { G: [186, 214, 208], W: [58, 130, 210], C: [150, 176, 172] }), { bottle: 'water', drink: 8 }),
    BERRIES: defItem('Berries', spriteTile('it_berries', MASK_BERRY,
      { R: [196, 40, 46], L: [86, 152, 66] }), { food: 2, drink: 2 }),

    DATA_SHARD: defItem('Data Shard', spriteTile('it_data_shard', MASK_GEM, shades([88, 226, 120]))),
    BAN_HAMMER: defItem('Ban Hammer', spriteTile('it_ban_hammer', MASK_HAMMER,
      { H: [206, 210, 220], R: [220, 56, 56], G: [122, 88, 52] }), { damage: 12, banhammer: true }),
    HACKED_CLIENT: defItem('Hacked Client', spriteTile('it_hacked_client', MASK_CHIP,
      { S: [64, 68, 80], B: [30, 34, 42], E: [88, 226, 120], M: [176, 180, 190] }), { hack: true }),
  };

  defineUiSprites();

  // --- tools: a pickaxe, axe and shovel in every material ----------------
  const HEADS = {
    Wooden: [162, 124, 74], Stone: [126, 126, 126], Iron: [206, 206, 212],
    Golden: [230, 196, 76], Diamond: [104, 224, 222],
  };
  const TIERS = { Wooden: 1, Golden: 1, Stone: 2, Iron: 3, Diamond: 4 };
  const TOOL_SHAPES = { pickaxe: MASK_PICKAXE, axe: MASK_AXE, shovel: MASK_SHOVEL };
  for (const mat in HEADS) {
    for (const kind in TOOL_SHAPES) {
      const name = mat + ' ' + kind[0].toUpperCase() + kind.slice(1);
      const key = 'to_' + mat.toLowerCase() + '_' + kind;
      const id = defItem(name, spriteTile(key, TOOL_SHAPES[kind], Object.assign(shades(HEADS[mat]), HAFT)),
        { tool: kind, tier: TIERS[mat] });
      itemDef(id).damage = kind === 'axe' ? TIERS[mat] + 2 : kind === 'pickaxe' ? TIERS[mat] + 1 : TIERS[mat];
      I[mat.toUpperCase() + '_' + kind.toUpperCase()] = id;
    }
  }

  // leather armour, the set you can make before you ever find iron
  const lea = [174, 126, 84];
  I.LEATHER_HELMET = armour('Leather Cap', MASK_HELMET, 'ar_leather_helmet', lea, 'head', 1);
  I.LEATHER_CHESTPLATE = armour('Leather Tunic', MASK_CHEST, 'ar_leather_chest', lea, 'chest', 3);
  I.LEATHER_LEGGINGS = armour('Leather Trousers', MASK_LEGS, 'ar_leather_legs', lea, 'legs', 2);
  I.LEATHER_BOOTS = armour('Leather Boots', MASK_BOOTS, 'ar_leather_boots', lea, 'feet', 1);

  // The Solytra. It counts as a chestplate, but what you actually want it for is
  // that it holds you up in the air and that it can shove you back into it.
  I.SOLYTRA = defItem('Solytra', spriteTile('ar_solytra', MASK_SOLYTRA,
    { W: [70, 78, 92], C: [46, 176, 176], E: [156, 246, 240] }),
    { armour: true, slot: 'chest', points: 3, glide: true });

  // sword damage, in half-hearts, matching Minecraft's ladder
  const dmg = { WOOD_SWORD: 4, STONE_SWORD: 5, IRON_SWORD: 6, GOLD_SWORD: 4, DIAMOND_SWORD: 7 };
  for (const k in dmg) itemDef(I[k]).damage = dmg[k];
}

// What you are wearing. Points follow Minecraft: a full iron set is 15.
const Equipment = {
  head: 0, chest: 0, legs: 0, feet: 0,
  slots: ['head', 'chest', 'legs', 'feet'],
  points() {
    let n = 0;
    for (const s of this.slots) if (this[s]) n += itemDef(this[s]).points;
    return n;
  },
  // each point cuts 4% of incoming damage
  absorb(amount) { return Math.max(0, amount * (1 - Math.min(0.8, this.points() * 0.04))); },
  equip(id) {
    const def = itemDef(id);
    if (!def || !def.armour) return false;
    if (!Inventory.take(id, 1)) return false;
    const slot = def.slot;
    if (this[slot]) Inventory.add(this[slot], 1);
    this[slot] = id;
    return true;
  },
  unequip(slot) {
    if (!this[slot]) return false;
    Inventory.add(this[slot], 1);
    this[slot] = 0;
    return true;
  },
  serialize() { return { head: this.head, chest: this.chest, legs: this.legs, feet: this.feet }; },
  load(o) { if (!o) return; for (const s of this.slots) this[s] = o[s] || 0; },
};

// Which pickaxe tier a block needs before it will drop anything.
// 0 means bare hands are fine.
let PICK_TIER = null;
function pickTier(blockId) {
  if (!PICK_TIER) {
    PICK_TIER = {};
    const set = (tier, ids) => { for (const id of ids) PICK_TIER[id] = tier; };
    set(1, [B.STONE, B.COBBLESTONE, B.ANDESITE, B.DIORITE, B.GRANITE, B.DEEPSLATE, B.SANDSTONE,
            B.BRICK, B.STONE_BRICKS, B.CHISELED_STONE_BRICKS, B.MOSSY_STONE_BRICKS, B.MOSSY_COBBLESTONE,
            B.POLISHED_ANDESITE, B.POLISHED_DIORITE, B.POLISHED_GRANITE, B.GLOWSTONE, B.TERRACOTTA,
            B.ICE, B.PACKED_ICE, B.COAL_BLOCK]);
    set(2, [B.COAL_ORE, B.IRON_ORE, B.IRON_BLOCK, B.LAMP]);
    set(3, [B.GOLD_ORE, B.DIAMOND_ORE, B.REDSTONE_ORE, B.LAPIS_ORE, B.EMERALD_ORE,
            B.GOLD_BLOCK, B.DIAMOND_BLOCK, B.LAPIS_BLOCK, B.EMERALD_BLOCK, B.REDSTONE_BLOCK]);
    set(4, [B.OBSIDIAN]);
  }
  return PICK_TIER[blockId] || 0;
}

// Blocks each tool is the right one for, which doubles what you get.
let TOOL_FOR = null;
function bestTool(blockId) {
  if (!TOOL_FOR) {
    pickTier(0);                       // makes sure PICK_TIER is built
    TOOL_FOR = {};
    for (const id in PICK_TIER) TOOL_FOR[id] = 'pickaxe';
    const set = (kind, ids) => { for (const id of ids) TOOL_FOR[id] = kind; };
    set('axe', [B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS,
                B.CRAFTING_TABLE, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES]);
    set('shovel', [B.DIRT, B.GRASS, B.SAND, B.GRAVEL, B.CLAY, B.SNOW]);
  }
  return TOOL_FOR[blockId] || null;
}

function heldTool(id) {
  if (!id || !isItem(id)) return null;
  const def = itemDef(id);
  return def && def.tool ? def : null;
}
const TIER_NAMES = ['your hands', 'a wooden pickaxe', 'a stone pickaxe', 'an iron pickaxe', 'a diamond pickaxe'];

// How long a block takes to break, following Minecraft's formula:
// hardness x 1.5 / tool speed when you can harvest it, x5 when you cannot.
let HARDNESS = null;
function blockHardness(id) {
  if (!HARDNESS) {
    HARDNESS = {};
    const set = (h, ids) => { for (const b of ids) HARDNESS[b] = h; };
    set(0.2, [B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES]);
    set(0.3, [B.GLASS, B.GLOWSTONE, B.LAMP]);
    set(0.4, [B.CACTUS]);
    set(0.5, [B.DIRT, B.SAND, B.GRAVEL, B.CLAY, B.SNOW, B.ICE, B.PACKED_ICE]);
    set(0.6, [B.GRASS]);
    set(0.8, [B.SANDSTONE, B.WOOL, B.RED_WOOL, B.YELLOW_WOOL, B.GREEN_WOOL, B.BLUE_WOOL, B.BLACK_WOOL]);
    set(1.0, [B.PUMPKIN]);
    set(1.25, [B.TERRACOTTA]);
    set(1.5, [B.STONE, B.ANDESITE, B.DIORITE, B.GRANITE,
              B.POLISHED_ANDESITE, B.POLISHED_DIORITE, B.POLISHED_GRANITE]);
    set(2.0, [B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS,
              B.COBBLESTONE, B.MOSSY_COBBLESTONE, B.BRICK, B.STONE_BRICKS,
              B.CHISELED_STONE_BRICKS, B.MOSSY_STONE_BRICKS]);
    set(2.5, [B.CRAFTING_TABLE, B.CLAY]);
    set(3.0, [B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.REDSTONE_ORE,
              B.LAPIS_ORE, B.EMERALD_ORE, B.DEEPSLATE]);
    set(5.0, [B.COAL_BLOCK, B.IRON_BLOCK, B.GOLD_BLOCK, B.DIAMOND_BLOCK,
              B.LAPIS_BLOCK, B.EMERALD_BLOCK, B.REDSTONE_BLOCK]);
    set(50, [B.OBSIDIAN]);
  }
  if (id === B.BEDROCK) return Infinity;
  const h = HARDNESS[id];
  return h === undefined ? 1 : h;
}

const TOOL_SPEED = [1, 2, 4, 6, 8];
function breakTime(blockId, heldId) {
  const hardness = blockHardness(blockId);
  if (!isFinite(hardness)) return Infinity;
  const tool = heldTool(heldId);
  const speed = tool && tool.tool === bestTool(blockId) ? (TOOL_SPEED[tool.tier] || 1) : 1;
  const have = tool && tool.tool === 'pickaxe' ? tool.tier : 0;
  const harvestable = pickTier(blockId) <= have;
  const seconds = harvestable ? hardness * 1.5 / speed : hardness * 5 / speed;
  return Math.max(0.05, seconds);
}

// The sword you are holding, if any.
function heldWeapon(id) {
  if (!id || !isItem(id)) return null;
  const def = itemDef(id);
  return def && def.damage ? def : null;
}
