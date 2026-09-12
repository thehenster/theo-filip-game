// Dropped items: break a block and a small spinning copy of it falls to the ground,
// waiting to be walked over.
const Drops = {
  list: [],
  MAX: 240,
  LIFETIME: 90,          // seconds before it fades away
  SIZE: 0.25,

  reset() { this.list.length = 0; },

  spawn(world, x, y, z, id, count = 1, scatter = 1) {
    if (!id || count <= 0) return null;
    if (this.list.length >= this.MAX) this.list.shift();
    const d = {
      id, count, x, y, z,
      vx: (Math.random() - 0.5) * 2 * scatter,
      vy: 2 + Math.random() * 1.5,
      vz: (Math.random() - 0.5) * 2 * scatter,
      age: 0, delay: 0.5,
      spin: Math.random() * Math.PI * 2,
      sky: 1, blk: 0,
      onGround: false,
    };
    this.list.push(d);
    return d;
  },

  solidAt(world, x, y, z) { return isSolid(world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))); },

  update(dt, world, player, onPickup) {
    const half = this.SIZE / 2;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.age += dt;
      d.delay = Math.max(0, d.delay - dt);
      d.spin += dt * 1.6;
      if (d.age > this.LIFETIME) { this.list.splice(i, 1); continue; }

      // drift towards the player once you are nearly on top of it
      const dx = player.pos[0] - d.x, dy = (player.pos[1] + 0.6) - d.y, dz = player.pos[2] - d.z;
      const dist = Math.hypot(dx, dy, dz);
      if (d.delay <= 0 && dist < 2) {
        const pull = 14 * dt / Math.max(0.4, dist);
        d.vx += dx * pull; d.vy += dy * pull; d.vz += dz * pull;
      }
      if (d.delay <= 0 && dist < 0.9) {
        this.list.splice(i, 1);
        if (onPickup) onPickup(d);
        continue;
      }

      d.vy -= 20 * dt;
      if (d.vy < -30) d.vy = -30;
      const steps = Math.max(1, Math.ceil(Math.hypot(d.vx, d.vy, d.vz) * dt / 0.2));
      d.onGround = false;
      for (let s = 0; s < steps; s++) {
        const sdt = dt / steps;
        d.y += d.vy * sdt;
        if (this.solidAt(world, d.x, d.y - half, d.z) || this.solidAt(world, d.x, d.y + half, d.z)) {
          d.y -= d.vy * sdt;
          if (d.vy < 0) { d.onGround = true; d.vy = 0; } else d.vy = 0;
        }
        d.x += d.vx * sdt;
        if (this.solidAt(world, d.x + Math.sign(d.vx) * half, d.y, d.z)) { d.x -= d.vx * sdt; d.vx = 0; }
        d.z += d.vz * sdt;
        if (this.solidAt(world, d.x, d.y, d.z + Math.sign(d.vz) * half)) { d.z -= d.vz * sdt; d.vz = 0; }
      }
      if (d.onGround) { d.vx *= 0.72; d.vz *= 0.72; }
      if (d.y < -20) { this.list.splice(i, 1); continue; }

      const l = world.getLight(Math.floor(d.x), Math.floor(d.y + 0.2), Math.floor(d.z));
      d.sky = (l >> 4) / 15; d.blk = (l & 15) / 15;
    }
  },
};

// Thrown ender pearls: they arc, they land, and you land with them.
const Thrown = {
  list: [],
  reset() { this.list.length = 0; },
  throwPearl(world, player, id) {
    const d = player.dir, eye = player.eye;
    this.list.push({
      id, count: 1,
      x: eye[0] + d[0] * 0.4, y: eye[1] + d[1] * 0.4, z: eye[2] + d[2] * 0.4,
      vx: d[0] * 19, vy: d[1] * 19 + 2, vz: d[2] * 19,
      age: 0, delay: 99, spin: 0, sky: 1, blk: 0, onGround: false,
    });
  },
  // A trident: heavier than an arrow, hits harder, and comes back to you as a
  // dropped item where it lands rather than vanishing.
  hurl(world, player, id) {
    const d = player.dir, eye = player.eye;
    this.list.push({
      id, count: 1, arrow: true, trident: true, damage: 9,
      x: eye[0] + d[0] * 0.5, y: eye[1] + d[1] * 0.5, z: eye[2] + d[2] * 0.5,
      vx: d[0] * 34, vy: d[1] * 34 + 1.2, vz: d[2] * 34,
      age: 0, delay: 99, spin: 0, sky: 1, blk: 0, onGround: false, lit: null,
    });
  },

  // An arrow flies flatter and faster than a pearl, and what it hits it hurts.
  shoot(world, player, id) {
    const d = player.dir, eye = player.eye;
    this.list.push({
      id, count: 1, arrow: true,
      x: eye[0] + d[0] * 0.5, y: eye[1] + d[1] * 0.5, z: eye[2] + d[2] * 0.5,
      vx: d[0] * 46, vy: d[1] * 46 + 0.4, vz: d[2] * 46,   // fast and nearly flat
      age: 0, delay: 99, spin: 0, sky: 1, blk: 0, onGround: false,
    });
  },

  update(dt, world, onLand) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];

      p.age += dt;
      p.spin += dt * 9;
      p.vy -= 16 * dt;
      const steps = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vy, p.vz) * dt / 0.25));
      let hit = false, struck = null;
      for (let s = 0; s < steps && !hit && !struck; s++) {
        const sdt = dt / steps;
        const nx = p.x + p.vx * sdt, ny = p.y + p.vy * sdt, nz = p.z + p.vz * sdt;
        const bx = Math.floor(nx), by = Math.floor(ny), bz = Math.floor(nz);
        const into = world.getBlock(bx, by, bz);
        if (isSolid(into)) { hit = true; p.hitId = into; p.hitAt = [bx, by, bz]; break; }
        p.x = nx; p.y = ny; p.z = nz;
        // A trident passing through the gap in a prismarine frame opens it.
        if (p.trident && !into) {
          const cell = bx + ',' + by + ',' + bz;
          if (p.lit !== cell) {
            p.lit = cell;
            if (typeof Portal !== 'undefined' && Portal.lightSea(world, bx, by, bz)) {
              p.opened = true;
            }
          }
        }
        // an arrow is checked against the animals every step of the way, or at
        // forty blocks a second it would fly straight through them
        if (p.arrow && typeof Animals !== 'undefined') {
          struck = Animals.list.find(m => !m.dead &&
            Math.abs(m.x - p.x) < m.halfW + 0.3 && Math.abs(m.z - p.z) < m.halfW + 0.3 &&
            p.y > m.y - 0.2 && p.y < m.y + m.def.height + 0.2);
        }
      }
      if (struck) {
        this.list.splice(i, 1);
        const len = Math.hypot(p.vx, p.vy, p.vz) || 1;
        const res = Animals.punch(struck, [p.vx / len, p.vy / len, p.vz / len], p.damage || 5, world);
        if (res.killed) {
          if (struck.def.bot) BedWars.botDied(struck, 'an arrow');
          if (struck.type && struck.type.startsWith('tribute_')) Hunger.tributeDied(struck, 'an arrow');
        }
        continue;
      }
      if (hit || p.age > 6 || p.y < -30) {
        this.list.splice(i, 1);
        if (onLand) onLand(p);
      }
    }
  },
};
