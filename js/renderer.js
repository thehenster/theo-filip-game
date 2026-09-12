// WebGL2 renderer: sky dome, chunk passes, block highlight and held block.
const CHUNK_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in float aLayer;
layout(location=3) in float aShade;
layout(location=4) in vec2 aLight;
uniform mat4 uViewProj;
uniform vec3 uOffset;
uniform float uDay;
uniform float uAmbient;
out vec2 vUV; out float vLayer; out float vBright; out vec3 vWorld;
void main() {
  vec3 p = aPos + uOffset;
  vUV = aUV; vLayer = aLayer; vWorld = p;
  float light = max(aLight.x * uDay, aLight.y);
  vBright = aShade * (uAmbient + (1.0 - uAmbient) * pow(light, 1.45));
  gl_Position = uViewProj * vec4(p, 1.0);
}`;

const CHUNK_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 vUV; in float vLayer; in float vBright; in vec3 vWorld;
uniform sampler2DArray uTex;
uniform vec3 uFogColor;
uniform vec2 uFogRange;
uniform vec3 uCam;
uniform float uAlpha;
uniform float uUVScroll;
uniform float uAlphaTest;
out vec4 frag;
void main() {
  vec2 uv = vUV + vec2(0.0, uUVScroll);
  vec4 t = texture(uTex, vec3(uv, vLayer));
  if (uAlphaTest > 0.5 && t.a < 0.5) discard;
  vec3 c = t.rgb * vBright;
  float d = distance(vWorld, uCam);
  float f = clamp((d - uFogRange.x) / max(uFogRange.y - uFogRange.x, 0.001), 0.0, 1.0);
  f = f * f;
  frag = vec4(mix(c, uFogColor, f), t.a * uAlpha);
}`;

const SKY_VS = `#version 300 es
precision highp float;
const vec2 P[3] = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0));
out vec2 vNDC;
void main() { vNDC = P[gl_VertexID]; gl_Position = vec4(P[gl_VertexID], 1.0, 1.0); }`;

const SKY_FS = `#version 300 es
precision highp float;
in vec2 vNDC;
uniform mat4 uInvVP;
uniform vec3 uCam;
uniform vec3 uSun;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform float uStars;
out vec4 frag;
float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
void main() {
  vec4 far = uInvVP * vec4(vNDC, 1.0, 1.0);
  vec3 dir = normalize(far.xyz / far.w - uCam);
  float h = clamp(dir.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
  // warm glow around the sun near the horizon
  float sd = max(dot(dir, uSun), 0.0);
  col += uHorizon * pow(sd, 8.0) * 0.5;
  col += vec3(1.0, 0.86, 0.6) * pow(sd, 220.0) * 3.0;
  if (uStars > 0.01) {
    vec3 g = floor(dir * 180.0);
    float s = hash(g);
    float star = smoothstep(0.9975, 1.0, s) * uStars * clamp(dir.y * 2.0, 0.0, 1.0);
    col += vec3(star);
  }
  frag = vec4(col, 1.0);
}`;

const LINE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform vec3 uOffset;
uniform float uScale;
void main() { gl_Position = uViewProj * vec4((aPos * 1.002 - 0.001) * uScale + uOffset, 1.0); }`;

const LINE_FS = `#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 frag;
void main() { frag = uColor; }`;

const HAND_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
layout(location=2) in float aLayer;
layout(location=3) in float aShade;
uniform mat4 uMVP;
out vec2 vUV; out float vLayer; out float vShade;
void main() { vUV = aUV; vLayer = aLayer; vShade = aShade; gl_Position = uMVP * vec4(aPos, 1.0); }`;

const HAND_FS = `#version 300 es
precision highp float;
precision highp sampler2DArray;
in vec2 vUV; in float vLayer; in float vShade;
uniform sampler2DArray uTex;
uniform float uDay;
out vec4 frag;
void main() {
  vec4 t = texture(uTex, vec3(vUV, vLayer));
  if (t.a < 0.5) discard;
  frag = vec4(t.rgb * vShade * max(0.35, uDay), 1.0);
}`;

class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    this.gl = gl; this.canvas = canvas;
    this.chunkProg = this.program(CHUNK_VS, CHUNK_FS);
    this.skyProg = this.program(SKY_VS, SKY_FS);
    this.lineProg = this.program(LINE_VS, LINE_FS);
    this.handProg = this.program(HAND_VS, HAND_FS);
    this.uChunk = this.uniforms(this.chunkProg, ['uViewProj','uOffset','uDay','uTex','uFogColor','uFogRange','uCam','uAlpha','uUVScroll','uAlphaTest','uAmbient']);
    this.uSky = this.uniforms(this.skyProg, ['uInvVP','uCam','uSun','uZenith','uHorizon','uStars']);
    this.uLine = this.uniforms(this.lineProg, ['uViewProj','uOffset','uColor','uScale']);
    this.uHand = this.uniforms(this.handProg, ['uMVP','uTex','uDay']);
    this.emptyVAO = gl.createVertexArray();
    this.buildTexture();
    this.buildMobTexture();
    this.buildLineBox();
    this.initMobBuffer();
    this.initDropBuffer();
    this.handMesh = null;
    this.proj = M4.create(); this.view = M4.create(); this.viewProj = M4.create();
    this.invVP = M4.create(); this.camWorld = M4.create(); this.handModel = M4.create(); this.handMVP = M4.create();
    this.planes = [[], [], [], [], [], []].map(() => new Float32Array(4));
    this.stats = { chunks: 0, tris: 0, mobs: 0 };
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  program(vsSrc, fsSrc) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  uniforms(prog, names) {
    const o = {};
    for (const n of names) o[n] = this.gl.getUniformLocation(prog, n);
    return o;
  }

  buildTexture() {
    const gl = this.gl;
    const layers = TILES.length;
    const data = new Uint8Array(TILE * TILE * 4 * layers);
    for (let i = 0; i < layers; i++) data.set(TILES[i], i * TILE * TILE * 4);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, TILE, TILE, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT,
      Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    this.tex = tex;
  }

  buildMobTexture() {
    const gl = this.gl;
    const layers = MOB_SKINS.length;
    if (!layers) { this.mobTex = null; return; }
    const data = new Uint8Array(MOB_TEX * MOB_TEX * 4 * layers);
    for (let i = 0; i < layers; i++) data.set(MOB_SKINS[i], i * MOB_TEX * MOB_TEX * 4);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, MOB_TEX, MOB_TEX, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.mobTex = tex;
  }

  // One dynamic buffer holds every visible animal, so the herd is a single draw call.
  initMobBuffer() {
    const gl = this.gl;
    const maxVerts = 48 * 10 * 24;
    this.mobData = new Float32Array(maxVerts * FLOATS_PER_VERT);
    this.mobMaxVerts = maxVerts;
    this.mobVAO = gl.createVertexArray();
    gl.bindVertexArray(this.mobVAO);
    this.mobVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.mobVBO);
    gl.bufferData(gl.ARRAY_BUFFER, this.mobData.byteLength, gl.DYNAMIC_DRAW);
    const stride = FLOATS_PER_VERT * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 28);
    const quads = maxVerts / 4;
    const idx = new Uint32Array(quads * 6);
    for (let q = 0; q < quads; q++) {
      const v = q * 4, i = q * 6;
      idx[i] = v; idx[i+1] = v+1; idx[i+2] = v+2; idx[i+3] = v; idx[i+4] = v+2; idx[i+5] = v+3;
    }
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  initDropBuffer() {
    const gl = this.gl;
    const maxVerts = this.dropMaxVerts = 240 * 24;
    this.dropData = new Float32Array(maxVerts * FLOATS_PER_VERT);
    this.dropVAO = gl.createVertexArray();
    gl.bindVertexArray(this.dropVAO);
    this.dropVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dropVBO);
    gl.bufferData(gl.ARRAY_BUFFER, this.dropData.byteLength, gl.DYNAMIC_DRAW);
    const stride = FLOATS_PER_VERT * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 28);
    const quads = maxVerts / 4;
    const idx = new Uint32Array(quads * 6);
    for (let q = 0; q < quads; q++) {
      const v = q * 4, i = q * 6;
      idx[i] = v; idx[i+1] = v+1; idx[i+2] = v+2; idx[i+3] = v; idx[i+4] = v+2; idx[i+5] = v+3;
    }
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  // Little spinning blocks (and flat sprites for items) waiting to be picked up.
  drawDrops(scene) {
    const gl = this.gl;
    const drops = scene.drops;
    if (!drops || !drops.length) { this.stats.drops = 0; return; }
    const out = this.dropData;
    let p = 0, verts = 0;
    const far = scene.fogRange[1];
    const S = 0.25;
    for (const d of drops) {
      const dx = d.x - scene.eye[0], dz = d.z - scene.eye[2];
      if (dx * dx + dz * dz > far * far) continue;
      if (verts + 24 > this.dropMaxVerts) break;
      const bob = Math.sin(d.age * 2.4) * 0.06 + (d.onGround ? 0.14 : 0);
      const c = Math.cos(d.spin), s = Math.sin(d.spin);
      const flat = isItem(d.id);
      const faces = flat ? [5] : [0, 1, 2, 3, 4, 5];
      const layerOf = f => (flat ? thingTile(d.id) : BLOCKS[d.id].faces[f]);
      for (const f of faces) {
        const face = FACES[f];
        for (let vi = 0; vi < 4; vi++) {
          const corner = face.v[vi];
          const lx = (corner[0] - 0.5) * S;
          const ly = (corner[1] - 0.5) * (flat ? S * 2 : S);
          const lz = (corner[2] - 0.5) * (flat ? 0.02 : S);
          out[p++] = d.x + lx * c - lz * s;
          out[p++] = d.y + ly + bob + (flat ? S : S / 2);
          out[p++] = d.z + lx * s + lz * c;
          out[p++] = FACE_UV[vi][0]; out[p++] = FACE_UV[vi][1];
          out[p++] = layerOf(f);
          out[p++] = flat ? 1 : face.shade;
          out[p++] = d.sky; out[p++] = d.blk;
        }
        verts += 4;
      }
    }
    this.stats.drops = drops.length;
    if (!verts) return;
    gl.bindVertexArray(this.dropVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dropVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, out, 0, p);
    gl.uniform3f(this.uChunk.uOffset, 0, 0, 0);
    gl.disable(gl.CULL_FACE);
    gl.drawElements(gl.TRIANGLES, verts / 4 * 6, gl.UNSIGNED_INT, 0);
    gl.enable(gl.CULL_FACE);
    this.stats.tris += verts / 4 * 2;
  }

  // Animals are rebuilt on the CPU each frame: a few thousand vertices, animated per part.
  drawMobs(scene) {
    const gl = this.gl;
    if (!this.mobTex || !scene.mobs || !scene.mobs.length) return;
    const out = this.mobData;
    let p = 0, verts = 0;
    const far = scene.fogRange[1];
    for (const m of scene.mobs) {
      const dx = m.x - scene.eye[0], dz = m.z - scene.eye[2];
      if (dx * dx + dz * dz > far * far) continue;
      const def = m.def;
      const b = m.aabb();
      const pad = def.boss ? 6 : 0.5;
      if (!M4.aabbInFrustum(this.planes, b[0] - pad, b[1] - pad, b[2] - pad, b[3] + pad, b[4] + pad, b[5] + pad)) continue;
      if (verts + def.template.length * 24 > this.mobMaxVerts) break;
      const cy = Math.cos(m.yaw), sy = Math.sin(m.yaw);
      const flash = m.hurt > 0 ? 2.3 : 1;
      const sky = m.sky;
      // Sculk-grown things carry their own light: in the Deep Lands they are the
      // only thing you can see, and a shape you cannot see is no use to anybody.
      const blk = def.glow ? Math.max(m.blk, def.glow) : m.blk;
      for (const part of def.template) {
        if (m.sheared && part.id === 'wool') continue;
        const a = m.partAngle(part), r = m.partRoll(part);
        const ca = Math.cos(a), sa = Math.sin(a), cr = Math.cos(r), sr = Math.sin(r);
        const V = part.verts, ox = part.origin[0], oy = part.origin[1], oz = part.origin[2];
        for (let i = 0; i < 24; i++) {
          const k = i * 6;
          let x = V[k], y = V[k+1], z = V[k+2];
          if (r) { const nx = x * cr - y * sr; y = x * sr + y * cr; x = nx; }
          if (a) { const ny = y * ca - z * sa; z = y * sa + z * ca; y = ny; }
          x = (x + ox) / 16; y = (y + oy) / 16; z = (z + oz) / 16;
          out[p++] = m.x + x * cy - z * sy;
          out[p++] = m.y + y;
          out[p++] = m.z + x * sy + z * cy;
          out[p++] = V[k+3]; out[p++] = V[k+4];
          out[p++] = def.layer;
          out[p++] = V[k+5] * flash;
          out[p++] = sky; out[p++] = blk;
        }
        verts += 24;
      }
    }
    if (!verts) return;
    gl.bindVertexArray(this.mobVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.mobVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, out, 0, p);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.mobTex);
    gl.uniform3f(this.uChunk.uOffset, 0, 0, 0);
    gl.drawElements(gl.TRIANGLES, verts / 4 * 6, gl.UNSIGNED_INT, 0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    this.stats.tris += verts / 4 * 2;
    this.stats.mobs = verts / 24;
  }

  // A cube of cracks, drawn slightly proud of the block being mined.
  crackMesh(stage) {
    this.crackMeshes = this.crackMeshes || [];
    if (this.crackMeshes[stage]) return this.crackMeshes[stage];
    const gl = this.gl;
    const layer = TILE_ID['crack_' + stage];
    const verts = [], idx = [];
    let base = 0;
    for (let d = 0; d < 6; d++) {
      const f = FACES[d];
      for (let vi = 0; vi < 4; vi++) {
        const c = f.v[vi];
        verts.push(c[0] - 0.5, c[1] - 0.5, c[2] - 0.5, FACE_UV[vi][0], FACE_UV[vi][1], layer, 1);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base += 4;
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 28, 24);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.crackMeshes[stage] = { vao, vbo, ibo, count: idx.length };
    return this.crackMeshes[stage];
  }

  drawBreak(scene) {
    const gl = this.gl;
    if (!scene.breakPos || scene.breakStage < 0) return;
    const mesh = this.crackMesh(clamp(scene.breakStage, 0, 9));
    M4.compose(this.handModel, scene.breakPos[0] + 0.5, scene.breakPos[1] + 0.5, scene.breakPos[2] + 0.5, 0, 0, 1.006);
    M4.multiply(this.handMVP, this.viewProj, this.handModel);
    gl.useProgram(this.handProg);
    gl.uniformMatrix4fv(this.uHand.uMVP, false, this.handMVP);
    gl.uniform1i(this.uHand.uTex, 0);
    gl.uniform1f(this.uHand.uDay, 1);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
    gl.useProgram(this.chunkProg);
  }

  buildLineBox() {
    const gl = this.gl;
    const e = [[0,0,0],[1,0,0],[1,0,0],[1,1,0],[1,1,0],[0,1,0],[0,1,0],[0,0,0],
               [0,0,1],[1,0,1],[1,0,1],[1,1,1],[1,1,1],[0,1,1],[0,1,1],[0,0,1],
               [0,0,0],[0,0,1],[1,0,0],[1,0,1],[1,1,0],[1,1,1],[0,1,0],[0,1,1]];
    this.lineVAO = gl.createVertexArray();
    gl.bindVertexArray(this.lineVAO);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(e.flat()), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    gl.bindVertexArray(null);
  }

  makeMesh(part) {
    const gl = this.gl;
    if (part.idx.length === 0) return null;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, part.verts, gl.STATIC_DRAW);
    const stride = FLOATS_PER_VERT * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride, 28);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, part.idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, vbo, ibo, count: part.idx.length };
  }
  freeMesh(m) {
    if (!m) return;
    const gl = this.gl;
    gl.deleteVertexArray(m.vao); gl.deleteBuffer(m.vbo); gl.deleteBuffer(m.ibo);
  }
  uploadChunk(chunk, data) {
    if (chunk.mesh) { this.freeMesh(chunk.mesh.solid); this.freeMesh(chunk.mesh.fluid); }
    chunk.mesh = { solid: this.makeMesh(data.solid), fluid: this.makeMesh(data.fluid) };
  }

  buildHandMesh(thing) {
    const gl = this.gl;
    if (this.handMesh) this.freeMesh(this.handMesh);
    if (!thing) { this.handMesh = null; return; }
    const verts = [], idx = [];
    let base = 0;
    this.handIsItem = isItem(thing);
    if (this.handIsItem) {
      // items are held as a flat sprite, like Minecraft's 2D item in hand
      const layer = thingTile(thing);
      const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
      for (const side of [1, -1]) {
        for (let vi = 0; vi < 4; vi++) {
          const c = corners[vi];
          verts.push(c[0] * side, c[1], 0, FACE_UV[vi][0], FACE_UV[vi][1], layer, side > 0 ? 1 : 0.82);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        base += 4;
      }
    } else {
    for (let d = 0; d < 6; d++) {
      const f = FACES[d], layer = BLOCKS[thing].faces[d];
      for (let vi = 0; vi < 4; vi++) {
        const c = f.v[vi];
        verts.push(c[0] - 0.5, c[1] - 0.5, c[2] - 0.5, FACE_UV[vi][0], FACE_UV[vi][1], layer, f.shade);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base += 4;
    }
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 28, 24);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.handMesh = { vao, vbo, ibo, count: idx.length };
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr), h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    return this.canvas.width / Math.max(1, this.canvas.height);
  }

  render(scene) {
    const gl = this.gl;
    const aspect = this.resize();
    M4.perspective(this.proj, scene.fov * Math.PI / 180, aspect, scene.near || 0.06, 1200);
    M4.lookAt(this.view, scene.eye, scene.dir, [0, 1, 0]);
    M4.multiply(this.viewProj, this.proj, this.view);
    M4.invert(this.invVP, this.viewProj);
    M4.frustum(this.planes, this.viewProj);

    gl.clearColor(scene.fogColor[0], scene.fogColor[1], scene.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // --- sky
    if (!scene.underwater) {
      gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
      gl.useProgram(this.skyProg);
      gl.bindVertexArray(this.emptyVAO);
      gl.uniformMatrix4fv(this.uSky.uInvVP, false, this.invVP);
      gl.uniform3fv(this.uSky.uCam, scene.eye);
      gl.uniform3fv(this.uSky.uSun, scene.sunDir);
      gl.uniform3fv(this.uSky.uZenith, scene.zenith);
      gl.uniform3fv(this.uSky.uHorizon, scene.horizon);
      gl.uniform1f(this.uSky.uStars, scene.stars);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
    }

    // --- chunks
    gl.useProgram(this.chunkProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tex);
    gl.uniform1i(this.uChunk.uTex, 0);
    gl.uniformMatrix4fv(this.uChunk.uViewProj, false, this.viewProj);
    gl.uniform1f(this.uChunk.uDay, scene.dayFactor);
    gl.uniform1f(this.uChunk.uAmbient, scene.ambient === undefined ? 0.055 : scene.ambient);
    gl.uniform3fv(this.uChunk.uFogColor, scene.fogColor);
    gl.uniform2fv(this.uChunk.uFogRange, scene.fogRange);
    gl.uniform3fv(this.uChunk.uCam, scene.eye);
    gl.uniform1f(this.uChunk.uAlpha, 1);
    gl.uniform1f(this.uChunk.uUVScroll, 0);
    gl.uniform1f(this.uChunk.uAlphaTest, 1);

    const visible = [];
    this.stats.tris = 0;
    for (const c of scene.chunks) {
      if (!c.mesh) continue;
      const x0 = c.cx * CX, z0 = c.cz * CZ;
      if (!M4.aabbInFrustum(this.planes, x0, 0, z0, x0 + CX, CY, z0 + CZ)) continue;
      const dx = x0 + 8 - scene.eye[0], dz = z0 + 8 - scene.eye[2];
      visible.push({ c, d: dx * dx + dz * dz });
    }
    visible.sort((a, b) => a.d - b.d);
    this.stats.chunks = visible.length;

    for (const { c } of visible) {
      const m = c.mesh.solid;
      if (!m) continue;
      gl.uniform3f(this.uChunk.uOffset, c.cx * CX, 0, c.cz * CZ);
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
      this.stats.tris += m.count / 3;
    }

    // --- dropped items, then animals
    this.drawDrops(scene);
    this.stats.mobs = 0;
    this.drawMobs(scene);

    // --- how far into the block you have dug
    this.drawBreak(scene);

    // --- selection outline
    if (scene.highlight) {
      gl.useProgram(this.lineProg);
      gl.uniformMatrix4fv(this.uLine.uViewProj, false, this.viewProj);
      gl.uniform3fv(this.uLine.uOffset, scene.highlight);
      gl.uniform1f(this.uLine.uScale, scene.highlightScale || 1);
      gl.uniform4f(this.uLine.uColor, 0.05, 0.05, 0.07, 0.85);
      gl.bindVertexArray(this.lineVAO);
      gl.drawArrays(gl.LINES, 0, 24);
      gl.useProgram(this.chunkProg);
    }

    // --- the outline of the block a click would place, drawn bright so it reads
    // against the sky when you are out over a drop
    if (scene.ghost) {
      gl.useProgram(this.lineProg);
      gl.uniformMatrix4fv(this.uLine.uViewProj, false, this.viewProj);
      gl.uniform3fv(this.uLine.uOffset, scene.ghost);
      gl.uniform1f(this.uLine.uScale, 1);
      gl.uniform4f(this.uLine.uColor, 0.95, 0.99, 1.0, 0.9);
      gl.bindVertexArray(this.lineVAO);
      gl.drawArrays(gl.LINES, 0, 24);
      gl.useProgram(this.chunkProg);
    }

    // --- water and other translucent faces, back to front
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.uniform1f(this.uChunk.uAlpha, 0.72);
    gl.uniform1f(this.uChunk.uAlphaTest, 0);
    gl.uniform1f(this.uChunk.uUVScroll, scene.waterScroll);
    for (let i = visible.length - 1; i >= 0; i--) {
      const c = visible[i].c, m = c.mesh.fluid;
      if (!m) continue;
      gl.uniform3f(this.uChunk.uOffset, c.cx * CX, 0, c.cz * CZ);
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
      this.stats.tris += m.count / 3;
    }
    gl.enable(gl.CULL_FACE);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // --- held block, last so nothing can overdraw it
    if (this.handMesh && scene.showHand) {
      gl.clear(gl.DEPTH_BUFFER_BIT);
      if (this.handIsItem) M4.compose(this.handModel, 0.46, -0.34 + scene.bob, -0.58, 0.12, -0.42, 0.52);
      else M4.compose(this.handModel, 0.42, -0.36 + scene.bob, -0.62, -0.32, 0.62, 0.30);
      M4.multiply(this.handMVP, this.proj, this.handModel);
      gl.useProgram(this.handProg);
      gl.uniformMatrix4fv(this.uHand.uMVP, false, this.handMVP);
      gl.uniform1i(this.uHand.uTex, 0);
      gl.uniform1f(this.uHand.uDay, scene.dayFactor);
      gl.bindVertexArray(this.handMesh.vao);
      gl.drawElements(gl.TRIANGLES, this.handMesh.count, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
  }
}
