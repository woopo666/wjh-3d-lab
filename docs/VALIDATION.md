# Validation record — 2026-11-04

## Executed locally

- Independent Python environment and npm dependencies installed; no game server dependency.
- Original humanoid sample: reference bake → fitted rig → 26 clips / 130 sampled poses → 10 render views → Blender archive → ZIP export. 48,602 triangles, 22 bones, no reported numeric failures. Existing rear-hair limitations remain.
- Procedural static prop: native surface → no-rig passthrough → four views → Blender archive. 12 triangles, no bones/clips.
- Experimental donor transfer: synthetic identical-mesh color preservation, geometry/UV/index equality, and rejection of displaced donors. This is algorithm testing, **not** validation of TL1-to-TL2 facial quality on real characters.
- Tests cover invalid job IDs, stale/failed reviews, profile separation, explicit unsupported-provider behavior, static workflow classification and donor transfer.

## New GPU smoke test

The new `model_worker.py` TL2 adapter completed a new image-to-GLB run on one NVIDIA RTX A6000:

- Original Aurelia input reference; seed 67100.
- 12 sampling steps, 1024 cascade, 2048 texture size, requested 45k triangle export with remesh.
- 232.39 seconds reported by the worker.
- Output SHA-256: `ca1e926cd0b476baaeec26662c2dc734f8b8ddc938e64fe409b202df53cc6e51`.
- Runtime: existing torch 2.6.0 + CUDA 12.4 environment. Its source checkout lacked Git metadata (`sourceRevision: unversioned`), so this is a configuration smoke test, not an exactly pinned reproducibility claim.
- Initial runtime failed on libstdc++ ABI; selecting the pre-existing compatible runtime library resolved it without changing system libraries.

TL1 and Hunyuan adapters have not completed a fresh end-to-end GPU run for this release. Pixal has no generation adapter. Avian/serpentine animation rigs are not implemented.

## Gallery provenance

The gallery is a selected historical original-design batch. It uses TL2 geometry + reference-image correction, including humanoid 0.6% alignment and separate SD proportions. It is **not** the new 12-step GPU smoke output and is **not** evidence that donor-transfer works aesthetically. `gallery/data.json` records source image hashes.

Numeric checks cannot detect every broken joint, rear texture, face mismatch or cloth intersection. Inspect views and pose silhouettes before approving. Runtime game weapon attachment checks remain the responsibility of the consuming application.

## v0.2 gallery and checkpoint handling

- Expanded to 12 historical original GLBs (6 humanoid, 6 SD), retaining input images and recorded hashes.
- Playwright checked all 12 model loads, drag rotation, motion playback, lazy loading before opening, renderer disposal after closing, and a 390 px mobile viewport. Tested production bundle locally.
- Missing checkpoint download/cache/offline handling has mocked unit coverage, including incomplete downloads and partial pipeline manifests. This does not claim a fresh multi-GB download or fresh GPU inference for every provider.
- Face-offset comparison was excluded at the user's request.
