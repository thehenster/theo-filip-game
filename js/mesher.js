// Turns a chunk of voxels into two vertex buffers (solid + translucent),
// with per-vertex ambient occlusion and smoothed light.

// +X, -X, +Y, -Y, +Z, -Z  (same order as DIRS and BLOCKS[].faces)
const FACES = [
  { n: [1, 0, 0], shade: 0.74, t: [1, 2], v: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]] },
  { n: [-1, 0, 0], shade: 0.74, t: [1, 2], v: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
  { n: [0, 1, 0], shade: 1.00, t: [0, 2], v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
  { n: [0, -1, 0], shade: 0.50, t: [0, 2], v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { n: [0, 0, 1], shade: 0.88, t: [0, 1], v: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  { n: [0, 0, -1], shade: 0.88, t: [0, 1], v: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] },
];
const FACE_UV = [[0, 1], [1, 1], [1, 0], [0, 0]];
const AO_SHADE = [0.42, 0.63, 0.82, 1.0];

// Precompute, per face and per corner, the three neighbour offsets used for AO.
for (const f of FACES) {
  f.ao = f.v.map(c => {
    const [t1, t2] = f.t;
    const d1 = c[t1] ? 1 : -1, d2 = c[t2] ? 1 : -1;
    const mk = (a1, a2) => {
      const o = [f.n[0], f.n[1], f.n[2]];
      if (a1) o[t1] += d1;
      if (a2) o[t2] += d2;
      return o;
    };
    return [mk(1, 0), mk(0, 1), mk(1, 1)];
  });
}

class VertBuffer {
  constructor() { this.data = new Float32Array(8192); this.len = 0; this.verts = 0; this.idx = new Uint32Array(4096); this.ilen = 0; }
  need(n) {
    if (this.len + n <= this.data.length) return;
    let cap = this.data.length;
    while (cap < this.len + n) cap *= 2;
    const d = new Float32Array(cap); d.set(this.data.subarray(0, this.len)); this.data = d;
  }
  needIdx(n) {
    if (this.ilen + n <= this.idx.length) return;
    let cap = this.idx.length;
    while (cap < this.ilen + n) cap *= 2;
    const d = new Uint32Array(cap); d.set(this.idx.subarray(0, this.ilen)); this.idx = d;
  }
}

const FLOATS_PER_VERT = 9; // x y z u v layer shade sky block

// Water level 0 (a source) fills 8/9 of the block; level 7 is a thin film.
function liquidSurface(world, id, x, y, z) {
  if (isLiquid(world.getBlock(x, y + 1, z))) return 1;
  return (8 - (BLOCKS[id].level || 0)) / 9;
}

function meshChunk(world, chunk) {
  const solid = new VertBuffer(), fluid = new VertBuffer();
  const bx = chunk.cx * CX, bz = chunk.cz * CZ;
  const blocks = chunk.blocks;

  for (let y = 0; y < CY; y++) {
    for (let z = 0; z < CZ; z++) {
      for (let x = 0; x < CX; x++) {
        const id = blocks[idx(x, y, z)];
        if (!id) continue;
        const def = BLOCKS[id];
        const wx = bx + x, wz = bz + z;
        const buf = def.translucent ? fluid : solid;
        // A liquid's surface sits at its level, unless more liquid covers it.
        const topY = def.liquid ? liquidSurface(world, id, wx, y, wz) : 1;

        // Blocks built out of sub-boxes — stairs — are drawn box by box. A face
        // is only culled where it sits flush against the cube's own boundary,
        // and the texture is sliced to match the box so it stays at world scale.
        if (def.boxes) {
          for (const bo of def.boxes) {
            for (let d = 0; d < 6; d++) {
              const f = FACES[d];
              const flush = (d === 0 && bo[3] === 1) || (d === 1 && bo[0] === 0) ||
                            (d === 2 && bo[4] === 1) || (d === 3 && bo[1] === 0) ||
                            (d === 4 && bo[5] === 1) || (d === 5 && bo[2] === 0);
              const nx = wx + f.n[0], ny = y + f.n[1], nz = wz + f.n[2];
              if (flush && BLOCKS[world.getBlockOrSolid(nx, ny, nz)].opaque) continue;
              const l = flush ? world.getLight(nx, ny, nz) : world.getLight(wx, y, wz);
              const sky = (l >> 4) / 15, blk = (l & 15) / 15;
              const layer = def.faces[d];
              const t1 = f.t[0], t2 = f.t[1];
              const base = buf.verts;
              buf.need(4 * FLOATS_PER_VERT);
              const D = buf.data;
              let p = buf.len;
              for (let vi = 0; vi < 4; vi++) {
                const c = f.v[vi];
                D[p++] = x + (c[0] ? bo[3] : bo[0]);
                D[p++] = y + (c[1] ? bo[4] : bo[1]);
                D[p++] = z + (c[2] ? bo[5] : bo[2]);
                D[p++] = bo[t1] + FACE_UV[vi][0] * (bo[t1 + 3] - bo[t1]);
                D[p++] = bo[t2] + FACE_UV[vi][1] * (bo[t2 + 3] - bo[t2]);
                D[p++] = layer;
                D[p++] = f.shade;
                D[p++] = sky; D[p++] = blk;
              }
              buf.len = p;
              buf.verts += 4;
              buf.needIdx(6);
              const I2 = buf.idx;
              let q2 = buf.ilen;
              I2[q2++] = base; I2[q2++] = base + 1; I2[q2++] = base + 2;
              I2[q2++] = base; I2[q2++] = base + 2; I2[q2++] = base + 3;
              buf.ilen = q2;
            }
          }
          continue;
        }

        for (let d = 0; d < 6; d++) {
          const f = FACES[d];
          const nx = wx + f.n[0], ny = y + f.n[1], nz = wz + f.n[2];
          const nid = world.getBlockOrSolid(nx, ny, nz);
          let faceTop = topY, botY = 0;
          if (def.liquid && BLOCKS[nid].liquid && BLOCKS[nid].fluid === def.fluid) {
            // between two bodies of water, only the step down to a shallower
            // neighbour is worth drawing
            if (d === 2 || d === 3) continue;
            const nTop = liquidSurface(world, nid, nx, ny, nz);
            if (nTop >= topY) continue;
            botY = nTop;
          } else if (nid === id || BLOCKS[nid].opaque) continue;

          const layer = def.faces[d];
          const base = buf.verts;
          const ao = [0, 0, 0, 0];
          buf.need(4 * FLOATS_PER_VERT);
          const D = buf.data;
          let p = buf.len;

          for (let vi = 0; vi < 4; vi++) {
            const c = f.v[vi], off = f.ao[vi];
            let s1 = 0, s2 = 0, cn = 0;
            let sky = 0, blk = 0, n = 0;
            // the cell in front of the face always contributes
            {
              const l = world.getLight(nx, ny, nz);
              sky += l >> 4; blk += l & 15; n++;
            }
            for (let k = 0; k < 3; k++) {
              const o = off[k];
              const ox = wx + o[0], oy = y + o[1], oz = wz + o[2];
              const ob = world.getBlockOrSolid(ox, oy, oz);
              const opaque = BLOCKS[ob].opaque;
              if (k === 0) s1 = opaque ? 1 : 0;
              else if (k === 1) s2 = opaque ? 1 : 0;
              else cn = opaque ? 1 : 0;
              if (!opaque) { const l = world.getLight(ox, oy, oz); sky += l >> 4; blk += l & 15; n++; }
            }
            const a = (s1 && s2) ? 0 : 3 - (s1 + s2 + cn);
            ao[vi] = a;
            const vy = c[1] ? faceTop : botY;
            D[p++] = x + c[0]; D[p++] = y + vy; D[p++] = z + c[2];
            D[p++] = FACE_UV[vi][0]; D[p++] = FACE_UV[vi][1];
            D[p++] = layer;
            D[p++] = f.shade * AO_SHADE[a];
            D[p++] = (sky / n) / 15;
            D[p++] = (blk / n) / 15;
          }
          buf.len = p;
          buf.verts += 4;

          buf.needIdx(6);
          const I = buf.idx;
          let q = buf.ilen;
          if (ao[0] + ao[2] > ao[1] + ao[3]) {
            // split along the 1-3 diagonal so the dark corner does not smear
            I[q++] = base + 1; I[q++] = base + 2; I[q++] = base + 3;
            I[q++] = base + 1; I[q++] = base + 3; I[q++] = base;
          } else {
            I[q++] = base; I[q++] = base + 1; I[q++] = base + 2;
            I[q++] = base; I[q++] = base + 2; I[q++] = base + 3;
          }
          buf.ilen = q;
        }
      }
    }
  }

  return {
    solid: { verts: solid.data.subarray(0, solid.len), idx: solid.idx.subarray(0, solid.ilen) },
    fluid: { verts: fluid.data.subarray(0, fluid.len), idx: fluid.idx.subarray(0, fluid.ilen) },
  };
}
