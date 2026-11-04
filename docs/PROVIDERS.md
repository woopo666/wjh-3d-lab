# GPU provider setup

Install each official runtime and follow its model license:

- [TRELLIS](https://github.com/microsoft/TRELLIS): `TrellisImageTo3DPipeline` and Gaussian/mesh GLB export.
- [TRELLIS.2](https://github.com/microsoft/TRELLIS.2): image-to-3D pipeline and `o_voxel` PBR export.
- [Hunyuan3D 2.1](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1): shape + paint, auxiliary checkpoints/configs.

Make an upstream example run first. Copy `providers.example.json` to `providers.local.json`. Configure `python` (that runtime executable), `source` (checkout), `model` (compatible weights folder/model identifier), and Hunyuan's optional `realesrgan` checkpoint. Use absolute paths. Keep the file private/ignored.

The Hunyuan worker also uses `fast-simplification` in its own environment to reduce the shape before painting (default target 45k faces). Install it there with `python -m pip install fast-simplification`. TL1 requests a removal ratio based on its initial face count. Final budgets are still checked during authoring; upstream simplification is not assumed exact.

One worker subprocess runs one provider and records seed, reference hash, source Git revision, model identifier/path, GPU, output hash and errors. The lightweight authoring venv does not install CUDA dependencies. Provider versions can require different torch, CUDA extensions and system libraries.

The orchestrator does not log in to remote machines or bundle weights. Upstream loading APIs can download resources unless local caches/offline options are configured. Configure Linux environments directly or copy a job to your GPU workstation; no SSH password is stored.

Actual validation is reported in [VALIDATION.md](VALIDATION.md). TL1/Hunyuan integration follows upstream APIs but has not completed end-to-end GPU validation in this release. Different model versions may need adapter adjustments.

Common failures: missing extensions/checkpoints; torch/torchvision mismatch; `GLIBCXX`/libstdc++ ABI mismatch; unavailable OpenGL context for authoring. Fix the relevant environment, not unrelated system libraries. `doctor` checks authoring dependencies only.

For a fair comparison use independent job IDs, the same reference and recorded settings. Preserve raw models and compare actual images; a favorite model for one character is not a universal winner.

## Automatic checkpoint downloads

Missing model directories are downloaded from the official Hugging Face repository specified by `repo_id` (defaults: microsoft/TRELLIS-image-large, microsoft/TRELLIS.2-4B, tencent/Hunyuan3D-2.1). Install `huggingface_hub` in each provider runtime. Downloads may be many GB. Existing prepared directories containing weights are reused; optional `required_files` lists relative files to detect incomplete installations. Set `revision` to pin a model revision. Existing custom files are not a checksum-verified installation.

Hunyuan's missing RealESRGAN_x4plus.pth is fetched atomically from the [official release](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.1.0), following the upstream paint setup. Nonempty cached auxiliary files are reused; this is not a cryptographic integrity check. Model weights remain subject to their upstream licenses and are never committed to this repository.

Use `python pipeline.py generate JOB_ID --offline` (or provider `offline: true` / `auto_download: false`) to prohibit hub downloads. Missing cached files then fail clearly. Other upstream auxiliary dependencies must also be cached; the offline flags cannot control arbitrary networking in third-party code.
