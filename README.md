# Darkness — The Wizard's Cell

A browser-based fantasy point-and-click adventure and isometric Sokoban cellar.

**[Play the game](https://tomstercz.github.io/Darkness/)** ·
**[Enter the cellar directly](https://tomstercz.github.io/Darkness/cellar.html)** ·
**[Open the blueprint inspector](https://tomstercz.github.io/Darkness/blueprint.html)**

## Architecture: logical skeleton, illustrated skin

The cellar is deliberately built from **one authoritative tile map**, with no
second painted maze on top.

- **Rules:** the JSON script identified by `id="cellar-level"` in
  [cellar.html](cellar.html). `#` means one impassable wall square. The
  player, crates, targets, gate tiles, pathfinding and undo use this same grid.
- **Art compiler:** [assets/js/cellar-visual.js](assets/js/cellar-visual.js).
  It analyzes adjacent wall cells, calculates exposed stone faces, places
  artwork on the matching grid coordinates, and renders objects in depth order.
  This code never affects a character's movement permissions.
- **Source materials:** genuine fantasy pixel art sampled from
  [cellar_stone_atlas.jpg](assets/scene/cellar_stone_atlas.jpg),
  [cellar_ambient.jpg](assets/scene/cellar_ambient.jpg),
  [dungeon_gate_art_v2.webp](assets/props/dungeon_gate_art_v2.webp),
  [crate_pixel.png](assets/props/crate_pixel.png) and
  [character sprites](assets/character).

Walls occupy exactly one logical square, including their top, vertical
faces and shadows. **Only the front faces are drawn when exposed** to
walkable space or the map edge. Thus consecutive squares form continuous
masonry, and walls never become secretly walkable because their art looks
like floor.

### Neighbor-mask grammar

For each wall tile, the compiler records whether its four neighbors
are walls. The mask is north=1, east=2, south=4, west=8. This defines
wall cap and face types: **isolated, end, straight, corner, tee, cross**.
The visual compiler also records each tile's depth, exposed left/right
faces, and optional deterministic decoration variant.

The rendering pass is:

1. Hand-drawn dungeon ambience and torch glow.
2. Floor diamonds derived only from the gameplay grid.
3. Goals on floor squares.
4. All walls, gates, crates and the hooded player sorted by isometric depth.
5. A subtle vignette / light pass.

There are **no background wall masks** and no independent painted maze
used for movement. The top of a wall does not erase a player's feet.

### Public map-to-art development tools

Node.js 22 or newer, with **no npm dependencies**:

    node tools/test_cellar_grid.mjs
    node tools/test_cellar_visual.cjs
    node tools/compile_cellar_visual.cjs > cellar-render.json
    node tools/compile_cellar_visual.cjs --svg > cellar-blueprint.svg

The output JSON lists each wall cell, its neighbor mask, visual variation,
and which faces should be painted. SVG is a diagnostic drawing of the
same exact gameplay map.

To inspect another map:

    node tools/compile_cellar_visual.cjs levels/next-level.json --svg > next-level.svg

The [blueprint inspector](blueprint.html) offers an in-browser view.

### Adding future levels

1. Copy the level's JSON and edit the rectangular `tiles` array.
2. Put crates, goals, player entrance and doors in their coordinate arrays.
   Do **not** paint crates or walls into a separate background bitmap.
3. Configure optional `render` projection values: `ox`, `oy`,
   `halfWidth`, `halfHeight` and `wallHeight`.
4. Run both regression tests and the SVG compiler. Confirm that floor and
   door cells align; then style the wall sprites independently.

The current cellar remains the same playable 13×11 four-crate puzzle.
Its known solution uses 20 crate pushes.

### Art updates without geometry regressions

Update the high-detail stone, door and gate artwork or the material sampling
inside the renderer. Neither a gate animation nor a texture should change
a tile's logical type. Use a single doorway square for both open/closed
states. To avoid the old visual bug, never overlay a separate full-room
maze image onto the gameplay renderer.

## Project files

- `index.html` — Wizard's Cell, the opening chapter
- `cellar.html` — the second screen, Sokoban rules and tile blueprint
- `assets/js/cellar-visual.js` — reusable visual grammar and painter
- `tools/compile_cellar_visual.cjs` — JSON and SVG compiler
- `tools/test_cellar_grid.mjs` — full puzzle + movement regression
- `tools/test_cellar_visual.cjs` — wall/face correspondence regression
- `.github/workflows/validate-cellar.yml` — continuous validation

This repository and GitHub Pages are publicly viewable. Public visibility
does not grant a blanket license to third-party artwork or music.
