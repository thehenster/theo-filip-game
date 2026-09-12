// Chunk storage, terrain generation and flood-fill lighting.
const CX = 16, CY = 128, CZ = 16;
const SEA_LEVEL = 62;
const CHUNK_VOL = CX * CY * CZ;
const idx = (x, y, z) => x + z * CX + y * CX * CZ;

class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint8Array(CHUNK_VOL);
    this.light = new Uint8Array(CHUNK_VOL);   // high nibble = skylight, low nibble = block light
    this.hmap = new Int16Array(CX * CZ);      // highest opaque block per column
    this.dirty = true;                        // needs a mesh rebuild
    this.mesh = null;
    this.empty = true;                        // nothing but air
  }
}

class World {
  constructor(seed, dimension) {
    this.seed = seed | 0;
    this.dimension = dimension || 'overworld';
    this.chunks = new Map();
    this.edits = new Map();          // "x,y,z" -> block id, player changes that survive unload
    this.nBase = new Perlin(this.seed);
    this.nMount = new Perlin(this.seed + 1337);
    this.nDetail = new Perlin(this.seed + 4242);
    this.nTemp = new Perlin(this.seed + 909);
    this.nHumid = new Perlin(this.seed + 31337);
    this.nCave = new Perlin(this.seed + 77);
    this.nCave2 = new Perlin(this.seed + 78);
    this.nStone = new Perlin(this.seed + 555);
    this.addQueue = []; this.addHead = 0;
    this.remQueue = []; this.remHead = 0;
    this.colInfo = new Map();
    this.villages = new Map();
    this.strongholds = new Map();
    this.chests = new Map();      // "x,y,z" -> [[id, count], ...]        // cached column data, cleared between chunk builds
    this.darkstones = new Map();  // "x,y,z" -> [x,y,z] for every darkstone placed
    this.shroud = new Set();      // "x,y,z" of every cell those darkstones hold in the dark
  }

  key(cx, cz) { return cx * 100003 + cz; }
  getChunk(cx, cz) { return this.chunks.get(this.key(cx, cz)); }

  getBlock(x, y, z) {
    // the End has nothing under it: step off the island and you fall out of the world
    if (y < 0) return (this.dimension === 'end' || this.dimension === 'hacker' || this.dimension === 'bedwars' || this.dimension === 'rush' || this.dimension === 'hunger') ? 0 : B.BEDROCK;
    if (y >= CY) return 0;
    const c = this.chunks.get(this.key(x >> 4, z >> 4));
    if (!c) return 0;
    return c.blocks[idx(x & 15, y, z & 15)];
  }
  // Treats not-yet-loaded chunks as solid so we never mesh a hole into the world.
  getBlockOrSolid(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= CY) return 0;
    const c = this.chunks.get(this.key(x >> 4, z >> 4));
    if (!c) return B.STONE;
    return c.blocks[idx(x & 15, y, z & 15)];
  }
  getLight(x, y, z) {
    if (y < 0 || y >= CY) return y >= CY ? 0xF0 : 0;
    const c = this.chunks.get(this.key(x >> 4, z >> 4));
    if (!c) return 0;
    return c.light[idx(x & 15, y, z & 15)];
  }

  // ---- darkstone --------------------------------------------------------
  // Darkstone smothers the light for four blocks around it. A lamp, a torch,
  // anything that gives light of its own within four blocks of a smothered cell
  // pushes the dark back off that cell again.
  rebuildShroud() {
    this.shroud.clear();
    if (!this.darkstones.size) return;
    const R = DARK_R;
    for (const [, [dx, dy, dz]] of this.darkstones) {
      for (let x = dx - R; x <= dx + R; x++)
        for (let y = Math.max(0, dy - R); y <= Math.min(CY - 1, dy + R); y++)
          for (let z = dz - R; z <= dz + R; z++) {
            if ((x - dx) ** 2 + (y - dy) ** 2 + (z - dz) ** 2 > R * R) continue;
            this.shroud.add(x + ',' + y + ',' + z);
          }
    }
    // now let every nearby light burn its own hole back through the dark
    for (const key of [...this.shroud]) {
      const p = key.split(',');
      const x = +p[0], y = +p[1], z = +p[2];
      let lit = false;
      for (let ax = x - R; ax <= x + R && !lit; ax++)
        for (let ay = Math.max(0, y - R); ay <= Math.min(CY - 1, y + R) && !lit; ay++)
          for (let az = z - R; az <= z + R; az++) {
            if ((ax - x) ** 2 + (ay - y) ** 2 + (az - z) ** 2 > R * R) continue;
            if (BLOCKS[this.getBlock(ax, ay, az)].light > 0) { lit = true; break; }
          }
      if (lit) this.shroud.delete(key);
    }
  }

  dark(x, y, z) { return this.shroud.size > 0 && this.shroud.has(x + ',' + y + ',' + z); }

  // Something changed that the shroud depends on: work it out again and relight
  // every chunk it could possibly touch.
  refreshDark(x, y, z) {
    this.rebuildShroud();
    const R = DARK_R * 2 + 1;
    const seen = new Set();
    for (let dx = -R; dx <= R; dx += CX) for (let dz = -R; dz <= R; dz += CX) {
      const cx = (x + dx) >> 4, cz = (z + dz) >> 4;
      const key = cx + ':' + cz;
      if (seen.has(key)) continue;
      seen.add(key);
      const c = this.getChunk(cx, cz);
      if (c) this.initLight(c);
    }
  }

  markDirty(x, z) {
    const cx = x >> 4, cz = z >> 4;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (dx && (x & 15) !== (dx < 0 ? 0 : 15)) continue;
      if (dz && (z & 15) !== (dz < 0 ? 0 : 15)) continue;
      const c = this.getChunk(cx + dx, cz + dz);
      if (c) c.dirty = true;
    }
  }

  setLightRaw(x, y, z, sky, block) {
    if (y < 0 || y >= CY) return;
    const c = this.chunks.get(this.key(x >> 4, z >> 4));
    if (!c) return;
    const i = idx(x & 15, y, z & 15);
    const v = (sky << 4) | block;
    if (c.light[i] !== v) { c.light[i] = v; this.markDirty(x, z); }
  }
  getSky(x, y, z) { return this.getLight(x, y, z) >> 4; }
  getBlockLight(x, y, z) { return this.getLight(x, y, z) & 15; }
  setSky(x, y, z, v) { this.setLightRaw(x, y, z, v, this.getLight(x, y, z) & 15); }
  setBlockLight(x, y, z, v) { this.setLightRaw(x, y, z, this.getLight(x, y, z) >> 4, v); }

  // ---- terrain ---------------------------------------------------------
  column(wx, wz) {
    if (this.dimension === 'halloween') return { h: HW_FLOOR, biome: 'plains', temp: 0, humid: 0 };
    if (this.dimension === 'future') return { h: FT_GROUND, biome: 'city', temp: 0, humid: 0 };
    if (this.dimension === 'deep') return { h: DEEP_FLOOR, biome: 'deep', temp: 0, humid: 0 };
    if (this.dimension === 'hacker') return { h: HK_FLOOR, biome: 'grid', temp: 0, humid: 0 };
    if (this.dimension === 'sea') return { h: Sea.floorAt(this, wx, wz), biome: 'reef', temp: 0, humid: 0 };
    const k = wx * 46349 + wz * 7919;
    let info = this.colInfo.get(k);
    if (info) return info;
    const e = this.nBase.nfbm2(wx * 0.0021, wz * 0.0021, 4);          // continents
    const hl = this.nDetail.nfbm2(wx * 0.011, wz * 0.011, 3);          // hills
    const mr = this.nMount.nfbm2(wx * 0.00085 + 40, wz * 0.00085 - 70, 3);
    const mountain = smoothstep(0.2, 0.9, mr);
    // How broken up the ground is here. Where this runs high the land stops being
    // gentle: it heaves up into ridges and the stone comes through the turf.
    const rough = this.nStone.nfbm2(wx * 0.0038 - 1200, wz * 0.0038 + 640, 3);
    const craggy = Math.max(0, rough - 0.22);
    let h = 63 + e * 15 + hl * 9 + mountain * mountain * 52 + craggy * 58;
    // A slower ridge term on top, so hillsides come in steps and shelves. It has
    // to stay well below one block per column or the ground stops being terrain
    // and turns into noise.
    h += this.nDetail.nfbm2(wx * 0.013 + 90, wz * 0.013 - 30, 2) * (2 + craggy * 12);
    h = Math.round(clamp(h, 5, CY - 14));
    // Broken country is terraced rather than merely bumpy: the height snaps to
    // shelves, which is what turns a smooth noise field into ledges and cliffs
    // you can actually stand on the edge of.
    if (craggy > 0.05 && h > SEA_LEVEL) {
      const step = 2 + Math.round(Math.min(1, craggy * 3.4) * 4);   // 2 to 6 block shelves
      h = Math.round(h / step) * step;
      h = Math.round(clamp(h, 5, CY - 14));
    }
    // biomes change every few hundred blocks, so a walk crosses several of them
    const temp = this.nTemp.nfbm2(wx * 0.0022 + 500, wz * 0.0022, 3) - Math.max(0, h - 70) * 0.014;
    const humid = this.nHumid.nfbm2(wx * 0.0026 - 800, wz * 0.0026, 3);
    let biome = 'plains';
    if (this.dimension === 'dinos') biome = h > 96 ? 'peaks' : 'jungle';
    else if (h > 92) biome = 'peaks';
    else if (temp < -0.5) biome = 'snowy';
    else if (craggy > 0.16 && h > SEA_LEVEL + 2) biome = 'rocky';   // the broken country
    else if (temp > 0.42 && humid < 0.06) biome = 'desert';
    else if (humid > 0.25) biome = 'forest';
    info = { h, biome, temp, humid, craggy };
    this.colInfo.set(k, info);
    return info;
  }

  generateChunk(cx, cz) {
    if (this.dimension === 'halloween') return Halloween.generateChunk(this, cx, cz);
    if (this.dimension === 'future') return Future.generateChunk(this, cx, cz);
    if (this.dimension === 'deep') return Deep.generateChunk(this, cx, cz);
    if (this.dimension === 'hacker') return Hacker.generateChunk(this, cx, cz);
    if (this.dimension === 'sea') return Sea.generateChunk(this, cx, cz);
    if (this.dimension === 'nether') return this.generateNether(cx, cz);
    if (this.dimension === 'end') return this.generateEnd(cx, cz);
    if (this.dimension === 'bedwars' || this.dimension === 'rush') return BedWars.generateChunk(this, cx, cz);
    if (this.dimension === 'hunger') return Hunger.generateChunk(this, cx, cz);
    const c = new Chunk(cx, cz);
    this.chunks.set(this.key(cx, cz), c);
    const bx = cx * CX, bz = cz * CZ;
    const blocks = c.blocks;
    if (this.colInfo.size > 60000) this.colInfo.clear();

    // column heights first, so we know how much of the chunk needs cave noise
    const hs = new Int16Array(CX * CZ);
    const biomes = new Array(CX * CZ);
    let maxH = 0;
    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      const info = this.column(bx + lx, bz + lz);
      const i = lz * CX + lx;
      hs[i] = info.h; biomes[i] = info.biome;
      if (info.h > maxH) maxH = info.h;
    }

    // Cave density is sampled on a 4-block lattice and interpolated: same shapes,
    // a fraction of the noise calls.
    const LS = 4, LX = CX / LS + 1, LZ = CZ / LS + 1, LY = Math.ceil(maxH / LS) + 2;
    const n = LX * LY * LZ;
    const g1 = new Float32Array(n), g2 = new Float32Array(n), g3 = new Float32Array(n), g4 = new Float32Array(n);
    for (let ly = 0; ly < LY; ly++) {
      const y = ly * LS;
      for (let lz = 0; lz < LZ; lz++) {
        const wz = bz + lz * LS;
        for (let lx = 0; lx < LX; lx++) {
          const wx = bx + lx * LS;
          const gi = lx + lz * LX + ly * LX * LZ;
          g1[gi] = this.nCave.noise3(wx * 0.028, y * 0.055, wz * 0.028);
          g2[gi] = this.nCave2.noise3(wx * 0.028 + 11, y * 0.055, wz * 0.028 - 5);
          g3[gi] = y < 60 ? this.nCave2.fbm3(wx * 0.014, y * 0.02, wz * 0.014, 3) : -1;
          g4[gi] = this.nStone.noise3(wx * 0.035, y * 0.045, wz * 0.035);
        }
      }
    }
    // bilinear weights are constant per column; only the y blend changes per voxel
    const LP = LX * LZ;

    for (let lz = 0; lz < CZ; lz++) {
      const glz = (lz / LS) | 0, tz = (lz % LS) / LS;
      for (let lx = 0; lx < CX; lx++) {
        const glx = (lx / LS) | 0, tx = (lx % LS) / LS;
        const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
        const colBase = glx + glz * LX;
        const wx = bx + lx, wz = bz + lz;
        const ci = lz * CX + lx;
        const h = hs[ci], biome = biomes[ci];
        const desert = biome === 'desert';
        const deepY = 12 + ((hash3(wx, 0, wz, this.seed + 2) * 5) | 0);
        const top = Math.max(h, SEA_LEVEL);
        const colOff = lx + lz * CX;

        for (let y = 0; y <= top; y++) {
          let id;
          if (y > h) {
            if (y > SEA_LEVEL) break;
            // snowy and mountain seas freeze over at the surface
            id = (y === SEA_LEVEL && (biome === 'snowy' || biome === 'peaks')) ? B.ICE : B.WATER;
          }
          else if (y === 0) id = B.BEDROCK;
          else if (y <= 3 && hash3(wx, y, wz, this.seed) < 0.62 - y * 0.16) id = B.BEDROCK;
          else if (y === h) {
            if (biome === 'peaks') id = B.SNOW;
            else if (biome === 'snowy') id = h <= SEA_LEVEL + 1 ? B.SAND : B.SNOW;
            else if (desert) id = B.SAND;
            else if (biome === 'rocky') {
              // bare stone, with grass only clinging on where it can
              const r2 = hash3(wx, 71, wz, this.seed + 63);
              id = r2 < 0.30 ? B.GRASS : r2 < 0.44 ? B.ANDESITE : r2 < 0.52 ? B.GRAVEL : B.STONE;
            }
            else id = h <= SEA_LEVEL + 1 ? B.SAND : B.GRASS;
            if (h < SEA_LEVEL && h > SEA_LEVEL - 5 && hash3(wx, 1, wz, this.seed + 8) < 0.10) id = B.CLAY;
          } else if (y > h - 4) id = desert ? B.SAND : (biome === 'peaks' || biome === 'rocky' ? B.STONE : B.DIRT);
          else if (desert && y > h - 7) id = B.SANDSTONE;
          else id = B.STONE;

          if (y > 2 && y < h - 1 && id !== B.BEDROCK) {
            const gly = (y / LS) | 0, ty = (y % LS) / LS;
            const i0 = colBase + gly * LP, i1 = i0 + LP;
            const a1 = g1[i0] * w00 + g1[i0 + 1] * w10 + g1[i0 + LX] * w01 + g1[i0 + LX + 1] * w11;
            const b1 = g1[i1] * w00 + g1[i1 + 1] * w10 + g1[i1 + LX] * w01 + g1[i1 + LX + 1] * w11;
            const v1 = a1 + (b1 - a1) * ty;
            let carved = false;
            if (v1 * v1 < 0.0042) {
              const a2 = g2[i0] * w00 + g2[i0 + 1] * w10 + g2[i0 + LX] * w01 + g2[i0 + LX + 1] * w11;
              const b2 = g2[i1] * w00 + g2[i1 + 1] * w10 + g2[i1 + LX] * w01 + g2[i1 + LX + 1] * w11;
              const v2 = a2 + (b2 - a2) * ty;
              carved = v1 * v1 + v2 * v2 < 0.0042;
            }
            if (!carved && y < 56) {
              const a3 = g3[i0] * w00 + g3[i0 + 1] * w10 + g3[i0 + LX] * w01 + g3[i0 + LX + 1] * w11;
              const b3 = g3[i1] * w00 + g3[i1 + 1] * w10 + g3[i1 + LX] * w01 + g3[i1 + LX + 1] * w11;
              carved = a3 + (b3 - a3) * ty > 0.40;
            }
            if (carved) continue;
          }

          if (id === B.STONE) {
            // andesite / diorite / granite blobs, and deepslate down at the bottom
            const gly = (y / LS) | 0, ty = (y % LS) / LS;
            const i0 = colBase + gly * LP, i1 = i0 + LP;
            const a4 = g4[i0] * w00 + g4[i0 + 1] * w10 + g4[i0 + LX] * w01 + g4[i0 + LX + 1] * w11;
            const b4 = g4[i1] * w00 + g4[i1 + 1] * w10 + g4[i1 + LX] * w01 + g4[i1 + LX + 1] * w11;
            const v = a4 + (b4 - a4) * ty;
            if (v > 0.42) id = B.GRANITE;
            else if (v < -0.42) id = B.DIORITE;
            else if ((v > 0.17 && v < 0.21) || (v < -0.17 && v > -0.21)) id = B.ANDESITE;
            if (y < deepY) id = B.DEEPSLATE;
          }

          if ((id === B.STONE || id === B.DEEPSLATE || id === B.ANDESITE || id === B.GRANITE || id === B.DIORITE) && y < 80) {
            const r = hash3(wx, y, wz, this.seed + 5);
            if (r < 0.014 && y < 76) {
              if (y < 18 && r < 0.0009) id = B.DIAMOND_ORE;
              else if (y < 30 && r < 0.0022) id = B.GOLD_ORE;
              else if (y < 50 && r < 0.006) id = B.IRON_ORE;
              else id = B.COAL_ORE;
            } else if (r > 0.994 && y < 60) id = y < 14 && r > 0.9993 ? B.GLOWSTONE : B.GRAVEL;
            else if (r > 0.9800 && r < 0.9848 && y < 26) id = B.REDSTONE_ORE;
            else if (r > 0.9750 && r < 0.9768 && y < 32) id = B.LAPIS_ORE;
            else if (r > 0.9700 && r < 0.9704 && y > 34 && biome === 'peaks') id = B.EMERALD_ORE;
          }
          blocks[colOff + y * CX * CZ] = id;
        }
      }
    }

    this.decorate(c);
    if (this.dimension !== 'dinos') {          // nobody has built anything yet, back then
      this.buildVillages(c);
      this.buildStrongholds(c);
      Deep.buildCities(this, c);
    }

    // apply saved player edits inside this chunk
    if (this.edits.size) {
      for (const [k, id] of this.edits) {
        const p = k.split(',');
        const x = +p[0], y = +p[1], z = +p[2];
        if ((x >> 4) === cx && (z >> 4) === cz) blocks[idx(x & 15, y, z & 15)] = id;
      }
    }

    this.rebuildHeightmap(c);
    c.empty = !blocks.some(v => v !== 0);
    this.initLight(c);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nb = this.getChunk(cx + dx, cz + dz);
      if (nb) nb.dirty = true;
    }
    return c;
  }

  // The Nether: caverns of netherrack between a bedrock floor and roof, with a
  // lava sea in the low ground and glowstone hanging from the ceilings.
  generateNether(cx, cz) {
    const c = new Chunk(cx, cz);
    this.chunks.set(this.key(cx, cz), c);
    const bx = cx * CX, bz = cz * CZ;
    const blocks = c.blocks;
    const LS = 4, LX = CX / LS + 1, LZ = CZ / LS + 1, LY = CY / LS + 1;
    const n = LX * LY * LZ;
    const g = new Float32Array(n);
    for (let ly = 0; ly < LY; ly++) {
      const y = ly * LS;
      for (let lz = 0; lz < LZ; lz++) for (let lx = 0; lx < LX; lx++) {
        const wx = bx + lx * LS, wz = bz + lz * LS;
        g[lx + lz * LX + ly * LX * LZ] =
          this.nStone.noise3(wx * 0.021, y * 0.03, wz * 0.021) +
          0.4 * this.nCave.noise3(wx * 0.055, y * 0.06, wz * 0.055);
      }
    }
    const LP = LX * LZ;
    const CEIL = CY - 3;
    for (let lz = 0; lz < CZ; lz++) {
      const glz = (lz / LS) | 0, tz = (lz % LS) / LS;
      for (let lx = 0; lx < CX; lx++) {
        const glx = (lx / LS) | 0, tx = (lx % LS) / LS;
        const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
        const colBase = glx + glz * LX;
        const wx = bx + lx, wz = bz + lz;
        for (let y = 0; y < CY; y++) {
          let id = 0;
          if (y <= 1 || y >= CEIL + 1) id = B.BEDROCK;
          else if (y === 2 || y === CEIL) id = hash3(wx, y, wz, this.seed + 4) < 0.6 ? B.BEDROCK : B.NETHERRACK;
          else {
            const gly = (y / LS) | 0, ty = (y % LS) / LS;
            const i0 = colBase + gly * LP, i1 = i0 + LP;
            const a = g[i0] * w00 + g[i0 + 1] * w10 + g[i0 + LX] * w01 + g[i0 + LX + 1] * w11;
            const b = g[i1] * w00 + g[i1 + 1] * w10 + g[i1 + LX] * w01 + g[i1 + LX + 1] * w11;
            const d = a + (b - a) * ty;
            // squeeze the caverns shut near the floor and the roof
            const bias = -0.30 + 0.62 * Math.abs(y - 62) / 62;
            if (d + bias > 0) {
              id = B.NETHERRACK;
              const r = hash3(wx, y, wz, this.seed + 6);
              if (r < 0.010) id = B.QUARTZ_ORE;
              else if (y < 42 && r > 0.988) id = B.SOUL_SAND;
            } else if (y <= 31) id = B.LAVA;
          }
          if (id) blocks[colOffset(lx, lz) + y * CX * CZ] = id;
        }
      }
    }

    // glowstone blisters on the cavern roofs
    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      const wx = bx + lx, wz = bz + lz;
      if (hash3(wx, 21, wz, this.seed + 7) > 0.012) continue;
      for (let y = CEIL - 1; y > 34; y--) {
        const here = blocks[colOffset(lx, lz) + y * CX * CZ];
        const above = blocks[colOffset(lx, lz) + (y + 1) * CX * CZ];
        if (!here && above === B.NETHERRACK) {
          const drop = 1 + ((hash3(wx, y, wz, this.seed + 8) * 3) | 0);
          for (let k = 0; k < drop && y - k > 2; k++) blocks[colOffset(lx, lz) + (y - k) * CX * CZ] = B.GLOWSTONE;
          break;
        }
      }
    }

    if (this.edits.size) {
      for (const [k, id] of this.edits) {
        const p = k.split(',');
        const x = +p[0], y = +p[1], z = +p[2];
        if ((x >> 4) === cx && (z >> 4) === cz) blocks[idx(x & 15, y, z & 15)] = id;
      }
    }
    this.rebuildHeightmap(c);
    c.empty = !blocks.some(v => v !== 0);
    this.initLight(c);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nb = this.getChunk(cx + dx, cz + dz);
      if (nb) nb.dirty = true;
    }
    return c;
  }

  // ---- villages ---------------------------------------------------------
  // The world is cut into regions; each may hold one village, laid out from the
  // seed alone so neighbouring chunks always agree on where the walls go.
  villageFor(rx, rz) {
    const key = rx * 7919 + rz * 104729;
    if (this.villages.has(key)) return this.villages.get(key);
    let village = null;
    if (hash3(rx, 77, rz, this.seed + 1234) < 0.5) {
      const jx = (hash3(rx, 1, rz, this.seed + 11) * (VILLAGE_SPACING - 6)) | 0;
      const jz = (hash3(rx, 2, rz, this.seed + 12) * (VILLAGE_SPACING - 6)) | 0;
      const x = (rx * VILLAGE_SPACING + jx + 3) * CX + 8;
      const z = (rz * VILLAGE_SPACING + jz + 3) * CZ + 8;
      const info = this.column(x, z);
      let flat = info.biome !== 'peaks' && info.h > SEA_LEVEL + 1;
      if (flat) {
        for (const [dx, dz] of [[-14, 0], [14, 0], [0, -14], [0, 14], [10, 10], [-10, -10]]) {
          const h = this.column(x + dx, z + dz).h;
          if (Math.abs(h - info.h) > 4 || h <= SEA_LEVEL) { flat = false; break; }
        }
      }
      if (flat) village = this.layOutVillage(x, z, info);
    }
    this.villages.set(key, village);
    return village;
  }

  // Which village, if any, covers this spot.
  villageNear(x, z) {
    const rx = Math.floor(x / (VILLAGE_SPACING * CX)), rz = Math.floor(z / (VILLAGE_SPACING * CZ));
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const v = this.villageFor(rx + dx, rz + dz);
      if (v && Math.abs(v.x - x) < VILLAGE_RADIUS && Math.abs(v.z - z) < VILLAGE_RADIUS) return v;
    }
    return null;
  }

  layOutVillage(x, z, info) {
    const desert = info.biome === 'desert';
    const v = {
      x, z, y: info.h + 1, desert,
      wall: desert ? B.SANDSTONE : B.PLANKS,
      post: desert ? B.SANDSTONE : B.LOG,
      roof: desert ? B.SANDSTONE : B.SPRUCE_PLANKS,
      path: desert ? B.SAND : B.GRAVEL,
      // the well in the middle, and a market stall beside it
      buildings: [{ type: 'well', x, z }, { type: 'stall', x: x + 4, z: z + 1 }],
    };
    const count = 4 + ((hash3(x, 5, z, this.seed + 21) * 4) | 0);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + hash3(x, i, z, this.seed + 31) * 0.5;
      const dist = 13 + hash3(x, i + 40, z, this.seed + 32) * 10;
      const bx = Math.round(x + Math.cos(a) * dist), bz = Math.round(z + Math.sin(a) * dist);
      const roll = hash3(bx, 9, bz, this.seed + 33);
      v.buildings.push({
        type: roll < 0.25 ? 'farm' : 'house',
        x: bx, z: bz,
        w: 7,
        d: roll < 0.25 ? 5 : 7,
        lamp: hash3(bx, 3, bz, this.seed + 34) < 0.5,
      });
    }
    return v;
  }

  buildVillages(c) {
    const bx = c.cx * CX, bz = c.cz * CZ;
    const rx = Math.floor((bx + 8) / (VILLAGE_SPACING * CX)), rz = Math.floor((bz + 8) / (VILLAGE_SPACING * CZ));
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const v = this.villageFor(rx + dx, rz + dz);
      if (!v) continue;
      if (Math.abs(v.x - (bx + 8)) > VILLAGE_RADIUS + 16 || Math.abs(v.z - (bz + 8)) > VILLAGE_RADIUS + 16) continue;
      for (const b of v.buildings) {
        if (Math.abs(b.x - (bx + 8)) > 20 || Math.abs(b.z - (bz + 8)) > 20) continue;
        if (b.type === 'well') this.buildWell(c, v, b);
        else if (b.type === 'stall') this.buildStall(c, v, b);
        else if (b.type === 'farm') this.buildFarm(c, v, b);
        else this.buildHouse(c, v, b);
        this.buildPath(c, v, b);
      }
    }
  }

  // Writes a block only if it lands inside the chunk being generated.
  put(c, x, y, z, id) {
    const lx = x - c.cx * CX, lz = z - c.cz * CZ;
    if (lx < 0 || lz < 0 || lx >= CX || lz >= CZ || y < 0 || y >= CY) return;
    c.blocks[idx(lx, y, lz)] = id;
  }

  // Level the ground under a footprint and clear the air above it.
  clearSite(c, x0, z0, w, d, base, floor) {
    for (let x = x0; x < x0 + w; x++) for (let z = z0; z < z0 + d; z++) {
      for (let y = base; y < base + 8; y++) this.put(c, x, y, z, 0);
      this.put(c, x, base - 1, z, floor);
      for (let y = base - 4; y < base - 1; y++) this.put(c, x, y, z, floor === B.SAND ? B.SAND : B.DIRT);
    }
  }

  buildHouse(c, v, b) {
    const base = this.column(b.x, b.z).h + 1;
    const x0 = b.x - (b.w >> 1), z0 = b.z - (b.d >> 1);
    this.clearSite(c, x0 - 1, z0 - 1, b.w + 2, b.d + 2, base, v.wall);
    const top = base + 4;
    for (let x = x0; x < x0 + b.w; x++) for (let z = z0; z < z0 + b.d; z++) {
      const edge = x === x0 || x === x0 + b.w - 1 || z === z0 || z === z0 + b.d - 1;
      this.put(c, x, base - 1, z, v.wall);
      if (!edge) continue;
      const corner = (x === x0 || x === x0 + b.w - 1) && (z === z0 || z === z0 + b.d - 1);
      for (let y = base; y < top; y++) this.put(c, x, y, z, corner ? v.post : v.wall);
      // a window in the middle of each wall
      const midX = x === x0 + (b.w >> 1), midZ = z === z0 + (b.d >> 1);
      if (!corner && (midX || midZ)) this.put(c, x, base + 2, z, B.GLASS);
    }
    // roof, one course wider than the walls
    for (let x = x0 - 1; x <= x0 + b.w; x++) for (let z = z0 - 1; z <= z0 + b.d; z++) {
      this.put(c, x, top, z, v.roof);
    }
    for (let x = x0 + 1; x < x0 + b.w - 1; x++) for (let z = z0 + 1; z < z0 + b.d - 1; z++) {
      this.put(c, x, top + 1, z, v.roof);
    }
    // doorway on the side facing the middle of the village
    const dirX = Math.abs(v.x - b.x) > Math.abs(v.z - b.z);
    const dx = dirX ? (v.x > b.x ? x0 + b.w - 1 : x0) : b.x;
    const dz = dirX ? b.z : (v.z > b.z ? z0 + b.d - 1 : z0);
    this.put(c, dx, base, dz, B.DOOR_LOWER);
    this.put(c, dx, base + 1, dz, B.DOOR_UPPER);
    this.put(c, b.x, top - 1, b.z, B.GLOWSTONE);       // a light in the ceiling
    this.furnish(c, v, b, x0, z0, base, dirX, dx, dz);
    if (b.lamp) {
      // clear of the wall, and two aside so it never stands in the doorway
      const off = Math.max(b.w, b.d) / 2 + 2;
      const lx = Math.round(b.x + (dirX ? (v.x > b.x ? off : -off) : 2));
      const lz = Math.round(b.z + (dirX ? 2 : (v.z > b.z ? off : -off)));
      const lbase = this.column(lx, lz).h + 1;
      for (let k = 0; k < 4; k++) this.put(c, lx, lbase + k, lz, v.post);
      this.put(c, lx, lbase + 4, lz, B.GLOWSTONE);
    }
  }

  // Furniture, laid out the way a Minecraft village house is: a bed in one corner,
  // a chest beside it, a work corner with a table and furnace, shelves on the wall.
  furnish(c, v, b, x0, z0, base, dirX, doorX, doorZ) {
    const x1 = x0 + b.w - 2, z1 = z0 + b.d - 2;      // far inside corner
    const ix = x0 + 1, iz = z0 + 1;                  // near inside corner
    const roll = hash3(b.x, 61, b.z, this.seed + 51);
    const free = (x, z) => !(x === doorX && z === doorZ) &&
      !(Math.abs(x - doorX) + Math.abs(z - doorZ) <= 1 && (x === doorX || z === doorZ));

    // bed: two blocks against a wall, head at the corner
    if (b.d >= 5 && free(ix, iz) && free(ix, iz + 1)) {
      this.put(c, ix, base, iz, B.BED_HEAD);
      this.put(c, ix, base, iz + 1, B.BED_FOOT);
    }
    // chest at the foot of the bed
    if (free(ix, iz + 2)) this.put(c, ix, base, iz + 2, B.CHEST);

    // the work corner
    if (free(x1, z1)) this.put(c, x1, base, z1, B.CRAFTING_TABLE);
    if (free(x1 - 1, z1)) this.put(c, x1 - 1, base, z1, B.FURNACE);

    // shelves or storage along the far wall
    const extra = roll < 0.45 ? B.BOOKSHELF : B.BARREL;
    if (free(x1, iz)) this.put(c, x1, base, iz, extra);
    if (roll < 0.25 && free(x1, iz + 1)) this.put(c, x1, base, iz + 1, B.BOOKSHELF);
    if (roll > 0.7 && free(ix, z1)) this.put(c, ix, base, z1, B.BARREL);
  }

  buildWell(c, v, b) {
    const base = this.column(b.x, b.z).h + 1;
    this.clearSite(c, b.x - 3, b.z - 3, 7, 7, base, v.path);
    for (let x = b.x - 1; x <= b.x + 1; x++) for (let z = b.z - 1; z <= b.z + 1; z++) {
      this.put(c, x, base, z, B.COBBLESTONE);
      this.put(c, x, base + 1, z, 0);
    }
    this.put(c, b.x, base, b.z, B.WATER);
    this.put(c, b.x, base - 1, b.z, B.WATER);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      for (let k = 1; k <= 3; k++) this.put(c, b.x + dx, base + k, b.z + dz, B.COBBLESTONE);
    }
    for (let x = b.x - 1; x <= b.x + 1; x++) for (let z = b.z - 1; z <= b.z + 1; z++) {
      this.put(c, x, base + 4, z, v.roof);
    }
  }

  buildFarm(c, v, b) {
    const base = this.column(b.x, b.z).h + 1;
    const x0 = b.x - (b.w >> 1), z0 = b.z - (b.d >> 1);
    this.clearSite(c, x0, z0, b.w, b.d, base, B.DIRT);
    for (let x = x0; x < x0 + b.w; x++) for (let z = z0; z < z0 + b.d; z++) {
      const edge = x === x0 || x === x0 + b.w - 1 || z === z0 || z === z0 + b.d - 1;
      if (edge) { this.put(c, x, base - 1, z, v.wall); this.put(c, x, base, z, v.wall); continue; }
      const trench = z === z0 + (b.d >> 1);
      this.put(c, x, base - 1, z, trench ? B.WATER : B.DIRT);
      if (!trench && hash3(x, 13, z, this.seed + 44) < 0.75) this.put(c, x, base, z, B.GREEN_WOOL);
    }
  }

  // A path of trodden ground from each doorstep back towards the well. It starts
  // outside the walls and stops short of the well, so it cuts through neither.
  buildPath(c, v, b) {
    if (b.type === 'well') return;
    const dx = v.x - b.x, dz = v.z - b.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 6) return;
    const ux = dx / dist, uz = dz / dist;
    const from = Math.max(b.w, b.d) / 2 + 1;
    const sx = b.x + ux * from, sz = b.z + uz * from;
    const ex = v.x - ux * 3, ez = v.z - uz * 3;
    const steps = Math.ceil(Math.max(Math.abs(ex - sx), Math.abs(ez - sz)));
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      const x = Math.round(sx + (ex - sx) * t), z = Math.round(sz + (ez - sz) * t);
      const y = this.column(x, z).h;
      this.put(c, x, y, z, v.path);
      this.put(c, x, y + 1, z, 0);
    }
  }

  // The End: one island of end stone hanging in the void, with obsidian pillars.
  generateEnd(cx, cz) {
    const c = new Chunk(cx, cz);
    this.chunks.set(this.key(cx, cz), c);
    const bx = cx * CX, bz = cz * CZ;
    const blocks = c.blocks;
    const MID = 62;
    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      const wx = bx + lx, wz = bz + lz;
      const dist = Math.hypot(wx, wz);
      if (dist > 190) continue;                                    // beyond the island is void
      const edge = 1 - dist / 190;
      const n = this.nStone.nfbm2(wx * 0.012, wz * 0.012, 4);
      const thick = 14 * Math.pow(clamp(edge * 1.35, 0, 1), 0.7) + n * 5;
      if (thick < 1.5) continue;
      const top = Math.round(MID + n * 4);
      const bottom = Math.round(top - thick);
      for (let y = bottom; y <= top; y++) blocks[colOffset(lx, lz) + y * CX * CZ] = B.END_STONE;
    }

    // the way home, at the very middle of the island
    if (Math.abs(bx) <= 16 && Math.abs(bz) <= 16) {
      // worked out from the noise, not from blocks, so all four chunks around the
      // middle agree on where the frame sits
      const surface = Math.round(MID + this.nStone.nfbm2(0, 0, 4) * 4);
      {
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
          const lx = dx - bx, lz = dz - bz;
          if (lx < 0 || lz < 0 || lx >= CX || lz >= CZ) continue;
          const ring = Math.abs(dx) === 2 || Math.abs(dz) === 2;
          blocks[colOffset(lx, lz) + surface * CX * CZ] = ring ? B.BEDROCK : B.END_PORTAL;
          if (ring) blocks[colOffset(lx, lz) + (surface + 1) * CX * CZ] = B.BEDROCK;
        }
      }
    }

    // obsidian pillars in a ring, each capped with a light
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const px = Math.round(Math.cos(a) * 74), pz = Math.round(Math.sin(a) * 74);
      if (Math.abs(px - (bx + 8)) > 12 || Math.abs(pz - (bz + 8)) > 12) continue;
      const h = 22 + ((hash3(px, 5, pz, this.seed) * 16) | 0);
      const rad = 2 + ((hash3(px, 6, pz, this.seed) * 2) | 0);
      let base = MID + 10;
      for (let y = CY - 2; y > 4; y--) {
        const lx = px - bx, lz = pz - bz;
        if (lx >= 0 && lz >= 0 && lx < CX && lz < CZ && blocks[colOffset(lx, lz) + y * CX * CZ]) { base = y + 1; break; }
      }
      for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
        if (dx * dx + dz * dz > rad * rad + 1) continue;
        const lx = px + dx - bx, lz = pz + dz - bz;
        if (lx < 0 || lz < 0 || lx >= CX || lz >= CZ) continue;
        for (let y = base; y < base + h && y < CY - 1; y++) blocks[colOffset(lx, lz) + y * CX * CZ] = B.OBSIDIAN;
        if (dx === 0 && dz === 0) blocks[colOffset(lx, lz) + Math.min(CY - 1, base + h) * CX * CZ] = B.END_CRYSTAL;
        else blocks[colOffset(lx, lz) + Math.min(CY - 1, base + h) * CX * CZ] = B.OBSIDIAN;
      }
    }

    if (this.edits.size) {
      for (const [k, id] of this.edits) {
        const p = k.split(',');
        const x = +p[0], y = +p[1], z = +p[2];
        if ((x >> 4) === cx && (z >> 4) === cz) blocks[idx(x & 15, y, z & 15)] = id;
      }
    }
    this.rebuildHeightmap(c);
    c.empty = !blocks.some(v => v !== 0);
    this.initLight(c);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nb = this.getChunk(cx + dx, cz + dz);
      if (nb) nb.dirty = true;
    }
    return c;
  }

  getBlockLocal(blocks, lx, y, lz) {
    if (lx < 0 || lz < 0 || lx >= CX || lz >= CZ || y < 0 || y >= CY) return 0;
    return blocks[colOffset(lx, lz) + y * CX * CZ];
  }

  // ---- strongholds ------------------------------------------------------
  // A buried room with the twelve-frame ring, waiting for eyes.
  strongholdFor(rx, rz) {
    const key = rx * 31337 + rz * 55499;
    if (this.strongholds.has(key)) return this.strongholds.get(key);
    let hold = null;
    if (hash3(rx, 91, rz, this.seed + 808) < 0.42) {
      const jx = (hash3(rx, 3, rz, this.seed + 41) * (STRONGHOLD_SPACING - 4)) | 0;
      const jz = (hash3(rx, 4, rz, this.seed + 42) * (STRONGHOLD_SPACING - 4)) | 0;
      const x = (rx * STRONGHOLD_SPACING + jx + 2) * CX + 8;
      const z = (rz * STRONGHOLD_SPACING + jz + 2) * CZ + 8;
      const surface = this.column(x, z).h;
      if (surface > SEA_LEVEL) hold = { x, z, y: Math.max(14, Math.min(34, surface - 30)) };
    }
    this.strongholds.set(key, hold);
    return hold;
  }

  buildStrongholds(c) {
    const bx = c.cx * CX, bz = c.cz * CZ;
    const rx = Math.floor((bx + 8) / (STRONGHOLD_SPACING * CX)), rz = Math.floor((bz + 8) / (STRONGHOLD_SPACING * CZ));
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const h = this.strongholdFor(rx + dx, rz + dz);
      if (!h) continue;
      if (Math.abs(h.x - (bx + 8)) > 20 || Math.abs(h.z - (bz + 8)) > 20) continue;
      this.buildStronghold(c, h);
    }
  }

  buildStronghold(c, h) {
    const R = 6, base = h.y;
    for (let x = h.x - R; x <= h.x + R; x++) for (let z = h.z - R; z <= h.z + R; z++) {
      const wall = Math.abs(x - h.x) === R || Math.abs(z - h.z) === R;
      for (let y = base - 1; y <= base + 5; y++) {
        const shell = wall || y === base - 1 || y === base + 5;
        if (shell) {
          const mossy = hash3(x, y, z, this.seed + 55) < 0.25;
          this.put(c, x, y, z, mossy ? B.MOSSY_STONE_BRICKS : B.STONE_BRICKS);
        } else this.put(c, x, y, z, 0);
      }
    }
    // the ring: twelve frames around a three by three
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const ring = (Math.abs(dx) === 2) !== (Math.abs(dz) === 2);
      if (ring) this.put(c, h.x + dx, base, h.z + dz, B.END_FRAME);
      else if (Math.abs(dx) < 2 && Math.abs(dz) < 2) this.put(c, h.x + dx, base, h.z + dz, 0);
    }
    for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
      this.put(c, h.x + dx, base + 4, h.z + dz, B.GLOWSTONE);
    }
    this.put(c, h.x + 4, base, h.z, B.CHEST);
  }

  // A market stall: a counter under an awning, with a lamp on the post.
  buildStall(c, v, b) {
    const y = v.y;
    for (let dx = -1; dx <= 1; dx++) {
      this.put(c, b.x + dx, y, b.z, B.SHOP);
      this.put(c, b.x + dx, y + 3, b.z, v.roof);
      this.put(c, b.x + dx, y + 3, b.z - 1, v.roof);
    }
    for (const dx of [-1, 1]) {
      this.put(c, b.x + dx, y + 1, b.z - 1, v.post);
      this.put(c, b.x + dx, y + 2, b.z - 1, v.post);
    }
    this.put(c, b.x, y + 2, b.z - 1, B.TORCH);
  }

  decorate(c) {
    const bx = c.cx * CX, bz = c.cz * CZ;
    for (let lz = -3; lz < CZ + 3; lz++) {
      for (let lx = -3; lx < CX + 3; lx++) {
        const wx = bx + lx, wz = bz + lz;
        const info = this.column(wx, wz);
        if (info.h <= SEA_LEVEL) continue;
        if (lx >= 0 && lz >= 0 && lx < CX && lz < CZ && info.biome !== 'desert' && info.biome !== 'peaks'
            && hash3(wx, 11, wz, this.seed + 77) < 0.0022) {
          const gy = info.h + 1;
          if (c.blocks[idx(lx, info.h, lz)] === B.GRASS && !c.blocks[idx(lx, gy, lz)]) {
            const rare = hash3(wx, 12, wz, this.seed + 78) < 0.08;   // one in a dozen has red eyes
            c.blocks[idx(lx, gy, lz)] = rare ? B.PUMPKIN_RED : B.PUMPKIN;
          }
        }
        // flowers, long grass and bushes across the meadows
        if (lx >= 0 && lz >= 0 && lx < CX && lz < CZ && info.biome !== 'desert' && info.biome !== 'peaks') {
          const gy = info.h + 1;
          if (c.blocks[idx(lx, info.h, lz)] === B.GRASS && !c.blocks[idx(lx, gy, lz)]) {
            const f = hash3(wx, 19, wz, this.seed + 61);
            if (f < 0.055) c.blocks[idx(lx, gy, lz)] = B.TALL_GRASS;
            else if (f < 0.064) c.blocks[idx(lx, gy, lz)] = B.RED_FLOWER;
            else if (f < 0.072) c.blocks[idx(lx, gy, lz)] = B.YELLOW_FLOWER;
            // bushes are commonest under the trees, and one in ten is in berry
            else if (f < 0.072 + (info.biome === 'forest' ? 0.030 : 0.014)) {
              c.blocks[idx(lx, gy, lz)] =
                hash3(wx, 20, wz, this.seed + 62) < 0.10 ? B.BERRY_BUSH : B.BUSH;
            }
          }
        }

        // Waterfalls. Where a hillside breaks away, a spring comes out at the lip
        // and the water is drawn down the face of the drop as a sheet. It is cut
        // in during generation rather than left to the fluid sim, so it is there
        // waiting for you rather than arriving once you walk up to it.
        if (info.h > SEA_LEVEL + 8 && info.biome !== 'desert'
            && hash3(wx, 23, wz, this.seed + 64) < 0.0075) {
          let dir = null, drop = 0;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const near = this.column(wx + dx, wz + dz).h;
            const far = this.column(wx + dx * 3, wz + dz * 3).h;
            const d = info.h - Math.min(near, far);
            if (d > drop && near <= info.h) { drop = d; dir = [dx, dz]; }
          }
          if (dir && drop >= 4) {
            const fx = wx + dir[0], fz = wz + dir[1];
            const foot = Math.min(this.column(fx, fz).h, this.column(wx + dir[0] * 2, wz + dir[1] * 2).h);
            this.put(c, wx, info.h + 1, wz, B.WATER);            // the spring on the lip
            for (let y = info.h; y > foot; y--) {                 // and the sheet coming off it
              this.put(c, fx, y, fz, B.WATER);
            }
            this.put(c, fx, foot + 1, fz, B.WATER);              // the pool at the bottom
          }
        }

        const p = { forest: 0.06, plains: 0.008, snowy: 0.025, desert: 0.02, peaks: 0.01, jungle: 0.17 }[info.biome];
        if (!p) continue;
        const r = hash3(wx, 7, wz, this.seed + 99);
        if (r > p) continue;
        // thin the forest: keep only the local minimum hash in a 5x5 window
        let best = true;
        for (let dz = -2; dz <= 2 && best; dz++) for (let dx = -2; dx <= 2; dx++) {
          if (!dx && !dz) continue;
          if (hash3(wx + dx, 7, wz + dz, this.seed + 99) < r) { best = false; break; }
        }
        if (!best) continue;
        const roll = hash3(wx, 3, wz, this.seed + 12);
        if (info.biome === 'jungle') this.placeTree(c, wx, info.h + 1, wz, roll, roll < 0.45 ? 'spruce' : 'oak');
        else if (info.biome === 'desert') this.placeCactus(c, wx, info.h + 1, wz, roll);
        else if (info.biome === 'snowy' || info.biome === 'peaks') this.placeTree(c, wx, info.h + 1, wz, roll, 'spruce');
        else if (info.biome === 'forest' && roll < 0.35) this.placeTree(c, wx, info.h + 1, wz, roll / 0.35, 'birch');
        else this.placeTree(c, wx, info.h + 1, wz, roll, 'oak');
      }
    }
  }

  placeCactus(c, wx, baseY, wz, r) {
    const bx = c.cx * CX, bz = c.cz * CZ;
    const lx = wx - bx, lz = wz - bz;
    if (lx < 0 || lz < 0 || lx >= CX || lz >= CZ) return;
    if (c.blocks[idx(lx, baseY - 1, lz)] !== B.SAND) return;
    const h = 1 + ((r * 3) | 0);
    for (let y = baseY; y < baseY + h && y < CY; y++) {
      if (c.blocks[idx(lx, y, lz)]) return;
      c.blocks[idx(lx, y, lz)] = B.CACTUS;
    }
  }

  placeTree(c, wx, baseY, wz, r, species) {
    const bx = c.cx * CX, bz = c.cz * CZ;
    const put = (x, y, z, id, replaceOnly) => {
      const lx = x - bx, lz = z - bz;
      if (lx < 0 || lz < 0 || lx >= CX || lz >= CZ || y < 0 || y >= CY) return;
      const i = idx(lx, y, lz);
      if (replaceOnly && c.blocks[i] !== 0) return;
      c.blocks[i] = id;
    };
    const kinds = treeKinds();
    const kind = kinds[species] || kinds.oak;
    const th = kind.min + ((r * kind.extra) | 0);
    const topY = baseY + th - 1;

    if (kind.conifer) {
      // a fir: widening rings of needles from the tip down
      for (let i = 0; i <= th - 2; i++) {
        const y = topY + 1 - i;
        if (y <= baseY + 1) break;
        const rad = Math.min(2, i >> 1);
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (rad === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          put(wx + dx, y, wz + dz, kind.leaves, true);
        }
      }
    } else {
      for (let dy = -2; dy <= 1; dy++) {
        const rad = dy <= -1 ? 2 : 1;
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad) {
            if (dy === 1 || hash3(wx + dx, topY + dy, wz + dz, this.seed + 3) < 0.5) continue;
          }
          if (dy === 1 && Math.abs(dx) + Math.abs(dz) > 1) continue;
          put(wx + dx, topY + dy, wz + dz, kind.leaves, true);
        }
      }
    }
    for (let y = baseY; y < baseY + th; y++) put(wx, y, wz, kind.log, false);
  }

  rebuildHeightmap(c) {
    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      let top = -1;
      for (let y = CY - 1; y >= 0; y--) {
        if (BLOCKS[c.blocks[idx(lx, y, lz)]].opaque) { top = y; break; }
      }
      c.hmap[lz * CX + lx] = top;
    }
  }

  // ---- lighting --------------------------------------------------------
  pushAdd(x, y, z) { this.addQueue.push(x, y, z); }
  pushRemove(x, y, z, level, channel) { this.remQueue.push(x, y, z, level, channel); }

  initLight(c) {
    const bx = c.cx * CX, bz = c.cz * CZ;
    for (let lz = 0; lz < CZ; lz++) for (let lx = 0; lx < CX; lx++) {
      let level = 15;
      for (let y = CY - 1; y >= 0; y--) {
        const id = c.blocks[idx(lx, y, lz)];
        const b = BLOCKS[id];
        if (b.opaque) level = 0;
        else if (b.liquid) level = Math.max(0, level - 1);
        const i = idx(lx, y, lz);
        const smothered = this.dark(bx + lx, y, bz + lz);
        c.light[i] = smothered ? 0 : ((level << 4) | b.light);
        if (!smothered && (level > 0 || b.light > 0)) this.pushAdd(bx + lx, y, bz + lz);
        if (level === 0 && !b.light) {
          // everything below an opaque column is dark until the flood fill reaches it
        }
      }
    }
    // let light from already-loaded neighbours flow in
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const n = this.getChunk(c.cx + dx, c.cz + dz);
      if (!n) continue;
      const nbx = n.cx * CX, nbz = n.cz * CZ;
      for (let t = 0; t < CX; t++) for (let y = 0; y < CY; y++) {
        const lx = dx === 0 ? t : (dx < 0 ? CX - 1 : 0);
        const lz = dz === 0 ? t : (dz < 0 ? CZ - 1 : 0);
        if (n.light[idx(lx, y, lz)]) this.pushAdd(nbx + lx, y, nbz + lz);
      }
    }
    this.propagate();
  }

  propagate() {
    const q = this.addQueue;
    while (this.addHead < q.length) {
      const x = q[this.addHead++], y = q[this.addHead++], z = q[this.addHead++];
      const l = this.getLight(x, y, z);
      const sky = l >> 4, blk = l & 15;
      if (!sky && !blk) continue;
      for (let d = 0; d < 6; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
        if (ny < 0 || ny >= CY) continue;
        const nc = this.chunks.get(this.key(nx >> 4, nz >> 4));
        if (!nc) continue;
        const ni = idx(nx & 15, ny, nz & 15);
        const nb = BLOCKS[nc.blocks[ni]];
        if (nb.opaque) continue;
        if (this.dark(nx, ny, nz)) continue;           // the dark does not let light in
        const cur = nc.light[ni];
        let changed = false;
        let nsky = cur >> 4, nblk = cur & 15;
        let want = (DIRS[d][1] === -1 && sky === 15 && !nb.liquid) ? 15 : sky - 1;
        if (want > nsky) { nsky = want; changed = true; }
        if (blk - 1 > nblk) { nblk = blk - 1; changed = true; }
        if (changed) {
          nc.light[ni] = (nsky << 4) | nblk;
          nc.dirty = true;
          if ((nx & 15) === 0 || (nx & 15) === 15 || (nz & 15) === 0 || (nz & 15) === 15) this.markDirty(nx, nz);
          q.push(nx, ny, nz);
        }
      }
    }
    q.length = 0; this.addHead = 0;
  }

  // Darkness spreads first, then we re-flood from whatever is still bright.
  removeLight(x, y, z) {
    const l = this.getLight(x, y, z);
    this.setLightRaw(x, y, z, 0, 0);
    this.remQueue.push(x, y, z, l >> 4, 0);
    this.remQueue.push(x, y, z, l & 15, 1);
    const rq = this.remQueue;
    while (this.remHead < rq.length) {
      const cx0 = rq[this.remHead++], cy0 = rq[this.remHead++], cz0 = rq[this.remHead++];
      const level = rq[this.remHead++], ch = rq[this.remHead++];
      if (level <= 0) continue;
      for (let d = 0; d < 6; d++) {
        const nx = cx0 + DIRS[d][0], ny = cy0 + DIRS[d][1], nz = cz0 + DIRS[d][2];
        if (ny < 0 || ny >= CY) continue;
        const nc = this.chunks.get(this.key(nx >> 4, nz >> 4));
        if (!nc) continue;
        const ni = idx(nx & 15, ny, nz & 15);
        const cur = nc.light[ni];
        const nl = ch === 0 ? (cur >> 4) : (cur & 15);
        if (nl === 0) continue;
        const sunColumn = ch === 0 && DIRS[d][1] === -1 && level === 15;
        if (nl < level || sunColumn) {
          nc.light[ni] = ch === 0 ? (cur & 15) : (cur & 0xF0);
          nc.dirty = true;
          this.markDirty(nx, nz);
          rq.push(nx, ny, nz, nl, ch);
        } else if (nl >= level) {
          this.pushAdd(nx, ny, nz);
        }
      }
    }
    rq.length = 0; this.remHead = 0;
  }

  // ---- mutation --------------------------------------------------------
  setBlock(x, y, z, id, record = true) {
    if (y < 0 || y >= CY) return false;
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return false;
    const i = idx(x & 15, y, z & 15);
    const old = c.blocks[i];
    if (old === id) return false;
    c.blocks[i] = id;
    if (id) c.empty = false;
    if (record) this.edits.set(x + ',' + y + ',' + z, id);

    const col = (z & 15) * CX + (x & 15);
    if (BLOCKS[id].opaque) { if (y > c.hmap[col]) c.hmap[col] = y; }
    else if (c.hmap[col] === y) {
      let top = -1;
      for (let yy = y - 1; yy >= 0; yy--) if (BLOCKS[c.blocks[idx(x & 15, yy, z & 15)]].opaque) { top = yy; break; }
      c.hmap[col] = top;
    }

    const key = x + ',' + y + ',' + z;
    const wasDark = BLOCKS[old].darkstone, nowDark = BLOCKS[id].darkstone;
    if (nowDark) this.darkstones.set(key, [x, y, z]);
    else if (wasDark) this.darkstones.delete(key);
    const lightChanged = BLOCKS[old].light > 0 || BLOCKS[id].light > 0;

    this.removeLight(x, y, z);
    if (!BLOCKS[id].opaque) {
      for (let d = 0; d < 6; d++) this.pushAdd(x + DIRS[d][0], y + DIRS[d][1], z + DIRS[d][2]);
      // reopening a column to the sky: re-seed from directly above
      this.pushAdd(x, y + 1, z);
    }
    // emitters glow whether or not they are see-through
    if (BLOCKS[id].light) { this.setBlockLight(x, y, z, BLOCKS[id].light); this.pushAdd(x, y, z); }
    this.propagate();
    c.dirty = true;
    this.markDirty(x, z);
    if (typeof Fluid !== 'undefined') Fluid.touchAround(this, x, y, z);
    if (wasDark || nowDark || (lightChanged && this.darkstones.size)) this.refreshDark(x, y, z);
    return true;
  }

  unloadChunk(cx, cz) {
    const k = this.key(cx, cz);
    const c = this.chunks.get(k);
    if (!c) return null;
    this.chunks.delete(k);
    return c;
  }
}

// Built lazily so it always follows the block table rather than hard-coded ids.
let TREE_KINDS = null;
function treeKinds() {
  if (!TREE_KINDS) TREE_KINDS = {
    oak: { log: B.LOG, leaves: B.LEAVES, min: 4, extra: 3 },
    birch: { log: B.BIRCH_LOG, leaves: B.BIRCH_LEAVES, min: 5, extra: 3 },
    spruce: { log: B.SPRUCE_LOG, leaves: B.SPRUCE_LEAVES, min: 6, extra: 4, conifer: true },
  };
  return TREE_KINDS;
}

const DARK_R = 4;             // how far darkstone smothers the light
const VILLAGE_SPACING = 20;   // chunks between village regions
const STRONGHOLD_SPACING = 28;
const VILLAGE_RADIUS = 30;

const colOffset = (lx, lz) => lx + lz * CX;

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
