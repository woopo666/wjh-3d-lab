# Third-party components

This repository's orchestration and authoring code is MIT licensed. Upstream model weights and GPU runtimes are **not distributed**. Install them separately and follow their own terms; this repository does not relicense them.

- [TRELLIS](https://github.com/microsoft/TRELLIS): Microsoft image-to-3D provider. Adapter follows the public pipeline/export API.
- [TRELLIS.2](https://github.com/microsoft/TRELLIS.2): Microsoft image-to-3D/PBR provider.
- [Hunyuan3D 2.1](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1): Tencent shape and paint provider. Review its model/code licenses and auxiliary checkpoint terms before use.
- [Three.js](https://github.com/mrdoob/three.js), [Vite](https://github.com/vitejs/vite), [Playwright](https://github.com/microsoft/playwright): installed through npm, licenses retained in their packages.
- NumPy, SciPy, trimesh, Pillow, ModernGL, NetworkX and Rtree: installed through pip with their package licenses.
- Blender is an external executable, not bundled.

Gallery images are selected original designs from this project's authoring history, not official game/anime character assets. They are included for illustrating input/output and review limitations. Twelve original generated GLB samples are included for inspection. Training weights are excluded. The procedural calibration example is generated entirely by `examples/make_sample.py`.
