// Procedurally painted 16x16 tiles + the block table.
const TILE = 16;
const TILES = [];          // Uint8Array(16*16*4) per layer, in texture-array order
const TILE_ID = {};        // name -> layer index

function paintTile(name, fn) {
  const data = new Uint8Array(TILE * TILE * 4).fill(255);
  const rnd = mulberry32(0xC0FFEE + TILES.length * 7919);
  const px = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const i = ((y | 0) * TILE + (x | 0)) * 4;
    data[i] = clamp(r, 0, 255); data[i + 1] = clamp(g, 0, 255);
    data[i + 2] = clamp(b, 0, 255); data[i + 3] = a === undefined ? 255 : clamp(a, 0, 255);
  };
  const fill = (r, g, b, amt) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const v = (rnd() - 0.5) * 2 * amt;
      px(x, y, r + v, g + v, b + v);
    }
  };
  const specks = (count, r, g, b, amt) => {
    for (let i = 0; i < count; i++) {
      const v = (rnd() - 0.5) * 2 * amt;
      px((rnd() * TILE) | 0, (rnd() * TILE) | 0, r + v, g + v, b + v);
    }
  };
  fn({ px, fill, specks, rnd, data });
  TILE_ID[name] = TILES.length;
  TILES.push(data);
  return TILE_ID[name];
}

function buildTextures() {
  paintTile('grass_top', t => { t.fill(112, 165, 66, 16); t.specks(40, 96, 148, 54, 12); t.specks(20, 128, 182, 78, 10); });

  paintTile('dirt', t => { t.fill(134, 96, 67, 14); t.specks(26, 112, 78, 52, 10); t.specks(14, 152, 114, 84, 8); });

  paintTile('grass_side', t => {
    t.fill(134, 96, 67, 14); t.specks(24, 112, 78, 52, 10);
    for (let x = 0; x < TILE; x++) {
      const h = 3 + (t.rnd() < 0.45 ? 1 : 0) + (t.rnd() < 0.18 ? 1 : 0);
      for (let y = 0; y < h; y++) { const v = (t.rnd() - 0.5) * 22; t.px(x, y, 108 + v, 160 + v, 62 + v); }
      if (t.rnd() < 0.4) { const v = (t.rnd() - 0.5) * 18; t.px(x, h, 100 + v, 150 + v, 58 + v); }
    }
  });

  paintTile('stone', t => {
    t.fill(126, 126, 126, 10); t.specks(30, 104, 104, 104, 8); t.specks(18, 146, 146, 146, 6);
    let x = 2 + ((t.rnd() * 10) | 0);
    for (let y = 3; y < 12; y++) { t.px(x, y, 104, 104, 104); if (t.rnd() < 0.5) x += t.rnd() < 0.5 ? 1 : -1; }
  });

  paintTile('cobblestone', t => {
    t.fill(78, 78, 78, 6);
    for (let i = 0; i < 9; i++) {
      const w = 3 + ((t.rnd() * 3) | 0), h = 3 + ((t.rnd() * 3) | 0);
      const ox = (t.rnd() * (TILE - w)) | 0, oy = (t.rnd() * (TILE - h)) | 0;
      const base = 112 + t.rnd() * 34;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const edge = (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? -22 : 0;
        const v = (t.rnd() - 0.5) * 14 + edge;
        t.px(ox + x, oy + y, base + v, base + v, base + v);
      }
    }
  });

  paintTile('sand', t => { t.fill(219, 205, 156, 9); t.specks(28, 200, 186, 138, 8); t.specks(12, 236, 226, 186, 6); });

  paintTile('water', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const w = Math.sin((x + y * 0.6) * 0.9) * 8 + Math.sin(y * 1.7) * 6 + (t.rnd() - 0.5) * 8;
      t.px(x, y, 46 + w, 108 + w, 196 + w, 255);
    }
  });

  paintTile('log_side', t => {
    for (let x = 0; x < TILE; x++) {
      const shade = (t.rnd() - 0.5) * 26;
      for (let y = 0; y < TILE; y++) { const v = shade + (t.rnd() - 0.5) * 10; t.px(x, y, 104 + v, 78 + v, 48 + v); }
    }
    for (let i = 0; i < 3; i++) {
      const cx = (t.rnd() * TILE) | 0, cy = (t.rnd() * TILE) | 0;
      for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++)
        if (Math.abs(x) + Math.abs(y) < 2) t.px(cx + x, cy + y, 78, 56, 34);
    }
  });

  paintTile('log_top', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const ring = ((d * 1.4) | 0) % 2;
      const v = (t.rnd() - 0.5) * 10;
      if (d > 6.5) t.px(x, y, 96 + v, 72 + v, 44 + v);
      else if (ring) t.px(x, y, 152 + v, 122 + v, 74 + v);
      else t.px(x, y, 132 + v, 102 + v, 60 + v);
    }
  });

  paintTile('leaves', t => {
    t.fill(58, 128, 44, 26);
    for (let i = 0; i < 22; i++) {
      const cx = (t.rnd() * TILE) | 0, cy = (t.rnd() * TILE) | 0, dark = t.rnd() < 0.5;
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        const v = (t.rnd() - 0.5) * 14;
        if (dark) t.px(cx + x, cy + y, 38 + v, 96 + v, 30 + v);
        else t.px(cx + x, cy + y, 82 + v, 156 + v, 60 + v);
      }
    }
  });

  paintTile('planks', t => {
    for (let y = 0; y < TILE; y++) {
      const plank = (y / 4) | 0, shade = [0, -8, 6, -3][plank];
      for (let x = 0; x < TILE; x++) {
        const v = shade + (t.rnd() - 0.5) * 9;
        t.px(x, y, 160 + v, 124 + v, 74 + v);
      }
      if (y % 4 === 3) for (let x = 0; x < TILE; x++) t.px(x, y, 116, 86, 50);
    }
    for (let p = 0; p < 4; p++) {
      const sx = 2 + ((t.rnd() * 12) | 0);
      for (let y = p * 4; y < p * 4 + 3; y++) t.px(sx, y, 128, 96, 56);
    }
  });

  paintTile('glass', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const edge = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
      t.px(x, y, 214, 236, 244, edge ? 235 : 26);
    }
    for (let i = 2; i < 8; i++) { t.px(i, 12 - i, 250, 252, 255, 150); t.px(i + 1, 12 - i, 240, 246, 252, 90); }
  });

  paintTile('brick', t => {
    t.fill(172, 164, 152, 5);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 0 : 4;
      for (let b = -1; b < 3; b++) {
        const ox = off + b * 8, oy = row * 4;
        const base = 148 + (t.rnd() - 0.5) * 16;
        for (let y = 0; y < 3; y++) for (let x = 0; x < 7; x++) {
          const v = (t.rnd() - 0.5) * 12;
          t.px(ox + x, oy + y, base + v, 74 + v, 56 + v);
        }
      }
    }
  });

  paintTile('snow', t => { t.fill(243, 247, 253, 6); t.specks(20, 226, 234, 246, 5); });

  paintTile('bedrock', t => {
    t.fill(84, 84, 84, 10);
    for (let i = 0; i < 26; i++) {
      const cx = (t.rnd() * TILE) | 0, cy = (t.rnd() * TILE) | 0, g = t.rnd() < 0.5 ? 46 : 128;
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) t.px(cx + x, cy + y, g, g, g);
    }
  });

  paintTile('gravel', t => {
    t.fill(126, 122, 120, 12);
    for (let i = 0; i < 18; i++) {
      const cx = (t.rnd() * TILE) | 0, cy = (t.rnd() * TILE) | 0, g = 90 + t.rnd() * 80;
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) t.px(cx + x, cy + y, g, g * 0.97, g * 0.92);
    }
  });

  const ore = (name, r, g, b) => paintTile(name, t => {
    t.fill(126, 126, 126, 10); t.specks(24, 104, 104, 104, 8);
    for (let i = 0; i < 5; i++) {
      const cx = 2 + ((t.rnd() * 12) | 0), cy = 2 + ((t.rnd() * 12) | 0), s = t.rnd() < 0.5 ? 2 : 3;
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        if ((x === 0 && y === 0) || (x === s - 1 && y === s - 1)) continue;
        const v = (t.rnd() - 0.5) * 26;
        t.px(cx + x, cy + y, r + v, g + v, b + v);
      }
    }
  });
  ore('coal_ore', 38, 38, 38);
  ore('iron_ore', 198, 158, 120);
  ore('gold_ore', 236, 200, 70);
  ore('diamond_ore', 108, 226, 226);

  paintTile('glowstone', t => {
    t.fill(150, 116, 62, 14);
    for (let i = 0; i < 16; i++) {
      const cx = (t.rnd() * TILE) | 0, cy = (t.rnd() * TILE) | 0;
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        const v = (t.rnd() - 0.5) * 20;
        t.px(cx + x, cy + y, 252 + v, 226 + v, 148 + v);
      }
    }
  });

  paintTile('obsidian', t => { t.fill(22, 19, 30, 6); t.specks(26, 62, 44, 96, 16); t.specks(10, 88, 66, 130, 10); });

  paintTile('crafting_top', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const v = (t.rnd() - 0.5) * 8;
      t.px(x, y, 152 + v, 116 + v, 70 + v);
    }
    for (const i of [0, 5, 10, 15]) for (let k = 0; k < TILE; k++) {   // 3x3 grid of cells
      t.px(i, k, 92, 68, 40); t.px(k, i, 92, 68, 40);
    }
    for (const cy of [1, 6, 11]) for (const cx of [1, 6, 11])
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        const v = (t.rnd() - 0.5) * 10;
        t.px(cx + x, cy + y, 124 + v, 92 + v, 56 + v);
      }
  });

  paintTile('crafting_side', t => {
    for (let y = 0; y < TILE; y++) {
      const top = y < 4;
      for (let x = 0; x < TILE; x++) {
        const v = (t.rnd() - 0.5) * 9;
        t.px(x, y, (top ? 168 : 146) + v, (top ? 132 : 110) + v, (top ? 80 : 66) + v);
      }
    }
    for (let x = 0; x < TILE; x++) t.px(x, 4, 104, 78, 46);
    for (let i = 0; i < 9; i++) {                                     // a saw hung on the side
      t.px(3 + i, 12 - Math.floor(i * 0.55), 176, 178, 184);
      t.px(3 + i, 13 - Math.floor(i * 0.55), 128, 130, 138);
    }
    for (let i = 0; i < 3; i++) t.px(11 + i, 7 + i, 96, 70, 44);
  });

  const brickPattern = (t, base, mortar) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const v = (t.rnd() - 0.5) * 9;
      t.px(x, y, base[0] + v, base[1] + v, base[2] + v);
    }
    for (let row = 0; row < 4; row++) {
      const oy = row * 4;
      for (let x = 0; x < TILE; x++) t.px(x, oy, mortar[0], mortar[1], mortar[2]);
      const seam = row % 2 ? 3 : 11;
      for (let y = oy; y < oy + 4; y++) t.px(seam, y, mortar[0], mortar[1], mortar[2]);
    }
  };

  paintTile('stone_bricks', t => brickPattern(t, [122, 122, 122], [92, 92, 92]));

  paintTile('mossy_stone_bricks', t => {
    brickPattern(t, [116, 120, 112], [86, 92, 84]);
    for (let i = 0; i < 26; i++) {
      const cx = (t.rnd() * TILE) | 0, cy = (t.rnd() * TILE) | 0, v = (t.rnd() - 0.5) * 22;
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) t.px(cx + x, cy + y, 74 + v, 112 + v, 62 + v);
    }
  });

  paintTile('chiseled_stone_bricks', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const v = (t.rnd() - 0.5) * 9;
      const edge = x < 1 || y < 1 || x > 14 || y > 14;
      t.px(x, y, (edge ? 96 : 124) + v, (edge ? 96 : 124) + v, (edge ? 96 : 124) + v);
    }
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {        // carved inset panel
      const border = x === 3 || x === 12 || y === 3 || y === 12;
      const v = (t.rnd() - 0.5) * 8;
      t.px(x, y, (border ? 88 : 138) + v, (border ? 88 : 138) + v, (border ? 88 : 138) + v);
    }
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) t.px(x, y, 100, 100, 100);
  });

  paintTile('lamp', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const v = (t.rnd() - 0.5) * 12;
      if (d > 6.5) t.px(x, y, 148 + v, 112 + v, 62 + v);
      else t.px(x, y, 250 + v, 226 + v, 150 + v);
    }
    for (const i of [3, 7, 11]) for (let k = 2; k < 14; k++) {
      t.px(i, k, 190, 148, 84); t.px(k, i, 190, 148, 84);
    }
    for (let i = 0; i < 10; i++) {
      const cx = 3 + ((t.rnd() * 10) | 0), cy = 3 + ((t.rnd() * 10) | 0);
      t.px(cx, cy, 255, 248, 210);
    }
  });

  // ---- families used by the wider block set -----------------------------
  const speckled = (name, base, dark, light) => paintTile(name, t => {
    t.fill(base[0], base[1], base[2], 9);
    t.specks(34, dark[0], dark[1], dark[2], 8);
    t.specks(20, light[0], light[1], light[2], 7);
  });
  const polished = (name, base) => paintTile(name, t => {
    t.fill(base[0], base[1], base[2], 4);
    for (let k = 0; k < TILE; k++) {
      t.px(k, 0, base[0] + 16, base[1] + 16, base[2] + 16);
      t.px(0, k, base[0] + 12, base[1] + 12, base[2] + 12);
      t.px(k, 15, base[0] - 16, base[1] - 16, base[2] - 16);
      t.px(15, k, base[0] - 12, base[1] - 12, base[2] - 12);
    }
  });
  const mineralBlock = (name, base, hi) => paintTile(name, t => {
    t.fill(base[0], base[1], base[2], 8);
    for (const i of [0, 15]) for (let k = 0; k < TILE; k++) {
      t.px(k, i, base[0] * 0.8, base[1] * 0.8, base[2] * 0.8);
      t.px(i, k, base[0] * 0.8, base[1] * 0.8, base[2] * 0.8);
    }
    for (let i = 0; i < 14; i++) {
      const cx = 2 + ((t.rnd() * 12) | 0), cy = 2 + ((t.rnd() * 12) | 0);
      t.px(cx, cy, hi[0], hi[1], hi[2]);
      if (t.rnd() < 0.5) t.px(cx + 1, cy, hi[0], hi[1], hi[2]);
    }
  });
  const logTiles = (prefix, bark, knot, ringA, ringB) => {
    paintTile(prefix + '_side', t => {
      for (let x = 0; x < TILE; x++) {
        const shade = (t.rnd() - 0.5) * 24;
        for (let y = 0; y < TILE; y++) {
          const v = shade + (t.rnd() - 0.5) * 9;
          t.px(x, y, bark[0] + v, bark[1] + v, bark[2] + v);
        }
      }
      for (let i = 0; i < 3; i++) {
        const cx = (t.rnd() * TILE) | 0, cy = (t.rnd() * TILE) | 0;
        for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++)
          if (Math.abs(x) + Math.abs(y) < 2) t.px(cx + x, cy + y, knot[0], knot[1], knot[2]);
      }
    });
    paintTile(prefix + '_top', t => {
      for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        const v = (t.rnd() - 0.5) * 10;
        if (d > 6.5) t.px(x, y, bark[0] + v, bark[1] + v, bark[2] + v);
        else if (((d * 1.4) | 0) % 2) t.px(x, y, ringA[0] + v, ringA[1] + v, ringA[2] + v);
        else t.px(x, y, ringB[0] + v, ringB[1] + v, ringB[2] + v);
      }
    });
  };
  const planksTile = (name, base, seam) => paintTile(name, t => {
    for (let y = 0; y < TILE; y++) {
      const shade = [0, -8, 6, -3][(y / 4) | 0];
      for (let x = 0; x < TILE; x++) {
        const v = shade + (t.rnd() - 0.5) * 9;
        t.px(x, y, base[0] + v, base[1] + v, base[2] + v);
      }
      if (y % 4 === 3) for (let x = 0; x < TILE; x++) t.px(x, y, seam[0], seam[1], seam[2]);
    }
    for (let p = 0; p < 4; p++) {
      const sx = 2 + ((t.rnd() * 12) | 0);
      for (let y = p * 4; y < p * 4 + 3; y++) t.px(sx, y, seam[0], seam[1], seam[2]);
    }
  });
  const leavesTile = (name, base, dark, light) => paintTile(name, t => {
    t.fill(base[0], base[1], base[2], 24);
    for (let i = 0; i < 22; i++) {
      const cx = (t.rnd() * TILE) | 0, cy = (t.rnd() * TILE) | 0, d = t.rnd() < 0.5;
      const c = d ? dark : light;
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
        const v = (t.rnd() - 0.5) * 14;
        t.px(cx + x, cy + y, c[0] + v, c[1] + v, c[2] + v);
      }
    }
  });
  const woolTile = (name, base) => paintTile(name, t => {
    t.fill(base[0], base[1], base[2], 10);
    for (let i = 0; i < 30; i++) {
      const cx = (t.rnd() * TILE) | 0, cy = (t.rnd() * TILE) | 0, v = t.rnd() < 0.5 ? -18 : 14;
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++)
        t.px(cx + x, cy + y, base[0] + v, base[1] + v, base[2] + v);
    }
  });

  speckled('andesite', [136, 136, 138], [110, 110, 114], [162, 162, 164]);
  speckled('diorite', [206, 206, 208], [168, 168, 172], [236, 236, 238]);
  speckled('granite', [154, 108, 90], [124, 84, 70], [186, 138, 116]);
  polished('polished_andesite', [140, 142, 144]);
  polished('polished_diorite', [212, 212, 214]);
  polished('polished_granite', [162, 114, 94]);
  paintTile('deepslate', t => {
    for (let x = 0; x < TILE; x++) {
      const shade = (t.rnd() - 0.5) * 16;
      for (let y = 0; y < TILE; y++) {
        const v = shade + (t.rnd() - 0.5) * 8;
        t.px(x, y, 78 + v, 78 + v, 82 + v);
      }
    }
    t.specks(22, 56, 56, 60, 6);
  });

  ore('redstone_ore', 210, 46, 40);
  ore('lapis_ore', 44, 78, 190);
  ore('emerald_ore', 46, 200, 96);

  mineralBlock('coal_block', [30, 30, 32], [72, 72, 76]);
  mineralBlock('iron_block', [214, 214, 216], [246, 246, 248]);
  mineralBlock('gold_block', [238, 202, 68], [255, 236, 150]);
  mineralBlock('diamond_block', [102, 224, 222], [186, 248, 246]);
  mineralBlock('lapis_block', [40, 74, 176], [92, 128, 220]);
  mineralBlock('emerald_block', [42, 194, 92], [126, 240, 158]);
  mineralBlock('redstone_block', [176, 32, 26], [226, 74, 62]);

  logTiles('birch_log', [216, 214, 206], [92, 90, 86], [204, 186, 148], [186, 166, 126]);
  planksTile('birch_planks', [196, 178, 128], [156, 138, 92]);
  leavesTile('birch_leaves', [110, 160, 70], [82, 130, 52], [140, 186, 96]);
  logTiles('spruce_log', [76, 56, 34], [50, 36, 22], [116, 88, 54], [96, 72, 44]);
  planksTile('spruce_planks', [110, 82, 50], [80, 58, 34]);
  leavesTile('spruce_leaves', [42, 92, 54], [28, 68, 40], [62, 116, 70]);

  paintTile('clay', t => { t.fill(160, 166, 178, 8); t.specks(26, 142, 148, 162, 6); });
  paintTile('terracotta', t => { t.fill(152, 94, 68, 10); t.specks(24, 130, 78, 56, 8); t.specks(12, 178, 116, 88, 6); });
  paintTile('ice', t => {
    t.fill(158, 196, 246, 8);
    for (let i = 0; i < 6; i++) {
      const x0 = (t.rnd() * TILE) | 0, y0 = (t.rnd() * TILE) | 0, len = 4 + ((t.rnd() * 8) | 0);
      for (let k = 0; k < len; k++) t.px(x0 + k, y0 + ((k * 0.6) | 0), 196, 222, 252);
    }
  });
  paintTile('packed_ice', t => { t.fill(140, 180, 238, 6); t.specks(30, 168, 204, 248, 6); });

  paintTile('cactus_side', t => {
    t.fill(58, 122, 52, 10);
    for (const x of [1, 14]) for (let y = 0; y < TILE; y++) t.px(x, y, 44, 96, 40);
    for (let y = 1; y < TILE; y += 4) for (const x of [4, 8, 12]) t.px(x, y, 208, 222, 180);
  });
  paintTile('cactus_top', t => {
    t.fill(70, 138, 60, 10);
    for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) t.px(x, y, 88, 158, 74);
  });

  paintTile('pumpkin_side', t => {
    for (let x = 0; x < TILE; x++) {
      const rib = x % 4 === 0 ? -26 : 0;
      for (let y = 0; y < TILE; y++) {
        const v = rib + (t.rnd() - 0.5) * 9;
        t.px(x, y, 224 + v, 138 + v, 38 + v);
      }
    }
  });
  paintTile('pumpkin_face', t => {
    for (let x = 0; x < TILE; x++) {
      const rib = x % 4 === 0 ? -26 : 0;
      for (let y = 0; y < TILE; y++) {
        const v = rib + (t.rnd() - 0.5) * 9;
        t.px(x, y, 224 + v, 138 + v, 38 + v);
      }
    }
    const dark = [60, 34, 12];
    for (let i = 0; i < 3; i++) {                       // two triangular eyes
      for (let k = 0; k <= i; k++) {
        t.px(3 + i, 4 + k, dark[0], dark[1], dark[2]);
        t.px(12 - i, 4 + k, dark[0], dark[1], dark[2]);
      }
    }
    for (let x = 4; x < 12; x++) t.px(x, 10, dark[0], dark[1], dark[2]);
    for (const x of [5, 8, 10]) t.px(x, 11, dark[0], dark[1], dark[2]);
    for (const x of [4, 11]) t.px(x, 9, dark[0], dark[1], dark[2]);
  });
  paintTile('pumpkin_top', t => { t.fill(198, 126, 40, 9); for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) t.px(x, y, 122, 92, 44); });

  paintTile('mossy_cobblestone', t => {
    t.fill(78, 84, 74, 6);
    for (let i = 0; i < 9; i++) {
      const w = 3 + ((t.rnd() * 3) | 0), h = 3 + ((t.rnd() * 3) | 0);
      const ox = (t.rnd() * (TILE - w)) | 0, oy = (t.rnd() * (TILE - h)) | 0;
      const base = 108 + t.rnd() * 30, moss = t.rnd() < 0.45;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const edge = (x === 0 || y === 0 || x === w - 1 || y === h - 1) ? -22 : 0;
        const v = (t.rnd() - 0.5) * 14 + edge;
        if (moss) t.px(ox + x, oy + y, base * 0.62 + v, base * 0.86 + v, base * 0.56 + v);
        else t.px(ox + x, oy + y, base + v, base + v, base + v);
      }
    }
  });

  woolTile('wool_white', [232, 234, 234]);
  woolTile('wool_red', [162, 46, 42]);
  woolTile('wool_yellow', [232, 194, 60]);
  woolTile('wool_green', [86, 130, 44]);
  woolTile('wool_blue', [54, 74, 168]);
  woolTile('wool_black', [34, 34, 38]);

  // ten stages of cracks, each adding to the last, drawn over the block you are mining
  for (let stage = 0; stage < 10; stage++) {
    paintTile('crack_' + stage, t => {
      t.data.fill(0);
      const rnd = mulberry32(90210);
      for (let i = 0; i <= stage; i++) {
        let x = 3 + ((rnd() * 10) | 0), y = 3 + ((rnd() * 10) | 0);
        const len = 4 + ((rnd() * 6) | 0) + stage;
        const dx = rnd() < 0.5 ? 1 : -1, dy = rnd() < 0.5 ? 1 : -1;
        for (let k = 0; k < len; k++) {
          t.px(x, y, 18, 18, 22, 255);
          if (rnd() < 0.75) x += dx * (rnd() < 0.35 ? 0 : 1);
          if (rnd() < 0.75) y += dy * (rnd() < 0.35 ? 0 : 1);
          if (x < 0 || y < 0 || x > 15 || y > 15) break;
        }
      }
    });
  }

  paintTile('netherrack', t => {
    t.fill(112, 44, 44, 14);
    t.specks(34, 84, 30, 30, 10);
    t.specks(18, 146, 62, 58, 8);
    for (let i = 0; i < 5; i++) {
      let x = (t.rnd() * TILE) | 0, y = (t.rnd() * TILE) | 0;
      for (let k = 0; k < 6; k++) { t.px(x, y, 78, 26, 26); x += (t.rnd() * 3 | 0) - 1; y += (t.rnd() * 3 | 0) - 1; }
    }
  });
  paintTile('soul_sand', t => {
    t.fill(88, 66, 54, 10);
    for (let i = 0; i < 3; i++) {                      // the faces in the sand
      const cx = 2 + ((t.rnd() * 10) | 0), cy = 2 + ((t.rnd() * 10) | 0);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) t.px(cx + x, cy + y, 66, 48, 40);
      t.px(cx + 1, cy + 1, 40, 28, 24); t.px(cx + 2, cy + 1, 40, 28, 24);
      t.px(cx + 1, cy + 3, 44, 32, 26); t.px(cx + 2, cy + 3, 44, 32, 26);
    }
  });
  paintTile('nether_bricks', t => brickPattern(t, [66, 32, 38], [42, 20, 24]));
  paintTile('quartz_ore', t => {
    t.fill(112, 44, 44, 12);
    for (let i = 0; i < 5; i++) {
      const cx = 2 + ((t.rnd() * 12) | 0), cy = 2 + ((t.rnd() * 12) | 0), sz = t.rnd() < 0.5 ? 2 : 3;
      for (let y = 0; y < sz; y++) for (let x = 0; x < sz; x++) {
        const v = (t.rnd() - 0.5) * 20;
        t.px(cx + x, cy + y, 236 + v, 232 + v, 226 + v);
      }
    }
  });
  paintTile('lava', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const w = Math.sin((x * 0.8 + y * 0.5)) * 12 + Math.sin(y * 1.3) * 10 + (t.rnd() - 0.5) * 16;
      t.px(x, y, 226 + w, 108 + w * 0.6, 26 + w * 0.2);
    }
    for (let i = 0; i < 14; i++) {
      const cx = (t.rnd() * TILE) | 0, cy = (t.rnd() * TILE) | 0;
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) t.px(cx + x, cy + y, 252, 214, 96);
    }
  });
  paintTile('portal', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const swirl = Math.sin(d * 1.5 - Math.atan2(y - 7.5, x - 7.5) * 2) * 30;
      const v = (t.rnd() - 0.5) * 22;
      t.px(x, y, 122 + swirl + v, 40 + v, 176 + swirl + v, 210);
    }
    for (let i = 0; i < 12; i++) t.px((t.rnd() * TILE) | 0, (t.rnd() * TILE) | 0, 226, 190, 250, 235);
  });

  // --- furniture ---------------------------------------------------------
  const plankBase = (t, shade) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const v = shade + (t.rnd() - 0.5) * 9 + ((y / 4) | 0) * 3;
      t.px(x, y, 152 + v, 116 + v, 70 + v);
    }
  };
  paintTile('bed_top_head', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const v = (t.rnd() - 0.5) * 10;
      if (y < 6 && x > 1 && x < 14) t.px(x, y, 236 + v, 236 + v, 232 + v);   // pillow
      else t.px(x, y, 178 + v, 40 + v, 44 + v);
    }
  });
  paintTile('bed_top_foot', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const v = (t.rnd() - 0.5) * 10;
      t.px(x, y, 178 + v, 40 + v, 44 + v);
    }
    for (let x = 0; x < TILE; x++) { t.px(x, 14, 150, 32, 36); t.px(x, 15, 150, 32, 36); }
  });
  paintTile('bed_side', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const v = (t.rnd() - 0.5) * 9;
      if (y < 4) t.px(x, y, 232 + v, 230 + v, 226 + v);            // sheet
      else if (y > 12) t.px(x, y, 118 + v, 88 + v, 52 + v);        // wooden base
      else t.px(x, y, 178 + v, 40 + v, 44 + v);
    }
  });
  paintTile('chest_side', t => {
    plankBase(t, -18);
    for (const yy of [0, 15]) for (let x = 0; x < TILE; x++) t.px(x, yy, 82, 58, 32);
    for (const xx of [0, 15]) for (let y = 0; y < TILE; y++) t.px(xx, y, 82, 58, 32);
    for (let x = 0; x < TILE; x++) { t.px(x, 5, 92, 66, 36); t.px(x, 6, 118, 88, 50); }
  });
  paintTile('chest_front', t => {
    plankBase(t, -18);
    for (const yy of [0, 15]) for (let x = 0; x < TILE; x++) t.px(x, yy, 82, 58, 32);
    for (const xx of [0, 15]) for (let y = 0; y < TILE; y++) t.px(xx, y, 82, 58, 32);
    for (let x = 0; x < TILE; x++) { t.px(x, 5, 92, 66, 36); t.px(x, 6, 118, 88, 50); }
    for (let y = 5; y < 10; y++) for (let x = 6; x < 10; x++) t.px(x, y, 176, 168, 140);   // latch
    for (let y = 7; y < 9; y++) t.px(8, y, 60, 54, 44);
  });
  paintTile('chest_top', t => {
    plankBase(t, -10);
    for (const yy of [0, 15]) for (let x = 0; x < TILE; x++) t.px(x, yy, 82, 58, 32);
    for (const xx of [0, 15]) for (let y = 0; y < TILE; y++) t.px(xx, y, 82, 58, 32);
  });
  paintTile('furnace_front', t => {
    t.fill(118, 118, 118, 10); t.specks(26, 96, 96, 96, 8);
    for (let y = 6; y < 14; y++) for (let x = 3; x < 13; x++) t.px(x, y, 44, 40, 38);
    for (let y = 11; y < 14; y++) for (let x = 4; x < 12; x++) {
      const v = (t.rnd() - 0.5) * 30;
      t.px(x, y, 226 + v, 122 + v, 40 + v);                        // embers
    }
    for (let x = 3; x < 13; x++) t.px(x, 5, 86, 86, 86);
  });
  paintTile('furnace_top', t => { t.fill(122, 122, 122, 10); for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) t.px(x, y, 78, 78, 78); });
  paintTile('bookshelf', t => {
    plankBase(t, 0);
    for (const yy of [0, 1, 7, 8, 14, 15]) for (let x = 0; x < TILE; x++) {
      const v = (t.rnd() - 0.5) * 8;
      t.px(x, yy, 150 + v, 114 + v, 68 + v);
    }
    const spines = [[168, 60, 52], [70, 96, 168], [200, 176, 88], [96, 148, 80], [150, 92, 160]];
    for (const shelf of [2, 9]) {
      let x = 1;
      while (x < 15) {
        const w = 1 + ((t.rnd() * 2) | 0);
        const c = spines[(t.rnd() * spines.length) | 0];
        for (let dx = 0; dx < w && x + dx < 15; dx++)
          for (let y = shelf; y < shelf + 5; y++) t.px(x + dx, y, c[0], c[1], c[2]);
        x += w + 1;
      }
    }
  });
  paintTile('barrel_side', t => {
    plankBase(t, -6);
    for (const yy of [1, 2, 13, 14]) for (let x = 0; x < TILE; x++) t.px(x, yy, 84, 62, 36);
  });
  paintTile('barrel_top', t => {
    plankBase(t, -2);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (d > 7) t.px(x, y, 84, 62, 36);
      else if (d > 5.6) t.px(x, y, 104, 76, 44);
    }
    for (let x = 5; x < 11; x++) t.px(x, 7, 92, 68, 40);
  });

  const doorPanel = (t, windowTop) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const v = (t.rnd() - 0.5) * 8;
      const frame = x < 2 || x > 13 || y < 1 || y > 14;
      t.px(x, y, (frame ? 132 : 158) + v, (frame ? 98 : 120) + v, (frame ? 58 : 72) + v);
    }
    for (const yy of [1, 14]) for (let x = 2; x < 14; x++) t.px(x, yy, 120, 88, 52);
    if (windowTop) {
      for (let y = 3; y < 8; y++) for (let x = 4; x < 12; x++) t.px(x, y, 168, 196, 210);
      for (let y = 3; y < 8; y++) { t.px(4, y, 110, 82, 48); t.px(11, y, 110, 82, 48); }
      for (let x = 4; x < 12; x++) { t.px(x, 3, 110, 82, 48); t.px(x, 7, 110, 82, 48); }
    } else {
      for (let y = 3; y < 12; y++) for (let x = 4; x < 12; x++) {
        const v = (t.rnd() - 0.5) * 6;
        t.px(x, y, 146 + v, 110 + v, 66 + v);
      }
      for (let x = 4; x < 12; x++) { t.px(x, 3, 116, 86, 50); t.px(x, 11, 116, 86, 50); }
      for (let y = 3; y < 12; y++) { t.px(4, y, 116, 86, 50); t.px(11, y, 116, 86, 50); }
    }
    for (let y = 7; y < 10; y++) t.px(13, y, 96, 92, 78);      // handle
  };
  paintTile('door_lower', t => doorPanel(t, false));
  paintTile('door_upper', t => doorPanel(t, true));
  paintTile('door_open', t => {
    t.data.fill(0);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < 3; x++) {
      const v = (t.rnd() - 0.5) * 8;
      t.px(x, y, 146 + v, 110 + v, 66 + v, 255);
    }
  });

  paintTile('end_stone', t => {
    t.fill(220, 224, 168, 10);
    t.specks(30, 198, 202, 142, 8);
    t.specks(16, 240, 242, 200, 6);
  });
  paintTile('purpur', t => {
    t.fill(168, 122, 168, 9);
    t.specks(28, 146, 100, 148, 7);
    t.specks(14, 196, 152, 196, 6);
  });
  paintTile('end_frame_top', t => {
    t.fill(96, 116, 100, 8);
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) t.px(x, y, 62, 78, 68);
  });
  paintTile('end_frame_filled_top', t => {
    t.fill(96, 116, 100, 8);
    for (let y = 3; y < 13; y++) for (let x = 3; x < 13; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const v = (t.rnd() - 0.5) * 20;
      if (d < 4.6) t.px(x, y, 108 + v, 216 + v, 176 + v);          // the eye
      else t.px(x, y, 62, 78, 68);
    }
    t.px(7, 7, 236, 255, 236); t.px(8, 7, 236, 255, 236);
  });
  paintTile('end_frame_side', t => {
    t.fill(104, 124, 108, 8);
    for (let x = 0; x < TILE; x++) { t.px(x, 3, 74, 92, 80); t.px(x, 4, 132, 152, 134); }
  });
  paintTile('end_portal', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const v = (t.rnd() - 0.5) * 26;
      t.px(x, y, 14 + v, 10 + v, 30 + v);
    }
    for (let i = 0; i < 26; i++) {                                   // stars in the dark
      const b = 120 + t.rnd() * 135;
      t.px((t.rnd() * TILE) | 0, (t.rnd() * TILE) | 0, b * 0.8, b, b);
    }
  });

  paintTile('end_crystal', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const v = (t.rnd() - 0.5) * 18;
      if (d > 6.5) t.px(x, y, 176 + v, 206 + v, 190 + v);
      else if (d > 4) t.px(x, y, 226 + v, 246 + v, 214 + v);
      else t.px(x, y, 250 + v, 255, 236 + v);
    }
    for (let i = 0; i < 8; i++) t.px((t.rnd() * TILE) | 0, (t.rnd() * TILE) | 0, 255, 255, 255);
  });
  paintTile('dragon_egg', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.hypot((x - 7.5) * 0.8, y - 7.5);
      const v = (t.rnd() - 0.5) * 12;
      if (d > 7.6) t.px(x, y, 12, 10, 16);
      else t.px(x, y, 26 + v + (15 - y) * 1.6, 14 + v, 38 + v + (15 - y) * 2);
    }
    for (let i = 0; i < 10; i++) t.px(2 + ((t.rnd() * 12) | 0), 2 + ((t.rnd() * 12) | 0), 132, 96, 176);
  });

  paintTile('sandstone_top', t => { t.fill(222, 209, 160, 7); t.specks(24, 205, 190, 142, 6); });
  paintTile('sandstone_side', t => {
    for (let y = 0; y < TILE; y++) {
      const band = y < 3 ? 10 : (y % 5 === 0 ? -16 : 0);
      for (let x = 0; x < TILE; x++) { const v = band + (t.rnd() - 0.5) * 8; t.px(x, y, 218 + v, 205 + v, 156 + v); }
    }
  });
}

// ---- Block table -------------------------------------------------------
// faces order: +X, -X, +Y(top), -Y(bottom), +Z, -Z
const BLOCKS = [];
function defBlock(name, tiles, opts = {}) {
  const t = typeof tiles === 'string'
    ? { top: tiles, side: tiles, bottom: tiles }
    : { top: tiles.top, side: tiles.side, bottom: tiles.bottom || tiles.side, front: tiles.front };
  const f = n => TILE_ID[n];
  BLOCKS.push(Object.assign({
    id: BLOCKS.length, name,
    faces: [f(t.side), f(t.side), f(t.top), f(t.bottom), f(t.side), f(t.front || t.side)],
    solid: true,      // stops the player
    opaque: true,     // culls neighbour faces and blocks light
    liquid: false,
    translucent: false, // drawn in the blended pass
    light: 0,
    hardness: 1,
  }, opts));
  return BLOCKS.length - 1;
}

let B = {};
function buildBlocks() {
  BLOCKS.length = 0;
  BLOCKS.push({ id: 0, name: 'Air', faces: [0,0,0,0,0,0], solid: false, opaque: false, liquid: false, translucent: false, light: 0 });
  B = {
    AIR: 0,
    GRASS: defBlock('Grass Block', { top: 'grass_top', side: 'grass_side', bottom: 'dirt' }),
    DIRT: defBlock('Dirt', 'dirt'),
    STONE: defBlock('Stone', 'stone'),
    COBBLESTONE: defBlock('Cobblestone', 'cobblestone'),
    SAND: defBlock('Sand', 'sand'),
    WATER: defBlock('Water', 'water', { solid: false, opaque: false, liquid: true, translucent: true, level: 0, fluid: 'water' }),
    LOG: defBlock('Oak Log', { top: 'log_top', side: 'log_side' }),
    LEAVES: defBlock('Oak Leaves', 'leaves'),
    PLANKS: defBlock('Oak Planks', 'planks'),
    GLASS: defBlock('Glass', 'glass', { opaque: false }),   // alpha-tested in the solid pass
    BRICK: defBlock('Bricks', 'brick'),
    SNOW: defBlock('Snow Block', 'snow'),
    BEDROCK: defBlock('Bedrock', 'bedrock'),
    GRAVEL: defBlock('Gravel', 'gravel'),
    COAL_ORE: defBlock('Coal Ore', 'coal_ore'),
    IRON_ORE: defBlock('Iron Ore', 'iron_ore'),
    GOLD_ORE: defBlock('Gold Ore', 'gold_ore'),
    DIAMOND_ORE: defBlock('Diamond Ore', 'diamond_ore'),
    GLOWSTONE: defBlock('Glowstone', 'glowstone', { light: 15 }),
    OBSIDIAN: defBlock('Obsidian', 'obsidian'),
    SANDSTONE: defBlock('Sandstone', { top: 'sandstone_top', side: 'sandstone_side' }),
    // --- crafted blocks (ids appended so existing saves keep their meaning)
    CRAFTING_TABLE: defBlock('Crafting Table', { top: 'crafting_top', side: 'crafting_side', bottom: 'planks' }),
    STONE_BRICKS: defBlock('Stone Bricks', 'stone_bricks'),
    CHISELED_STONE_BRICKS: defBlock('Chiseled Stone Bricks', 'chiseled_stone_bricks'),
    MOSSY_STONE_BRICKS: defBlock('Mossy Stone Bricks', 'mossy_stone_bricks'),
    LAMP: defBlock('Lamp', 'lamp', { light: 15 }),
    ANDESITE: defBlock('Andesite', 'andesite'),
    DIORITE: defBlock('Diorite', 'diorite'),
    GRANITE: defBlock('Granite', 'granite'),
    POLISHED_ANDESITE: defBlock('Polished Andesite', 'polished_andesite'),
    POLISHED_DIORITE: defBlock('Polished Diorite', 'polished_diorite'),
    POLISHED_GRANITE: defBlock('Polished Granite', 'polished_granite'),
    DEEPSLATE: defBlock('Deepslate', 'deepslate'),
    REDSTONE_ORE: defBlock('Redstone Ore', 'redstone_ore'),
    LAPIS_ORE: defBlock('Lapis Ore', 'lapis_ore'),
    EMERALD_ORE: defBlock('Emerald Ore', 'emerald_ore'),
    COAL_BLOCK: defBlock('Block of Coal', 'coal_block'),
    IRON_BLOCK: defBlock('Block of Iron', 'iron_block'),
    GOLD_BLOCK: defBlock('Block of Gold', 'gold_block'),
    DIAMOND_BLOCK: defBlock('Block of Diamond', 'diamond_block'),
    LAPIS_BLOCK: defBlock('Lapis Block', 'lapis_block'),
    EMERALD_BLOCK: defBlock('Block of Emerald', 'emerald_block'),
    REDSTONE_BLOCK: defBlock('Block of Redstone', 'redstone_block'),
    BIRCH_LOG: defBlock('Birch Log', { top: 'birch_log_top', side: 'birch_log_side' }),
    BIRCH_PLANKS: defBlock('Birch Planks', 'birch_planks'),
    BIRCH_LEAVES: defBlock('Birch Leaves', 'birch_leaves'),
    SPRUCE_LOG: defBlock('Spruce Log', { top: 'spruce_log_top', side: 'spruce_log_side' }),
    SPRUCE_PLANKS: defBlock('Spruce Planks', 'spruce_planks'),
    SPRUCE_LEAVES: defBlock('Spruce Leaves', 'spruce_leaves'),
    CLAY: defBlock('Clay', 'clay'),
    TERRACOTTA: defBlock('Terracotta', 'terracotta'),
    ICE: defBlock('Ice', 'ice'),
    PACKED_ICE: defBlock('Packed Ice', 'packed_ice'),
    CACTUS: defBlock('Cactus', { top: 'cactus_top', side: 'cactus_side' }),
    PUMPKIN: defBlock('Pumpkin', { top: 'pumpkin_top', side: 'pumpkin_side', front: 'pumpkin_face' }),
    MOSSY_COBBLESTONE: defBlock('Mossy Cobblestone', 'mossy_cobblestone'),
    WOOL: defBlock('White Wool', 'wool_white'),
    RED_WOOL: defBlock('Red Wool', 'wool_red'),
    YELLOW_WOOL: defBlock('Yellow Wool', 'wool_yellow'),
    GREEN_WOOL: defBlock('Green Wool', 'wool_green'),
    BLUE_WOOL: defBlock('Blue Wool', 'wool_blue'),
    BLACK_WOOL: defBlock('Black Wool', 'wool_black'),
  };
  // Flowing water: one block per level, the way Minecraft stores it in metadata.
  // Level 1 is nearly full, level 7 is the last thin edge before it dries up.
  B.WATER_FLOW = [B.WATER];
  for (let level = 1; level <= 7; level++) {
    B.WATER_FLOW.push(defBlock('Flowing Water', 'water',
      { solid: false, opaque: false, liquid: true, translucent: true, level, flowing: true, fluid: 'water' }));
  }

  Object.assign(B, {
    NETHERRACK: defBlock('Netherrack', 'netherrack'),
    SOUL_SAND: defBlock('Soul Sand', 'soul_sand'),
    NETHER_BRICKS: defBlock('Nether Bricks', 'nether_bricks'),
    QUARTZ_ORE: defBlock('Nether Quartz Ore', 'quartz_ore'),
    LAVA: defBlock('Lava', 'lava', { solid: false, opaque: false, liquid: true, level: 0, fluid: 'lava', light: 15 }),
    PORTAL: defBlock('Nether Portal', 'portal', { solid: false, opaque: false, translucent: true, light: 11, portal: true }),
  });
  Object.assign(B, {
    BED_HEAD: defBlock('Bed', { top: 'bed_top_head', side: 'bed_side', bottom: 'planks' }),
    BED_FOOT: defBlock('Bed Foot', { top: 'bed_top_foot', side: 'bed_side', bottom: 'planks' }),
    CHEST: defBlock('Chest', { top: 'chest_top', side: 'chest_side', bottom: 'chest_top', front: 'chest_front' }),
    FURNACE: defBlock('Furnace', { top: 'furnace_top', side: 'cobblestone', bottom: 'cobblestone', front: 'furnace_front' }),
    BOOKSHELF: defBlock('Bookshelf', { top: 'planks', side: 'bookshelf', bottom: 'planks' }),
    BARREL: defBlock('Barrel', { top: 'barrel_top', side: 'barrel_side', bottom: 'barrel_top' }),
  });

  Object.assign(B, {
    DOOR_LOWER: defBlock('Oak Door', { top: 'planks', side: 'door_lower', bottom: 'planks' }),
    DOOR_UPPER: defBlock('Oak Door Top', { top: 'planks', side: 'door_upper', bottom: 'planks' }),
    DOOR_LOWER_OPEN: defBlock('Open Door', 'door_open', { solid: false, opaque: false, door: true }),
    DOOR_UPPER_OPEN: defBlock('Open Door Top', 'door_open', { solid: false, opaque: false, door: true }),
  });
  BLOCKS[B.DOOR_LOWER].door = true;
  BLOCKS[B.DOOR_UPPER].door = true;

  Object.assign(B, {
    END_STONE: defBlock('End Stone', 'end_stone'),
    PURPUR: defBlock('Purpur Block', 'purpur'),
    END_FRAME: defBlock('End Portal Frame', { top: 'end_frame_top', side: 'end_frame_side', bottom: 'end_frame_side' }),
    END_FRAME_FILLED: defBlock('End Portal Frame', { top: 'end_frame_filled_top', side: 'end_frame_side', bottom: 'end_frame_side' }, { light: 6 }),
    END_PORTAL: defBlock('End Portal', 'end_portal', { solid: false, opaque: false, light: 15, endPortal: true }),
  });

  Object.assign(B, {
    END_CRYSTAL: defBlock('End Crystal', 'end_crystal', { light: 15 }),
    DRAGON_EGG: defBlock('Dragon Egg', 'dragon_egg', { light: 3 }),
  });

  B.LAVA_FLOW = [B.LAVA];
  for (let level = 1; level <= 3; level++) {
    B.LAVA_FLOW.push(defBlock('Flowing Lava', 'lava',
      { solid: false, opaque: false, liquid: true, level, fluid: 'lava', flowing: true, light: 15 }));
  }

}

const isOpaque = id => BLOCKS[id].opaque;
const isSolid = id => BLOCKS[id].solid;
const isLiquid = id => BLOCKS[id].liquid;
const isWaterBlock = id => BLOCKS[id].fluid === 'water';
const isLavaBlock = id => BLOCKS[id].fluid === 'lava';

// Small canvas preview of one texture layer, for the hotbar / inventory.
// Cached: the UI asks often.
const ICON_CACHE = new Map();
function tileIcon(layer, size = 48) {
  const key = layer + ':' + size;
  let url = ICON_CACHE.get(key);
  if (url) return url;
  url = renderTileIcon(layer, size);
  ICON_CACHE.set(key, url);
  return url;
}
function blockIcon(id, size = 48) { return tileIcon(BLOCKS[id].faces[0], size); }
function renderTileIcon(layer, size) {
  const c = document.createElement('canvas');
  c.width = c.height = TILE;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(TILE, TILE);
  img.data.set(TILES[layer]);
  ctx.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const octx = out.getContext('2d');
  octx.imageSmoothingEnabled = false;
  octx.drawImage(c, 0, 0, size, size);
  return out.toDataURL();
}
