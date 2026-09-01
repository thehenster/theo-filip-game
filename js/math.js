// Minimal mat4/vec3 helpers (column-major, GL order).
const M4 = {
  create() { return new Float32Array(16); },
  identity(o) {
    o[0]=1;o[1]=0;o[2]=0;o[3]=0; o[4]=0;o[5]=1;o[6]=0;o[7]=0;
    o[8]=0;o[9]=0;o[10]=1;o[11]=0; o[12]=0;o[13]=0;o[14]=0;o[15]=1; return o;
  },
  perspective(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o[0]=f/aspect;o[1]=0;o[2]=0;o[3]=0;
    o[4]=0;o[5]=f;o[6]=0;o[7]=0;
    o[8]=0;o[9]=0;o[10]=(far+near)*nf;o[11]=-1;
    o[12]=0;o[13]=0;o[14]=2*far*near*nf;o[15]=0; return o;
  },
  lookAt(o, eye, dir, up) {
    // dir is a (normalized) forward vector, not a target point.
    let zx=-dir[0], zy=-dir[1], zz=-dir[2];
    let xx=up[1]*zz-up[2]*zy, xy=up[2]*zx-up[0]*zz, xz=up[0]*zy-up[1]*zx;
    let l = Math.hypot(xx,xy,xz) || 1; xx/=l; xy/=l; xz/=l;
    const yx=zy*xz-zz*xy, yy=zz*xx-zx*xz, yz=zx*xy-zy*xx;
    o[0]=xx;o[1]=yx;o[2]=zx;o[3]=0;
    o[4]=xy;o[5]=yy;o[6]=zy;o[7]=0;
    o[8]=xz;o[9]=yz;o[10]=zz;o[11]=0;
    o[12]=-(xx*eye[0]+xy*eye[1]+xz*eye[2]);
    o[13]=-(yx*eye[0]+yy*eye[1]+yz*eye[2]);
    o[14]=-(zx*eye[0]+zy*eye[1]+zz*eye[2]);
    o[15]=1; return o;
  },
  multiply(o, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0=b[c*4], b1=b[c*4+1], b2=b[c*4+2], b3=b[c*4+3];
      o[c*4+0]=a[0]*b0+a[4]*b1+a[8]*b2+a[12]*b3;
      o[c*4+1]=a[1]*b0+a[5]*b1+a[9]*b2+a[13]*b3;
      o[c*4+2]=a[2]*b0+a[6]*b1+a[10]*b2+a[14]*b3;
      o[c*4+3]=a[3]*b0+a[7]*b1+a[11]*b2+a[15]*b3;
    }
    return o;
  },
  invert(o, m) {
    const a00=m[0],a01=m[1],a02=m[2],a03=m[3],a10=m[4],a11=m[5],a12=m[6],a13=m[7],
          a20=m[8],a21=m[9],a22=m[10],a23=m[11],a30=m[12],a31=m[13],a32=m[14],a33=m[15];
    const b00=a00*a11-a01*a10, b01=a00*a12-a02*a10, b02=a00*a13-a03*a10,
          b03=a01*a12-a02*a11, b04=a01*a13-a03*a11, b05=a02*a13-a03*a12,
          b06=a20*a31-a21*a30, b07=a20*a32-a22*a30, b08=a20*a33-a23*a30,
          b09=a21*a32-a22*a31, b10=a21*a33-a23*a31, b11=a22*a33-a23*a32;
    let det = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
    if (!det) return null;
    det = 1 / det;
    o[0]=(a11*b11-a12*b10+a13*b09)*det; o[1]=(a02*b10-a01*b11-a03*b09)*det;
    o[2]=(a31*b05-a32*b04+a33*b03)*det; o[3]=(a22*b04-a21*b05-a23*b03)*det;
    o[4]=(a12*b08-a10*b11-a13*b07)*det; o[5]=(a00*b11-a02*b08+a03*b07)*det;
    o[6]=(a32*b02-a30*b05-a33*b01)*det; o[7]=(a20*b05-a22*b02+a23*b01)*det;
    o[8]=(a10*b10-a11*b08+a13*b06)*det; o[9]=(a01*b08-a00*b10-a03*b06)*det;
    o[10]=(a30*b04-a31*b02+a33*b00)*det; o[11]=(a21*b02-a20*b04-a23*b00)*det;
    o[12]=(a11*b07-a10*b09-a12*b06)*det; o[13]=(a00*b09-a01*b07+a02*b06)*det;
    o[14]=(a31*b01-a30*b03-a32*b00)*det; o[15]=(a20*b03-a21*b01+a22*b00)*det;
    return o;
  },
  // Six frustum planes (ax+by+cz+d) from a view-projection matrix.
  frustum(out, m) {
    for (let i = 0; i < 6; i++) {
      const s = i & 1 ? -1 : 1, r = i >> 1;
      const p = out[i];
      p[0] = m[3] + s * m[r];
      p[1] = m[7] + s * m[4 + r];
      p[2] = m[11] + s * m[8 + r];
      p[3] = m[15] + s * m[12 + r];
      const l = Math.hypot(p[0], p[1], p[2]) || 1;
      p[0]/=l; p[1]/=l; p[2]/=l; p[3]/=l;
    }
    return out;
  },
  aabbInFrustum(planes, minX, minY, minZ, maxX, maxY, maxZ) {
    for (let i = 0; i < 6; i++) {
      const p = planes[i];
      const x = p[0] > 0 ? maxX : minX, y = p[1] > 0 ? maxY : minY, z = p[2] > 0 ? maxZ : minZ;
      if (p[0]*x + p[1]*y + p[2]*z + p[3] < 0) return false;
    }
    return true;
  }
};

// translate * rotateY * rotateX * scale, for the held-block model matrix
M4.compose = function (o, tx, ty, tz, rx, ry, s) {
  const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
  o[0] = cy * s;        o[1] = 0;       o[2] = -sy * s;       o[3] = 0;
  o[4] = sy * sx * s;   o[5] = cx * s;  o[6] = cy * sx * s;   o[7] = 0;
  o[8] = sy * cx * s;   o[9] = -sx * s; o[10] = cy * cx * s;  o[11] = 0;
  o[12] = tx;           o[13] = ty;     o[14] = tz;           o[15] = 1;
  return o;
};

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, t) { t = clamp((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
