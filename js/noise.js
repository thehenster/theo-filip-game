// Seeded PRNG + Perlin noise (2D/3D) with fBm helpers.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic hash of an integer position -> [0,1). Used for trees, ores, decoration.
function hash3(x, y, z, seed) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

class Perlin {
  constructor(seed) {
    const rnd = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (rnd() * (i + 1)) | 0;
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.p[i] = p[i & 255];
  }
  static fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  static grad2(h, x, y) {
    switch (h & 3) {
      case 0: return x + y; case 1: return -x + y; case 2: return x - y; default: return -x - y;
    }
  }
  static grad3(h, x, y, z) {
    const u = h < 8 ? x : y;
    const v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }
  noise2(x, y) {
    const p = this.p;
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = Perlin.fade(x), v = Perlin.fade(y);
    const A = p[X] + Y, B = p[X + 1] + Y;
    const n0 = lerp(Perlin.grad2(p[A], x, y), Perlin.grad2(p[B], x - 1, y), u);
    const n1 = lerp(Perlin.grad2(p[A + 1], x, y - 1), Perlin.grad2(p[B + 1], x - 1, y - 1), u);
    return lerp(n0, n1, v) * 0.7;
  }
  noise3(x, y, z) {
    const p = this.p;
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = Perlin.fade(x), v = Perlin.fade(y), w = Perlin.fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    const g = Perlin.grad3;
    return lerp(
      lerp(lerp(g(p[AA], x, y, z), g(p[BA], x - 1, y, z), u),
           lerp(g(p[AB], x, y - 1, z), g(p[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(g(p[AA + 1], x, y, z - 1), g(p[BA + 1], x - 1, y, z - 1), u),
           lerp(g(p[AB + 1], x, y - 1, z - 1), g(p[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  }
  fbm2(x, y, octaves, persistence = 0.5, lacunarity = 2) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise2(x * freq, y * freq) * amp;
      norm += amp; amp *= persistence; freq *= lacunarity;
    }
    return sum / norm;
  }
  // fBm lands around +-0.3 at the 1st/99th percentile; scale it into a usable +-1.
  nfbm2(x, y, octaves) { return clamp(this.fbm2(x, y, octaves) * 3.3, -1, 1); }
  fbm3(x, y, z, octaves, persistence = 0.5, lacunarity = 2) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise3(x * freq, y * freq, z * freq) * amp;
      norm += amp; amp *= persistence; freq *= lacunarity;
    }
    return sum / norm;
  }
}
