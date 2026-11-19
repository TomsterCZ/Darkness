# Darkness — illustrated dungeon registration

## The rule

**The blueprint determines geometry. An image generator determines the visual
surface. The game keeps gameplay state completely independent of the picture.**

This is an art-authoring pipeline, not a procedural final-wall renderer.

The currently published game still uses the working fallback art. The single
image-generated master will become active **only after it is independently
registered against the original tilemap and visually approved**.

## Published reference

- [Exact 2170×1132 conditioning blueprint](../assets/scene/registered/blueprint-reference.png)
- [Exact 2170×1132 required wall silhouette](../assets/scene/registered/expected-wall-mask.png)
- [Interactive art-alignment studio](../art-studio.html)
- [Blueprint Inspector](../blueprint.html)
- [Playable cellar](../cellar.html)

Every image above is derived from the same authoritative 13×11 map stored in
`cellar.html`. It has 50 solid wall cells, 93 nonwall cells, four crates and
four goals. The left-hand entrance, north door and south gate are at fixed
world coordinates. **Do not rearrange the gameplay to fit a picture.**

## Image-generation assignment

Use `blueprint-reference.png` as the **primary geometric reference**, not as
an artistic suggestion. The wall mask is a hard constraint.

Produce a native **2170×1132** image of one coherent medieval fantasy
pixel-art dungeon:

- Exactly the blueprinted stone walls and walkable passages. One wall cell
  occupies one grid square. Never add, remove, or join separate wall runs.
- Connected, beautiful, hand-illustrated stone masonry, proper mortar,
  variable wear, natural shadows and warm torchlight.
- A left-hand entrance staircase, a north exit doorway and a southern
  portcullis ARCH, each anchored to its specified cell. The architectural
  stone arch must remain identical in closed and open states.
- Moss, restrained cobwebs, a red banner, darker corners, rich brickwork and
  realistic architectural integration. No schematic pixel cubes.
- **NO permanently drawn hero, crates, movable props, goals, gate leaves,
  instructional text, controls, or grid labels.** They belong to other layers.
- A uniform isometric projection. Do not change the angle or the width or
  position of a corridor. Preserve the silhouette exactly.

Also produce independent transparent PNGs of:
`north-closed.png`, `north-open.png`, `south-closed.png`, and
`south-open.png`. The stone surround must not jump or change between states.

The finished scene must be inspected over the blueprint using
[art-studio.html](../art-studio.html). A beautiful render with a different maze
is NOT an acceptable deliverable.

## Geometry validation

An illustration by itself cannot prove that its walls agree with the game.
Trace the **actual painted wall silhouettes** independently from the final
artwork, at native resolution, into `traced-walls.png`. Only the playable
maze's own solid wall prisms belong in this mask; decorative rear architecture
does not.

The authoring tool checks its intersection with the mathematically exact
wall geometry, requiring:

- Intersection over union ≥ **96.5%**.
- Precision ≥ **98%**.
- Recall ≥ **98%**.

These metrics don't validate beauty; they catch geometry errors.
An additional human review must confirm no props are baked in, that the
entrance and exit read as genuine walkable openings, and that gate states
match the same stone arch.

Generate a blueprint reference:

```sh
python -m pip install pillow
python tools/register_illustration.py --level cellar.html --out /tmp/darkness-reference
```

Register final art *only after visual review*:

```sh
python tools/register_illustration.py \
  --level cellar.html \
  --out assets/scene/registered \
  --scene final-illustration.png \
  --wall-mask traced-walls.png \
  --north-closed north-closed.png --north-open north-open.png \
  --south-closed south-closed.png --south-open south-open.png \
  --approve-art
```

The output includes a manifest referencing the exact blueprint, the approved
static scene, separately animated gate overlays, and depth-indexed *pixel
masks* for the original masonry. No static maze is independently redrawn when
the character walks.

The static scene is painted once as the background; character and crates move
in grid space; wall occlusion slices are replayed by depth from the same art
image when the character passes behind them. No collidable objects are inferred
from painted pixels.

`assets/js/cellar-registered.js` refuses to load a manifest if the grid,
projection, resolution, gate states, occlusion layers, or approval differs.
It automatically leaves the existing, tested renderer active instead.

## CI and acceptance

```sh
node tools/test_cellar_grid.mjs
node tools/test_cellar_visual.cjs
node tools/test_illustration_registration.cjs
```

Run the Playwright browser checks to verify real sprites, no missing assets,
correct gate animations, and wall overlap:
`python tools/test_cellar_browser.py`.

**Do not claim visual completion based only on tests.** Walk every edge of
every passage, push each crate, inspect both gates in both states, and confirm
the illustration is at least as good as the earlier approved concepts.

## Why previous full-scene pictures were rejected

They were beautiful but produced from approximate prompts. Their exact walls
and corridors were different from the authoritative puzzle, so placing them
behind the existing movement engine would recreate the original collision
mismatch. This workflow prevents that regression.

Public GitHub Pages access is independent of the approval. The working
version remains playable while illustrated art is registered.
