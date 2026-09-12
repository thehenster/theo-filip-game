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

  // ---- the age of the dinosaurs ----------------------------------------
  defineMob('stegosaurus', {
    label: 'Stegosaurus', width: 1.4, height: 1.9, speed: 0.7, eyeH: 1.5, grazes: true,
    hp: 30, loot: () => [[I.BEEF, 2, 4], [I.LEATHER, 1, 3]],
    spawn: { jungle: 1.5 }, groupMax: 3, call: 'moo',
    parts: [
      { id: 'body', size: [12, 12, 24], pos: [0, 18, 0] },
      { id: 'neck', size: [6, 6, 8], pos: [0, 18, -15] },
      { id: 'head', size: [6, 5, 8], pos: [0, 16, -22], anim: 'head' },
      { id: 'tail', size: [6, 6, 16], pos: [0, 20, 18] },
      { id: 'plateA', size: [1, 7, 6], pos: [0, 29, -6] },
      { id: 'plateB', size: [1, 8, 6], pos: [0, 30, 1], share: 'plate' },
      { id: 'plateC', size: [1, 6, 6], pos: [0, 28, 8] },
      { id: 'legFL', size: [5, 12, 5], pos: [-4, 6, -8], pivot: [0, 6, 0], anim: 'legA', share: 'leg' },
      { id: 'legFR', size: [5, 12, 5], pos: [4, 6, -8], pivot: [0, 6, 0], anim: 'legB', share: 'leg' },
      { id: 'legBL', size: [5, 12, 5], pos: [-4, 6, 8], pivot: [0, 6, 0], anim: 'legB', share: 'leg' },
      { id: 'legBR', size: [5, 12, 5], pos: [4, 6, 8], pivot: [0, 6, 0], anim: 'legA', share: 'leg' },
    ],
    paint(t, P) {
      const hide = [96, 118, 74], belly = [138, 146, 104], plate = [176, 122, 66];
      t.fill(hide);
      t.part(P.body, hide, { top: 1.15, bottom: 0.82 });
      t.face(P.body.rects.ny, belly, { top: 0.98, bottom: 0.92 });
      t.part(P.neck, hide); t.part(P.tail, hide);
      t.part(P.head, hide);
      t.part(P.legFL, [82, 100, 62]);
      t.part(P.plateA, plate); t.part(P.plateB, plate); t.part(P.plateC, plate);
      for (const k of ['px', 'nx', 'py']) {                      // mottling along the flanks
        const r = P.body.rects[k];
        for (let i = 0; i < 6; i++) {
          t.patch(r, 2 + ((t.rnd() * (r[2] - 4)) | 0), 2 + ((t.rnd() * (r[3] - 4)) | 0), 1 + t.rnd(), [76, 96, 58]);
        }
      }
      t.eyes(P.head.rects.nz, 1, [40, 34, 26], { y: 1 });
    },
  });

  defineMob('raptor', {
    label: 'Raptor', width: 0.8, height: 1.5, speed: 1.9, eyeH: 1.35,
    hp: 16, damage: 4, hostile: true,
    loot: () => [[I.BEEF, 1, 2], [I.FEATHER, 1, 3]],
    spawn: { jungle: 1.1 }, groupMax: 4, call: 'cluck',
    parts: [
      { id: 'body', size: [6, 8, 14], pos: [0, 16, 0] },
      { id: 'neck', size: [4, 6, 4], pos: [0, 21, -8] },
      { id: 'head', size: [5, 5, 9], pos: [0, 23, -13], anim: 'head' },
      { id: 'jaw', size: [4, 2, 7], pos: [0, 20, -14], anim: 'head' },
      { id: 'tail', size: [4, 4, 16], pos: [0, 16, 13] },
      { id: 'armL', size: [2, 6, 2], pos: [-4, 16, -5], pivot: [0, 3, 0], anim: 'legB', share: 'arm' },
      { id: 'armR', size: [2, 6, 2], pos: [4, 16, -5], pivot: [0, 3, 0], anim: 'legA', share: 'arm' },
      { id: 'legL', size: [4, 12, 5], pos: [-3, 6, 2], pivot: [0, 6, 0], anim: 'legA', share: 'leg' },
      { id: 'legR', size: [4, 12, 5], pos: [3, 6, 2], pivot: [0, 6, 0], anim: 'legB', share: 'leg' },
    ],
    paint(t, P) {
      const hide = [148, 106, 62], stripe = [92, 62, 38], belly = [196, 172, 128];
      t.fill(hide);
      t.part(P.body, hide, { top: 1.14, bottom: 0.84 });
      t.face(P.body.rects.ny, belly, { top: 0.98, bottom: 0.93 });
      t.part(P.neck, hide); t.part(P.tail, hide); t.part(P.head, hide);
      t.part(P.jaw, [166, 126, 84]);
      t.part(P.legL, hide); t.part(P.armL, hide);
      for (const k of ['px', 'nx']) {                            // tiger stripes down the flanks
        const r = P.body.rects[k];
        for (let i = 1; i < 5; i++) t.rect(r, stripe, 6, Math.round(r[2] * i / 5), 1, 1, r[3] - 2);
      }
      const f = P.head.rects.nz;
      t.eyes(f, 1, [212, 84, 40], { y: 1 });
      t.rect(P.jaw.rects.py, [244, 240, 232], 0, 1, 1, P.jaw.rects.py[2] - 2, 1);   // teeth
    },
  });

  defineMob('tyrannosaur', {
    label: 'Tyrannosaur', width: 1.8, height: 3.4, speed: 1.25, eyeH: 3,
    hp: 70, damage: 9, hostile: true,
    loot: () => [[I.BEEF, 4, 7], [I.LEATHER, 2, 4]],
    spawn: { jungle: 0.5 }, groupMax: 1, call: 'roar',
    parts: [
      { id: 'body', size: [14, 16, 26], pos: [0, 30, 0] },
      { id: 'neck', size: [8, 10, 8], pos: [0, 38, -15] },
      { id: 'head', size: [10, 10, 18], pos: [0, 42, -25], anim: 'head' },
      { id: 'jaw', size: [8, 4, 15], pos: [0, 36, -26], anim: 'head' },
      { id: 'tail', size: [8, 8, 24], pos: [0, 30, 24] },
      { id: 'armL', size: [2, 7, 2], pos: [-7, 30, -8], pivot: [0, 3, 0], anim: 'legB', share: 'arm' },
      { id: 'armR', size: [2, 7, 2], pos: [7, 30, -8], pivot: [0, 3, 0], anim: 'legA', share: 'arm' },
      { id: 'legL', size: [7, 20, 9], pos: [-5, 10, 3], pivot: [0, 10, 0], anim: 'legA', share: 'leg' },
      { id: 'legR', size: [7, 20, 9], pos: [5, 10, 3], pivot: [0, 10, 0], anim: 'legB', share: 'leg' },
    ],
    paint(t, P) {
      const hide = [86, 92, 78], back = [58, 64, 52], belly = [146, 142, 116];
      t.fill(hide);
      t.part(P.body, hide, { top: 1.2, bottom: 0.78 });
      t.face(P.body.rects.py, back);
      t.face(P.body.rects.ny, belly, { top: 0.98, bottom: 0.92 });
      t.part(P.neck, hide); t.part(P.tail, hide); t.part(P.head, hide);
      t.face(P.head.rects.py, back);
      t.part(P.jaw, [104, 108, 90]);
      t.part(P.legL, hide); t.part(P.armL, hide);
      for (const k of ['px', 'nx']) {
        const r = P.body.rects[k];
        for (let i = 0; i < 7; i++) {
          t.patch(r, 2 + ((t.rnd() * (r[2] - 4)) | 0), 1 + ((t.rnd() * (r[3] - 3)) | 0), 1 + t.rnd(), back);
        }
      }
      const f = P.head.rects.nz;
      t.eyes(f, 2, [230, 176, 40], { y: 2 });
      t.rect(P.jaw.rects.py, [246, 242, 232], 0, 1, 1, P.jaw.rects.py[2] - 2, 1);
      t.rect(P.head.rects.ny, [246, 242, 232], 0, 1, 1, P.head.rects.ny[2] - 2, 1);
    },
  });

  // ---- three more out of the age of the dinosaurs -------------------------
  defineMob('triceratops', {
    label: 'Triceratops', width: 1.6, height: 2.0, speed: 0.85, eyeH: 1.7, grazes: true,
    hp: 60, damage: 7, loot: () => [[I.BEEF, 3, 6], [I.LEATHER, 2, 4]],
    spawn: { jungle: 1.5, peaks: 0.4 }, groupMax: 2, call: 'groan',
    parts: [
      { id: 'body', size: [16, 16, 26], pos: [0, 20, 0] },
      { id: 'head', size: [12, 12, 12], pos: [0, 18, -19], anim: 'head' },
      { id: 'frill', size: [22, 20, 2], pos: [0, 22, -13], anim: 'head' },
      { id: 'hornL', size: [2, 8, 2], pos: [-4, 26, -24], anim: 'head' },
      { id: 'hornR', size: [2, 8, 2], pos: [4, 26, -24], anim: 'head' },
      { id: 'beak', size: [5, 4, 5], pos: [0, 14, -24], anim: 'head' },
      { id: 'tail', size: [7, 7, 12], pos: [0, 20, 18], pivot: [0, 0, -6], anim: 'legA' },
      { id: 'legFL', size: [5, 12, 5], pos: [-6, 6, -8], pivot: [0, 6, 0], anim: 'legA', share: 'leg' },
      { id: 'legFR', size: [5, 12, 5], pos: [6, 6, -8], pivot: [0, 6, 0], anim: 'legB', share: 'leg' },
      { id: 'legBL', size: [6, 12, 6], pos: [-6, 6, 9], pivot: [0, 6, 0], anim: 'legB', share: 'leg' },
      { id: 'legBR', size: [6, 12, 6], pos: [6, 6, 9], pivot: [0, 6, 0], anim: 'legA', share: 'leg' },
    ],
    paint(t, P) {
      const hide = [116, 128, 92], dark = [78, 88, 62], frill = [168, 96, 84], horn = [232, 224, 202];
      t.fill(hide);
      t.part(P.body, hide, { top: 1.2, bottom: 0.72 });
      t.part(P.head, hide);
      t.part(P.frill, frill, { top: 1.24, bottom: 0.8 });
      for (let i = 0; i < 14; i++) {                              // knobbles round the frill
        const r = P.frill.rects.nz;
        t.patch(r, 1 + ((t.rnd() * (r[2] - 2)) | 0), 1 + ((t.rnd() * (r[3] - 2)) | 0), 0, horn);
      }
      t.part(P.hornL, horn);
      t.part(P.beak, [206, 196, 172]);
      t.part(P.tail, hide);
      t.part(P.legFL, dark);
      for (let i = 0; i < 22; i++) {                              // scale mottling
        const r = P.body.rects[['nx', 'px', 'py'][(t.rnd() * 3) | 0]];
        t.patch(r, 1 + ((t.rnd() * (r[2] - 2)) | 0), 1 + ((t.rnd() * (r[3] - 2)) | 0), 1, dark);
      }
      t.eyes(P.head.rects.nz, 2, [222, 176, 60], { y: 2 });
    },
  });

  defineMob('pterodactyl', {
    label: 'Pterodactyl', width: 1.2, height: 1.0, speed: 1.7, eyeH: 0.8, flaps: true,
    hp: 14, damage: 4, hostile: true, loot: () => [[I.FEATHER, 2, 4], [I.CHICKEN, 1, 2]],
    spawn: { jungle: 0.9, peaks: 1.2 }, groupMax: 3, call: 'hiss',
    parts: [
      { id: 'body', size: [6, 6, 14], pos: [0, 8, 0] },
      { id: 'head', size: [5, 5, 6], pos: [0, 10, -9], anim: 'head' },
      { id: 'beak', size: [2, 2, 11], pos: [0, 9, -17], anim: 'head' },
      { id: 'crest', size: [1, 6, 7], pos: [0, 14, -8], anim: 'head' },
      { id: 'wingL', size: [22, 1, 12], pos: [-14, 10, 0], pivot: [11, 0, 0], anim: 'legA' },
      { id: 'wingR', size: [22, 1, 12], pos: [14, 10, 0], pivot: [-11, 0, 0], anim: 'legB' },
      { id: 'legL', size: [2, 5, 2], pos: [-2, 3, 3], pivot: [0, 3, 0], anim: 'legA', share: 'leg' },
      { id: 'legR', size: [2, 5, 2], pos: [2, 3, 3], pivot: [0, 3, 0], anim: 'legB', share: 'leg' },
    ],
    paint(t, P) {
      const hide = [138, 108, 78], wing = [110, 84, 62], crest = [206, 88, 62];
      t.fill(hide);
      t.part(P.body, hide, { top: 1.16, bottom: 0.78 });
      t.part(P.head, hide);
      t.part(P.beak, [226, 214, 186]);
      t.part(P.crest, crest);
      t.part(P.wingL, wing, { top: 1.1, bottom: 0.86 });
      for (const k of ['py', 'ny']) {                             // the fingers in the membrane
        const r = P.wingL.rects[k];
        for (let x = 2; x < r[2]; x += 4) t.rect(r, [72, 54, 40], 0, x, 0, 1, r[3]);
      }
      t.eyes(P.head.rects.nz, 1, [236, 196, 70], { y: 1 });
    },
  });

  defineMob('brachiosaurus', {
    label: 'Brachiosaurus', width: 2.4, height: 5.4, speed: 0.7, eyeH: 5.0, grazes: true,
    hp: 110, damage: 6, loot: () => [[I.BEEF, 6, 10], [I.LEATHER, 4, 7]],
    spawn: { jungle: 0.55 }, groupMax: 2, call: 'groan',
    parts: [
      { id: 'body', size: [20, 20, 34], pos: [0, 34, 0] },
      { id: 'neck', size: [8, 30, 8], pos: [0, 56, -14], pivot: [0, -15, 0], anim: 'head' },
      { id: 'head', size: [7, 7, 11], pos: [0, 74, -17], anim: 'head' },
      { id: 'tail', size: [9, 9, 26], pos: [0, 34, 28], pivot: [0, 0, -13], anim: 'legA' },
      { id: 'legFL', size: [7, 26, 7], pos: [-8, 13, -11], pivot: [0, 13, 0], anim: 'legA', share: 'leg' },
      { id: 'legFR', size: [7, 26, 7], pos: [8, 13, -11], pivot: [0, 13, 0], anim: 'legB', share: 'leg' },
      { id: 'legBL', size: [8, 24, 8], pos: [-8, 12, 12], pivot: [0, 12, 0], anim: 'legB', share: 'leg' },
      { id: 'legBR', size: [8, 24, 8], pos: [8, 12, 12], pivot: [0, 12, 0], anim: 'legA', share: 'leg' },
    ],
    paint(t, P) {
      const hide = [108, 122, 136], pale = [176, 186, 194], dark = [72, 84, 96];
      t.fill(hide);
      t.part(P.body, hide, { top: 1.22, bottom: 0.7 });
      t.face(P.body.rects.ny, pale, { top: 1, bottom: 0.94 });
      t.part(P.neck, hide);
      t.part(P.head, hide);
      t.part(P.tail, hide);
      t.part(P.legFL, dark);
      for (let i = 0; i < 26; i++) {                              // big soft blotches
        const r = P.body.rects[['nx', 'px', 'py'][(t.rnd() * 3) | 0]];
        t.patch(r, 1 + ((t.rnd() * (r[2] - 2)) | 0), 1 + ((t.rnd() * (r[3] - 2)) | 0), 2, dark);
      }
      t.eyes(P.head.rects.nz, 1, [40, 34, 30], { y: 1 });
    },
  });

  // ---- what is still walking about in the future -------------------------
  defineMob('sentry', {
    label: 'Sentry', width: 0.7, height: 1.85, speed: 1.05, eyeH: 1.6,
    hp: 26, damage: 5, hostile: true,
    loot: () => [[B.CIRCUIT, 1, 2], [I.IRON_INGOT, 1, 3]],
    spawn: { city: 0.75 }, groupMax: 2, call: 'beep',
    parts: [
      { id: 'legL', size: [4, 10, 4], pos: [-3, 5, 0], pivot: [0, 5, 0], anim: 'legA', share: 'leg' },
      { id: 'legR', size: [4, 10, 4], pos: [3, 5, 0], pivot: [0, 5, 0], anim: 'legB', share: 'leg' },
      { id: 'body', size: [10, 12, 6], pos: [0, 16, 0] },
      { id: 'armL', size: [3, 11, 3], pos: [-6, 16, 0], pivot: [0, 5, 0], anim: 'legB', share: 'arm' },
      { id: 'armR', size: [3, 11, 3], pos: [6, 16, 0], pivot: [0, 5, 0], anim: 'legA', share: 'arm' },
      { id: 'head', size: [8, 6, 8], pos: [0, 25, 0], anim: 'head' },
    ],
    paint(t, P) {
      const steel = [138, 144, 152], dark = [86, 90, 98], rust = [124, 88, 62];
      t.fill(steel);
      t.part(P.body, steel, { top: 1.16, bottom: 0.82 });
      t.part(P.legL, dark);
      t.part(P.armL, dark);
      t.part(P.head, steel);
      for (const k of FACE_KEY) {                                   // panel seams
        const r = P.body.rects[k];
        t.band(r, Math.round(r[3] * 0.45), 1, dark, 2);
      }
      for (let i = 0; i < 6; i++) {                                 // weathering
        const r = P.body.rects[['nx', 'px', 'nz', 'pz'][(t.rnd() * 4) | 0]];
        t.patch(r, 1 + ((t.rnd() * (r[2] - 2)) | 0), 1 + ((t.rnd() * (r[3] - 2)) | 0), 1, rust);
      }
      const f = P.head.rects.nz;
      t.rect(f, [24, 26, 30], 0, 1, 2, f[2] - 2, 2);                // the visor
      t.rect(f, [232, 64, 52], 0, 2, 2, 2, 2);                      // and the eye in it
      t.rect(f, [255, 150, 140], 0, 2, 2, 1, 1);
      t.rect(P.body.rects.nz, [92, 226, 140], 0, 4, 3, 2, 1);       // a status light
    },
  });

  defineMob('scrapbot', {
    label: 'Scrapbot', width: 0.6, height: 0.8, speed: 1.35, eyeH: 0.6,
    hp: 10, loot: () => [[B.CIRCUIT, 1, 1], [I.IRON_INGOT, 1, 2]],
    spawn: { city: 1.1 }, groupMax: 3, call: 'beep',
    parts: [
      { id: 'body', size: [8, 6, 10], pos: [0, 7, 0] },
      { id: 'head', size: [5, 4, 4], pos: [0, 11, -4], anim: 'head' },
      { id: 'legFL', size: [2, 4, 2], pos: [-3, 2, -3], pivot: [0, 2, 0], anim: 'legA', share: 'leg' },
      { id: 'legFR', size: [2, 4, 2], pos: [3, 2, -3], pivot: [0, 2, 0], anim: 'legB', share: 'leg' },
      { id: 'legBL', size: [2, 4, 2], pos: [-3, 2, 3], pivot: [0, 2, 0], anim: 'legB', share: 'leg' },
      { id: 'legBR', size: [2, 4, 2], pos: [3, 2, 3], pivot: [0, 2, 0], anim: 'legA', share: 'leg' },
    ],
    paint(t, P) {
      const shell = [176, 152, 84], dark = [92, 84, 60];
      t.fill(shell);
      t.part(P.body, shell, { top: 1.18, bottom: 0.8 });
      t.part(P.head, dark);
      t.part(P.legFL, dark);
      t.face(P.body.rects.py, [206, 184, 110]);
      for (const k of ['px', 'nx']) t.band(P.body.rects[k], 2, 1, dark, 2);
      t.rect(P.head.rects.nz, [96, 226, 236], 0, 1, 1, 3, 2);       // one wide blue eye
      t.rect(P.head.rects.nz, [230, 255, 255], 0, 1, 1, 1, 1);
    },
  });

  // ---- more of the overworld ---------------------------------------------
  defineMob('fox', {
    label: 'Fox', width: 0.7, height: 0.7, speed: 1.5, eyeH: 0.55,
    hp: 10, loot: () => [[I.LEATHER, 1, 1]],
    spawn: { forest: 1.1, snowy: 0.7, rocky: 0.5 }, groupMax: 2, call: 'oink',
    parts: [
      { id: 'body', size: [7, 6, 13], pos: [0, 8, 0] },
      { id: 'head', size: [7, 6, 6], pos: [0, 10, -9], anim: 'head' },
      { id: 'snout', size: [3, 3, 3], pos: [0, 9, -13], anim: 'head' },
      { id: 'earL', size: [2, 3, 1], pos: [-2, 14, -8], anim: 'head' },
      { id: 'earR', size: [2, 3, 1], pos: [2, 14, -8], anim: 'head' },
      { id: 'tail', size: [4, 4, 9], pos: [0, 9, 9], pivot: [0, 0, -4], anim: 'legA' },
      { id: 'legFL', size: [2, 6, 2], pos: [-2, 3, -4], pivot: [0, 3, 0], anim: 'legA', share: 'leg' },
      { id: 'legFR', size: [2, 6, 2], pos: [2, 3, -4], pivot: [0, 3, 0], anim: 'legB', share: 'leg' },
      { id: 'legBL', size: [2, 6, 2], pos: [-2, 3, 4], pivot: [0, 3, 0], anim: 'legB', share: 'leg' },
      { id: 'legBR', size: [2, 6, 2], pos: [2, 3, 4], pivot: [0, 3, 0], anim: 'legA', share: 'leg' },
    ],
    paint(t, P) {
      const rust = [206, 118, 56], cream = [242, 232, 216], dark = [58, 44, 38];
      t.fill(rust);
      t.part(P.body, rust, { top: 1.14, bottom: 0.8 });
      t.face(P.body.rects.ny, cream, { top: 1, bottom: 0.95 });
      t.part(P.head, rust);
      t.part(P.snout, cream);
      t.part(P.earL, dark);
      t.part(P.tail, rust);
      t.face(P.tail.rects.pz, cream);
      t.part(P.legFL, dark);
      t.eyes(P.head.rects.nz, 2, [40, 32, 30], { y: 2 });
      t.dot(P.snout.rects.nz, 1, 0, dark);
    },
  });

  defineMob('deer', {
    label: 'Deer', width: 0.9, height: 1.5, speed: 1.2, eyeH: 1.3, grazes: true,
    hp: 14, loot: () => [[I.BEEF, 1, 2], [I.LEATHER, 1, 2]],
    spawn: { forest: 1.0, plains: 0.6, rocky: 0.4 }, groupMax: 3, call: 'hmm',
    parts: [
      { id: 'body', size: [8, 9, 16], pos: [0, 16, 0] },
      { id: 'neck', size: [4, 8, 4], pos: [0, 22, -7], anim: 'head' },
      { id: 'head', size: [5, 5, 8], pos: [0, 26, -10], anim: 'head' },
      { id: 'antlerL', size: [1, 7, 5], pos: [-2, 31, -9], anim: 'head' },
      { id: 'antlerR', size: [1, 7, 5], pos: [2, 31, -9], anim: 'head' },
      { id: 'legFL', size: [3, 12, 3], pos: [-3, 6, -5], pivot: [0, 6, 0], anim: 'legA', share: 'leg' },
      { id: 'legFR', size: [3, 12, 3], pos: [3, 6, -5], pivot: [0, 6, 0], anim: 'legB', share: 'leg' },
      { id: 'legBL', size: [3, 12, 3], pos: [-3, 6, 5], pivot: [0, 6, 0], anim: 'legB', share: 'leg' },
      { id: 'legBR', size: [3, 12, 3], pos: [3, 6, 5], pivot: [0, 6, 0], anim: 'legA', share: 'leg' },
    ],
    paint(t, P) {
      const coat = [162, 116, 74], pale = [226, 210, 186], horn = [206, 188, 154];
      t.fill(coat);
      t.part(P.body, coat, { top: 1.16, bottom: 0.78 });
      t.face(P.body.rects.ny, pale, { top: 1, bottom: 0.95 });
      for (let i = 0; i < 12; i++) {                              // dapples along the flanks
        const r = P.body.rects[t.rnd() < 0.5 ? 'nx' : 'px'];
        t.patch(r, 1 + ((t.rnd() * (r[2] - 2)) | 0), 1 + ((t.rnd() * (r[3] - 2)) | 0), 0, pale);
      }
      t.part(P.neck, coat);
      t.part(P.head, coat);
      t.part(P.antlerL, horn);
      t.part(P.legFL, [124, 88, 58]);
      t.eyes(P.head.rects.nz, 1, [36, 30, 26], { y: 1 });
      t.rect(P.head.rects.nz, [60, 48, 44], 0, 1, 3, 3, 1);
    },
  });

  defineMob('bear', {
    label: 'Bear', width: 1.2, height: 1.5, speed: 1.05, eyeH: 1.3,
    hp: 34, damage: 6, hostile: true,
    loot: () => [[I.BEEF, 2, 4], [I.LEATHER, 2, 3]],
    spawn: { forest: 0.30, snowy: 0.34, rocky: 0.40 }, groupMax: 1, call: 'groan',
    parts: [
      { id: 'body', size: [12, 12, 18], pos: [0, 16, 0] },
      { id: 'head', size: [9, 8, 8], pos: [0, 19, -12], anim: 'head' },
      { id: 'snout', size: [5, 4, 3], pos: [0, 18, -16], anim: 'head' },
      { id: 'earL', size: [2, 3, 1], pos: [-3, 24, -11], anim: 'head' },
      { id: 'earR', size: [2, 3, 1], pos: [3, 24, -11], anim: 'head' },
      { id: 'legFL', size: [4, 10, 4], pos: [-4, 5, -6], pivot: [0, 5, 0], anim: 'legA', share: 'leg' },
      { id: 'legFR', size: [4, 10, 4], pos: [4, 5, -6], pivot: [0, 5, 0], anim: 'legB', share: 'leg' },
      { id: 'legBL', size: [4, 10, 4], pos: [-4, 5, 6], pivot: [0, 5, 0], anim: 'legB', share: 'leg' },
      { id: 'legBR', size: [4, 10, 4], pos: [4, 5, 6], pivot: [0, 5, 0], anim: 'legA', share: 'leg' },
    ],
    paint(t, P) {
      const fur = [92, 66, 48], dark = [58, 42, 32], muzzle = [156, 130, 102];
      t.fill(fur);
      t.part(P.body, fur, { top: 1.18, bottom: 0.72 });
      t.part(P.head, fur);
      t.part(P.snout, muzzle);
      t.part(P.earL, dark);
      t.part(P.legFL, dark);
      for (let i = 0; i < 16; i++) {
        const r = P.body.rects[['nx', 'px', 'py'][(t.rnd() * 3) | 0]];
        t.patch(r, 1 + ((t.rnd() * (r[2] - 2)) | 0), 1 + ((t.rnd() * (r[3] - 2)) | 0), 1, dark);
      }
      t.eyes(P.head.rects.nz, 1, [28, 22, 20], { y: 2 });
      t.dot(P.snout.rects.nz, 2, 0, [30, 26, 24]);
    },
  });

  // ---- Poseidon's guard, and Poseidon ------------------------------------
  // A guardian is mostly eye. It hangs in the water and does not much bother to
  // swim, and what it does at range is worse than what it does up close.
  defineMob('guardian', {
    label: 'Guardian', width: 0.9, height: 0.9, speed: 1.1, eyeH: 0.6,
    hp: 30, damage: 5, hostile: true, swims: true, glow: 0.3,
    loot: () => [[I.PRISMARINE_SHARD, 1, 3]],
    spawn: {}, groupMax: 3, call: 'hiss',
    parts: [
      { id: 'body', size: [12, 12, 12], pos: [0, 8, 0] },
      { id: 'finT', size: [2, 5, 8], pos: [0, 15, 2], anim: 'head' },
      { id: 'finB', size: [2, 5, 8], pos: [0, 1, 2], anim: 'head' },
      { id: 'tail', size: [3, 3, 8], pos: [0, 8, 9], pivot: [0, 0, -4], anim: 'legA' },
    ],
    paint(t, P) {
      const hide = [82, 138, 128], dark = [44, 84, 78], spine = [216, 230, 214];
      t.fill(hide);
      t.part(P.body, hide, { top: 1.2, bottom: 0.72 });
      t.part(P.tail, dark);
      t.part(P.finT, dark);
      for (const k of ['px', 'nx', 'py', 'ny', 'pz']) {                    // spines all over it
        const r = P.body.rects[k];
        for (let i = 0; i < 7; i++) {
          t.patch(r, 1 + ((t.rnd() * (r[2] - 2)) | 0), 1 + ((t.rnd() * (r[3] - 2)) | 0), 0, spine);
        }
      }
      const f = P.body.rects.nz;                                          // the eye
      t.rect(f, [236, 238, 230], 0, 3, 3, 6, 6);
      t.rect(f, [226, 92, 74], 0, 4, 4, 4, 4);
      t.rect(f, [20, 22, 26], 0, 5, 5, 2, 2);
      t.rect(f, [255, 255, 255], 0, 5, 5, 1, 1);
    },
  });

  // The man himself: green, enormous, and holding the thing you came for.
  defineMob('poseidon', {
    label: 'Poseidon', width: 1.2, height: 3.4, speed: 1.4, eyeH: 3.0,
    hp: 150, damage: 14, hostile: true, boss: true, swims: true, glow: 0.35,
    loot: () => [[I.TRIDENT, 1, 1], [I.HEART_OF_THE_SEA, 1, 1], [I.PRISMARINE_SHARD, 5, 9]],
    spawn: {}, groupMax: 1, call: 'groan',
    parts: [
      { id: 'legL', size: [6, 16, 6], pos: [-5, 8, 0], pivot: [0, 8, 0], anim: 'legA', share: 'leg' },
      { id: 'legR', size: [6, 16, 6], pos: [5, 8, 0], pivot: [0, 8, 0], anim: 'legB', share: 'leg' },
      { id: 'body', size: [16, 22, 9], pos: [0, 27, 0] },
      { id: 'armL', size: [5, 20, 5], pos: [-11, 30, 0], pivot: [0, 9, 0], anim: 'armA', share: 'arm' },
      { id: 'armR', size: [5, 20, 5], pos: [11, 30, 0], pivot: [0, 9, 0], anim: 'armB', share: 'arm' },
      { id: 'head', size: [10, 11, 10], pos: [0, 44, 0], anim: 'head' },
      { id: 'crown', size: [12, 3, 12], pos: [0, 51, 0], anim: 'head' },
    ],
    paint(t, P) {
      const skin = [96, 168, 152], deep = [56, 112, 106], gold = [232, 198, 88], beard = [206, 226, 218];
      t.fill(skin);
      t.part(P.body, skin, { top: 1.22, bottom: 0.7 });
      t.part(P.legL, deep);
      t.part(P.armL, skin);
      t.part(P.head, skin);
      t.part(P.crown, gold);
      for (const k of ['nx', 'px', 'nz', 'pz']) {                          // scales down the legs
        const r = P.legL.rects[k];
        for (let i = 0; i < 9; i++) t.patch(r, 1 + ((t.rnd() * (r[2] - 2)) | 0), 1 + ((t.rnd() * (r[3] - 2)) | 0), 0, [76, 150, 140]);
        t.band(P.body.rects[k], 12, 2, gold, 3);                           // a gold belt
      }
      const f = P.head.rects.nz;
      t.rect(f, beard, 0, 1, 6, f[2] - 2, 4);                              // the beard
      t.rect(f, skin, 0, 3, 6, f[2] - 6, 1);
      t.rect(f, [236, 240, 236], 0, 2, 3, 2, 2);                           // eyes
      t.rect(f, [236, 240, 236], 0, f[2] - 4, 3, 2, 2);
      t.rect(f, [30, 90, 120], 0, 2, 4, 1, 1);
      t.rect(f, [30, 90, 120], 0, f[2] - 3, 4, 1, 1);
      t.face(P.head.rects.py, beard);
      t.rect(P.crown.rects.nz, [255, 236, 150], 0, 1, 0, P.crown.rects.nz[2] - 2, 1);
    },
  });

  // ---- what is loose in the Hacker Dimension -----------------------------
  // Somebody in a black hoodie who should not have an account. Griefers go for
  // your blocks as much as they go for you.
  defineMob('griefer', {
    label: 'Griefer', width: 0.6, height: 1.95, speed: 1.25, eyeH: 1.7,
    hp: 24, damage: 5, hostile: true, griefer: true,
    loot: () => [[I.DATA_SHARD, 1, 3]],
    spawn: {}, groupMax: 2, call: 'groan',
    parts: HUMANOID.slice(0, 6).map(p => Object.assign({}, p)),
    paint(t, P) {
      const hood = [26, 28, 34], trim = [88, 226, 120], jeans = [40, 44, 56], skin = [16, 18, 22];
      t.fill(hood);
      t.part(P.body, hood, { top: 1.2, bottom: 0.72 });
      t.part(P.legL, jeans);
      t.part(P.armL, hood);
      t.part(P.head, hood);
      for (const k of ['nx', 'px', 'nz', 'pz']) {                 // the drawstrings and cuffs
        const r = P.armL.rects[k];
        t.band(r, r[3] - 3, 3, [20, 22, 28], 2);
        t.band(P.body.rects[k], 2, 1, trim, 2);
      }
      const f = P.head.rects.nz;
      t.rect(f, skin, 0, 1, 3, f[2] - 2, 4);                      // a face lost inside the hood
      t.rect(f, trim, 0, 2, 4, 2, 2);                             // two green points where eyes go
      t.rect(f, trim, 0, f[2] - 4, 4, 2, 2);
      t.rect(f, [240, 255, 240], 0, 2, 4, 1, 1);
      t.rect(f, [240, 255, 240], 0, f[2] - 4, 4, 1, 1);
      t.face(P.head.rects.py, [18, 20, 26]);
    },
  });

  // A thing the server keeps trying to draw and keeps getting wrong.
  defineMob('glitch', {
    label: 'Glitch', width: 0.7, height: 1.4, speed: 1.9, eyeH: 1.1,
    hp: 14, damage: 4, hostile: true, glitchy: true, glow: 0.6,
    loot: () => [[I.DATA_SHARD, 1, 2], [B.CORRUPT, 1, 1]],
    spawn: {}, groupMax: 3, call: 'beep',
    parts: [
      { id: 'legL', size: [4, 7, 4], pos: [-3, 4, 0], pivot: [0, 3, 0], anim: 'legA', share: 'leg' },
      { id: 'legR', size: [4, 7, 4], pos: [3, 4, 0], pivot: [0, 3, 0], anim: 'legB', share: 'leg' },
      { id: 'body', size: [9, 10, 5], pos: [0, 12, 0] },
      { id: 'armL', size: [3, 9, 3], pos: [-6, 13, 0], pivot: [0, 4, 0], anim: 'armA', share: 'arm' },
      { id: 'armR', size: [3, 9, 3], pos: [6, 13, 0], pivot: [0, 4, 0], anim: 'armB', share: 'arm' },
      { id: 'head', size: [8, 7, 8], pos: [0, 20, 0], anim: 'head' },
    ],
    paint(t, P) {
      const on = [232, 40, 232], off = [10, 10, 14];
      t.fill(off);
      // the missing-texture check, drawn straight onto the thing itself
      for (const part of [P.body, P.head, P.armL, P.legL]) {
        for (const k of FACE_KEY) {
          const r = part.rects[k];
          for (let y = 0; y < r[3]; y++) for (let x = 0; x < r[2]; x++) {
            const cell = (((x >> 1) + (y >> 1)) & 1) === 0;
            t.rect(r, cell ? on : off, 0, x, y, 1, 1);
          }
        }
      }
      const f = P.head.rects.nz;
      t.rect(f, [88, 226, 120], 0, 1, 2, f[2] - 2, 2);            // one green scanline for a face
      t.rect(f, [10, 10, 14], 0, 3, 5, f[2] - 6, 1);
    },
  });

  // ---- what lives in the Deep Lands -------------------------------------
  // The stalker has no eyes at all. It hangs off the ceiling listening, and only
  // comes down when there is enough noise to come down for.
  defineMob('stalker', {
    label: 'Sculk Stalker', width: 0.7, height: 1.5, speed: 2.0, eyeH: 1.2,
    hp: 22, damage: 6, hostile: true, deepStalker: true, glow: 0.42,
    loot: () => [[I.ECHO_SHARD, 1, 2]],
    spawn: {}, groupMax: 3, call: 'hiss',
    parts: [
      { id: 'legL', size: [3, 9, 3], pos: [-3, 5, 0], pivot: [0, 4, 0], anim: 'legA', share: 'leg' },
      { id: 'legR', size: [3, 9, 3], pos: [3, 5, 0], pivot: [0, 4, 0], anim: 'legB', share: 'leg' },
      { id: 'body', size: [8, 9, 5], pos: [0, 14, 0] },
      { id: 'armL', size: [3, 13, 3], pos: [-6, 15, 0], pivot: [0, 6, 0], anim: 'armA', share: 'arm' },
      { id: 'armR', size: [3, 13, 3], pos: [6, 15, 0], pivot: [0, 6, 0], anim: 'armB', share: 'arm' },
      { id: 'head', size: [7, 6, 7], pos: [0, 21, 0], anim: 'head' },
    ],
    paint(t, P) {
      const hide = [18, 30, 36], vein = [86, 224, 216];
      t.fill(hide);
      t.part(P.body, hide, { top: 1.2, bottom: 0.7 });
      t.part(P.legL, [12, 22, 28]);
      t.part(P.armL, [14, 26, 32]);
      t.part(P.head, hide);
      for (let i = 0; i < 22; i++) {                                 // sculk veins over the whole thing
        const part = [P.body, P.armL, P.head, P.legL][(t.rnd() * 4) | 0];
        const r = part.rects[['nx', 'px', 'nz', 'pz'][(t.rnd() * 4) | 0]];
        t.patch(r, 1 + ((t.rnd() * (r[2] - 2)) | 0), 1 + ((t.rnd() * (r[3] - 2)) | 0), 1, vein);
      }
      const f = P.head.rects.nz;
      t.rect(f, [8, 14, 18], 0, 1, 1, f[2] - 2, 3);                  // where the eyes would be, if it had any
      t.rect(f, vein, 0, 2, 4, f[2] - 4, 1);                         // a listening slit instead
      t.rect(f, [140, 246, 240], 0, (f[2] / 2) | 0, 4, 1, 1);
    },
  });

  // And the thing the stalkers are only the warning for.
  defineMob('warden', {
    label: 'Warden', width: 1.2, height: 2.9, speed: 1.5, eyeH: 2.5,
    hp: 120, damage: 16, hostile: true, deepWarden: true, boss: true, glow: 0.5,
    loot: () => [[I.ECHO_SHARD, 4, 7], [I.DIAMOND, 1, 2]],
    spawn: {}, groupMax: 1, call: 'groan',
    parts: [
      { id: 'legL', size: [6, 14, 6], pos: [-5, 7, 0], pivot: [0, 7, 0], anim: 'legA', share: 'leg' },
      { id: 'legR', size: [6, 14, 6], pos: [5, 7, 0], pivot: [0, 7, 0], anim: 'legB', share: 'leg' },
      { id: 'body', size: [16, 20, 10], pos: [0, 24, 0] },
      { id: 'armL', size: [6, 22, 6], pos: [-11, 26, 0], pivot: [0, 10, 0], anim: 'armA', share: 'arm' },
      { id: 'armR', size: [6, 22, 6], pos: [11, 26, 0], pivot: [0, 10, 0], anim: 'armB', share: 'arm' },
      { id: 'head', size: [12, 10, 12], pos: [0, 39, 0], anim: 'head' },
    ],
    paint(t, P) {
      const hide = [22, 40, 46], vein = [86, 224, 216], rib = [14, 26, 32];
      t.fill(hide);
      t.part(P.body, hide, { top: 1.25, bottom: 0.62 });
      t.part(P.legL, rib);
      t.part(P.armL, rib);
      t.part(P.head, hide);
      for (const k of ['nx', 'px', 'nz', 'pz']) {                    // a ribcage across the chest
        const r = P.body.rects[k];
        for (let b = 3; b < r[3] - 2; b += 4) t.band(r, b, 1, rib, 1);
      }
      t.rect(P.body.rects.nz, vein, 0, 6, 5, 4, 6);                  // the heart, showing through
      t.rect(P.body.rects.nz, [180, 250, 246], 0, 7, 7, 2, 2);
      for (let i = 0; i < 26; i++) {
        const part = [P.body, P.armL, P.head][(t.rnd() * 3) | 0];
        const r = part.rects[['nx', 'px', 'nz', 'pz'][(t.rnd() * 4) | 0]];
        t.patch(r, 1 + ((t.rnd() * (r[2] - 2)) | 0), 1 + ((t.rnd() * (r[3] - 2)) | 0), 1, vein);
      }
      const f = P.head.rects.nz;
      t.rect(f, [10, 18, 22], 0, 1, 2, f[2] - 2, 4);                 // no eyes, only the sensing band
      t.rect(f, vein, 0, 2, 3, 2, 2);
      t.rect(f, vein, 0, f[2] - 4, 3, 2, 2);
      t.rect(f, [140, 246, 240], 0, 3, 8, f[2] - 6, 1);
    },
  });

  // ---- more of what the city left running ---------------------------------
  defineMob('drone', {
    label: 'Drone', width: 0.7, height: 0.6, speed: 1.6, eyeH: 0.5,
    hp: 12, damage: 4, hostile: true, flaps: true, glow: 0.25,
    loot: () => [[B.CIRCUIT, 1, 2]],
    spawn: { city: 0.9 }, groupMax: 3, call: 'beep',
    parts: [
      { id: 'body', size: [7, 4, 7], pos: [0, 7, 0] },
      { id: 'eye', size: [3, 3, 2], pos: [0, 7, -4], anim: 'head' },
      { id: 'armL', size: [7, 1, 2], pos: [-6, 9, 0], pivot: [3, 0, 0], anim: 'legA' },
      { id: 'armR', size: [7, 1, 2], pos: [6, 9, 0], pivot: [-3, 0, 0], anim: 'legB' },
    ],
    paint(t, P) {
      const shell = [66, 70, 82], trim = [124, 130, 144];
      t.fill(shell);
      t.part(P.body, shell, { top: 1.22, bottom: 0.74 });
      t.part(P.armL, trim);
      t.rect(P.eye.rects.nz, [232, 64, 52], 0, 0, 0, 3, 3);
      t.rect(P.eye.rects.nz, [255, 190, 180], 0, 1, 1, 1, 1);
      t.rect(P.body.rects.py, [92, 226, 140], 0, 3, 3, 1, 1);
    },
  });

  defineMob('mech', {
    label: 'Mech', width: 1.3, height: 3.1, speed: 0.95, eyeH: 2.7,
    hp: 90, damage: 11, hostile: true, boss: true, glow: 0.2,
    loot: () => [[B.CIRCUIT, 2, 5], [I.IRON_INGOT, 4, 8], [I.DIAMOND, 1, 2]],
    spawn: { city: 0.16 }, groupMax: 1, call: 'beep',
    parts: [
      { id: 'legL', size: [7, 16, 7], pos: [-6, 8, 0], pivot: [0, 8, 0], anim: 'legA', share: 'leg' },
      { id: 'legR', size: [7, 16, 7], pos: [6, 8, 0], pivot: [0, 8, 0], anim: 'legB', share: 'leg' },
      { id: 'body', size: [18, 18, 11], pos: [0, 26, 0] },
      { id: 'armL', size: [6, 20, 6], pos: [-12, 28, 0], pivot: [0, 9, 0], anim: 'armA', share: 'arm' },
      { id: 'armR', size: [6, 20, 6], pos: [12, 28, 0], pivot: [0, 9, 0], anim: 'armB', share: 'arm' },
      { id: 'head', size: [9, 7, 9], pos: [0, 39, 0], anim: 'head' },
      { id: 'dish', size: [13, 2, 13], pos: [0, 44, 0], anim: 'head' },
    ],
    paint(t, P) {
      const steel = [118, 124, 134], dark = [64, 68, 78], warn = [226, 176, 48];
      t.fill(steel);
      t.part(P.body, steel, { top: 1.2, bottom: 0.74 });
      t.part(P.legL, dark);
      t.part(P.armL, dark);
      t.part(P.head, steel);
      t.part(P.dish, dark);
      for (const k of ['nx', 'px', 'nz', 'pz']) {                 // hazard striping round the chest
        const r = P.body.rects[k];
        for (let x = 0; x < r[2]; x++) if (((x >> 1) & 1) === 0) t.rect(r, warn, 0, x, r[3] - 3, 1, 2);
        t.band(r, 2, 1, dark, 2);
      }
      const f = P.head.rects.nz;
      t.rect(f, [22, 24, 30], 0, 1, 1, f[2] - 2, 3);              // the visor
      t.rect(f, [255, 96, 72], 0, 2, 2, 2, 1);
      t.rect(f, [255, 96, 72], 0, f[2] - 4, 2, 2, 1);
      t.rect(P.body.rects.nz, [92, 226, 140], 0, 8, 6, 2, 2);     // the core, showing
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
        for (let xx = x0; xx <= x1; xx++) {
          const id = world.getBlock(xx, yy, zz);
          if (id && blockHits(id, xx, yy, zz, x - hw, y, z - hw, x + hw, y + h, z + hw)) return true;
        }
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
    if (this.def.deepStalker || this.def.deepWarden) return this.deepUpdate(dt, world, player);
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
          if (player.damage(this.def.damage, 'a ' + (this.def.label || 'zombie').toLowerCase())) {
            const push = 4.5 / Math.max(0.6, dist);
            player.vel[0] += dx * push; player.vel[2] += dz * push; player.vel[1] = 3.4;
          }
          Sound.animal(this.def.call, 1);
        }
      }
      // A griefer takes the world apart as it comes: one block out of the wall
      // in front of it every few seconds, which is how you know one is coming.
      if (this.def.griefer && dist < 20) {
        this.griefCd = (this.griefCd || 2) - dt;
        if (this.griefCd <= 0) {
          this.griefCd = 2.5 + Math.random() * 2;
          const ax = Math.floor(this.x + Math.sin(this.yaw) * 1.4);
          const az = Math.floor(this.z - Math.cos(this.yaw) * 1.4);
          for (const dy of [1, 0, 2]) {
            const y = Math.floor(this.y) + dy;
            const id = world.getBlock(ax, y, az);
            if (!id || id === B.BEDROCK || !BLOCKS[id].solid) continue;
            world.setBlock(ax, y, az, 0);
            Sound.dig(id);
            break;
          }
        }
      }

      // A glitch does not walk the last stretch: it is simply somewhere else.
      if (this.def.glitchy && dist < 24 && dist > 3) {
        this.blinkCd = (this.blinkCd || 3) - dt;
        if (this.blinkCd <= 0) {
          this.blinkCd = 3 + Math.random() * 3;
          const t = Math.min(0.7, 6 / dist);
          const tx = this.x + dx * t, tz = this.z + dz * t;
          for (let k = 0; k < 6; k++) {
            const ty = Math.floor(this.y) + k - 1;
            if (ty < 1) continue;
            if (this.collides(world, tx, ty, tz)) continue;
            if (!isSolid(world.getBlock(Math.floor(tx), ty - 1, Math.floor(tz)))) continue;
            this.x = tx; this.y = ty; this.z = tz; this.vy = 0;
            Sound.burst({ dur: 0.1, freq: 1800, gain: 0.16, sweep: 2 });
            break;
          }
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

    if (this.def.swims && inWater) {
      // Poseidon's people hang wherever they like in the water, and rise or sink
      // to whatever height you happen to be at.
      const want = clamp((player.pos[1] + 0.6 - this.y) * 1.6, -3, 3);
      this.vy += (want - this.vy) * Math.min(1, dt * 3);
    } else if (inWater) {
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

  // Blind things. Neither of these can see you at all; they go to the last place
  // that made a noise, and they will stand over it until something else does.
  deepUpdate(dt, world, player) {
    const tier = typeof Deep === 'undefined' ? 0 : Deep.tier;
    const heard = (typeof Deep !== 'undefined' && Deep.heard) || null;
    this.attackCd = Math.max(0, (this.attackCd || 0) - dt);
    this.hurt = Math.max(0, this.hurt - dt);

    const dxP = player.pos[0] - this.x, dyP = player.pos[1] - this.y, dzP = player.pos[2] - this.z;
    const toPlayer = Math.hypot(dxP, dyP, dzP);

    // Where it thinks you are. At the top of the scale you are making so much
    // noise that where it thinks you are and where you are are the same place.
    let tx = this.home[0], tz = this.home[1];
    if (tier >= 3) { tx = player.pos[0]; tz = player.pos[2]; }
    else if (heard) { tx = heard[0]; tz = heard[2]; }

    // A stalker below the second tier climbs back up and waits on the ceiling.
    const hiding = this.def.deepStalker && tier < 2;
    if (hiding) {
      const ceil = this.ceilingAbove(world);
      if (ceil !== null) {
        this.clung = true;
        const want = ceil - this.def.height;
        this.y += (want - this.y) * Math.min(1, dt * 3);
        this.vy = 0;
        this.onGround = false;
      }
    } else if (this.clung) {
      this.clung = false;                                   // let go, and drop on them
      this.vy = -2;
    }

    const dx = tx - this.x, dz = tz - this.z;
    const flat = Math.hypot(dx, dz);
    const idle = tier === 0 && !this.hurt;
    if (!idle && flat > 0.6) this.targetYaw = Math.atan2(dx, -dz);
    let d = this.targetYaw - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += clamp(d, -3.4 * dt, 3.4 * dt);

    // How fast it comes: barely at all when it is quiet, flat out when it is not.
    const urgency = idle ? 0.15 : (tier === 1 ? 0.5 : tier === 2 ? 1 : 1.25);
    const speed = this.def.speed * urgency * (this.clung ? 0.6 : 1);
    const moving = !idle || flat > 3;
    this.walking = moving;
    const fx = moving ? Math.sin(this.yaw) * speed : 0;
    const fz = moving ? -Math.cos(this.yaw) * speed : 0;
    this.vx += (fx - this.vx) * Math.min(1, dt * 8);
    this.vz += (fz - this.vz) * Math.min(1, dt * 8);

    if (!this.clung) {
      this.vy -= GRAVITY_MOB * dt;
      if (this.vy < -45) this.vy = -45;
    }
    this.onGround = false;
    const steps = Math.max(1, Math.ceil(Math.hypot(this.vx, this.vy, this.vz) * dt / 0.25));
    let blocked = false;
    for (let i = 0; i < steps; i++) {
      this.moveAxis(world, 1, this.vy * dt / steps);
      blocked = this.moveAxis(world, 0, this.vx * dt / steps) || blocked;
      blocked = this.moveAxis(world, 2, this.vz * dt / steps) || blocked;
    }
    if (blocked && this.onGround) {
      const head = !isSolid(world.getBlock(Math.floor(this.x), Math.floor(this.y + this.def.height + 0.7), Math.floor(this.z)));
      if (head) this.vy = 8.4; else this.targetYaw += 1.2;
    }
    if (this.y < -8) this.dead = true;

    // What it does when it gets to you. The Warden also shouts, which reaches
    // further than its arms do.
    if (toPlayer < (this.def.deepWarden ? 3.4 : 2.2) && Math.abs(dyP) < 3 && this.attackCd <= 0 && player.damage) {
      this.attackCd = this.def.deepWarden ? 1.6 : 0.9;
      if (player.damage(this.def.damage, this.def.label.toLowerCase())) {
        const push = 6 / Math.max(0.6, toPlayer);
        player.vel[0] += dxP * push; player.vel[2] += dzP * push; player.vel[1] = 4;
      }
      Sound.animal(this.def.call, 1);
    } else if (this.def.deepWarden && toPlayer < 22 && this.attackCd <= 0 && tier >= 2 && player.damage) {
      this.attackCd = 3.5;                                  // the sonic shout
      player.damage(9, 'the Warden');
      Sound.burst({ dur: 0.7, freq: 70, gain: 0.5, sweep: 5 });
    }

    const hspeed = Math.hypot(this.vx, this.vz);
    this.walkPhase += dt * (hspeed * 5.5 + 0.4);
    this.swing = Math.min(1, hspeed / this.def.speed);
    this.airborne = !this.onGround && !this.clung;
    const l = world.getLight(Math.floor(this.x), Math.floor(this.y + this.def.height * 0.6), Math.floor(this.z));
    this.sky = (l >> 4) / 15; this.blk = (l & 15) / 15;
    this.callTimer -= dt;
    if (this.callTimer <= 0) {
      this.callTimer = 5 + Math.random() * 9;
      if (toPlayer < 30) Sound.animal(this.def.call, clamp(1 - toPlayer / 30, 0.08, 1));
    }
  }

  // The first solid block over its head, if there is one within reach.
  ceilingAbove(world) {
    const x = Math.floor(this.x), z = Math.floor(this.z);
    const from = Math.floor(this.y + this.def.height);
    for (let y = from; y < from + 22 && y < CY; y++) {
      if (isSolid(world.getBlock(x, y, z))) return y;
    }
    return null;
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
    const cap = this.capFor(world);
    for (let i = 0; i < 14 && this.list.length < cap; i++) this.trySpawn(world, player, viewDist);
  },

  // How crowded a world gets. Back then it was crowded; an arena has its cap set
  // to zero and stays empty whatever the dimension.
  capFor(world) {
    if (!this.cap) return 0;
    return world.dimension === 'dinos' ? Math.max(this.cap, 44) : this.cap;
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
      this.spawnTimer = world.dimension === 'dinos' ? 0.6 : 1.3;
      if (this.list.length < this.capFor(world)) this.trySpawn(world, player, viewDist);
    }
    this.hostileTimer = (this.hostileTimer || 0) - dt;
    if (this.hostileTimer <= 0) {
      this.hostileTimer = world.dimension === 'future' ? 0.8 : (world.dimension === 'deep' ? 1.4 : 2);
      const hostiles = this.list.reduce((n, m) => n + (m.def.hostile ? 1 : 0), 0);
      let cap = this.hostileCap;
      if (cap && world.dimension === 'future') cap = Math.max(cap, 34);
      // How many stalkers there are is a function of how loud you have been.
      if (cap && world.dimension === 'deep') cap = 3 + (typeof Deep === 'undefined' ? 0 : Deep.tier) * 5;
      if (cap && world.dimension === 'hacker') cap = Math.max(cap, 16);
      if (cap && world.dimension === 'sea') cap = Math.max(cap, 14);
      if (hostiles < cap) this.trySpawnHostile(world, player, viewDist);
    }
  },

  // Zombies want somewhere dark: a cave, or the surface after sunset.
  trySpawnHostile(world, player, viewDist) {
    if (world.dimension === 'dinos') return;
    if (world.dimension === 'deep') return this.trySpawnStalker(world, player);
    if (world.dimension === 'hacker') return this.trySpawnHack(world, player);
    if (world.dimension === 'sea') return this.trySpawnGuardian(world, player);
    const apocalypse = world.dimension === 'future';
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
      if (!apocalypse) {
        const sky = this.isDay ? world.getSky(x, y, z) : 0;
        if (Math.max(sky, world.getBlockLight(x, y, z)) > 7) continue;     // elsewhere they need the dark
      }
      const n = 1 + Math.floor(Math.random() * (apocalypse ? 4 : 2));
      let kind = 'zombie';
      if (apocalypse) {
        // the city is as full of machines as it is of the dead
        const r = Math.random();
        kind = r < 0.52 ? 'zombie' : r < 0.72 ? 'drone' : r < 0.90 ? 'sentry' : 'mech';
      } else if (world.dimension === 'end' || Math.random() < 0.22) kind = 'enderman';
      for (let i = 0; i < n; i++) this.list.push(new Mob(kind, x + 0.5 + i * 0.6, y, z + 0.5, Math.random() * 6.28));
      return;
    }
  },

  // Guardians come out of the open water, not off the bed.
  trySpawnGuardian(world, player) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const a = Math.random() * Math.PI * 2, r = 16 + Math.random() * 26;
      const x = Math.floor(player.pos[0] + Math.cos(a) * r);
      const z = Math.floor(player.pos[2] + Math.sin(a) * r);
      if (!world.getChunk(x >> 4, z >> 4)) continue;
      const y = Math.floor(player.pos[1]) + Math.floor(Math.random() * 9) - 4;
      if (y < 2 || y > SEA_TOP - 2) continue;
      if (!isLiquid(world.getBlock(x, y, z)) || !isLiquid(world.getBlock(x, y + 1, z))) continue;
      this.list.push(new Mob('guardian', x + 0.5, y, z + 0.5, Math.random() * 6.28));
      return;
    }
  },

  // Griefers and glitches, anywhere on the grid there is floor to stand on.
  trySpawnHack(world, player) {
    for (let attempt = 0; attempt < 14; attempt++) {
      const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 30;
      const x = Math.floor(player.pos[0] + Math.cos(a) * r);
      const z = Math.floor(player.pos[2] + Math.sin(a) * r);
      if (!world.getChunk(x >> 4, z >> 4)) continue;
      let floor = -1;
      for (let y = HK_FLOOR; y < HK_FLOOR + 40; y++) {
        if (isSolid(world.getBlock(x, y, z)) && !isSolid(world.getBlock(x, y + 1, z))
            && !isSolid(world.getBlock(x, y + 2, z))) { floor = y + 1; break; }
      }
      if (floor < 0) continue;
      const kind = Math.random() < 0.55 ? 'griefer' : 'glitch';
      const n = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) {
        this.list.push(new Mob(kind, x + 0.5 + i * 0.7, floor, z + 0.5, Math.random() * 6.28));
      }
      return;
    }
  },

  // Stalkers arrive on the ceiling, out of sight, far enough away that the first
  // you know of one is the sound it makes when it lets go.
  trySpawnStalker(world, player) {
    for (let attempt = 0; attempt < 14; attempt++) {
      const a = Math.random() * Math.PI * 2, r = 16 + Math.random() * 22;
      const x = Math.floor(player.pos[0] + Math.cos(a) * r);
      const z = Math.floor(player.pos[2] + Math.sin(a) * r);
      if (!world.getChunk(x >> 4, z >> 4)) continue;
      let floor = -1;
      for (let y = DEEP_FLOOR; y < DEEP_FLOOR + 30; y++) {
        if (isSolid(world.getBlock(x, y, z)) && !isSolid(world.getBlock(x, y + 1, z))) { floor = y + 1; break; }
      }
      if (floor < 0) continue;
      let head = floor;
      while (head < floor + 24 && !isSolid(world.getBlock(x, head, z))) head++;
      if (head - floor < 3) continue;                    // no room to hang
      const y = Math.max(floor, head - 2);
      this.list.push(new Mob('stalker', x + 0.5, y, z + 0.5, Math.random() * 6.28));
      return;
    }
  },

  // A column an animal of this size can actually stand in: grass under it, clear above.
  groundAt(world, bx, bz, def) {
    if (!world.getChunk(bx >> 4, bz >> 4)) return -1;
    const info = world.column(bx, bz);
    const ground = world.getBlock(bx, info.h, bz);
    const paved = world.dimension === 'future' && isSolid(ground);   // the city has no lawns
    if (!paved && ground !== B.GRASS && ground !== B.SNOW) return -1;
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

      // Something as tall as a tyrannosaur needs a clearing, and under a jungle
      // canopy those are scarce — so look around a little before giving up.
      let sx = x, sz = z, y = this.groundAt(world, x, z, def);
      for (let k = 0; y < 0 && k < 8; k++) {
        sx = x + Math.round((Math.random() - 0.5) * 12);
        sz = z + Math.round((Math.random() - 0.5) * 12);
        y = this.groundAt(world, sx, sz, def);
      }
      if (y < 0 || world.getSky(sx, y, sz) < 8) continue;

      const n = 1 + Math.floor(Math.random() * def.groupMax);
      const yaw = Math.random() * Math.PI * 2;
      this.list.push(new Mob(type, sx + 0.5, y, sz + 0.5, yaw));
      for (let i = 1; i < n && this.list.length < this.capFor(world); i++) {
        const bx = sx + Math.round(Math.random() * 5 - 2.5);
        const bz = sz + Math.round(Math.random() * 5 - 2.5);
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
