// Player movement, AABB collision against voxels, and block picking.
const P_HALF = 0.3, P_HEIGHT = 1.8, P_EYE = 1.62;
const STEP_UP = 0.55;         // how high a lip you can walk straight up
const GRAVITY = 30, JUMP_V = 8.6, TERMINAL = 55;

class Player {
  constructor(world) {
    this.world = world;
    this.pos = [0.5, 90, 0.5];
    this.vel = [0, 0, 0];
    this.yaw = 0; this.pitch = 0;
    this.flying = true;
    this.onGround = false;
    this.inWater = false; this.headInWater = false;
    this.walkPhase = 0; this.bob = 0;
    this.reach = 5.5;
    this.maxHp = 20; this.hp = 20;
    this.air = 15; this.maxAir = 15;         // seconds of breath
    this.food = 20; this.maxFood = 20;       // and how long since you last ate
    this.water = 20; this.maxWater = 20;     // and drank, which goes first
    this.exert = 0;                          // work done since the last tick
    this.fallFrom = null;
    this.groundY = null;          // level of the block last stood on, for bridging
    this.hurtFlash = 0; this.invuln = 0; this.sinceHurt = 99;
    this.dead = false;
    this.invulnerable = false;    // creative mode sets this
    this.shield = 0;              // seconds of Warden's Plate left
    this.noFall = false;          // the next landing is free, however far it was
    this.spawn = null;
  }

  // Damage in half-hearts; armour soaks up its share first.
  damage(amount, reason) {
    if (this.dead || this.invuln > 0 || this.invulnerable || this.shield > 0) return 0;
    const taken = Math.max(0, Math.round(Equipment.absorb(amount)));
    if (taken <= 0) { this.sinceHurt = 0; return 0; }
    this.hp = Math.max(0, this.hp - taken);
    this.invuln = 0.45;
    this.hurtFlash = 0.4;
    this.sinceHurt = 0;
    this.lastHurtReason = reason;
    if (typeof Deep !== 'undefined' && typeof Game !== 'undefined') Deep.stir(Game, 12);   // crying out is a noise
    if (this.hp <= 0) this.dead = true;
    return taken;
  }
  heal(n) { this.hp = Math.min(this.maxHp, this.hp + n); }
  respawn() {
    this.hp = this.maxHp; this.air = this.maxAir;
    this.food = this.maxFood; this.water = this.maxWater; this.exert = 0;
    this.dead = false; this.invuln = 1; this.fallFrom = null;
    this.vel = [0, 0, 0];
    if (this.spawn) this.pos = this.spawn.slice();
  }

  get eye() { return [this.pos[0], this.pos[1] + P_EYE, this.pos[2]]; }
  get dir() {
    const cp = Math.cos(this.pitch);
    return [Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  collides(x, y, z) {
    const w = this.world;
    const x0 = Math.floor(x - P_HALF), x1 = Math.floor(x + P_HALF);
    const y0 = Math.floor(y), y1 = Math.floor(y + P_HEIGHT - 0.001);
    const z0 = Math.floor(z - P_HALF), z1 = Math.floor(z + P_HALF);
    for (let yy = y0; yy <= y1; yy++)
      for (let zz = z0; zz <= z1; zz++)
        for (let xx = x0; xx <= x1; xx++) {
          const id = w.getBlock(xx, yy, zz);
          if (id && blockHits(id, xx, yy, zz, x - P_HALF, y, z - P_HALF, x + P_HALF, y + P_HEIGHT, z + P_HALF)) return true;
        }
    return false;
  }

  moveAxis(axis, amount) {
    if (amount === 0) return;
    const p = this.pos;
    const before = p[axis];
    p[axis] += amount;
    if (this.collides(p[0], p[1], p[2])) {
      // A step half a block high is walked up, not jumped over — which is what
      // makes a staircase a staircase.
      if (axis !== 1 && !this.flying && this.vel[1] <= 0.01) {
        const wasY = p[1];
        p[1] += STEP_UP;
        if (!this.collides(p[0], p[1], p[2])) return;
        p[1] = wasY;
      }
      p[axis] = before;
      if (axis === 1) {
        if (amount < 0) this.onGround = true;
        // nudge flush against the surface we hit
        const step = amount > 0 ? 0.01 : -0.01;
        for (let i = 0; i < 40; i++) {
          p[axis] += step;
          if (this.collides(p[0], p[1], p[2])) { p[axis] -= step; break; }
        }
      }
      this.vel[axis] = 0;
    }
  }

  update(dt, input) {
    const w = this.world;
    const feet = w.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] + 0.1), Math.floor(this.pos[2]));
    const head = w.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] + P_EYE), Math.floor(this.pos[2]));
    this.inWater = isWaterBlock(feet);
    this.headInWater = isWaterBlock(head);
    this.inLava = isLavaBlock(feet) || isLavaBlock(head);

    // desired horizontal velocity in world space
    let fx = 0, fz = 0;
    if (input.forward) fz -= 1;
    if (input.back) fz += 1;
    if (input.left) fx -= 1;
    if (input.right) fx += 1;
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    let wishX = fx * c - fz * s;
    let wishZ = fx * s + fz * c;

    let speed = 4.4;
    if (input.sprint) speed = 6.2;
    if (input.sneak && !this.flying) speed = 2.0;
    if (this.flying) speed = input.sprint ? 24 : 11;
    else if (this.inWater) speed *= 0.6;

    const accel = this.flying ? 9 : (this.onGround ? 16 : 3.2);
    const blend = 1 - Math.exp(-accel * dt);
    this.vel[0] += (wishX * speed - this.vel[0]) * blend;
    this.vel[2] += (wishZ * speed - this.vel[2]) * blend;

    if (this.flying) {
      let vy = 0;
      if (input.jump) vy += speed;
      if (input.sneak) vy -= speed;
      this.vel[1] += (vy - this.vel[1]) * blend;
    } else if (this.inLava) {
      this.vel[1] -= GRAVITY * 0.35 * dt;
      if (input.jump) this.vel[1] = 2.2;
      this.vel[1] = clamp(this.vel[1], -2.5, 2.5);
      this.vel[0] *= 0.86; this.vel[2] *= 0.86;
    } else if (this.inWater) {
      this.vel[1] -= GRAVITY * 0.28 * dt;
      if (input.jump) this.vel[1] = 4.2;
      this.vel[1] = clamp(this.vel[1], -4.5, 5);
      this.vel[0] *= 0.98; this.vel[2] *= 0.98;
    } else if (this.onLadder()) {
      // hands and feet: you go up while you hold forward or jump, and down slowly otherwise
      const climbing = input.jump || input.forward;
      this.vel[1] = input.sneak ? -1.4 : (climbing ? 3.4 : -1.2);
      this.fallFrom = null;
    } else {
      // The Solytra. Hold jump while you are falling and the wings take: you
      // trade height for speed looking down, and speed for height looking up.
      const wings = Equipment.chest && itemDef(Equipment.chest) && itemDef(Equipment.chest).glide;
      if (wings && !this.onGround && input.jump && this.vel[1] < 1.5) {
        const d = this.dir;
        const sp = clamp((this.glideSpeed || 12) + (-d[1]) * 30 * dt - 2.2 * dt, 8, 30);
        this.glideSpeed = sp;
        this.gliding = true;
        this.vel[0] = d[0] * sp;
        this.vel[2] = d[2] * sp;
        this.vel[1] = d[1] * sp - 1.6;
        this.fallFrom = null;              // you land on the wings, not on your legs
      } else {
        this.gliding = false;
        this.glideSpeed = 0;
        if (this.onGround && input.jump) { this.vel[1] = JUMP_V; this.onGround = false; }
        this.vel[1] -= GRAVITY * dt;
        if (this.vel[1] < -TERMINAL) this.vel[1] = -TERMINAL;
      }
    }

    // Sneaking holds you on the block you are standing on rather than letting you
    // walk off it. It is what makes bridging out over a drop possible: you edge
    // out, look back down at the block face, and lay the next one.
    const edgeGuard = input.sneak && !this.flying && this.onGround && this.vel[1] <= 0;
    this.onGround = false;
    // sub-step so fast movement cannot tunnel through blocks
    const dist = Math.hypot(this.vel[0], this.vel[1], this.vel[2]) * dt;
    const steps = Math.max(1, Math.ceil(dist / 0.25));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.moveAxis(1, this.vel[1] * sdt);
      const backX = this.pos[0];
      this.moveAxis(0, this.vel[0] * sdt);
      if (edgeGuard && !this.overSolidGround()) { this.pos[0] = backX; this.vel[0] = 0; }
      const backZ = this.pos[2];
      this.moveAxis(2, this.vel[2] * sdt);
      if (edgeGuard && !this.overSolidGround()) { this.pos[2] = backZ; this.vel[2] = 0; }
    }
    if (this.pos[1] < -4 && w.dimension === 'end') {
      this.invuln = 0;
      this.damage(20, 'the void');
      this.pos[1] = 90; this.vel[1] = 0; this.fallFrom = null;
    } else if (this.pos[1] < -20) { this.pos[1] = CY - 8; this.vel[1] = 0; this.fallFrom = null; }

    if (this.onGround) this.groundY = Math.floor(this.pos[1] - 0.02);

    const hspeed = Math.hypot(this.vel[0], this.vel[2]);
    if (this.onGround && hspeed > 0.5) this.walkPhase += dt * hspeed * 1.9;
    this.bob = Math.sin(this.walkPhase) * 0.022;

    this.updateVitals(dt, w);
    return { landed: this.onGround, speed: hspeed };
  }

  updateVitals(dt, w) {
    this.invuln = Math.max(0, this.invuln - dt);
    this.shield = Math.max(0, this.shield - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.sinceHurt += dt;

    // falling: remember the highest point of the fall, settle up on landing
    if (this.flying || this.inWater) {
      this.fallFrom = null;
    } else if (this.onGround) {
      if (this.fallFrom !== null) {
        const drop = this.fallFrom - this.pos[1];
        if (this.noFall) this.noFall = false;
        else if (drop > 3.5) this.damage(Math.floor(drop - 3), 'the fall');
      }
      this.fallFrom = this.pos[1];
    } else {
      this.fallFrom = this.fallFrom === null ? this.pos[1] : Math.max(this.fallFrom, this.pos[1]);
    }

    // Hunger and thirst. Thirst runs down about half again as fast as hunger,
    // and running about empties both quicker than standing still does. Well fed
    // and watered, you heal; empty, you do not, and then you start to suffer.
    if (!this.invulnerable && !this.dead) {
      const hspeed = Math.hypot(this.vel[0], this.vel[2]);
      const work = 1 + (hspeed > 5 ? 1.9 : hspeed > 1 ? 0.5 : 0);
      // A full bar is about a quarter of an hour of pottering about, rather less
      // if you spend it running, and thirst always goes before hunger does.
      this.food = Math.max(0, this.food - dt * 0.020 * work);
      this.water = Math.max(0, this.water - dt * 0.030 * work);
      this.starveTick = (this.starveTick || 0) + dt;
      if (this.starveTick >= 2) {
        this.starveTick = 0;
        if (this.food > 6 && this.water > 6 && this.hp < this.maxHp) this.heal(1);
        else if (this.water <= 0) { this.invuln = 0; this.damage(1, 'thirst'); }
        else if (this.food <= 0) { this.invuln = 0; this.damage(1, 'hunger'); }
      }
    }

    // breath. Poseidon's water is the exception: down there you simply do not
    // need to come up, which is the only reason the place is playable at all.
    const blessed = this.world && this.world.dimension === 'sea';
    if (this.headInWater && !blessed) {
      this.air -= dt;
      if (this.air <= 0) {
        this.drownTick = (this.drownTick || 0) + dt;
        if (this.drownTick >= 1) { this.drownTick = 0; this.invuln = 0; this.damage(2, 'drowning'); }
      }
    } else {
      this.air = Math.min(this.maxAir, this.air + dt * 4);
      this.drownTick = 0;
    }

    // cactus spines
    const hw = P_HALF + 0.06;
    let onCactus = false;
    for (let yy = Math.floor(this.pos[1]); yy <= Math.floor(this.pos[1] + P_HEIGHT - 0.001) && !onCactus; yy++)
      for (let zz = Math.floor(this.pos[2] - hw); zz <= Math.floor(this.pos[2] + hw) && !onCactus; zz++)
        for (let xx = Math.floor(this.pos[0] - hw); xx <= Math.floor(this.pos[0] + hw); xx++)
          if (w.getBlock(xx, yy, zz) === B.CACTUS) { onCactus = true; break; }
    if (this.inLava) {
      this.lavaTick = (this.lavaTick || 0) + dt;
      if (this.lavaTick >= 0.5) { this.lavaTick = 0; this.invuln = 0; this.damage(4, 'the lava'); }
    } else this.lavaTick = 0;

    if (onCactus) {
      this.cactusTick = (this.cactusTick || 0) + dt;
      if (this.cactusTick >= 0.6) { this.cactusTick = 0; this.invuln = 0; this.damage(1, 'a cactus'); }
    } else this.cactusTick = 0;

    // The slow natural mend, but only if you are fed and watered enough for it.
    const fed = this.invulnerable || (this.food > 6 && this.water > 6);
    if (fed && this.hp < this.maxHp && this.sinceHurt > 6 && !this.dead) this.hp = Math.min(this.maxHp, this.hp + dt * 0.6);
  }

  // Voxel DDA. Returns the hit block, the face normal, and where to place.
  raycast(maxDist = this.reach) {
    const o = this.eye, d = this.dir, w = this.world;
    let x = Math.floor(o[0]), y = Math.floor(o[1]), z = Math.floor(o[2]);
    const step = [Math.sign(d[0]), Math.sign(d[1]), Math.sign(d[2])];
    const tDelta = [Math.abs(1 / d[0]), Math.abs(1 / d[1]), Math.abs(1 / d[2])];
    const tMax = [
      step[0] > 0 ? (x + 1 - o[0]) * tDelta[0] : (o[0] - x) * tDelta[0],
      step[1] > 0 ? (y + 1 - o[1]) * tDelta[1] : (o[1] - y) * tDelta[1],
      step[2] > 0 ? (z + 1 - o[2]) * tDelta[2] : (o[2] - z) * tDelta[2],
    ];
    for (let i = 0; i < 3; i++) if (!isFinite(tDelta[i])) tMax[i] = Infinity;
    let normal = [0, 0, 0];
    let t = 0;
    while (t <= maxDist) {
      const id = w.getBlock(x, y, z);
      if (id && !isLiquid(id)) {
        return { x, y, z, id, normal, dist: t, place: [x + normal[0], y + normal[1], z + normal[2]] };
      }
      if (tMax[0] < tMax[1] && tMax[0] < tMax[2]) {
        t = tMax[0]; x += step[0]; tMax[0] += tDelta[0]; normal = [-step[0], 0, 0];
      } else if (tMax[1] < tMax[2]) {
        t = tMax[1]; y += step[1]; tMax[1] += tDelta[1]; normal = [0, -step[1], 0];
      } else {
        t = tMax[2]; z += step[2]; tMax[2] += tDelta[2]; normal = [0, 0, -step[2]];
      }
    }
    return null;
  }

  // Standing in the same cell as a ladder is what counts as being on it.
  onLadder() {
    const w = this.world;
    for (let yy = Math.floor(this.pos[1]); yy <= Math.floor(this.pos[1] + P_HEIGHT - 0.001); yy++) {
      for (let zz = Math.floor(this.pos[2] - P_HALF); zz <= Math.floor(this.pos[2] + P_HALF); zz++) {
        for (let xx = Math.floor(this.pos[0] - P_HALF); xx <= Math.floor(this.pos[0] + P_HALF); xx++) {
          if (BLOCKS[w.getBlock(xx, yy, zz)].ladder) return true;
        }
      }
    }
    return false;
  }

  // Is anything solid directly under the player's feet?
  overSolidGround() {
    const y = Math.floor(this.pos[1] - 0.02);
    for (let zz = Math.floor(this.pos[2] - P_HALF); zz <= Math.floor(this.pos[2] + P_HALF); zz++)
      for (let xx = Math.floor(this.pos[0] - P_HALF); xx <= Math.floor(this.pos[0] + P_HALF); xx++)
        if (isSolid(this.world.getBlock(xx, y, zz))) return true;
    return false;
  }

  // Would placing a block here trap the player inside it?
  intersectsBlock(bx, by, bz) {
    const p = this.pos;
    return (p[0] + P_HALF > bx && p[0] - P_HALF < bx + 1 &&
            p[1] + P_HEIGHT > by && p[1] < by + 1 &&
            p[2] + P_HALF > bz && p[2] - P_HALF < bz + 1);
  }
}
