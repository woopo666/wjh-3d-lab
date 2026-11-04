# Contributing

Use independent fixtures and small tests. Do not commit model weights, generated job folders, provider credentials, private hosts, or copyrighted character datasets. Keep comparisons labeled with model/source version, input hash, seed, resolution and processing recipe.

New provider adapters belong in `model_worker.py` and must fail explicitly when their runtime is missing. Do not silently fall back to another model. Record GPU-tested configurations separately from code-only integration. New anatomy rigs need front/side/back and multiple motion phases, not only a successful export.

Run `python -m unittest discover -s tests`, Node syntax checks, and `python tools/check_public_files.py` after staging. Synthetic transfer tests require OpenGL; the CI template uses Xvfb. Workflow templates are initially under `examples/workflows/` pending workflow-scope authorization. GPU tests are manual and must not run on pull requests by default.
