// The dressing room. What you are wearing decides what you can do: one outfit at
// a time, one power, on its own cooldown. Pressing G is the whole interface.
const Outfits = {
  worn: 'none',
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
        const dx = anchor[0] - p.pos[0], dy = anchor[1] - (p.pos[1] + P_EYE), dz = anchor[2] - p.pos[2];
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
  current() { return this.byKey(this.worn); },

  wear(key, game) {
    this.worn = this.byKey(key).key;
    this.cooldown = 0;
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
    if (this.worn !== 'spider') return;
    const p = game.player;
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
