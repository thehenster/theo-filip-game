// Guns, and the things that go off.
//
// A gun in this engine cannot be a projectile: at the speeds involved it would
// step straight past everything it was aimed at. So it is a ray instead — walked
// forward in small steps until it meets either something alive or a wall.

const GUNS = {
  pistol:  { name: 'Pistol',       damage: 5,  range: 34, rate: 0.28, spread: 0.012, pellets: 1, kick: 0.020, ammo: 1, auto: false, freq: 620 },
  rifle:   { name: 'Rifle',        damage: 6,  range: 52, rate: 0.11, spread: 0.020, pellets: 1, kick: 0.016, ammo: 1, auto: true,  freq: 520 },
  shotgun: { name: 'Shotgun',      damage: 4,  range: 18, rate: 0.85, spread: 0.075, pellets: 8, kick: 0.075, ammo: 1, auto: false, freq: 260 },
  sniper:  { name: 'Sniper Rifle', damage: 22, range: 140, rate: 1.5, spread: 0.001, pellets: 1, kick: 0.110, ammo: 1, auto: false, freq: 880 },
};

const Guns = {
  // One pellet: walk the ray and give the first thing it meets a very bad day.
  trace(game, from, dir, range, damage) {
    const w = game.world;
    let hitMob = null, hitAt = null;
    for (let t = 0.4; t <= range; t += 0.12) {
      const x = from[0] + dir[0] * t, y = from[1] + dir[1] * t, z = from[2] + dir[2] * t;
      const id = w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
      if (id && BLOCKS[id].solid && !BLOCKS[id].plant) { hitAt = [x, y, z]; break; }
      for (const m of Animals.list) {
        if (m.dead || m.def.vehicle) continue;
        const hw = m.halfW + 0.1;
        if (Math.abs(m.x - x) < hw && Math.abs(m.z - z) < hw && y > m.y - 0.1 && y < m.y + m.def.height + 0.1) {
          hitMob = m; break;
        }
      }
      if (hitMob) { hitAt = [x, y, z]; break; }
    }
    if (hitMob) {
      const res = Animals.punch(hitMob, dir, damage, w);
      if (res.killed) {
        if (hitMob.def.bot) BedWars.botDied(hitMob, 'a gun');
        if (hitMob.type && hitMob.type.startsWith('tribute_')) Hunger.tributeDied(hitMob, 'a gun');
      }
      return { mob: hitMob, killed: res.killed };
    }
    return { mob: null, at: hitAt };
  },

  fire(game, kind) {
    const g = GUNS[kind];
    if (!g) return;
    if ((game.gunCd || 0) > 0) return;
    if (game.survivalRules() && Inventory.count(I.BULLETS) < g.ammo) {
      if (!game.gunDry || game.gunDry <= 0) {
        game.gunDry = 1;
        game.toast('Out of bullets');
        Sound.burst({ dur: 0.05, freq: 200, gain: 0.16, sweep: 0.4 });
      }
      return;
    }
    if (game.survivalRules()) Inventory.take(I.BULLETS, g.ammo);
    game.gunCd = g.rate;

    const p = game.player, from = p.eye, d = p.dir;
    let hits = 0, kills = 0;
    for (let i = 0; i < g.pellets; i++) {
      // a pellet leaves the barrel a little off true, more so the wider the choke
      const dir = [
        d[0] + (Math.random() - 0.5) * g.spread * 2,
        d[1] + (Math.random() - 0.5) * g.spread * 2,
        d[2] + (Math.random() - 0.5) * g.spread * 2,
      ];
      const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
      dir[0] /= len; dir[1] /= len; dir[2] /= len;
      const res = this.trace(game, from, dir, g.range, g.damage);
      if (res.mob) { hits++; if (res.killed) kills++; }
    }

    // the shove back into your shoulder
    p.pitch = clamp(p.pitch + g.kick, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
    game.hitMark = hits ? 0.25 : 0;
    game.muzzle = 0.06;
    Sound.burst({ dur: 0.09, freq: g.freq, gain: 0.34, sweep: 3.4 });
    Sound.burst({ dur: 0.22, freq: g.freq * 0.35, gain: 0.2, sweep: 2.2 });
    Deep.stir(game, 34);                      // a gun is the loudest thing you own
    game.hotbarCheck();
    if (kills) game.toast(kills > 1 ? 'Dropped ' + kills : 'Dropped it');
  },

  update(dt, game) {
    game.gunCd = Math.max(0, (game.gunCd || 0) - dt);
    game.gunDry = Math.max(0, (game.gunDry || 0) - dt);
    game.hitMark = Math.max(0, (game.hitMark || 0) - dt);
    game.muzzle = Math.max(0, (game.muzzle || 0) - dt);
    const cross = document.getElementById('crosshair');
    if (cross) cross.classList.toggle('hit', game.hitMark > 0);
  },
};

// ---- explosives ---------------------------------------------------------
// A placed charge does nothing until something sets it off; then it counts down
// out loud, and then there is a hole where the neighbourhood was.
const Boom = {
  list: [],
  flash: 0,

  reset() { this.list.length = 0; this.flash = 0; },

  key(x, y, z) { return x + ',' + y + ',' + z; },

  primed(x, y, z) {
    const k = this.key(x, y, z);
    return this.list.some(b => b.key === k);
  },

  // Light the fuse on a charge that is already sitting in the world.
  prime(game, x, y, z, fuseOverride) {
    const id = game.world.getBlock(x, y, z);
    const def = BLOCKS[id] && BLOCKS[id].explosive;
    if (!def || this.primed(x, y, z)) return false;
    game.world.setBlock(x, y, z, 0);
    this.list.push({
      key: this.key(x, y, z), x: x + 0.5, y, z: z + 0.5,
      fuse: fuseOverride === undefined ? def.fuse : fuseOverride,
      tick: 0, def, name: BLOCKS[id].name,
    });
    Sound.burst({ dur: 0.12, freq: 1500, gain: 0.3, sweep: 1.4 });
    game.toast(BLOCKS[id].name + ' armed — ' + (fuseOverride === undefined ? def.fuse : fuseOverride) + ' seconds');
    return true;
  },

  update(dt, game) {
    this.flash = Math.max(0, this.flash - dt * 1.6);
    const fx = document.getElementById('boomflash');
    if (fx) fx.style.opacity = this.flash.toFixed(3);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.fuse -= dt;
      b.tick -= dt;
      if (b.tick <= 0) {
        // the beeping speeds up as it runs out, which is the only warning you get
        b.tick = Math.max(0.09, Math.min(0.6, b.fuse / 6));
        Sound.burst({ dur: 0.05, freq: 1800, gain: 0.2, sweep: 1 });
      }
      if (b.fuse > 0) continue;
      this.list.splice(i, 1);
      this.detonate(game, b.x, b.y, b.z, b.def);
    }
  },

  // Blocks a blast will not shift, however big it is.
  tough(id) {
    return id === B.BEDROCK || id === B.REINFORCED_DEEPSLATE || id === B.OBSIDIAN
        || id === B.PORTAL || id === B.END_PORTAL || id === B.END_FRAME || id === B.END_FRAME_FILLED
        || id === B.TIME_PORTAL || id === B.FUTURE_PORTAL || id === B.DEEP_PORTAL
        || id === B.SEA_PORTAL || id === B.HACK_PORTAL;
  },

  detonate(game, cx, cy, cz, def) {
    const w = game.world;
    const R = def.power;
    const r2 = R * R;
    const chain = [];

    for (let y = Math.max(1, Math.floor(cy - R)); y <= Math.min(CY - 1, Math.ceil(cy + R)); y++) {
      for (let z = Math.floor(cz - R); z <= Math.ceil(cz + R); z++) {
        for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dz = z + 0.5 - cz;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2) continue;
          const id = w.getBlock(x, y, z);
          if (!id || this.tough(id)) continue;
          // a ragged edge, so a crater does not look like it was cut with a compass
          if (d2 > r2 * 0.55 && Math.random() < (Math.sqrt(d2) / R - 0.74) * 2.6) continue;
          if (BLOCKS[id].explosive) { chain.push([x, y, z]); continue; }
          w.setBlock(x, y, z, 0);
        }
      }
    }

    // A nuclear one scorches what it does not remove, and leaves the ground bare.
    if (def.nuclear) {
      const S = R * 1.7;
      for (let z = Math.floor(cz - S); z <= Math.ceil(cz + S); z++) {
        for (let x = Math.floor(cx - S); x <= Math.ceil(cx + S); x++) {
          const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
          if (d > S) continue;
          for (let y = Math.min(CY - 2, Math.ceil(cy + R)); y > Math.max(1, cy - R * 1.5); y--) {
            const id = w.getBlock(x, y, z);
            if (!id || this.tough(id)) continue;
            if (BLOCKS[id].plant || id === B.LEAVES || id === B.BIRCH_LEAVES || id === B.SPRUCE_LEAVES) {
              w.setBlock(x, y, z, 0);
            } else if (id === B.GRASS || id === B.SNOW) {
              w.setBlock(x, y, z, Math.random() < 0.35 ? B.COBBLESTONE : B.DIRT);
            } else if (id === B.SAND && Math.random() < 0.4) {
              w.setBlock(x, y, z, B.GLASS);                  // sand fused where the flash caught it
            }
            break;
          }
        }
      }
    }

    // everything alive inside it, and you
    for (const m of Animals.list.slice()) {
      if (m.dead) continue;
      const d = Math.hypot(m.x - cx, m.y - cy, m.z - cz);
      if (d > R * 1.4) continue;
      const hurt = Math.round(def.damage * (1 - d / (R * 1.4)));
      if (hurt <= 0) continue;
      const dir = [(m.x - cx) / (d || 1), (m.y - cy) / (d || 1), (m.z - cz) / (d || 1)];
      Animals.punch(m, dir, hurt, w);
    }
    const p = game.player;
    const pd = Math.hypot(p.pos[0] - cx, p.pos[1] + 0.9 - cy, p.pos[2] - cz);
    if (pd < R * 1.4 && p.damage) {
      const hurt = Math.round(def.damage * (1 - pd / (R * 1.4)));
      if (hurt > 0) {
        p.invuln = 0;
        p.damage(hurt, def.nuclear ? 'a nuclear blast' : 'an explosion');
        const push = 14 / Math.max(1, pd);
        p.vel[0] += (p.pos[0] - cx) * push; p.vel[2] += (p.pos[2] - cz) * push;
        p.vel[1] = Math.max(p.vel[1], 8);
        p.noFall = true;
      }
    }

    this.flash = def.nuclear ? 1 : 0.45;
    Sound.burst({ dur: def.nuclear ? 2.4 : 0.7, freq: def.nuclear ? 40 : 120, gain: 0.5, sweep: 6 });
    game.toast(def.nuclear ? 'The sky goes white' : 'Boom');

    // anything else in range goes up a moment later
    for (const [x, y, z] of chain) this.prime(game, x, y, z, 0.35 + Math.random() * 0.4);
  },
};
