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
  const carved = (name, eye, mouth, glow) => paintTile(name, t => {
    for (let x = 0; x < TILE; x++) {
      const rib = x % 4 === 0 ? -26 : 0;
      for (let y = 0; y < TILE; y++) {
        const v = rib + (t.rnd() - 0.5) * 9;
        t.px(x, y, 224 + v, 138 + v, 38 + v);
      }
    }
    for (let i = 0; i < 4; i++) for (let k = 0; k <= i; k++) {        // two triangular eyes
      t.px(3 + i, 4 + k, eye[0], eye[1], eye[2]);
      t.px(12 - i, 4 + k, eye[0], eye[1], eye[2]);
    }
    for (let x = 3; x < 13; x++) t.px(x, 10, mouth[0], mouth[1], mouth[2]);   // a jagged grin
    for (const x of [4, 6, 9, 11]) t.px(x, 11, mouth[0], mouth[1], mouth[2]);
    for (const x of [5, 8, 10]) t.px(x, 9, mouth[0], mouth[1], mouth[2]);
    if (glow) for (let i = 0; i < 10; i++) {
      t.px(3 + ((t.rnd() * 10) | 0), 9 + ((t.rnd() * 3) | 0), glow[0], glow[1], glow[2]);
    }
  });
  carved('pumpkin_red_face', [224, 40, 34], [120, 20, 18], [255, 120, 96]);
  carved('pumpkin_lit_face', [255, 214, 96], [148, 74, 12], [255, 244, 176]);

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

  const crossTile = (name, draw) => paintTile(name, t => {
    t.data.fill(0);
    draw(t);
  });
  crossTile('flower_red', t => {
    for (let y = 8; y < 15; y++) t.px(7, y, 62, 122, 54, 255);
    for (const [x, y] of [[6, 10], [8, 11]]) t.px(x, y, 74, 138, 60, 255);
    for (let y = 4; y < 8; y++) for (let x = 5; x < 10; x++) {
      if ((x === 5 || x === 9) && (y === 4 || y === 7)) continue;
      t.px(x, y, 206 + (t.rnd() - 0.5) * 20, 54, 48, 255);
    }
    t.px(7, 6, 242, 214, 96, 255);
  });
  crossTile('flower_yellow', t => {
    for (let y = 8; y < 15; y++) t.px(8, y, 62, 122, 54, 255);
    for (const [x, y] of [[7, 10], [9, 12]]) t.px(x, y, 74, 138, 60, 255);
    for (let y = 4; y < 8; y++) for (let x = 6; x < 11; x++) {
      if ((x === 6 || x === 10) && (y === 4 || y === 7)) continue;
      t.px(x, y, 232 + (t.rnd() - 0.5) * 18, 206, 62, 255);
    }
    t.px(8, 6, 152, 110, 40, 255);
  });
  crossTile('tall_grass', t => {
    for (let i = 0; i < 7; i++) {
      const x = 3 + i * 1.6, h = 5 + ((t.rnd() * 6) | 0);
      for (let k = 0; k < h; k++) {
        const v = (t.rnd() - 0.5) * 24;
        t.px(Math.round(x + k * 0.16), 15 - k, 74 + v, 142 + v, 58 + v, 255);
      }
    }
  });
  crossTile('ladder', t => {
    for (const x of [3, 12]) for (let y = 0; y < TILE; y++) {
      const v = (t.rnd() - 0.5) * 12;
      t.px(x, y, 150 + v, 112 + v, 62 + v, 255);
    }
    for (let y = 1; y < TILE; y += 4) for (let x = 3; x <= 12; x++) {
      const v = (t.rnd() - 0.5) * 10;
      t.px(x, y, 132 + v, 96 + v, 52 + v, 255);
    }
  });

  woolTile('wool_orange', [214, 126, 46]);
  woolTile('wool_magenta', [186, 76, 190]);
  woolTile('wool_lightblue', [92, 156, 216]);
  woolTile('wool_lime', [126, 200, 62]);
  woolTile('wool_pink', [226, 140, 170]);
  woolTile('wool_grey', [76, 80, 86]);
  woolTile('wool_lightgrey', [154, 158, 162]);
  woolTile('wool_cyan', [46, 148, 156]);
  woolTile('wool_purple', [122, 62, 174]);
  woolTile('wool_brown', [110, 76, 46]);
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
  paintTile('time_portal', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const swirl = Math.sin(d * 1.7 - Math.atan2(y - 7.5, x - 7.5) * 3) * 34;
      const v = (t.rnd() - 0.5) * 20;
      t.px(x, y, 96 + swirl + v, 176 + swirl * 0.6 + v, 78 + v, 205);
    }
    for (let i = 0; i < 14; i++) t.px((t.rnd() * TILE) | 0, (t.rnd() * TILE) | 0, 238, 250, 190, 235);
  });

  paintTile('future_portal', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const band = Math.sin(d * 2.2 - Math.atan2(y - 7.5, x - 7.5)) * 40;
      const v = (t.rnd() - 0.5) * 18;
      t.px(x, y, 60 + band * 0.4 + v, 190 + band + v, 214 + band + v, 210);
    }
    for (let i = 0; i < 12; i++) t.px((t.rnd() * TILE) | 0, (t.rnd() * TILE) | 0, 236, 255, 255, 240);
  });
  paintTile('plating', t => {
    t.fill(122, 128, 136, 8);
    for (const i of [0, 15]) for (let k = 0; k < TILE; k++) { t.px(k, i, 84, 88, 96); t.px(i, k, 84, 88, 96); }
    for (let k = 0; k < TILE; k++) t.px(k, 7, 96, 100, 108);                      // a panel seam
    for (const [rx, ry] of [[2,2],[13,2],[2,13],[13,13]]) t.px(rx, ry, 176, 182, 192);   // rivets
    t.specks(14, 96, 88, 78, 8);                                                  // rust
  });
  paintTile('neon', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const edge = x < 2 || y < 2 || x > 13 || y > 13;
      const v = (t.rnd() - 0.5) * 12;
      t.px(x, y, edge ? 40 : 90 + v, edge ? 46 : 236 + v, edge ? 54 : 244 + v);
    }
    for (let k = 3; k < 13; k++) { t.px(k, 5, 240, 255, 255); t.px(k, 10, 240, 255, 255); }
  });
  paintTile('circuit', t => {
    t.fill(28, 62, 44, 6);
    for (const y of [3, 8, 12]) for (let x = 1; x < 15; x++) t.px(x, y, 208, 176, 72);   // gold traces
    for (const x of [4, 11]) for (let y = 1; y < 15; y++) t.px(x, y, 208, 176, 72);
    for (let y = 5; y < 8; y++) for (let x = 6; x < 10; x++) t.px(x, y, 26, 28, 32);     // the chip
    t.px(7, 6, 190, 60, 52);
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

  // --- a workshop printer and a television -------------------------------
  const panel = (t, base) => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const edge = x < 1 || y < 1 || x > 14 || y > 14;
      const v = (t.rnd() - 0.5) * 7;
      t.px(x, y, base[0] + v - (edge ? 22 : 0), base[1] + v - (edge ? 22 : 0), base[2] + v - (edge ? 22 : 0));
    }
  };
  paintTile('printer_side', t => {
    panel(t, [92, 96, 104]);
    for (const y of [4, 6, 8, 10]) for (let x = 3; x < 13; x++) t.px(x, y, 58, 62, 70);   // vents
  });
  paintTile('printer_top', t => {
    panel(t, [78, 82, 90]);
    for (let x = 1; x < 15; x++) { t.px(x, 5, 176, 180, 188); t.px(x, 10, 176, 180, 188); }   // gantry rails
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) t.px(x, y, 132, 138, 148);      // the head
    for (let y = 10; y < 12; y++) for (let x = 7; x < 9; x++) t.px(x, y, 232, 176, 62);       // hot nozzle
  });
  paintTile('printer_front', t => {
    panel(t, [92, 96, 104]);
    for (let y = 3; y < 9; y++) for (let x = 2; x < 14; x++) {
      const v = (t.rnd() - 0.5) * 10;
      t.px(x, y, 34 + v, 44 + v, 38 + v);                                                     // the window
    }
    for (let y = 5; y < 8; y++) for (let x = 5; x < 11; x++) t.px(x, y, 120, 214, 140);        // something printing
    for (const x of [4, 7, 10]) { t.px(x, 12, 226, 92, 72); t.px(x + 1, 12, 92, 200, 226); }   // buttons
  });

  paintTile('tv_side', t => {
    panel(t, [46, 48, 54]);
    for (let x = 5; x < 11; x++) t.px(x, 14, 120, 124, 132);
  });
  const screen = (name, draw) => paintTile(name, t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const v = (t.rnd() - 0.5) * 6;
      t.px(x, y, 40 + v, 42 + v, 48 + v);                                                     // the casing
    }
    for (let y = 2; y < 13; y++) for (let x = 1; x < 15; x++) draw(t, x, y);
    for (let x = 6; x < 10; x++) t.px(x, 14, 96, 100, 108);                                   // the stand
  });
  screen('tv_off', (t, x, y) => {
    const v = (t.rnd() - 0.5) * 5;
    t.px(x, y, 16 + v, 18 + v, 22 + v);
    if (x === 13 && y === 11) t.px(x, y, 180, 60, 52);                                        // standby light
  });
  screen('tv_bars', (t, x, y) => {
    const bars = [[220,220,220],[220,214,64],[64,214,220],[64,200,80],[214,72,190],[214,72,64],[72,84,214]];
    const c = bars[Math.min(bars.length - 1, Math.floor((x - 1) / 2))];
    const v = (t.rnd() - 0.5) * 8;
    t.px(x, y, c[0] + v, c[1] + v, c[2] + v);
  });
  screen('tv_view', (t, x, y) => {
    const v = (t.rnd() - 0.5) * 8;
    if (y < 7) t.px(x, y, 96 + v, 156 + v, 226 + v);                                          // sky
    else if (y < 9) t.px(x, y, 62 + v, 122 + v, 58 + v);                                      // hills
    else t.px(x, y, 88 + v, 148 + v, 62 + v);                                                 // field
    if (x > 10 && x < 13 && y > 2 && y < 5) t.px(x, y, 250, 230, 140);                         // sun
  });
  screen('tv_static', (t, x, y) => {
    const g = t.rnd() < 0.5 ? 30 + t.rnd() * 40 : 150 + t.rnd() * 100;
    t.px(x, y, g, g, g);
  });

  paintTile('darkstone', t => {
    t.fill(28, 26, 34, 6);
    t.specks(30, 14, 13, 18, 5);
    for (let i = 0; i < 8; i++) {                        // a few cold glints in the dark
      const cx = (t.rnd() * TILE) | 0, cy = (t.rnd() * TILE) | 0;
      t.px(cx, cy, 68, 62, 88);
    }
  });

  // ---- the Deep Lands ---------------------------------------------------
  // Everything down there is one of two colours: deepslate, which is nearly
  // black, and the cold blue-green light of the sculk, which is the only thing
  // that can be seen from more than a few blocks away.
  const SCULK_LIT = [86, 224, 216], SCULK_DARK = [12, 20, 26];

  paintTile('reinforced_deepslate', t => {
    t.fill(58, 60, 68, 8);
    t.specks(30, 42, 44, 52, 6);
    for (let i = 0; i < TILE; i++) {                       // a band of old metal across the middle
      t.px(i, 6, 118, 116, 128); t.px(i, 9, 96, 94, 108);
      t.px(6, i, 112, 110, 122); t.px(9, i, 92, 90, 104);
    }
    for (const [x, y] of [[7, 7], [8, 8], [7, 8], [8, 7]]) t.px(x, y, 148, 204, 198);
  });

  paintTile('sculk', t => {
    t.fill(SCULK_DARK[0], SCULK_DARK[1], SCULK_DARK[2], 5);
    for (let i = 0; i < 5; i++) {                          // veins wandering across it
      let x = (t.rnd() * TILE) | 0, y = (t.rnd() * TILE) | 0;
      for (let k = 0; k < 14; k++) {
        const f = 0.28 + t.rnd() * 0.5;
        t.px(x, y, SCULK_LIT[0] * f, SCULK_LIT[1] * f, SCULK_LIT[2] * f);
        x = (x + (t.rnd() < 0.5 ? 1 : -1) + TILE) % TILE;
        y = (y + (t.rnd() < 0.6 ? 1 : 0) + TILE) % TILE;
      }
    }
    for (let i = 0; i < 10; i++) t.px((t.rnd() * TILE) | 0, (t.rnd() * TILE) | 0, 40, 96, 100);
  });

  paintTile('sculk_bloom', t => {                          // sculk that has flowered, and glows
    t.fill(16, 30, 36, 5);
    for (let i = 0; i < 26; i++) {
      const x = (t.rnd() * TILE) | 0, y = (t.rnd() * TILE) | 0, f = 0.5 + t.rnd() * 0.5;
      t.px(x, y, SCULK_LIT[0] * f, SCULK_LIT[1] * f, SCULK_LIT[2] * f);
      if (t.rnd() < 0.5) t.px(x + 1, y, SCULK_LIT[0] * 0.4, SCULK_LIT[1] * 0.4, SCULK_LIT[2] * 0.4);
    }
  });

  paintTile('sensor_top', t => {                           // the listening one: tendrils around a dish
    t.fill(18, 34, 42, 5);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      for (let r = 3; r < 8; r++) {
        const f = 1 - (r - 3) / 6;
        t.px(8 + Math.cos(a) * r, 8 + Math.sin(a) * r, SCULK_LIT[0] * f, SCULK_LIT[1] * f, SCULK_LIT[2] * f);
      }
    }
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) t.px(x, y, 156, 244, 236);
  });
  paintTile('sensor_side', t => {
    t.fill(14, 26, 32, 5);
    for (let x = 0; x < TILE; x++) {
      const h = 2 + ((t.rnd() * 3) | 0);
      for (let y = 0; y < h; y++) {
        const f = 0.8 - y * 0.2;
        t.px(x, y, SCULK_LIT[0] * f, SCULK_LIT[1] * f, SCULK_LIT[2] * f);
      }
    }
  });

  paintTile('echo_ore', t => {
    t.fill(48, 50, 58, 7);
    t.specks(26, 38, 40, 48, 5);
    for (const [cx, cy] of [[4, 5], [10, 4], [6, 11], [12, 10]]) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]) {
        t.px(cx + dx, cy + dy, 120 + t.rnd() * 40, 226, 220);
      }
      t.px(cx, cy, 220, 252, 250);
    }
  });

  paintTile('deepslate_bricks', t => {
    t.fill(52, 54, 62, 6);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const row = (y / 8) | 0, off = row % 2 ? 8 : 0;
      if (y % 8 === 0 || (x + off) % 16 === 0) t.px(x, y, 32, 34, 40);
    }
    t.specks(18, 68, 70, 80, 6);
  });

  // Crystals. Three of them, the same shape in three different tempers: the
  // Deep Lands swap between them depending on how much noise is being made.
  const crystalTile = (name, glow) => paintTile(name, t => {
    t.fill(20, 24, 32, 4);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.abs(x - 8) + Math.abs(y - 8);
      if (d > 8) continue;
      const f = 1 - d / 11 + (t.rnd() - 0.5) * 0.18;
      t.px(x, y, glow[0] * f, glow[1] * f, glow[2] * f);
    }
    for (let y = 4; y < 12; y++) t.px(8, y, glow[0], glow[1], glow[2]);
  });
  crystalTile('crystal_calm', [72, 196, 210]);
  crystalTile('crystal_roused', [186, 176, 84]);
  crystalTile('crystal_alarmed', [222, 74, 86]);

  crossTile('spore_blossom', t => {
    for (let y = 9; y < 16; y++) t.px(8, y, 44, 96, 92, 255);       // the stem it hangs from
    for (const [x, y] of [[5, 5], [11, 5], [5, 9], [11, 9], [8, 3], [8, 11], [3, 7], [13, 7]]) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        t.px(x + dx, y + dy, 168 + t.rnd() * 50, 108, 206, 255);
      }
    }
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) t.px(x, y, 246, 232, 168, 255);
  });

  paintTile('deep_portal', t => {                          // the way in, seen edge-on
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const f = 0.25 + 0.75 * Math.abs(Math.sin(d * 0.9 + t.rnd() * 0.4));
      t.px(x, y, 26 + f * 70, 60 + f * 170, 90 + f * 150, 210);
    }
  });

  // ---- the Hacker Dimension ---------------------------------------------
  // A world somebody has been at with tools they should not have. Everything in
  // it looks like a rendering that has gone wrong on purpose.
  paintTile('voidstone', t => {                          // the floor of the grid
    t.fill(10, 12, 16, 3);
    for (let i = 0; i < TILE; i++) { t.px(i, 0, 40, 210, 120); t.px(0, i, 40, 210, 120); }
    for (let i = 0; i < TILE; i += 4) { t.px(i, 8, 20, 80, 52); t.px(8, i, 20, 80, 52); }
  });

  paintTile('corrupt', t => {                            // the texture that is not there
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const on = (((x >> 3) + (y >> 3)) & 1) === 0;
      t.px(x, y, on ? 232 : 8, on ? 40 : 8, on ? 232 : 12);
    }
  });

  paintTile('datastream', t => {                         // characters falling down a column
    t.data.fill(0);
    for (const x of [2, 6, 10, 13]) {
      const start = (t.rnd() * TILE) | 0;
      for (let k = 0; k < 11; k++) {
        const y = (start + k) % TILE;
        const f = 1 - k / 12;
        t.px(x, y, 40 * f, (150 + 105 * f) * f, 90 * f, 255);
        if (t.rnd() < 0.4) t.px(x + 1, y, 30 * f, 150 * f, 70 * f, 255);
      }
    }
  });

  paintTile('rack_side', t => {                          // a server, still running
    t.fill(26, 28, 34, 5);
    for (let y = 1; y < TILE; y += 3) {
      for (let x = 1; x < TILE - 1; x++) t.px(x, y, 44, 46, 56);
      t.px(2, y, 90, 230, 130);
      if (t.rnd() < 0.5) t.px(4, y, 230, 180, 60);
    }
  });
  paintTile('rack_top', t => { t.fill(34, 36, 44, 5); t.specks(24, 60, 64, 76, 6); });

  paintTile('hack_portal', t => {                        // the way in, made of nothing but code
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const f = (((x * 5 + y * 3) % 7) < 3 ? 1 : 0.35) * (0.5 + t.rnd() * 0.5);
      t.px(x, y, 20 * f, 60 + 190 * f, 70 * f, 200);
    }
  });

  // ---- Poseidon's realm --------------------------------------------------
  // Prismarine is a stone that cannot make up its mind what colour it is, which
  // is exactly right for a place that is entirely underwater.
  const prismarineTile = (name, a, b) => paintTile(name, t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const m = (Math.sin(x * 0.9) + Math.cos(y * 0.7) + t.rnd() * 0.8) * 0.25 + 0.5;
      t.px(x, y, a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m, a[2] + (b[2] - a[2]) * m);
    }
  });
  prismarineTile('prismarine', [88, 152, 140], [130, 196, 176]);
  prismarineTile('dark_prismarine', [44, 82, 74], [64, 110, 96]);

  paintTile('prismarine_bricks', t => {
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const m = (Math.sin(x * 0.8) + Math.cos(y * 0.9)) * 0.2 + 0.55;
      t.px(x, y, 96 + 44 * m, 168 + 40 * m, 152 + 36 * m);
    }
    for (let i = 0; i < TILE; i++) { t.px(i, 0, 60, 108, 100); t.px(i, 8, 60, 108, 100); t.px(0, i, 60, 108, 100); t.px(8, i, 60, 108, 100); }
  });

  paintTile('sea_lantern', t => {
    t.fill(196, 226, 214, 6);
    for (let i = 0; i < 5; i++) {                        // the pale cells inside it
      const w = 3 + ((t.rnd() * 4) | 0), h = 3 + ((t.rnd() * 4) | 0);
      const ox = (t.rnd() * (TILE - w)) | 0, oy = (t.rnd() * (TILE - h)) | 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) t.px(ox + x, oy + y, 240, 252, 238);
    }
    t.specks(20, 160, 200, 190, 8);
  });

  paintTile('marble', t => { t.fill(226, 226, 218, 6); t.specks(26, 198, 200, 200, 8);
    let x = 3 + ((t.rnd() * 9) | 0);
    for (let y = 0; y < TILE; y++) { t.px(x, y, 186, 190, 194); if (t.rnd() < 0.5) x += t.rnd() < 0.5 ? 1 : -1; } });

  const coralTile = (name, col) => paintTile(name, t => {
    t.fill(col[0] * 0.7, col[1] * 0.7, col[2] * 0.7, 8);
    for (let i = 0; i < 26; i++) {                       // knuckly, uneven growth
      const cx = (t.rnd() * TILE) | 0, cy = (t.rnd() * TILE) | 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        t.px(cx + dx, cy + dy, col[0] + (t.rnd() - 0.5) * 30, col[1] + (t.rnd() - 0.5) * 30, col[2] + (t.rnd() - 0.5) * 30);
      }
    }
  });
  coralTile('coral_pink', [236, 118, 178]);
  coralTile('coral_blue', [92, 132, 232]);
  coralTile('coral_gold', [242, 190, 70]);

  crossTile('seagrass', t => {
    for (let i = 0; i < 6; i++) {
      const x = 3 + i * 1.8, h = 8 + ((t.rnd() * 7) | 0);
      for (let k = 0; k < h; k++) {
        const v = (t.rnd() - 0.5) * 26;
        t.px(Math.round(x + Math.sin(k * 0.5) * 1.4), 15 - k, 44 + v, 148 + v, 96 + v, 255);
      }
    }
  });

  paintTile('sea_portal', t => {                         // water standing upright
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const f = 0.35 + 0.65 * Math.abs(Math.sin((x + y * 1.7) * 0.55 + t.rnd() * 0.5));
      t.px(x, y, 40 + f * 70, 140 + f * 90, 190 + f * 60, 205);
    }
  });

  // ---- shops, runways, bushes and the Moon --------------------------------
  paintTile('shop_front', t => {                         // a counter with an awning over it
    t.fill(146, 106, 70, 8);
    for (let y = 0; y < 5; y++) for (let x = 0; x < TILE; x++) {
      t.px(x, y, ((x >> 1) & 1) ? 214 : 196, ((x >> 1) & 1) ? 74 : 214, ((x >> 1) & 1) ? 68 : 210);
    }
    for (let x = 0; x < TILE; x++) t.px(x, 5, 96, 68, 44);
    for (let y = 8; y < 12; y++) for (let x = 2; x < TILE - 2; x++) t.px(x, y, 178, 140, 96);
    t.specks(20, 120, 86, 56, 8);
  });
  paintTile('shop_side', t => { t.fill(132, 96, 62, 9); t.specks(24, 106, 76, 48, 8);
    for (let y = 0; y < 5; y++) for (let x = 0; x < TILE; x++) t.px(x, y, ((x >> 1) & 1) ? 200 : 190, ((x >> 1) & 1) ? 78 : 200, 72 + (((x >> 1) & 1) ? 0 : 130)); });
  paintTile('shop_top', t => { t.fill(160, 118, 78, 8); t.specks(22, 128, 92, 58, 8); });

  paintTile('tarmac', t => { t.fill(56, 58, 62, 5); t.specks(34, 42, 44, 48, 5); });
  paintTile('runway', t => {                             // asphalt with the centre line on it
    t.fill(44, 46, 50, 4);
    t.specks(30, 34, 36, 40, 4);
    for (let y = 3; y < 13; y++) for (let x = 6; x < 10; x++) t.px(x, y, 226, 226, 220);
  });

  crossTile('bush', t => {
    for (let i = 0; i < 60; i++) {
      const a = t.rnd() * Math.PI * 2, r = t.rnd() * 6.2;
      const x = Math.round(8 + Math.cos(a) * r), y = Math.round(11 + Math.sin(a) * r * 0.7);
      const v = (t.rnd() - 0.5) * 34;
      t.px(x, y, 58 + v, 118 + v, 52 + v, 255);
    }
    for (let y = 12; y < 16; y++) t.px(8, y, 92, 68, 44, 255);
  });
  crossTile('berry_bush', t => {
    for (let i = 0; i < 60; i++) {
      const a = t.rnd() * Math.PI * 2, r = t.rnd() * 6.2;
      const x = Math.round(8 + Math.cos(a) * r), y = Math.round(11 + Math.sin(a) * r * 0.7);
      const v = (t.rnd() - 0.5) * 30;
      t.px(x, y, 48 + v, 104 + v, 46 + v, 255);
    }
    for (const [x, y] of [[5, 8], [10, 7], [7, 12], [12, 11], [4, 12], [9, 10]]) {
      t.px(x, y, 208, 42, 46, 255); t.px(x + 1, y, 176, 30, 36, 255);
    }
    for (let y = 12; y < 16; y++) t.px(8, y, 92, 68, 44, 255);
  });

  paintTile('moon_rock', t => { t.fill(126, 124, 128, 9); t.specks(34, 96, 94, 100, 8); t.specks(16, 158, 156, 160, 6); });
  paintTile('moon_dust', t => { t.fill(158, 156, 158, 7); t.specks(40, 132, 130, 134, 6); t.specks(18, 186, 184, 186, 5); });
  paintTile('solar', t => {
    t.fill(26, 34, 62, 4);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      if (x % 4 === 0 || y % 8 === 0) t.px(x, y, 128, 132, 146);
      else if ((x + y) % 9 === 0) t.px(x, y, 66, 96, 158);
    }
  });

  // ---- things that go off ------------------------------------------------
  paintTile('tnt_side', t => {
    t.fill(196, 58, 48, 8);
    for (let y = 5; y < 11; y++) for (let x = 0; x < TILE; x++) t.px(x, y, 236, 236, 230);
    const word = ['..X..X..X..X....', '..X..X..X.X.....'];
    for (let y = 6; y < 10; y++) for (let x = 2; x < 13; x++) if ((x + y) % 5 === 0) t.px(x, y, 40, 40, 44);
    t.specks(18, 168, 44, 38, 6);
  });
  paintTile('tnt_top', t => { t.fill(206, 74, 62, 8); t.specks(24, 176, 52, 44, 7);
    for (let i = 0; i < TILE; i++) { t.px(i, 0, 150, 40, 34); t.px(0, i, 150, 40, 34); } });
  paintTile('nuke_side', t => {
    t.fill(206, 196, 60, 6);
    // the trefoil, roughly, in black
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const dx = x - 7.5, dy = y - 7.5, r = Math.hypot(dx, dy);
      if (r < 2) { t.px(x, y, 24, 24, 26); continue; }
      if (r < 3.4 || r > 7.2) continue;
      let a = Math.atan2(dy, dx) + Math.PI;
      const seg = (a / (Math.PI * 2 / 3)) % 1;
      if (seg < 0.55) t.px(x, y, 24, 24, 26);
    }
  });
  paintTile('nuke_top', t => { t.fill(196, 186, 56, 6); t.specks(26, 166, 158, 46, 7);
    for (let i = 0; i < TILE; i++) { t.px(i, 0, 40, 40, 30); t.px(0, i, 40, 40, 30); } });

  // Torches. The engine only draws whole cubes, so — exactly as the open door
  // does — the texture is mostly nothing, and what is left reads as a torch.
  // A torch is a thin post with a flame on the end, not a cube: it is drawn as a
  // sub-box, and the box takes its texture from the top ten-sixteenths of the
  // tile, so that is where the torch has to be painted.
  const torchTile = (name, bracket) => paintTile(name, t => {
    t.data.fill(0);
    for (let y = 3; y < 10; y++) {                                   // the handle
      const v = (t.rnd() - 0.5) * 12;
      t.px(7, y, 132 + v, 96 + v, 56 + v, 255);
      t.px(8, y, 106 + v, 74 + v, 42 + v, 255);
    }
    for (let y = 0; y < 3; y++) for (let x = 6; x <= 9; x++) {       // the flame on top of it
      if ((x === 6 || x === 9) && y === 0) continue;
      const hot = y >= 2;
      const v = (t.rnd() - 0.5) * 22;
      t.px(x, y, (hot ? 252 : 255) + v, (hot ? 170 : 226) + v, (hot ? 56 : 130) + v, 255);
    }
    t.px(7, 0, 255, 248, 206, 255); t.px(8, 0, 255, 244, 190, 255);
    // the square the top face samples, so the end of the torch glows rather than
    // showing the cut end of a stick
    for (let y = 7; y <= 8; y++) for (let x = 7; x <= 8; x++) t.px(x, y, 250, 190, 96, 255);
    if (bracket) for (let y = 8; y < 11; y++) { t.px(5, y, 96, 100, 108, 255); t.px(6, y, 78, 82, 90, 255); }
  });
  torchTile('torch', 0);
  torchTile('torch_wall', 1);

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
    DARKSTONE: defBlock('Darkstone', 'darkstone', { darkstone: true }),
    PUMPKIN_RED: defBlock('Red-Eyed Pumpkin', { top: 'pumpkin_top', side: 'pumpkin_side', front: 'pumpkin_red_face' },
      { light: 6, redPumpkin: true }),
    PUMPKIN_LIT: defBlock("Jack o'Lantern", { top: 'pumpkin_top', side: 'pumpkin_side', front: 'pumpkin_lit_face' },
      { light: 13 }),
    // The same lantern with its face cut the other way, for the wall of a world
    // you stand inside: you want to be looking at the grin, not the back of it.
    PUMPKIN_LIT_IN: defBlock("Jack o'Lantern", { top: 'pumpkin_top', side: 'pumpkin_side', front: 'pumpkin_side' },
      { light: 13 }),
    PRINTER: defBlock('3D Printer', { top: 'printer_top', side: 'printer_side', bottom: 'printer_side', front: 'printer_front' },
      { printer: true, light: 4 }),
    TV: defBlock('Television', { top: 'tv_side', side: 'tv_side', bottom: 'tv_side', front: 'tv_off' }, { tv: 0 }),
    TV_BARS: defBlock('Television', { top: 'tv_side', side: 'tv_side', bottom: 'tv_side', front: 'tv_bars' }, { tv: 1, light: 9 }),
    TV_VIEW: defBlock('Television', { top: 'tv_side', side: 'tv_side', bottom: 'tv_side', front: 'tv_view' }, { tv: 2, light: 9 }),
    TV_STATIC: defBlock('Television', { top: 'tv_side', side: 'tv_side', bottom: 'tv_side', front: 'tv_static' }, { tv: 3, light: 7 }),

    // ---- the Deep Lands ---------------------------------------------------
    REINFORCED_DEEPSLATE: defBlock('Reinforced Deepslate', 'reinforced_deepslate', { hardness: 9, deepFrame: true }),
    DEEPSLATE_BRICKS: defBlock('Deepslate Bricks', 'deepslate_bricks', { hardness: 2.4 }),
    SCULK: defBlock('Sculk', 'sculk', { hardness: 0.8, sculk: true }),
    SCULK_BLOOM: defBlock('Sculk Bloom', 'sculk_bloom', { hardness: 0.8, light: 6, sculk: true }),
    SCULK_SENSOR: defBlock('Sculk Sensor', { top: 'sensor_top', side: 'sensor_side', bottom: 'sculk' },
      { hardness: 1, light: 3, sensor: true }),
    ECHO_ORE: defBlock('Echo Ore', 'echo_ore', { hardness: 4, light: 3 }),
    CRYSTAL_CALM: defBlock('Echo Crystal', 'crystal_calm', { hardness: 1.2, light: 9, crystal: 0 }),
    CRYSTAL_ROUSED: defBlock('Echo Crystal', 'crystal_roused', { hardness: 1.2, light: 10, crystal: 1 }),
    CRYSTAL_ALARMED: defBlock('Echo Crystal', 'crystal_alarmed', { hardness: 1.2, light: 11, crystal: 2 }),
    SPORE_BLOSSOM: defBlock('Spore Blossom', 'spore_blossom', { solid: false, opaque: false, plant: true, light: 11 }),
    DEEP_PORTAL: defBlock('Deep Rift', 'deep_portal',
      { solid: false, opaque: false, translucent: true, light: 12, hardness: 0 }),

    // ---- the Hacker Dimension ---------------------------------------------
    VOIDSTONE: defBlock('Voidstone', 'voidstone', { hardness: 3, light: 2 }),
    CORRUPT: defBlock('Corrupted Block', 'corrupt', { hardness: 1.5, light: 4 }),
    DATASTREAM: defBlock('Datastream', 'datastream',
      { solid: false, opaque: false, translucent: true, light: 10, hardness: 0.2 }),
    SERVER_RACK: defBlock('Server Rack', { top: 'rack_top', side: 'rack_side', bottom: 'rack_top' },
      { hardness: 3, light: 7 }),
    HACK_PORTAL: defBlock('Breach', 'hack_portal',
      { solid: false, opaque: false, translucent: true, light: 14, hardness: 0 }),

    // ---- Poseidon's realm --------------------------------------------------
    PRISMARINE: defBlock('Prismarine', 'prismarine', { hardness: 1.6, seaFrame: true }),
    PRISMARINE_BRICKS: defBlock('Prismarine Bricks', 'prismarine_bricks', { hardness: 1.6 }),
    DARK_PRISMARINE: defBlock('Dark Prismarine', 'dark_prismarine', { hardness: 1.6 }),
    SEA_LANTERN: defBlock('Sea Lantern', 'sea_lantern', { hardness: 0.5, light: 15 }),
    MARBLE: defBlock('Sea Marble', 'marble', { hardness: 1.6 }),
    CORAL_PINK: defBlock('Pink Coral', 'coral_pink', { hardness: 0.6, light: 4 }),
    CORAL_BLUE: defBlock('Blue Coral', 'coral_blue', { hardness: 0.6, light: 4 }),
    CORAL_GOLD: defBlock('Gold Coral', 'coral_gold', { hardness: 0.6, light: 5 }),
    SEAGRASS: defBlock('Seagrass', 'seagrass', { solid: false, opaque: false, plant: true }),
    SEA_PORTAL: defBlock("Poseidon's Gate", 'sea_portal',
      { solid: false, opaque: false, translucent: true, light: 12, hardness: 0 }),

    // ---- shops, airports, bushes and space ---------------------------------
    SHOP: defBlock('Shop Counter', { top: 'shop_top', side: 'shop_side', bottom: 'shop_top', front: 'shop_front' },
      { hardness: 2, shop: true }),
    TARMAC: defBlock('Tarmac', 'tarmac', { hardness: 2.2 }),
    RUNWAY: defBlock('Runway', { top: 'runway', side: 'tarmac', bottom: 'tarmac' }, { hardness: 2.2 }),
    BUSH: defBlock('Bush', 'bush', { solid: false, opaque: false, plant: true }),
    BERRY_BUSH: defBlock('Berry Bush', 'berry_bush', { solid: false, opaque: false, plant: true, berries: true }),
    MOON_ROCK: defBlock('Moon Rock', 'moon_rock', { hardness: 3 }),
    MOON_DUST: defBlock('Moon Dust', 'moon_dust', { hardness: 0.6 }),
    SOLAR_PANEL: defBlock('Solar Panel', { top: 'solar', side: 'plating', bottom: 'plating' }, { hardness: 2, light: 3 }),
    TNT: defBlock('TNT', { top: 'tnt_top', side: 'tnt_side', bottom: 'tnt_top' },
      { hardness: 0.4, explosive: { power: 4.5, fuse: 3, damage: 18 } }),
    NUKE: defBlock('Nuclear Bomb', { top: 'nuke_top', side: 'nuke_side', bottom: 'nuke_top' },
      { hardness: 1.2, light: 3, explosive: { power: 22, fuse: 8, damage: 90, nuclear: true } }),
  });

  Object.assign(B, {
    ORANGE_WOOL: defBlock('Orange Wool', 'wool_orange'),
    MAGENTA_WOOL: defBlock('Magenta Wool', 'wool_magenta'),
    LIGHT_BLUE_WOOL: defBlock('Light Blue Wool', 'wool_lightblue'),
    LIME_WOOL: defBlock('Lime Wool', 'wool_lime'),
    PINK_WOOL: defBlock('Pink Wool', 'wool_pink'),
    GREY_WOOL: defBlock('Grey Wool', 'wool_grey'),
    LIGHT_GREY_WOOL: defBlock('Light Grey Wool', 'wool_lightgrey'),
    CYAN_WOOL: defBlock('Cyan Wool', 'wool_cyan'),
    PURPLE_WOOL: defBlock('Purple Wool', 'wool_purple'),
    BROWN_WOOL: defBlock('Brown Wool', 'wool_brown'),

    RED_FLOWER: defBlock('Poppy', 'flower_red', { solid: false, opaque: false, plant: true }),
    YELLOW_FLOWER: defBlock('Dandelion', 'flower_yellow', { solid: false, opaque: false, plant: true }),
    TALL_GRASS: defBlock('Tall Grass', 'tall_grass', { solid: false, opaque: false, plant: true }),

    STAIRS_N: defBlock('Stone Stairs', 'stone_bricks', { opaque: false, stairs: true,
      boxes: [[0, 0, 0, 1, 0.5, 1], [0, 0.5, 0, 1, 1, 0.5]] }),
    STAIRS_E: defBlock('Stone Stairs', 'stone_bricks', { opaque: false, stairs: true,
      boxes: [[0, 0, 0, 1, 0.5, 1], [0.5, 0.5, 0, 1, 1, 1]] }),
    STAIRS_S: defBlock('Stone Stairs', 'stone_bricks', { opaque: false, stairs: true,
      boxes: [[0, 0, 0, 1, 0.5, 1], [0, 0.5, 0.5, 1, 1, 1]] }),
    STAIRS_W: defBlock('Stone Stairs', 'stone_bricks', { opaque: false, stairs: true,
      boxes: [[0, 0, 0, 1, 0.5, 1], [0, 0.5, 0, 0.5, 1, 1]] }),
    // 2/16 across, 10/16 tall, standing in the middle of its block — Minecraft's
    // proportions, so a torch on a floor looks like a torch and not like a brick.
    TORCH: defBlock('Torch', 'torch', { solid: false, opaque: false, light: 14, torch: true,
      boxes: [[0.4375, 0, 0.4375, 0.5625, 0.625, 0.5625]] }),
    TORCH_WALL: defBlock('Torch', 'torch_wall', { solid: false, opaque: false, light: 14, torch: true,
      boxes: [[0.4375, 0.2, 0.4375, 0.5625, 0.825, 0.5625]] }),
    PLATING: defBlock('Steel Plating', 'plating'),
    NEON: defBlock('Neon Panel', 'neon', { light: 14 }),
    CIRCUIT: defBlock('Circuit Block', 'circuit', { light: 3 }),
    FUTURE_PORTAL: defBlock('Rift', 'future_portal',
      { solid: false, opaque: false, translucent: true, light: 13, futurePortal: true }),
  });

  Object.assign(B, {
    TIME_PORTAL: defBlock('Time Portal', 'time_portal',
      { solid: false, opaque: false, translucent: true, light: 12, timePortal: true }),
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

  // Whole families of shaped blocks, now that the mesher can draw part of a cube.
  const stairSet = (label, tile) => {
    const mk = box => defBlock(label, tile, { opaque: false, stairs: true, boxes: [[0, 0, 0, 1, 0.5, 1], box] });
    const turns = [mk([0, .5, 0, 1, 1, .5]), mk([.5, .5, 0, 1, 1, 1]), mk([0, .5, .5, 1, 1, 1]), mk([0, .5, 0, .5, 1, 1])];
    for (const id of turns) BLOCKS[id].turns = turns;
    return turns[0];
  };
  B.STAIRS_OAK = stairSet('Oak Stairs', 'planks');
  B.STAIRS_COBBLE = stairSet('Cobblestone Stairs', 'cobblestone');
  for (const id of [B.STAIRS_N, B.STAIRS_E, B.STAIRS_S, B.STAIRS_W]) {
    BLOCKS[id].turns = [B.STAIRS_N, B.STAIRS_E, B.STAIRS_S, B.STAIRS_W];
  }

  const slab = (label, tile) => defBlock(label, tile, { opaque: false, slab: true, boxes: [[0, 0, 0, 1, 0.5, 1]] });
  B.SLAB_STONE = slab('Stone Slab', 'stone_bricks');
  B.SLAB_OAK = slab('Oak Slab', 'planks');
  B.SLAB_COBBLE = slab('Cobblestone Slab', 'cobblestone');

  const FENCE_BOXES = [[.375, 0, .375, .625, 1, .625],
                       [.4375, .3, 0, .5625, .55, 1], [0, .3, .4375, 1, .55, .5625],
                       [.4375, .75, 0, .5625, .95, 1], [0, .75, .4375, 1, .95, .5625]];
  B.FENCE = defBlock('Oak Fence', 'planks', { opaque: false, boxes: FENCE_BOXES });

  const ladder = box => defBlock('Ladder', 'ladder', { solid: false, opaque: false, ladder: true, boxes: [box] });
  const ladders = [ladder([0, 0, 0, 1, 1, .125]), ladder([.875, 0, 0, 1, 1, 1]),
                   ladder([0, 0, .875, 1, 1, 1]), ladder([0, 0, 0, .125, 1, 1])];
  for (const id of ladders) BLOCKS[id].turns = ladders;
  B.LADDER = ladders[0];

  BLOCKS[B.PUMPKIN_LIT_IN].faces[4] = TILE_ID['pumpkin_lit_face'];   // carved onto its +Z side

  B.LAVA_FLOW = [B.LAVA];
  for (let level = 1; level <= 3; level++) {
    B.LAVA_FLOW.push(defBlock('Flowing Lava', 'lava',
      { solid: false, opaque: false, liquid: true, level, fluid: 'lava', flowing: true, light: 15 }));
  }

}

// Does this block, sitting in cell (cx,cy,cz), get in the way of that box?
// Full cubes always do; the ones made of sub-boxes are asked properly.
function blockHits(id, cx, cy, cz, x0, y0, z0, x1, y1, z1) {
  const def = BLOCKS[id];
  if (!def.solid) return false;
  if (!def.boxes) return true;
  for (const b of def.boxes) {
    if (x1 > cx + b[0] && x0 < cx + b[3] &&
        y1 > cy + b[1] && y0 < cy + b[4] &&
        z1 > cz + b[2] && z0 < cz + b[5]) return true;
  }
  return false;
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
