# Voxelcraft

A Minecraft-style voxel game written from scratch — no engine, no libraries, no build step.
Plain WebGL2 and about 4,000 lines of JavaScript.

## Run it

Open `index.html` in Chrome, Edge, Firefox or Safari. That's it.

Or serve it locally (needed if your browser restricts `file://`):

```
python3 -m http.server 8777      # then open http://localhost:8777
```

### Single-file build

`voxelcraft.html` is the whole game — markup, CSS and all twelve scripts — inlined into one
194 KB file with no external requests. Mail it, drop it on a static host, open it from a USB
stick; it just runs. Rebuild it after editing the sources with:

```
node build.js
```

## Home screen

Everything starts on the home screen: pick a mode, adjust settings, or read the controls.

**Creative** — fly, take anything from the catalogue of every block and item (filtered by
blocks, tools, swords, armour, food or materials; click for one, shift-click for ten), and
nothing can hurt you.
**Survival** — no flying, blocks take time to mine, placing one spends it from your inventory,
and falls, cacti and deep water can kill you. Both modes share the same world; switch whenever
you like.

Settings cover render distance, field of view, mouse sensitivity, volume and day length, and
you can type a seed for the next world you generate. They are remembered in this browser.

## Controls

| | |
|---|---|
| Arrow keys | Move |
| Mouse | Look (click to capture the pointer) |
| `Space` | Jump — double-tap to toggle flight |
| `Shift` | Sneak / descend while flying |
| `S` | Sprint |
| `M` or left click | Break block (hold to keep breaking) &middot; attack an animal |
| `P` or right click | Place &middot; use a door, bed, chest, furnace or table &middot; eat &middot; throw a pearl |
| Middle click | Pick the block you are looking at |
| `1`–`9`, mouse wheel | Select hotbar slot |
| `E` | Inventory, crafting grid and block picker (click a tool to hold it, armour to wear it) |
| `F` | Toggle flight (creative only) |
| `T` / `N` | Freeze time / skip 12 hours |
| `F3` | Debug overlay |
| `Esc` | Pause |

Your world autosaves to `localStorage` every 20 seconds and on exit. **New world** on the home
screen discards it and reseeds, using the seed you typed in Settings if there is one.

## What's in it

- **Infinite terrain.** Perlin fBm continents, hills and mountain masks; five biomes (plains,
  forest, desert, snowy, peaks) that change every few hundred blocks, oceans at y=62, beaches
  and 3D worm + cheese caves. Everything is a pure function of `(seed, x, z)`, so the world is
  the same every time you walk back.
- **96 blocks.** Stone comes in andesite, diorite and granite blobs and turns to deepslate deep
  down; coal, iron, gold, diamond, redstone and lapis sit at their own depths, with emerald only
  in the mountains. Oaks grow in the plains, birches in forests, firs in the snow and cacti in
  the desert. Clay banks line shallow water, snowy seas freeze over, and pumpkins turn up in
  the grass.
- **Villages.** The world is cut into regions, and about half of them hold a village on flat
  ground above the sea. Each is laid out from the seed alone — a well at the middle, four to
  seven houses and farms around it, gravel paths from every doorstep back to the well, and lamp
  posts by the doors. Houses are hollow, roofed, glazed, lit by a glowstone in the ceiling and
  furnished the way Minecraft furnishes them: a door in the frame, a bed in the corner, a chest
  at its foot, a work corner with a crafting table and furnace, and bookshelves or a barrel
  along the far wall — never blocking the door. The chests hold something worth taking, fixed by position, once.
  Farms have a water trench down the middle and crops either side. Deserts build the same village in sandstone. Because every wall is worked out from the
  seed, chunks generated at different times always agree on where it stands.
- **Dropped items.** Break something and it does not teleport into your bag: a quarter-size
  copy of it falls to the ground, spins, bobs, and waits. Walk near and it drifts towards you;
  step on it and it is yours. Animals drop their loot where they fall, chests spill theirs when
  broken, and anything left lying about fades after ninety seconds.
- **Furniture you can use.** Beds, chests with a latch on the front, furnaces with embers in
  the mouth, bookshelves with coloured spines, barrels with hoops, and doors — all craftable,
  all with the right face on the right side, and all of them do something when you press `P`:
  - **Door** — swings open and shut; open, it is a thin panel you can walk through
  - **Bed** — sets where you respawn, and sleeps the night away if it is dark
  - **Furnace** — smelts ten things (ore to ingots, sand to glass, meat to a cooked meal that
    heals twice as much), burning coal or wood to do it
  - **Chest** — a real container: take stacks out, put stacks in, and it keeps them
  - **Crafting table** — the 3×3 grid, as before
- **Zombies.** After dark, and in any unlit cave at any hour, zombies find you: arms out,
  green and rotting, twenty health and three damage a hit. They walk straight at you from
  twenty-six blocks, knock you back when they land a blow, and burn up if the sun catches them
  in the open. A full diamond suit turns three damage into one. They drop rotten flesh, which
  you can eat if you are desperate.
- **Villagers and trading.** Big-nosed and two blocks tall, they spawn only where a village is
  and turn back when they stray more than twenty blocks from home. Each wears the apron of one
  of five trades — farmer, butcher, toolsmith, armourer, mason. Right-click one and their stall
  opens: sell them your surplus for emeralds (coal ore, cobblestone, meat, the crops growing in
  their own farms) and buy what you cannot easily make — an iron pickaxe for three emeralds, a
  diamond chestplate for fourteen. Every deal has limited stock and sells out. Emeralds come out
  of emerald ore, which only turns up in the mountains.
- **Real lighting.** Two flood-filled light channels — skylight and block light — propagated
  across chunk borders with proper removal passes. Roof over a shaft and it goes dark;
  break the roof and daylight pours back down. Glowstone lights up a cave.
- **Ambient occlusion.** Per-vertex AO with the quad-flip fix, plus smoothed light sampling,
  so corners and overhangs read as solid geometry rather than flat colour.
- **Animals.** Pigs, cows, sheep and chickens (shear one and it walks around bare; kill one
  and it drops meat), built the Minecraft way: boxy parts with a standard box-unwrap skin,
  painted procedurally like everything else. Every face is shaded top to bottom and darkened at
  its edges, so the boxes read as rounded rather than flat: pigs have trotters, ears and a
  nostrilled snout, cows wear irregular white patches over a dark hide with white socks and a
  muzzle, sheep are clumped fleece over bare legs, chickens have streaked feathers and a red
  eye. Eyes have whites and a highlight, which is most of what makes them look alive. They wander, turn away
  from ledges and water, hop up single blocks, swing their legs in step with how fast they are
  moving, float in water, and call to each other when you are nearby. Sheep stop to graze;
  chickens flap and glide down instead of falling. They spawn in small herds on grass, weighted
  by biome, and are lit by the same skylight as the terrain, so they darken at dusk. Punch one
  and it flashes and gets knocked back.
- **Crafting.** Break blocks and they go into your materials; a crafting table opens a 3&times;3
  grid (your inventory has a 2&times;2 one). Seventy recipes, shaped and shapeless, matched the way
  Minecraft matches them: a shaped pattern is found anywhere in the grid, a shapeless one in any
  order, and an ingredient can accept alternatives &mdash; a table takes planks of any wood. The
  recipe book lists everything with its pattern and filters as you type; click a recipe to lay it
  out (in whichever wood you have most of), click the result to make it. The screen follows
  Minecraft's layout: armour down the left beside a figure showing what is covered, the crafting
  grid and its result top right, your stacks in a nine-wide grid of square slots with counts in
  the corner, and the hotbar along the bottom. Stone drops cobblestone
  and grass drops dirt, so the chain is real: cobblestone becomes stone bricks, then chiseled or
  mossy ones; sand and glowstone melt into glass, and a ring of glass around glowstone makes
  lamps. Nine ore packs into a solid mineral block, clay fires into bricks and terracotta, and
  wool &mdash; punch a sheep and it loses its fleece &mdash; dyes five colours. Ore melts into
  ingots, planks split into sticks, and from those come tools, swords and armour on the
  3&times;3 grid.
- **Tools, weapons, armour and health.** Forty-six items live alongside the blocks &mdash;
  sticks, ingots, leather, five swords, a pickaxe, axe and shovel in every material, four full
  suits of armour, and the meat animals drop. Swords follow
  Minecraft's damage ladder (wood 4 up to diamond 7), and a sword is held as a flat sprite in
  your hand rather than a cube. You have ten hearts: falling from height hurts, cacti prick,
  and staying under water past fifteen seconds drowns you. Armour soaks up 4% of damage per
  point, so a full iron suit (15 points) cuts damage by 60% and diamond (20) by 80%. Eat the
  meat to heal. Die and you lose everything you were carrying, armour included, and respawn
  back where you started.
- **Mining takes time.** In survival a block does not vanish on click: you hold the button and
  cracks spread across it in ten stages until it gives. The time is Minecraft's own formula —
  hardness × 1.5 ÷ tool speed, or × 5 when you lack the right tool — so stone is 7.5 seconds
  bare-handed, 1.1 with a wooden pickaxe and 0.3 with a diamond one, obsidian is a 9-second
  job even with diamond, and bedrock never gives at all. Look away and the progress resets.
  Creative still breaks on the press.
- **Tools that matter.** What a block leaves behind depends on what is in your hand, the way
  Minecraft does it: stone gives you nothing bare-handed, a wooden pickaxe gets cobblestone,
  coal and iron want a stone pickaxe, and gold, diamond, redstone, lapis and emerald want an
  iron one. Use the right tool &mdash; an axe on wood, a shovel on dirt and sand, a pickaxe on
  stone &mdash; and you get double. So the run goes: punch a tree, make planks, make sticks and
  a table, cut a wooden pickaxe, mine cobble, cut a stone pickaxe, mine iron, melt it, and on up
  to diamond. Building is unaffected &mdash; the creative block list still hands you anything.
- **The Nether.** Craft flint and steel (flint comes off gravel), stand an obsidian frame on
  end, and light it: the doorway fills with a purple sheet and standing in it for a moment pulls
  you through. On the other side is a second world — caverns of netherrack between a bedrock
  floor and roof, lava seas in the low ground, glowstone blistering the ceilings, quartz ore and
  soul sand — lit only by what glows, under a red sky. The two worlds run on Minecraft's eight
  to one scale, so a portal in the Nether comes out eight times further away at home, and if
  there is no portal where you arrive one gets built for you. Break the frame and the portal
  goes out.
- **The End.** Deep underground, roughly one region in three hides a **stronghold**: a mossy
  stone-brick room around a ring of twelve end portal frames. Set an **Eye of Ender** in each
  one — crafted from an ender pearl and glowstone — and the ring fills with stars. Step in and
  you are on an island of end stone hanging in the void, ringed by obsidian pillars, under a
  violet sky. Walk off the edge and there is nothing underneath: the void kills you. A portal at
  the middle of the island brings you home.
- **The Ender Dragon.** Enter the End and something enormous is already circling. Nine boxy
  parts — head, jaw, neck, body, three tail segments and two beating wings — wheeling round the
  island and stooping at you every fifteen seconds, six damage a strike. A hundred health, and
  it heals two a second while any of the ten **end crystals** still sits on its pillar, so break
  those first: a bar across the top of the screen counts both. Kill it and its egg is left on
  the portal home, and it stays dead.
- **Ender pearls.** Press `P` with one and you throw it: it arcs, it lands, and you land with
  it — two health for the trouble.
- **Endermen.** Nearly three blocks tall, black with a violet stare, faster than a zombie and
  hitting harder. They haunt the End, and turn up in the overworld dark. Their pearls are the
  only way to make the eyes that open the End.
- **Lava.** Flows like water but only three blocks, glows at full brightness, and burns you
  four hearts a second if you fall in. Pour water on it and it sets: cobblestone where it was
  flowing, obsidian where it was a source — which is how you get the obsidian for the next
  portal.
- **Day/night cycle.** Moving sun, sunset gradients, stars at night, and skylight that dims
  with it — ten real minutes per day by default, adjustable on the home screen.
- **Water that flows.** Place a source and it spreads seven blocks in every direction, falls
  down any drop it meets, and pools at the bottom — with the surface stepping down level by
  level as it thins out, drawn as a real sloping edge rather than a flat sheet. Break the source
  and the whole pool drains away. Dig into the seabed and the ocean pours into your tunnel.
  Water is still translucent and depth-sorted, slows you down, and tints the screen when you
  swim through it.
- **No image assets.** Every texture is painted pixel by pixel at load time into a
  `TEXTURE_2D_ARRAY` (no atlas bleeding). Sound effects are synthesised from filtered noise.

## Layout

```
index.html      markup, HUD, menus
build.js        inlines everything into voxelcraft.html
style.css       UI
js/math.js      mat4, frustum planes
js/noise.js     seeded PRNG, Perlin noise, fBm
js/blocks.js    procedural textures + the block table
js/world.js     chunks, terrain generation, light propagation
js/mesher.js    voxels -> vertex buffers, ambient occlusion
js/entities.js  animal models, skins, AI and herd management
js/crafting.js  materials, recipes and the pattern matcher
js/fluid.js     water and lava flow simulation
js/portal.js    nether portal frames and linking
js/drops.js     dropped items on the ground
js/trading.js   villager trades and the emerald economy
js/items.js     item sprites, tools, armour and equipment
js/renderer.js  WebGL2: sky, chunk passes, highlight, held block
js/player.js    movement, AABB collision, voxel raycast
js/sound.js     WebAudio effects
js/main.js      game loop, chunk streaming, input, HUD, saving
```

Chunks are 16 × 128 × 16. Terrain generation costs ~13 ms per chunk and meshing ~3 ms, both
spread across frames under a time budget so the frame rate stays smooth while the world
streams in around you. Default view distance is 8 chunks.

## Known limits

- Animals cannot be killed, bred or fed — they wander, and you can shove them around.
- In creative, placing a block does not spend materials; in survival it does.
- Creative hands you finished tools and armour; it has no way to conjure a half-mined world.
- Ice is a solid block rather than see-through.
- Armour reduces fall damage too; Minecraft would not.
- Armour is worn, not drawn on you &mdash; there is no third-person view to see it in.
- Nothing hostile is out there yet, so armour is for gravity, cacti, deep water and lava.
- The Nether has no fortresses or mobs — it is terrain, lava and glowstone.
- No hostile mobs, smelting or hunger.
- Chunk work runs on the main thread (Web Workers would let the view distance go further).
