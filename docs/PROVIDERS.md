# GPU provider setup

Install each official runtime and follow its model license:

- [TRELLIS](https://github.com/microsoft/TRELLIS): `TrellisImageTo3DPipeline` and Gaussian/mesh GLB export.
- [TRELLIS.2](https://github.com/microsoft/TRELLIS.2): image-to-3D pipeline and `o_voxel` PBR export.
- [Hunyuan3D 2.1](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1): shape + paint, auxiliary checkpoints/configs.

Make an upstream example run first. Copy `providers.example.json` to `providers.local.json`. Configure `python` (that runtime executable), `source` (checkout), `model` (compatible weights folder/model identifier), and Hunyuan's optional `realesrgan` checkpoint. Use absolute paths. Keep the file private/ignored.

One worker subprocess runs one provider and records seed, reference hash, source Git revision, model identifier/path, GPU, output hash and errors. The lightweight authoring venv does not install CUDA dependencies. Provider versions can require different torch, CUDA extensions and system libraries.

The orchestrator does not log in to remote machines or bundle weights. Upstream loading APIs can download resources unless local caches/offline options are configured. Configure Linux environments directly or copy a job to your GPU workstation; no SSH password is stored.

Actual validation is reported in [VALIDATION.md](VALIDATION.md). TL1/Hunyuan integration follows upstream APIs but has not completed end-to-end GPU validation in this release. Different model versions may need adapter adjustments.

Common failures: missing extensions/checkpoints; torch/torchvision mismatch; `GLIBCXX`/libstdc++ ABI mismatch; unavailable OpenGL context for authoring. Fix the relevant environment, not unrelated system libraries. `doctor` checks authoring dependencies only.

For a fair comparison use independent job IDs, the same reference and recorded settings. Preserve raw models and compare actual images; a favorite model for one character is not a universal winner.
