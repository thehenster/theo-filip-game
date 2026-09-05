// Animals: boxy Minecraft-style models, procedurally painted skins, and wandering AI.
// Models are described in 1/16-block "pixels" with the animal facing -Z at yaw 0.
const MOB_TEX = 128;   // big enough for the dragon's wings
const MOB_TYPES = {};
const MOB_ORDER = [];
const MOB_SKINS = [];   // Uint8Array(64*64*4) per type, in MOB_ORDER order

// Standard box unwrap: top/bottom across the top row, then right/front/left/back.
function boxUnwrapSize(w, h, d) { return [2 * (d + w), d + h]; }
function boxRects(w, h, d, u, v) {
  return {
    py: [u + d, v, w, d],                 // top
    ny: [u + d + w, v, w, d],             // bottom
    nx: [u, v + d, d, h],                 // right side
    nz: [u + d, v + d, w, h],             // front (the face)
    px: [u + d + w, v + d, d, h],         // left side
    pz: [u + d + w + d, v + d, w, h],     // back
  };
}
const FACE_KEY = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];

// Corner (0/1 coords) -> position inside the face rect, so every skin sits upright.
const FACE_ST = [
  (c) => [1 - c[2], 1 - c[1]],   // +X
  (c) => [c[2], 1 - c[1]],       // -X
  (c) => [c[0], c[2]],           // +Y
  (c) => [1 - c[0], 1 - c[2]],   // -Y
  (c) => [c[0], 1 - c[1]],       // +Z
  (c) => [1 - c[0], 1 - c[1]],   // -Z
];

// Greedy shelf packer over the 64x64 skin. Tallest first, or the shelves waste space.
function packParts(parts) {
  let x = 0, y = 0, shelf = 0;
  const shared = {};
  const unwrap = p => boxUnwrapSize(p.size[0], p.size[1], p.size[2]);
  const order = parts.slice().sort((a, b) => unwrap(b)[1] - unwrap(a)[1]);
  for (const p of order) {
    const key = p.share;
    if (key && shared[key]) { p.uv = shared[key]; continue; }
    const [w, h] = unwrap(p);
    if (x + w > MOB_TEX) { x = 0; y += shelf; shelf = 0; }
    if (y + h > MOB_TEX) throw new Error('skin does not fit: ' + p.id + ' (' + w + 'x' + h + ' at y=' + y + ')');
    p.uv = [x, y];
    if (key) shared[key] = p.uv;
    x += w; shelf = Math.max(shelf, h);
  }
}

function defineMob(id, def) {
  packParts(def.parts);
  for (const p of def.parts) {
    p.rects = boxRects(p.size[0], p.size[1], p.size[2], p.uv[0], p.uv[1]);
    p.pivot = p.pivot || [0, 0, 0];   // rotation point, offset from the box centre
  }
  // 24 vertices per part, positioned relative to the pivot
  def.template = def.parts.map(p => {
    const verts = [];
    const [sx, sy, sz] = p.size;
    for (let d = 0; d < 6; d++) {
      const rect = p.rects[FACE_KEY[d]], f = FACES[d], st = FACE_ST[d];
      for (let i = 0; i < 4; i++) {
        const c = f.v[i];
        const [s, t] = st(c);
        verts.push(
          (c[0] - 0.5) * sx - p.pivot[0],
          (c[1] - 0.5) * sy - p.pivot[1],
          (c[2] - 0.5) * sz - p.pivot[2],
          (rect[0] + s * rect[2]) / MOB_TEX,
          (rect[1] + t * rect[3]) / MOB_TEX,
          f.shade);
      }
    }
    return { id: p.id, anim: p.anim, verts: new Float32Array(verts),
             origin: [p.pos[0] + p.pivot[0], p.pos[1] + p.pivot[1], p.pos[2] + p.pivot[2]] };
  });
  def.id = id;
  def.layer = MOB_ORDER.length;
  MOB_TYPES[id] = def;
  MOB_ORDER.push(id);
}

// ---- skin painting -----------------------------------------------------
// Faces are shaded top-to-bottom and darkened at the edges, so a flat box of
// colour reads as something rounded rather than a sticker.
function makeSkinPainter(seed) {
  const data = new Uint8Array(MOB_TEX * MOB_TEX * 4);
  const rnd = mulberry32(seed);
  const put = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= MOB_TEX || y >= MOB_TEX) return;
    const i = ((y | 0) * MOB_TEX + (x | 0)) * 4;
    data[i] = clamp(r, 0, 255); data[i + 1] = clamp(g, 0, 255); data[i + 2] = clamp(b, 0, 255); data[i + 3] = 255;
  };
  const shadeAt = (col, f) => [col[0] * f, col[1] * f, col[2] * f];

  const api = {
    data, rnd,
    fill(col, noise = 0) {
      for (let y = 0; y < MOB_TEX; y++) for (let x = 0; x < MOB_TEX; x++) {
        const n = (rnd() - 0.5) * 2 * noise;
        put(x, y, col[0] + n, col[1] + n, col[2] + n);
      }
    },

    // One face: a soft vertical gradient, darker edges, a little grain.
    face(r, col, opts = {}) {
      const grain = opts.grain === undefined ? 5 : opts.grain;
      const top = opts.top === undefined ? 1.09 : opts.top;
      const bottom = opts.bottom === undefined ? 0.88 : opts.bottom;
      for (let y = 0; y < r[3]; y++) {
        const t = r[3] > 1 ? y / (r[3] - 1) : 0;
        let f = top + (bottom - top) * t;
        for (let x = 0; x < r[2]; x++) {
          const edge = (x === 0 || y === 0 || x === r[2] - 1 || y === r[3] - 1) ? 0.93 : 1;
          const n = (rnd() - 0.5) * 2 * grain;
          const c = shadeAt(col, f * edge);
          put(r[0] + x, r[1] + y, c[0] + n, c[1] + n, c[2] + n);
        }
      }
    },
    part(p, col, opts) {
      for (const k of FACE_KEY) api.face(p.rects[k], col, opts);
    },
    // Flat colour with no shading, for markings.
    rect(r, col, noise = 0, dx = 0, dy = 0, w = r[2], h = r[3]) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const n = (rnd() - 0.5) * 2 * noise;
        put(r[0] + dx + x, r[1] + dy + y, col[0] + n, col[1] + n, col[2] + n);
      }
    },
    dot(r, dx, dy, col) { put(r[0] + dx, r[1] + dy, col[0], col[1], col[2]); },
    blob(r, cx, cy, rad, col) {
      for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++)
        if (x * x + y * y <= rad * rad + 1) put(r[0] + cx + x, r[1] + cy + y, col[0], col[1], col[2]);
    },
    // An irregular patch, the way a cow's markings actually sit.
    patch(r, cx, cy, rad, col) {
      for (let y = -rad - 1; y <= rad + 1; y++) for (let x = -rad - 1; x <= rad + 1; x++) {
        const px = cx + x, py = cy + y;
        if (px < 0 || py < 0 || px >= r[2] || py >= r[3]) continue;
        const wobble = rad + (rnd() - 0.5) * 1.6;
        if (x * x + y * y <= wobble * wobble) {
          const n = (rnd() - 0.5) * 10;
          put(r[0] + px, r[1] + py, col[0] + n, col[1] + n, col[2] + n);
        }
      }
    },
    // A pair of eyes with a white and a highlight, which is what makes them read as alive.
    eyes(r, w, iris, opts = {}) {
      const y = opts.y === undefined ? Math.round(r[3] * 0.34) : opts.y;
      const inset = opts.inset === undefined ? 1 : opts.inset;
      const white = opts.white || [240, 240, 244];
      for (const side of [0, 1]) {
        const x = side ? r[2] - inset - w : inset;
        api.rect(r, white, 0, x, y, w, 2);
        const px = side ? x : x + w - 1;
        api.rect(r, iris, 0, px, y, 1, 2);
        api.dot(r, side ? x + w - 1 : x, y, [255, 255, 255]);
      }
    },
    // A soft band, for muzzles, belts and hooves.
    band(r, y, h, col, noise = 4) { api.rect(r, col, noise, 0, y, r[2], h); },
  };
  return api;
}

function buildMobSkins() {
  MOB_SKINS.length = 0;
  for (const id of MOB_ORDER) {
    const def = MOB_TYPES[id];
    const P = {};
    for (const p of def.parts) P[p.id] = p;
    const t = makeSkinPainter(0xA11A15 + def.layer * 7717);
    def.paint(t, P);
    MOB_SKINS.push(t.data);
  }
}

function defineAnimals() {
  MOB_ORDER.length = 0;

  defineMob('pig', {
    label: 'Pig', width: 0.9, height: 0.9, speed: 0.95, eyeH: 0.75,
    hp: 10, loot: () => [[I.PORKCHOP, 1, 2]],
    spawn: { plains: 1, forest: 1.2, snowy: 0.3 }, groupMax: 3, call: 'oink',
    parts: [
      { id: 'body', size: [10, 8, 16], pos: [0, 10, 0] },
      { id: 'head', size: [8, 8, 8], pos: [0, 11, -11], anim: 'head' },
      { id: 'snout', size: [4, 3, 1], pos: [0, 10, -15.5], anim: 'head' },
      { id: 'legFL', size: [4, 6, 4], pos: [-3, 3, -5], pivot: [0, 3, 0], anim: 'legA', share: 'leg' },
      { id: 'legFR', size: [4, 6, 4], pos: [3, 3, -5], pivot: [0, 3, 0], anim: 'legB', share: 'leg' },
      { id: 'legBL', size: [4, 6, 4], pos: [-3, 3, 5], pivot: [0, 3, 0], anim: 'legB', share: 'leg' },
      { id: 'legBR', size: [4, 6, 4], pos: [3, 3, 5], pivot: [0, 3, 0], anim: 'legA', share: 'leg' },
    ],
    paint(t, P) {
      const pink = [240, 158, 156], dark = [212, 124, 124], hoof = [156, 96, 98];
      t.fill(pink);
      t.part(P.body, pink);
      t.face(P.body.rects.ny, [224, 142, 140], { top: 0.98, bottom: 0.93 });     // belly
      t.part(P.head, pink);
      t.part(P.legFL, [234, 150, 148]);
      for (const k of ['nx', 'px', 'pz', 'nz']) {
        const r = P.legFL.rects[k];
        t.band(r, r[3] - 2, 2, hoof, 3);                                          // trotters
      }
      t.part(P.snout, dark);
      t.face(P.snout.rects.nz, [196, 106, 108], { top: 1.04, bottom: 0.96 });
      t.dot(P.snout.rects.nz, 1, 1, [88, 48, 52]);
      t.dot(P.snout.rects.nz, 2, 1, [88, 48, 52]);
      t.eyes(P.head.rects.nz, 2, [58, 40, 42], { y: 2 });
      const top = P.head.rects.py;                                                // ears
      t.patch(top, 1, 1, 1, dark);
      t.patch(top, top[2] - 2, 1, 1, dark);
    },
  });

  defineMob('cow', {
    label: 'Cow', width: 0.9, height: 1.4, speed: 0.8, eyeH: 1.2,
    hp: 10, loot: () => [[I.BEEF, 1, 2], [I.LEATHER, 1, 2]],
    spawn: { plains: 1.2, forest: 0.8, snowy: 0.5 }, groupMax: 4, call: 'moo',
    parts: [
      { id: 'body', size: [12, 10, 18], pos: [0, 17, 0] },
      { id: 'head', size: [8, 8, 6], pos: [0, 20, -12], anim: 'head' },
      { id: 'hornL', size: [1, 3, 1], pos: [-4.5, 25, -12], anim: 'head' },
      { id: 'hornR', size: [1, 3, 1], pos: [4.5, 25, -12], anim: 'head' },
      { id: 'legFL', size: [4, 12, 4], pos: [-4, 6, -6], pivot: [0, 6, 0], anim: 'legA', share: 'leg' },
      { id: 'legFR', size: [4, 12, 4], pos: [4, 6, -6], pivot: [0, 6, 0], anim: 'legB', share: 'leg' },
      { id: 'legBL', size: [4, 12, 4], pos: [-4, 6, 6], pivot: [0, 6, 0], anim: 'legB', share: 'leg' },
      { id: 'legBR', size: [4, 12, 4], pos: [4, 6, 6], pivot: [0, 6, 0], anim: 'legA', share: 'leg' },
    ],
    paint(t, P) {
      const hide = [78, 62, 48], white = [230, 228, 222], horn = [214, 198, 168];
      t.fill(hide);
      t.part(P.body, hide);
      for (const k of ['px', 'nx', 'py', 'pz']) {                                 // hide markings
        const r = P.body.rects[k];
        const n = 2 + ((t.rnd() * 2) | 0);
        for (let i = 0; i < n; i++) {
          t.patch(r, 2 + ((t.rnd() * (r[2] - 4)) | 0), 2 + ((t.rnd() * (r[3] - 4)) | 0), 2 + t.rnd() * 2, white);
        }
      }
      t.face(P.body.rects.ny, [96, 78, 62], { top: 0.96, bottom: 0.9 });
      t.patch(P.body.rects.ny, P.body.rects.ny[2] >> 1, P.body.rects.ny[3] - 4, 2, [206, 150, 148]);   // udder
      t.part(P.head, white);
      t.face(P.head.rects.py, hide);                                              // dark cap between the horns
      const f = P.head.rects.nz;
      t.rect(f, [198, 172, 162], 4, 1, f[3] - 4, f[2] - 2, 3);                     // muzzle
      t.dot(f, 2, f[3] - 3, [118, 92, 88]);
      t.dot(f, f[2] - 3, f[3] - 3, [118, 92, 88]);
      t.eyes(f, 2, [40, 32, 30], { y: 2 });
      t.part(P.hornL, horn); t.part(P.hornR, horn);
      t.part(P.legFL, [64, 52, 40]);
      for (const k of ['nx', 'px', 'pz', 'nz']) {
        const r = P.legFL.rects[k];
        t.band(r, r[3] - 3, 3, [222, 220, 214], 4);                                // white socks
      }
    },
  });

  defineMob('sheep', {
    label: 'Sheep', width: 0.9, height: 1.3, speed: 0.8, eyeH: 1.1, grazes: true,
    hp: 8, loot: () => [[I.MUTTON, 1, 2]],
    spawn: { plains: 1.4, forest: 0.7, snowy: 1 }, groupMax: 4, call: 'baa',
    parts: [
      { id: 'body', size: [8, 6, 16], pos: [0, 15, 1] },
      { id: 'wool', size: [11, 9, 18], pos: [0, 15, 1] },
      { id: 'head', size: [6, 6, 8], pos: [0, 18, -11], anim: 'head' },
      { id: 'legFL', size: [4, 12, 4], pos: [-3, 6, -5], pivot: [0, 6, 0], anim: 'legA', share: 'leg' },
      { id: 'legFR', size: [4, 12, 4], pos: [3, 6, -5], pivot: [0, 6, 0], anim: 'legB', share: 'leg' },
      { id: 'legBL', size: [4, 12, 4], pos: [-3, 6, 5], pivot: [0, 6, 0], anim: 'legB', share: 'leg' },
      { id: 'legBR', size: [4, 12, 4], pos: [3, 6, 5], pivot: [0, 6, 0], anim: 'legA', share: 'leg' },
    ],
    paint(t, P) {
      const wool = [238, 236, 231], clumpLight = [248, 247, 244], clumpDark = [212, 209, 202];
      const skin = [208, 198, 188], face = [226, 219, 210];
      t.fill(wool);
      t.part(P.wool, wool, { grain: 3, top: 1.06, bottom: 0.9 });
      for (const k of FACE_KEY) {                                                  // fleece clumps
        const r = P.wool.rects[k];
        for (let i = 0; i < 7; i++) {
          const c = t.rnd() < 0.5 ? clumpDark : clumpLight;
          t.patch(r, 1 + ((t.rnd() * (r[2] - 2)) | 0), 1 + ((t.rnd() * (r[3] - 2)) | 0), 1 + t.rnd(), c);
        }
      }
      t.part(P.body, skin);
      t.part(P.head, face);
      t.part(P.legFL, skin);
      for (const k of ['nx', 'px', 'pz', 'nz']) {
        const r = P.legFL.rects[k];
        t.band(r, r[3] - 3, 3, [72, 62, 56], 3);                                   // dark feet
      }
      const f = P.head.rects.nz;
      t.rect(f, [188, 178, 168], 3, 1, f[3] - 3, f[2] - 2, 2);                      // muzzle
      t.eyes(f, 1, [40, 34, 32], { y: 2 });
      t.patch(P.head.rects.py, 1, 2, 1, [206, 196, 186]);                           // ears
      t.patch(P.head.rects.py, P.head.rects.py[2] - 2, 2, 1, [206, 196, 186]);
    },
  });

  defineMob('chicken', {
    label: 'Chicken', width: 0.5, height: 0.8, speed: 1.05, eyeH: 0.7, flaps: true,
    hp: 4, loot: () => [[I.CHICKEN, 1, 1], [I.FEATHER, 1, 2]],
    spawn: { plains: 0.9, forest: 0.9, snowy: 0.4, desert: 0.5 }, groupMax: 4, call: 'cluck',
    parts: [
      { id: 'body', size: [6, 5, 8], pos: [0, 6.5, 0] },
      { id: 'head', size: [4, 5, 3], pos: [0, 11, -4], anim: 'head' },
      { id: 'beak', size: [4, 2, 2], pos: [0, 11, -6.5], anim: 'head' },
      { id: 'wattle', size: [2, 2, 2], pos: [0, 9, -6], anim: 'head' },
      { id: 'wingL', size: [1, 4, 6], pos: [-3.5, 7.5, 0], pivot: [0, 2, 0], anim: 'wingA' },
      { id: 'wingR', size: [1, 4, 6], pos: [3.5, 7.5, 0], pivot: [0, 2, 0], anim: 'wingB' },
      { id: 'legFL', size: [3, 4, 3], pos: [-1.6, 2, 0], pivot: [0, 2, 0], anim: 'legA', share: 'leg' },
      { id: 'legFR', size: [3, 4, 3], pos: [1.6, 2, 0], pivot: [0, 2, 0], anim: 'legB', share: 'leg' },
    ],
    paint(t, P) {
      const feather = [246, 246, 244], shadow = [216, 214, 210], beak = [240, 158, 50], comb = [200, 58, 54];
      t.fill(feather);
      t.part(P.body, feather, { grain: 4, top: 1.05, bottom: 0.86 });
      for (const k of ['px', 'nx']) {                                              // feather streaks
        const r = P.body.rects[k];
        for (let i = 0; i < 4; i++) {
          const y = 1 + ((t.rnd() * (r[3] - 2)) | 0);
          t.rect(r, shadow, 4, 1 + ((t.rnd() * 2) | 0), y, r[2] - 3, 1);
        }
      }
      t.part(P.head, feather);
      t.part(P.wingL, shadow, { top: 1.08, bottom: 0.85 });
      t.part(P.wingR, shadow, { top: 1.08, bottom: 0.85 });
      for (const w of [P.wingL, P.wingR]) {
        const r = w.rects.px;
        t.band(r, r[3] - 2, 2, [188, 186, 182], 3);
      }
      t.part(P.beak, beak);
      t.part(P.wattle, comb);
      t.part(P.legFL, beak);
      t.eyes(P.head.rects.nz, 1, [178, 44, 40], { y: 1 });
      t.rect(P.head.rects.py, comb, 4, 1, 0, 2, 2);
    },
  });

  // Villagers come in trades, and wear their trade on their apron.
  const PROFESSIONS = [
    ['farmer', 'Farmer', [118, 148, 60]],
    ['butcher', 'Butcher', [206, 206, 206]],
    ['toolsmith', 'Toolsmith', [88, 92, 104]],
    ['armourer', 'Armourer', [64, 74, 96]],
    ['mason', 'Mason', [150, 128, 96]],
  ];
  const HUMANOID = [
    { id: 'legL', size: [4, 12, 4], pos: [-2, 6, 0], pivot: [0, 6, 0], anim: 'legA', share: 'leg' },
    { id: 'legR', size: [4, 12, 4], pos: [2, 6, 0], pivot: [0, 6, 0], anim: 'legB', share: 'leg' },
    { id: 'body', size: [8, 12, 6], pos: [0, 18, 0] },
    { id: 'armL', size: [4, 12, 4], pos: [-6, 18, 0], pivot: [0, 5, 0], anim: 'legB', share: 'arm' },
    { id: 'armR', size: [4, 12, 4], pos: [6, 18, 0], pivot: [0, 5, 0], anim: 'legA', share: 'arm' },
    { id: 'head', size: [8, 10, 8], pos: [0, 29, 0], anim: 'head' },
    { id: 'nose', size: [2, 4, 2], pos: [0, 28, -5], anim: 'head' },
  ];
  for (const [key, label, apronColour] of PROFESSIONS) {
    defineMob('villager_' + key, {
      label, profession: key, width: 0.6, height: 1.95, speed: 0.7, eyeH: 1.7, homebody: true,
      hp: 12, loot: () => [], spawn: {}, groupMax: 3, call: 'hmm', villager: true,
      parts: HUMANOID.map(p => Object.assign({}, p)),
      paint(t, P) {
        const robe = [98, 70, 50], skin = [198, 162, 134], belt = [70, 50, 36];
        t.fill(robe);
        t.part(P.body, robe);
        for (const k of ['nz', 'pz']) t.rect(P.body.rects[k], apronColour, 6, 0, 5, 8, 7);
        for (const k of FACE_KEY) {
          const r = P.body.rects[k];
          t.band(r, Math.round(r[3] * 0.62), 1, belt, 2);                          // belt
        }
        t.part(P.legL, [64, 50, 38]);
        t.part(P.armL, robe);
        for (const k of ['nx', 'px', 'nz', 'pz']) {
          const r = P.armL.rects[k];
          t.band(r, r[3] - 3, 3, skin, 4);                                         // hands
        }
        t.part(P.head, skin);
        t.part(P.nose, [178, 140, 112]);
        t.face(P.head.rects.py, [80, 60, 44]);                                     // hair
        const f = P.head.rects.nz;
        t.band(f, 1, 2, [80, 60, 44], 4);                                          // fringe
        t.eyes(f, 2, [44, 48, 94], { y: 4 });
        t.rect(f, [172, 136, 110], 4, 2, 8, 4, 1);                                 // mouth line
      },
    });
  }

  defineMob('enderman', {
    label: 'Enderman', width: 0.6, height: 2.9, speed: 1.25, eyeH: 2.5,
    hp: 16, damage: 4, hostile: true,
    loot: () => [[I.ENDER_PEARL, 1, 1]],
    spawn: {}, groupMax: 2, call: 'groan',
    parts: [
      { id: 'legL', size: [2, 26, 2], pos: [-2, 13, 0], pivot: [0, 13, 0], anim: 'legA', share: 'leg' },
      { id: 'legR', size: [2, 26, 2], pos: [2, 13, 0], pivot: [0, 13, 0], anim: 'legB', share: 'leg' },
      { id: 'body', size: [8, 12, 4], pos: [0, 32, 0] },
      { id: 'armL', size: [2, 26, 2], pos: [-5, 32, 0], pivot: [0, 12, 0], anim: 'legB', share: 'arm' },
      { id: 'armR', size: [2, 26, 2], pos: [5, 32, 0], pivot: [0, 12, 0], anim: 'legA', share: 'arm' },
      { id: 'head', size: [8, 8, 8], pos: [0, 42, 0], anim: 'head' },
    ],
    paint(t, P) {
      const black = [22, 20, 28];
      t.fill(black);
      t.part(P.body, black, { top: 1.25, bottom: 0.8, grain: 3 });
      t.part(P.legL, black, { top: 1.2, bottom: 0.85, grain: 3 });
      t.part(P.armL, black, { top: 1.2, bottom: 0.85, grain: 3 });
      t.part(P.head, black, { top: 1.3, bottom: 0.85, grain: 3 });
      const f = P.head.rects.nz;
      t.rect(f, [188, 148, 236], 0, 1, 3, 6, 2);                    // the glowing band
      t.rect(f, [black[0], black[1], black[2]], 0, 3, 3, 2, 2);
      t.rect(f, [236, 214, 255], 0, 1, 3, 2, 2);
      t.rect(f, [236, 214, 255], 0, 5, 3, 2, 2);
    },
  });

  // The Ender Dragon: it circles the island and stoops at you.
  defineMob('dragon', {
    label: 'Ender Dragon', width: 4, height: 4, speed: 0, eyeH: 3,
    hp: 100, damage: 6, hostile: true, flies: true, boss: true,
    loot: () => [], spawn: {}, groupMax: 1, call: 'roar',
    parts: [
      { id: 'body', size: [20, 14, 36], pos: [0, 24, 0] },
      { id: 'neck', size: [8, 8, 18], pos: [0, 30, -26], share: 'seg' },
      { id: 'head', size: [16, 14, 20], pos: [0, 33, -46] },
      { id: 'jaw', size: [12, 4, 14], pos: [0, 25, -48] },
      { id: 'tail1', size: [8, 8, 18], pos: [0, 24, 26], share: 'seg' },
      { id: 'tail2', size: [8, 8, 18], pos: [0, 24, 44], share: 'seg' },
      { id: 'tail3', size: [8, 8, 18], pos: [0, 24, 62], share: 'seg' },
      { id: 'wingL', size: [36, 3, 20], pos: [-28, 31, 0], pivot: [18, 0, 0], anim: 'wingA', share: 'wing' },
      { id: 'wingR', size: [36, 3, 20], pos: [28, 31, 0], pivot: [-18, 0, 0], anim: 'wingB', share: 'wing' },
    ],
    paint(t, P) {
      const scale = [26, 22, 34], sheen = [58, 40, 82], membrane = [40, 32, 54];
      t.fill(scale);
      t.part(P.body, scale, { top: 1.35, bottom: 0.75, grain: 4 });
      t.part(P.neck, scale, { top: 1.3, bottom: 0.8, grain: 4 });
      t.part(P.head, scale, { top: 1.35, bottom: 0.8, grain: 4 });
      t.part(P.jaw, [34, 28, 42], { top: 1.2, bottom: 0.85 });
      t.part(P.wingL, membrane, { top: 1.4, bottom: 0.7, grain: 3 });
      for (const k of ['py', 'ny']) {                                  // ribs across the wing
        const r = P.wingL.rects[k];
        for (let i = 1; i < 5; i++) t.rect(r, [24, 20, 32], 0, Math.round(r[2] * i / 5), 0, 1, r[3]);
      }
      for (const k of FACE_KEY) {                                      // a purple sheen along the back
        const r = P.body.rects[k];
        for (let i = 0; i < 5; i++) {
          t.patch(r, 2 + ((t.rnd() * (r[2] - 4)) | 0), 1 + ((t.rnd() * 3) | 0), 1 + t.rnd(), sheen);
        }
      }
      const f = P.head.rects.nz;
      t.rect(f, [214, 96, 234], 0, 2, 3, 3, 2);                        // eyes
      t.rect(f, [214, 96, 234], 0, f[2] - 5, 3, 3, 2);
      t.rect(f, [255, 190, 255], 0, 3, 3, 1, 1);
      t.rect(f, [255, 190, 255], 0, f[2] - 4, 3, 1, 1);
    },
  });

  // The one thing out there that wants you dead.
  defineMob('zombie', {
    label: 'Zombie', width: 0.6, height: 1.95, speed: 1.05, eyeH: 1.7,
    hp: 20, damage: 3, hostile: true, burnsInSun: true,
    loot: () => [[I.ROTTEN_FLESH, 1, 2]],
    spawn: {}, groupMax: 3, call: 'groan',
    parts: HUMANOID.slice(0, 6).map(p => Object.assign({}, p,
      p.id === 'armL' || p.id === 'armR' ? { anim: p.id === 'armL' ? 'armA' : 'armB' } : {})),
    paint(t, P) {
      const flesh = [92, 142, 84], shirt = [58, 132, 130], trousers = [56, 62, 122], hair = [50, 66, 44];
      t.fill(flesh);
      t.part(P.body, shirt);
      t.part(P.legL, trousers);
      for (const k of ['nx', 'px', 'nz', 'pz']) {
        const r = P.legL.rects[k];
        t.band(r, r[3] - 3, 3, [72, 76, 92], 4);                                   // shoes
      }
      t.part(P.armL, shirt);
      for (const k of ['nx', 'px', 'nz', 'pz']) {
        const r = P.armL.rects[k];
        t.band(r, r[3] - 4, 4, flesh, 5);                                          // bare forearms
      }
      t.part(P.head, flesh);
      t.face(P.head.rects.py, hair);
      const f = P.head.rects.nz;
      t.band(f, 1, 2, hair, 4);
      // sunken black eyes, no whites
      t.rect(f, [26, 34, 24], 0, 1, 4, 2, 2);
      t.rect(f, [26, 34, 24], 0, f[2] - 3, 4, 2, 2);
      t.rect(f, [70, 112, 66], 0, 2, 8, 4, 1);                                     // grim mouth
      for (let i = 0; i < 10; i++) {                                               // rot
        const r = P.body.rects[['nx', 'px', 'nz', 'pz'][(t.rnd() * 4) | 0]];
        t.patch(r, 1 + ((t.rnd() * (r[2] - 2)) | 0), 1 + ((t.rnd() * (r[3] - 2)) | 0), 1, [46, 100, 52]);
      }
    },
  });
}

// ---- the animals themselves -------------------------------------------
const GRAVITY_MOB = 26;
const VILLAGER_TYPES = ['villager_farmer', 'villager_butcher', 'villager_toolsmith', 'villager_armourer', 'villager_mason'];

class Mob {
  constructor(type, x, y, z, yaw) {
    this.type = type;
    this.def = MOB_TYPES[type];
    this.x = x; this.y = y; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = yaw === undefined ? Math.random() * Math.PI * 2 : yaw;
    this.targetYaw = this.yaw;
    this.onGround = false;
    this.walking = false;
    this.walkPhase = Math.random() * 6;
    this.headPitch = 0;
    this.grazing = 0;
    this.think = Math.random() * 3;
    this.callTimer = 6 + Math.random() * 14;
    this.dead = false;
    this.hurt = 0;
    this.sheared = false;
    this.hp = this.def.hp || 8;
    this.home = [x, z];
    this.sky = 1; this.blk = 0;   // light where it stands, sampled each update
    this.swing = 0; this.airborne = false;
  }

  get halfW() { return this.def.width / 2; }

  collides(world, x, y, z) {
    const hw = this.halfW, h = this.def.height;
    const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw);
    const y0 = Math.floor(y), y1 = Math.floor(y + h - 0.001);
    const z0 = Math.floor(z - hw), z1 = Math.floor(z + hw);
    for (let yy = y0; yy <= y1; yy++)
      for (let zz = z0; zz <= z1; zz++)
        for (let xx = x0; xx <= x1; xx++)
          if (isSolid(world.getBlock(xx, yy, zz))) return true;
    return false;
  }

  moveAxis(world, axis, amount) {
    if (!amount) return false;
    const before = axis === 0 ? this.x : axis === 1 ? this.y : this.z;
    const set = v => { if (axis === 0) this.x = v; else if (axis === 1) this.y = v; else this.z = v; };
    set(before + amount);
    if (this.collides(world, this.x, this.y, this.z)) {
      set(before);
      if (axis === 1) {
        if (amount < 0) this.onGround = true;
        const step = amount > 0 ? 0.02 : -0.02;   // settle flush against the surface
        for (let i = 0; i < 30; i++) {
          this.y += step;
          if (this.collides(world, this.x, this.y, this.z)) { this.y -= step; break; }
        }
        this.vy = 0;
      }
      return true;    // blocked
    }
    return false;
  }

  update(dt, world, player) {
    if (this.def.bot) return (this.def.arena === 'hunger' ? Hunger : BedWars).botUpdate(this, dt, world, player);
    if (this.def.flies) return this.flyUpdate(dt, world, player);
    const inWater = isLiquid(world.getBlock(Math.floor(this.x), Math.floor(this.y + 0.1), Math.floor(this.z)));

    // --- decide what to do
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 2 + Math.random() * 5;
      if (Math.random() < 0.38) {
        this.walking = false;
        if (this.def.grazes && Math.random() < 0.5) this.grazing = 2 + Math.random() * 3;
      } else {
        this.walking = true;
        this.grazing = 0;
        this.targetYaw = Math.random() * Math.PI * 2;
      }
    }
    if (this.grazing > 0) { this.grazing -= dt; this.walking = false; }
    this.headPitch += ((this.grazing > 0 ? 1.15 : 0) - this.headPitch) * Math.min(1, dt * 4);

    // hostiles come for you
    if (this.def.hostile) {
      this.attackCd = Math.max(0, (this.attackCd || 0) - dt);
      const dx = player.pos[0] - this.x, dy = player.pos[1] - this.y, dz = player.pos[2] - this.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 26) {
        this.walking = true;
        this.think = 1;
        this.grazing = 0;
        this.targetYaw = Math.atan2(dx, -dz);
        this.yaw += clamp(this.targetYaw - this.yaw, -6 * dt, 6 * dt);
        if (dist < 1.9 && Math.abs(dy) < 2.2 && this.attackCd <= 0 && player.damage) {
          this.attackCd = 1;
          if (player.damage(this.def.damage, 'a zombie')) {
            const push = 4.5 / Math.max(0.6, dist);
            player.vel[0] += dx * push; player.vel[2] += dz * push; player.vel[1] = 3.4;
          }
          Sound.animal(this.def.call, 1);
        }
      }
      // daylight is fatal
      if (this.def.burnsInSun && Animals.isDay && world.getSky(Math.floor(this.x), Math.floor(this.y + 1), Math.floor(this.z)) >= 14) {
        this.burning = (this.burning || 0) + dt;
        if (this.burning > 1) {
          this.burning = 0;
          this.hp -= 2;
          this.hurt = 0.3;
          if (this.hp <= 0) Animals.kill(this, world);
        }
      } else this.burning = 0;
    }

    // villagers keep near home
    if (this.def.homebody && this.walking) {
      const dx = this.home[0] - this.x, dz = this.home[1] - this.z;
      if (dx * dx + dz * dz > 400) this.targetYaw = Math.atan2(dx, -dz);
    }

    // turn towards the heading we picked
    let d = this.targetYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += clamp(d, -2.5 * dt, 2.5 * dt);

    // --- move
    const speed = this.def.speed * (inWater ? 0.5 : 1);
    const fx = this.walking ? Math.sin(this.yaw) * speed : 0;
    const fz = this.walking ? -Math.cos(this.yaw) * speed : 0;
    const blend = 1 - Math.exp(-(this.onGround ? 12 : 3) * dt);
    this.vx += (fx - this.vx) * blend;
    this.vz += (fz - this.vz) * blend;

    if (inWater) {
      this.vy += (1.6 - this.vy) * Math.min(1, dt * 4);          // float
    } else {
      const terminal = this.def.flaps ? 3.2 : 45;                 // chickens glide down
      this.vy -= GRAVITY_MOB * dt;
      if (this.vy < -terminal) this.vy = -terminal;
    }

    const wasGround = this.onGround;
    this.onGround = false;
    const steps = Math.max(1, Math.ceil(Math.hypot(this.vx, this.vy, this.vz) * dt / 0.25));
    let blocked = false;
    for (let i = 0; i < steps; i++) {
      this.moveAxis(world, 1, this.vy * dt / steps);
      blocked = this.moveAxis(world, 0, this.vx * dt / steps) || blocked;
      blocked = this.moveAxis(world, 2, this.vz * dt / steps) || blocked;
    }

    // hop up single blocks, and turn away from ledges and water
    if (this.walking && this.onGround) {
      if (blocked) {
        const headroom = !isSolid(world.getBlock(Math.floor(this.x), Math.floor(this.y + this.def.height + 0.6), Math.floor(this.z)));
        if (headroom) this.vy = 7.4; else this.targetYaw = Math.random() * Math.PI * 2;
      }
      const ax = Math.floor(this.x + Math.sin(this.yaw) * 0.8);
      const az = Math.floor(this.z - Math.cos(this.yaw) * 0.8);
      const below = world.getBlock(ax, Math.floor(this.y) - 1, az);
      const below2 = world.getBlock(ax, Math.floor(this.y) - 3, az);
      if ((!isSolid(below) && !isSolid(below2)) || isLiquid(below)) {
        this.targetYaw = this.yaw + Math.PI * (0.6 + Math.random() * 0.8);
        this.walking = Math.random() < 0.5;
      }
    }
    if (!wasGround && this.onGround && this.vy < -8) this.vy = 0;
    if (this.y < -8) this.dead = true;

    // --- animation and idle noises
    const hspeed = Math.hypot(this.vx, this.vz);
    this.walkPhase += dt * (hspeed * 5.5 + (this.def.flaps && !this.onGround ? 14 : 0));
    this.swing = Math.min(1, hspeed / this.def.speed);
    this.airborne = !this.onGround && !inWater;
    if (this.hurt > 0) this.hurt -= dt;

    const l = world.getLight(Math.floor(this.x), Math.floor(this.y + this.def.height * 0.6), Math.floor(this.z));
    this.sky = (l >> 4) / 15; this.blk = (l & 15) / 15;

    this.callTimer -= dt;
    if (this.callTimer <= 0) {
      this.callTimer = 9 + Math.random() * 16;
      const dist = Math.hypot(this.x - player.pos[0], this.y - player.pos[1], this.z - player.pos[2]);
      if (dist < 26) Sound.animal(this.def.call, clamp(1 - dist / 26, 0.05, 1));
    }
  }

  // The dragon never touches the ground: it circles the island, and every so
  // often it puts its head down and comes for you.
  flyUpdate(dt, world, player) {
    if (this.baseY === undefined) this.baseY = this.y;
    this.orbit = (this.orbit || 0) + dt * 0.3;
    this.attackCd = Math.max(0, (this.attackCd || 0) - dt);
    this.diveCd = (this.diveCd === undefined ? 6 : this.diveCd) - dt;
    this.diving = Math.max(0, (this.diving || 0) - dt);

    const toPlayer = Math.hypot(player.pos[0] - this.x, player.pos[2] - this.z);
    let tx, ty, tz;
    if (this.diving > 0) {
      tx = player.pos[0]; ty = player.pos[1] + 1.5; tz = player.pos[2];
    } else {
      const R = 46;
      tx = Math.cos(this.orbit) * R;
      tz = Math.sin(this.orbit) * R;
      ty = this.baseY + Math.sin(this.orbit * 2) * 5;
      if (this.diveCd <= 0 && toPlayer < 90) {
        this.diving = 4.5; this.diveCd = 15;
        Sound.animal(this.def.call, 1);
      }
    }
    const dx = tx - this.x, dy = ty - this.y, dz = tz - this.z;
    const d = Math.max(0.001, Math.hypot(dx, dy, dz));
    const sp = this.diving > 0 ? 15 : 9;
    const blend = Math.min(1, dt * 1.5);
    this.vx += ((dx / d) * sp - this.vx) * blend;
    this.vy += ((dy / d) * sp - this.vy) * blend;
    this.vz += ((dz / d) * sp - this.vz) * blend;
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    this.yaw = Math.atan2(this.vx, -this.vz);
    this.walkPhase += dt * (this.diving > 0 ? 3.4 : 2.2);
    this.swing = 1;
    this.onGround = false;

    if (Math.hypot(player.pos[0] - this.x, player.pos[1] - this.y, player.pos[2] - this.z) < 4.5
        && this.attackCd <= 0 && player.damage) {
      this.attackCd = 1.5;
      if (player.damage(this.def.damage, 'the dragon')) {
        const px = player.pos[0] - this.x, pz = player.pos[2] - this.z;
        const push = 7 / Math.max(1, Math.hypot(px, pz));
        player.vel[0] += px * push; player.vel[2] += pz * push; player.vel[1] = 6;
      }
    }

    // the crystals on the pillars keep it whole
    this.healTick = (this.healTick || 0) + dt;
    if (this.healTick > 1) {
      this.healTick = 0;
      if (Animals.crystalsLeft(world) > 0 && this.hp < this.def.hp) this.hp = Math.min(this.def.hp, this.hp + 2);
    }
    if (this.hurt > 0) this.hurt -= dt;
    const l = world.getLight(Math.floor(this.x), Math.floor(clamp(this.y, 0, CY - 1)), Math.floor(this.z));
    this.sky = (l >> 4) / 15; this.blk = (l & 15) / 15;
  }

  // rotation applied to an animated part, in radians about its pivot
  partAngle(part) {
    switch (part.anim) {
      case 'legA': return Math.sin(this.walkPhase) * 0.95 * this.swing;
      case 'legB': return -Math.sin(this.walkPhase) * 0.95 * this.swing;
      case 'wingA': case 'wingB': return 0;
      case 'armA': return -1.45 + Math.sin(this.walkPhase) * 0.12;      // arms out, zombie-fashion
      case 'armB': return -1.45 - Math.sin(this.walkPhase) * 0.12;
      case 'head': return -this.headPitch;
      default: return 0;
    }
  }
  partRoll(part) {
    if (!part.anim) return 0;
    if (this.def.flies) {
      const beat = Math.sin(this.walkPhase) * 0.55 - 0.15;
      if (part.anim === 'wingA') return -beat;
      if (part.anim === 'wingB') return beat;
      return 0;
    }
    if (!this.def.flaps) return 0;
    const flap = this.airborne ? Math.sin(this.walkPhase) * 0.9 - 0.5 : 0;
    if (part.anim === 'wingA') return -flap;
    if (part.anim === 'wingB') return flap;
    return 0;
  }

  aabb() {
    const hw = this.halfW;
    return [this.x - hw, this.y, this.z - hw, this.x + hw, this.y + this.def.height, this.z + hw];
  }
}

// ---- the herd ----------------------------------------------------------
const Animals = {
  list: [],
  cap: 26,
  hostileCap: 12,
  isDay: true,
  spawnTimer: 2,
  seeded: false,

  reset() { this.list.length = 0; this.seeded = false; },

  // Put a first herd around the player as soon as the world is ready.
  seed(world, player, viewDist) {
    if (this.seeded) return;
    this.seeded = true;
    for (let i = 0; i < 10 && this.list.length < this.cap; i++) this.trySpawn(world, player, viewDist);
  },

  update(dt, world, player, viewDist, isDay) {
    this.isDay = isDay === undefined ? true : isDay;
    for (const m of this.list) m.update(dt, world, player);
    const maxD = viewDist * CX + 26;
    this.list = this.list.filter(m => {
      if (m.dead) return false;
      if (m.def.bot) return true;              // match bots live until the match kills them
      if (Math.abs(m.x - player.pos[0]) > maxD || Math.abs(m.z - player.pos[2]) > maxD) return false;
      return !!world.getChunk(Math.floor(m.x) >> 4, Math.floor(m.z) >> 4);
    });
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.3;
      if (this.list.length < this.cap) this.trySpawn(world, player, viewDist);
    }
    this.hostileTimer = (this.hostileTimer || 0) - dt;
    if (this.hostileTimer <= 0) {
      this.hostileTimer = 2;
      const hostiles = this.list.reduce((n, m) => n + (m.def.hostile ? 1 : 0), 0);
      if (hostiles < this.hostileCap) this.trySpawnHostile(world, player, viewDist);
    }
  },

  // Zombies want somewhere dark: a cave, or the surface after sunset.
  trySpawnHostile(world, player, viewDist) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const r = 14 + Math.random() * Math.max(10, (viewDist - 4) * CX - 14);
      const x = Math.floor(player.pos[0] + Math.cos(a) * r);
      const z = Math.floor(player.pos[2] + Math.sin(a) * r);
      if (!world.getChunk(x >> 4, z >> 4)) continue;
      const top = world.column(x, z).h + 1;
      const y = 5 + Math.floor(Math.random() * Math.max(1, top - 4));
      if (!isSolid(world.getBlock(x, y - 1, z))) continue;
      if (world.getBlock(x, y, z) !== 0 || world.getBlock(x, y + 1, z) !== 0) continue;
      const sky = this.isDay ? world.getSky(x, y, z) : 0;
      if (Math.max(sky, world.getBlockLight(x, y, z)) > 7) continue;
      const n = 1 + Math.floor(Math.random() * 2);
      const kind = (world.dimension === 'end' || Math.random() < 0.22) ? 'enderman' : 'zombie';
      for (let i = 0; i < n; i++) this.list.push(new Mob(kind, x + 0.5 + i * 0.6, y, z + 0.5, Math.random() * 6.28));
      return;
    }
  },

  // A column an animal of this size can actually stand in: grass under it, clear above.
  groundAt(world, bx, bz, def) {
    if (!world.getChunk(bx >> 4, bz >> 4)) return -1;
    const info = world.column(bx, bz);
    const ground = world.getBlock(bx, info.h, bz);
    if (ground !== B.GRASS && ground !== B.SNOW) return -1;
    const y = info.h + 1;
    const need = Math.max(1, Math.ceil(def.height));
    for (let i = 0; i < need; i++) if (world.getBlock(bx, y + i, bz) !== 0) return -1;
    return y;
  },

  // Spawn a small herd on grass, in the ring of loaded chunks around the player.
  trySpawn(world, player, viewDist) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const r = 24 + Math.random() * Math.max(16, (viewDist - 3) * CX - 24);   // 24 blocks out to the fog
      const x = Math.floor(player.pos[0] + Math.cos(a) * r);
      const z = Math.floor(player.pos[2] + Math.sin(a) * r);
      if (!world.getChunk(x >> 4, z >> 4)) continue;
      const info = world.column(x, z);

      let type;
      if (world.villageNear && world.villageNear(x, z) && Math.random() < 0.75) {
        // the village looks after its own
        type = VILLAGER_TYPES[(Math.random() * VILLAGER_TYPES.length) | 0];
      } else {
        const weights = [];
        let total = 0;
        for (const id of MOB_ORDER) {
          const w = MOB_TYPES[id].spawn[info.biome] || 0;
          weights.push(w); total += w;
        }
        if (total <= 0) continue;
        let pick = Math.random() * total;
        type = MOB_ORDER[0];
        for (let i = 0; i < MOB_ORDER.length; i++) { pick -= weights[i]; if (pick <= 0) { type = MOB_ORDER[i]; break; } }
      }
      const def = MOB_TYPES[type];

      const y = this.groundAt(world, x, z, def);
      if (y < 0 || world.getSky(x, y, z) < 8) continue;

      const n = 1 + Math.floor(Math.random() * def.groupMax);
      const yaw = Math.random() * Math.PI * 2;
      this.list.push(new Mob(type, x + 0.5, y, z + 0.5, yaw));
      for (let i = 1; i < n && this.list.length < this.cap; i++) {
        const bx = x + Math.round(Math.random() * 5 - 2.5);
        const bz = z + Math.round(Math.random() * 5 - 2.5);
        const gy = this.groundAt(world, bx, bz, def);
        if (gy < 0) continue;
        this.list.push(new Mob(type, bx + 0.5, gy, bz + 0.5, yaw));
      }
      return;
    }
  },

  // How many crystals still stand on the pillars.
  crystalsLeft(world) {
    let n = 0;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const px = Math.round(Math.cos(a) * 74), pz = Math.round(Math.sin(a) * 74);
      for (let y = CY - 1; y > 40; y--) {
        if (world.getBlock(px, y, pz) === B.END_CRYSTAL) { n++; break; }
      }
    }
    return n;
  },

  boss() { return this.list.find(m => m.def.boss) || null; },

  // Closest animal along a ray, for punching.
  pick(origin, dir, maxDist) {
    let best = null, bestT = maxDist;
    for (const m of this.list) {
      const b = m.aabb();
      let t0 = 0, t1 = bestT, hit = true;
      for (let a = 0; a < 3; a++) {
        const o = origin[a], d = dir[a];
        if (Math.abs(d) < 1e-6) { if (o < b[a] || o > b[a + 3]) { hit = false; break; } continue; }
        let ta = (b[a] - o) / d, tb = (b[a + 3] - o) / d;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        if (t0 > t1) { hit = false; break; }
      }
      if (hit && t0 >= 0 && t0 < bestT) { bestT = t0; best = m; }
    }
    return best;
  },

  // A hit: shears a sheep, knocks the animal back, and can kill it.
  punch(mob, dir, damage = 1, world) {
    if (mob.type === 'sheep' && !mob.sheared) {
      mob.sheared = true;
      this.drop(world, mob, B.WOOL, 1 + Math.floor(Math.random() * 2));
    }
    mob.vx += dir[0] * 7; mob.vz += dir[2] * 7; mob.vy = 5.4;
    mob.hurt = 0.4;
    mob.walking = true; mob.think = 1.5;
    mob.targetYaw = Math.atan2(dir[0], -dir[2]);
    mob.hp -= damage;
    if (mob.hp <= 0) { this.kill(mob, world); return { killed: true, drops: mob.lastDrops }; }
    Sound.animal(mob.def.call, 1);
    return { killed: false };
  },

  // Loot falls where the animal did, to be picked up.
  drop(world, mob, id, n) {
    if (typeof Drops !== 'undefined' && world) Drops.spawn(world, mob.x, mob.y + 0.5, mob.z, id, n, 0.6);
    else Inventory.add(id, n);
  },

  kill(mob, world) {
    if (mob.dead) return;
    mob.dead = true;
    const drops = [];
    for (const [id, min, max] of (mob.def.loot ? mob.def.loot() : [])) {
      const n = min + Math.floor(Math.random() * (max - min + 1));
      if (n > 0) { this.drop(world, mob, id, n); drops.push([id, n]); }
    }
    mob.lastDrops = drops;
    Sound.animal(mob.def.call, 1);
    Sound.burst({ dur: 0.2, freq: 240, gain: 0.4, sweep: 0.3 });
  },
};
