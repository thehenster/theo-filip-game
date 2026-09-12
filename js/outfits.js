// The dressing room. What you are wearing decides what you can do: one outfit at
// a time, one power, on its own cooldown. Pressing G is the whole interface.
// The suit takes you down to one pixel block in eight — the same grid the world
// can be carved on — so a pixel block is to you then exactly what a block is to
// you now. You end up a shade over a fifth of a block tall.
const ANT_SCALE = 1 / MICRO;

// How far the Steel Cape's heat vision reaches, and how much of it it takes out.
const HEAT_RANGE = 26, HEAT_BLOCKS = 8;

// The other way off your own size: three and a half blocks of temper. Chosen so
// that STEP_UP scales past a whole block (0.55 x 1.9 = 1.045) — a full block
// becomes a kerb he strides over rather than a step he has to jump.
const HULK_SCALE = 1.9;
const HEROBRINE_RANGE = 18;      // how far his attention carries

// The outfits that change your size, and what they change it to, so that taking
// one off — or putting a different one on — always puts you back in your own body.
const SIZED = { antman: ANT_SCALE, hulk: HULK_SCALE };

const Outfits = {
  worn: 'none',
  awakened: false,             // whether the Noob has found out who he is
  cooldown: 0,
  ready: 0,                    // brief flash when a power comes back

  list: [
    {
      key: 'none', name: 'Plain clothes', icon: () => B.LEAVES, cd: 0,
      blurb: 'No power, no cooldown. Just you.',
      use() { return false; },
    },
    {
      key: 'miner', name: "Miner's Rig", icon: () => I.DIAMOND_PICKAXE, cd: 3,
      blurb: 'Whatever you are looking at comes away in one go, however hard it is.',
      use(game) {
        if (!game.player.raycast()) return 'Nothing in reach';
        game.breakBlock();
        return true;
      },
    },
    {
      key: 'falcon', name: 'Falcon Cloak', icon: () => I.FEATHER, cd: 6,
      blurb: 'Throws you into the air, and you land soft.',
      use(game) {
        const p = game.player;
        if (p.flying) return 'Not while flying';
        p.vel[1] = 20;                    // about seven blocks up
        p.onGround = false;
        p.fallFrom = null;
        p.noFall = true;                  // and the landing is on the house
        Sound.burst({ dur: 0.35, freq: 1200, gain: 0.3, sweep: 2.2 });
        return true;
      },
    },
    {
      key: 'blink', name: 'Blink Boots', icon: () => I.ENDER_PEARL, cd: 9,
      blurb: 'Slip fourteen blocks the way you are looking, through the gap you can see.',
      use(game) {
        const p = game.player, d = p.dir;
        let best = null;
        for (let t = 1; t <= 14; t += 0.25) {
          const x = p.pos[0] + d[0] * t, y = p.pos[1] + d[1] * t, z = p.pos[2] + d[2] * t;
          if (y < 1 || y > CY - 2 || p.collides(x, y, z)) break;
          best = [x, y, z];
        }
        if (!best) return 'Nowhere to go';
        p.pos = best;
        p.vel = [0, 0, 0];
        p.fallFrom = null;
        Sound.burst({ dur: 0.3, freq: 300, gain: 0.35, sweep: 2.4 });
        return true;
      },
    },
    {
      key: 'mason', name: "Mason's Apron", icon: () => B.STONE_BRICKS, cd: 7,
      blurb: 'Lays a three by three of stone under your feet — worth having over a drop.',
      use(game) {
        const p = game.player, w = game.world;
        const y = Math.floor(p.pos[1]) - 1;
        let laid = 0;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          const x = Math.floor(p.pos[0]) + dx, z = Math.floor(p.pos[2]) + dz;
          if (w.getBlock(x, y, z)) continue;
          if (w.setBlock(x, y, z, B.STONE_BRICKS)) { BedWars.notePlaced(x, y, z); laid++; }
        }
        if (!laid) return 'There is already floor here';
        Sound.place();
        return true;
      },
    },
    {
      // The red-and-blue webbed suit. Sticks to walls and pulls you towards
      // whatever you are looking at, which between them is most of the fun of it.
      key: 'spider', name: 'Web-Slinger Suit', icon: () => B.RED_WOOL, cd: 2,
      blurb: 'Fires a web at whatever you are looking at and pulls you to it. Climbs walls, and never takes fall damage.',
      use(game) {
        const p = game.player, d = p.dir, o = p.eye;
        let anchor = null;
        for (let t = 1; t <= 42 && !anchor; t += 0.25) {
          const x = Math.floor(o[0] + d[0] * t), y = Math.floor(o[1] + d[1] * t), z = Math.floor(o[2] + d[2] * t);
          const id = game.world.getBlock(x, y, z);
          if (id && BLOCKS[id].solid && !BLOCKS[id].plant) anchor = [x + 0.5, y + 0.5, z + 0.5];
        }
        if (!anchor) return 'Nothing in range to web onto';
        const dx = anchor[0] - p.pos[0], dy = anchor[1] - (p.pos[1] + p.eyeHeight), dz = anchor[2] - p.pos[2];
        const len = Math.max(1, Math.hypot(dx, dy, dz));
        const pull = Math.min(30, 9 + len * 0.9);
        p.vel[0] = dx / len * pull;
        p.vel[1] = dy / len * pull + 4.5;      // a little lift, so you clear the lip
        p.vel[2] = dz / len * pull;
        p.onGround = false;
        p.fallFrom = null;
        p.noFall = true;
        Sound.burst({ dur: 0.22, freq: 1500, gain: 0.28, sweep: 2.6 });
        return true;
      },
    },
    {
      // Small enough to walk under a slab and through the gap beside a door.
      // Nothing that size has ever been hurt by a long drop, either.
      key: 'antman', name: 'Ant-Man Suit', icon: () => B.REDSTONE_BLOCK, cd: 1.5,
      blurb: 'Shrink to the size of an ant. Down there every block is a cliff made of 512 pixel blocks, and you can break and lay them one at a time. No fall can hurt you. Press G again to grow back.',
      use(game) {
        const p = game.player;
        if (p.targetScale !== 1) {
          if (!p.resize(1)) return 'Not enough room to grow back here';
          Sound.burst({ dur: 0.45, freq: 220, gain: 0.32, sweep: 3.2 });
          game.toast('Back to full size');
          return true;
        }
        p.resize(ANT_SCALE);                 // shrinking always fits
        Sound.burst({ dur: 0.45, freq: 1600, gain: 0.3, sweep: 0.3 });
        game.toast('Ant-sized');
        return true;
      },
    },
    {
      // The other end of the scale from the ant, and the same machinery: he is
      // simply a much larger body, with the reach and the temper to match.
      key: 'hulk', name: 'Hulk Suit', icon: () => B.GREEN_WOOL, cd: 2,
      blurb: 'Press G to hulk out: three and a half blocks of muscle. You stride straight over a full block instead of jumping it, you move half again as fast, and every swing smashes a three by three to dust \u2014 instantly, in any mode, with nothing left to pick up. You need four blocks of headroom. Press G again to calm down.',
      use(game) {
        const p = game.player;
        if (p.targetScale !== 1) {
          if (!p.resize(1)) return 'No room to calm down here';
          Sound.burst({ dur: 0.5, freq: 900, gain: 0.26, sweep: 0.4 });
          game.toast('Calm again');
          return true;
        }
        if (!p.resize(HULK_SCALE)) return 'Not enough headroom to hulk out';
        Sound.burst({ dur: 0.7, freq: 120, gain: 0.4, sweep: 0.5 });
        Deep.stir(game, 30);                       // everything hears that
        game.toast('HULK');
        return true;
      },
    },
    {
      // Starts as the worst skin in the game and ends as the one the stories are
      // about. The first press is the whole point of it.
      key: 'noob',
      get name() { return Outfits.awakened ? 'Herobrine' : 'Noob'; },
      icon: () => Outfits.awakened ? B.GLOWSTONE : B.DIRT,
      get cd() { return Outfits.awakened ? 20 : 0; },
      get blurb() {
        return Outfits.awakened
          ? 'He is awake. Press G and night falls, and everything hostile within eighteen blocks is struck down where it stands.'
          : 'Plain dirt-coloured nobody, no powers at all. Press G anyway and see who is wearing it.';
      },
      use(game) {
        if (!Outfits.awakened) {
          Outfits.awakened = true;
          game.time = 0.78;                        // the sun goes down on the spot
          Sound.burst({ dur: 1.2, freq: 70, gain: 0.42, sweep: 0.35 });
          Deep.stir(game, 40);
          Outfits.buildCards(game);                // the card is a different skin now
          game.toast('Herobrine woke up');
          return true;
        }
        const p = game.player;
        game.time = 0.78;
        let struck = 0;
        for (const mob of Animals.list.slice()) {
          if (!mob.def.hostile) continue;          // he has no quarrel with the cows
          const d = Math.hypot(mob.x - p.pos[0], mob.y - p.pos[1], mob.z - p.pos[2]);
          if (d > HEROBRINE_RANGE) continue;
          const away = [(mob.x - p.pos[0]) / (d || 1), 0, (mob.z - p.pos[2]) / (d || 1)];
          if (Animals.punch(mob, away, 1000, game.world).killed) struck++;
        }
        Sound.burst({ dur: 0.8, freq: 160, gain: 0.4, sweep: 0.3 });
        Deep.stir(game, 40);
        game.toast(struck ? 'Struck down ' + struck + (struck === 1 ? ' thing' : ' things') : 'Nothing out there to strike');
        return true;
      },
    },
    {
      // The one with the cape: it flies, and it looks straight through stone.
      // Between them there is nowhere left you cannot get to.
      key: 'hero', name: 'Steel Cape', icon: () => B.BLUE_WOOL, cd: 8,
      blurb: 'Fly in any mode \u2014 press F, then jump to rise and Shift to drop. Press G for heat vision, which melts a tunnel straight through whatever you are looking at. Never takes fall damage.',
      use(game) {
        const p = game.player, d = p.dir, o = p.eye, w = game.world;
        let bored = 0, last = '';
        for (let t = 0.5; t <= HEAT_RANGE && bored < HEAT_BLOCKS; t += 0.25) {
          const x = Math.floor(o[0] + d[0] * t), y = Math.floor(o[1] + d[1] * t), z = Math.floor(o[2] + d[2] * t);
          const at = x + ',' + y + ',' + z;
          if (at === last) continue;                 // the ray is finer than the grid
          last = at;
          if (y < 0 || y >= CY) break;
          const id = w.getBlock(x, y, z);
          if (!id || isLiquid(id)) continue;         // the beam goes through air and water
          if (id === B.BEDROCK) break;
          if (BedWars.active && !BedWars.canBreak(x, y, z, id)) break;
          if (w.setBlock(x, y, z, 0)) { BedWars.placed.delete(BedWars.key(x, y, z)); bored++; }
        }
        if (!bored) return 'Nothing in the way';
        Sound.burst({ dur: 0.5, freq: 2000, gain: 0.3, sweep: 0.25 });
        Deep.stir(game, 20);                         // it is not a quiet way in
        game.toast('Heat vision \u00b7 ' + bored + (bored === 1 ? ' block' : ' blocks') + ' melted');
        return true;
      },
    },
    {
      key: 'warden', name: "Warden's Plate", icon: () => I.IRON_CHESTPLATE, cd: 25,
      blurb: 'Five seconds where nothing can touch you.',
      use(game) {
        game.player.shield = 5;
        Sound.burst({ dur: 0.5, freq: 500, gain: 0.35, sweep: 1.6 });
        return true;
      },
    },
    {
      key: 'medic', name: "Medic's Sash", icon: () => I.COOKED_BEEF, cd: 30,
      blurb: 'Back to full health on the spot.',
      use(game) {
        const p = game.player;
        if (p.hp >= p.maxHp) return 'You are not hurt';
        p.heal(p.maxHp);
        Sound.burst({ dur: 0.4, freq: 800, gain: 0.3, sweep: 0.5 });
        return true;
      },
    },
  ],

  byKey(key) { return this.list.find(o => o.key === key) || this.list[0]; },
  // Only the cape lets you off the ground where the rules otherwise would not.
  caped() { return this.worn === 'hero'; },
  // Hulked out: a fist that takes a three by three, and no interest in hardness.
  smashing() { return this.worn === 'hulk' && this.big; },
  get big() { return typeof Game !== 'undefined' && Game.player && Game.player.big; },
  current() { return this.byKey(this.worn); },

  wear(key, game) {
    const next = this.byKey(key).key;
    // You leave the dressing room in your own body, unless the outfit you are
    // putting on is the very one that changed it.
    if (game && game.player && game.player.targetScale !== 1 && SIZED[next] !== game.player.targetScale) {
      if (!game.player.resize(1)) { game.toast('Get back to your own size first'); return; }
    }
    if (next !== 'noob') this.awakened = false;      // he goes back to sleep
    const wasCaped = this.caped();
    this.worn = this.byKey(key).key;
    this.cooldown = 0;
    // hang the cape up and you come down, unless the mode would have let you fly
    if (wasCaped && !this.caped() && game && game.survivalRules() && game.player) {
      game.player.flying = false;
    }
    Settings.set('outfit', this.worn);
    this.buildCards(game);
    this.refreshHud();
    if (game) game.toast(this.worn === 'none' ? 'Back in plain clothes' : 'Wearing ' + this.current().name);
  },

  use(game) {
    const outfit = this.current();
    if (outfit.key === 'none') { game.toast('Nothing equipped — pick an outfit in the dressing room'); return; }
    if (this.cooldown > 0) { game.toast(outfit.name + ' — ' + this.cooldown.toFixed(1) + 's'); return; }
    const res = outfit.use(game);
    if (res !== true) { game.toast(typeof res === 'string' ? res : 'That did nothing'); return; }
    this.cooldown = outfit.cd;
    this.refreshHud();
  },

  // Worn effects that are not a button press: the suit lets you hold onto a wall
  // the way a ladder does, and takes the sting out of every landing.
  tick(game) {
    const p = game.player;
    // Square-cube law: an ant can be dropped off anything and walk away.
    if (p.tiny) p.noFall = true;
    if (this.worn === 'hero') { p.noFall = true; return; }   // it flies; it does not fall
    if (this.worn === 'hulk' && p.big) { p.noFall = true; return; }  // he lands in a crater, unhurt
    if (this.worn !== 'spider') return;
    p.noFall = true;
    if (p.flying || p.onGround) return;
    // pressed against something solid, and holding forward: climb it
    const d = p.dir, ahead = 0.45;
    const x = Math.floor(p.pos[0] + d[0] * ahead), z = Math.floor(p.pos[2] + d[2] * ahead);
    for (const dy of [0, 1]) {
      const id = game.world.getBlock(x, Math.floor(p.pos[1]) + dy, z);
      if (!id || !BLOCKS[id].solid || BLOCKS[id].plant) continue;
      if (game.input.forward) p.vel[1] = 3.2;
      else if (p.vel[1] < -1.2) p.vel[1] = -1.2;      // otherwise you slide down slowly
      return;
    }
  },

  update(dt) {
    if (this.cooldown <= 0) return;
    const was = this.cooldown;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (was > 0 && this.cooldown === 0) {
      this.ready = 1;
      Sound.burst({ dur: 0.12, freq: 1400, gain: 0.16, sweep: 1.2 });
    }
  },

  // ---- the dressing room itself ---------------------------------------
  buildCards(game) {
    const list = document.getElementById('dress-list');
    if (!list) return;
    list.innerHTML = '';
    for (const o of this.list) {
      const card = document.createElement('button');
      card.className = 'dress-card' + (o.key === this.worn ? ' active' : '');
      card.innerHTML =
        '<img src="' + thingIcon(o.icon(), 48) + '" alt="">' +
        '<span class="dress-text"><b>' + o.name + '</b><span>' + o.blurb + '</span></span>' +
        '<span class="dress-cd">' + (o.cd ? o.cd + 's' : '—') + '</span>';
      card.addEventListener('click', () => this.wear(o.key, game));
      list.appendChild(card);
    }
  },

  refreshHud() {
    const el = document.getElementById('outfit');
    if (!el) return;
    const o = this.current();
    if (o.key === 'none') { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const waiting = this.cooldown > 0;
    el.classList.toggle('waiting', waiting);
    el.innerHTML = '<img src="' + thingIcon(o.icon(), 32) + '" alt="">' +
      '<span class="outfit-name">' + o.name + '</span>' +
      '<span class="outfit-key">' + (waiting ? this.cooldown.toFixed(1) + 's' : 'G') + '</span>';
  },
};
