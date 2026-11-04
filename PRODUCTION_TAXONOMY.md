# Production taxonomy

| Axis | Values |
|---|---|
| category | character, creature, weapon, environment, prop |
| morphology | humanoid, quadruped, prone, serpentine, avian, static |
| style | stylized, realistic, chibi, mascot, mecha |
| role | optional application tag: player, guardian, demon, etc. |
| geometry.provider | trellis2, trellis1, hunyuan3d-2.1, pixal3d, imported |
| surface.method | reference-front, native, tl1-transfer |

A guardian can be a human, dragon or machine: role must not determine skeleton or provider. Chibi is a style; prone is posture. Mecha style alone does not produce a robot-specific rigid-part rig.

Direct GPU adapters: TL1, TL2, Hunyuan 2.1. Pixal/other GLBs can be imported. Humanoid/prone/quadruped have fitted rigs. Static assets bypass rigging. Avian/serpentine animation is unsupported and rejected.

`reference-front` projects the original image onto generated geometry. Human face alignment defaults to 0.006 body height, configurable per asset. `native` retains generated appearance. `tl1-transfer` is an opt-in experimental albedo transfer from an aligned donor GLB; it retains target geometry, UVs, weights and animation buffers.

The historical production hybrid read a TL2 mesh plus `front-cutout.png`. TL1 production assets were comparison candidates, not texture donors in that code. Do not confuse this with the newly added donor-transfer experiment.

Legacy `--body` remains compatible. Unknown imported model provenance stays `imported`. Profiles describe intent; generation and QA reports describe what actually ran. No numeric gate substitutes for visual approval.
