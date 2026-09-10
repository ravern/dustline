# Anatomical viewmodel arms

The anatomical arm surface, UVs, finger skeleton and skin weights derive from
MakeHuman's CC0 base mesh. The source has been cropped to the arms, normalized to
meters with wrist origin, and split cleanly at the glove cuff. Dustline poses the
fingers and limbs, assigns skin and glove materials, adds a thin dorsal glove
reinforcement, and reduces the runtime rig to three bones per arm.

Original assets (CC0):

- https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/3dobjs/base.obj
- https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/rigs/default.mhskel
- https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/rigs/default_weights.mhw
- https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.md
- https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.ASSETS.md

The skeleton credits (c) 2020 Data Collection AB, Joel Palmius and Jonas Hauquier;
the skin-weight asset credits the same authors in 2021. The raw graphical assets
are explicitly CC0, independently of the MakeHuman application's AGPL code.
The complete CC0 dedication is preserved in LICENSE.txt. Attribution is not
required, but retained here to document provenance.

`makehuman-arms.json` contains the retained source geometry, UVs, original skin
weights and bone landmarks. Run `blender --background --python tools/build-arms.py`
from the repository to regenerate `public/models/viewmodel-arms.glb` and the
editable `viewmodel-arms.blend`. Passing `-- --preview` also renders local authoring
previews. Only the GLB is served to browsers; the Blender file and source data are
authoring inputs.

Each rifle/pistol pair uses approximately 8,500 triangles and six runtime bones.
The five authored poses are in weapon-local meters with +Y up and the muzzle
pointing -Z. `src/arms.ts` shares mesh geometry, gives each displayed model its own
materials and skeleton, and solves the support arm during reload so the shoulder
remains anchored.
