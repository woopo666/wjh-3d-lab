"""Resolve official checkpoints without putting model weights in Git."""
import os
import json
import tempfile
import urllib.request
from pathlib import Path

REPOS = {'trellis1': 'microsoft/TRELLIS-image-large', 'trellis2': 'microsoft/TRELLIS.2-4B', 'hunyuan3d-2.1': 'tencent/Hunyuan3D-2.1'}
REALESRGAN = 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth'

def offline(runtime):
    return runtime.get('offline', False) or os.environ.get('HF_HUB_OFFLINE') == '1' or not runtime.get('auto_download', True)

def ensure_file(path, url, disabled=False):
    path = Path(path)
    if path.is_file() and path.stat().st_size > 0:
        return str(path)
    if disabled:
        raise FileNotFoundError(f'Missing checkpoint (downloads disabled): {path}')
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = None
    try:
        with urllib.request.urlopen(url, timeout=120) as response, tempfile.NamedTemporaryFile(dir=path.parent, suffix='.part', delete=False) as output:
            temp = Path(output.name)
            if 'text/html' in response.headers.get('Content-Type', ''):
                raise ValueError('Checkpoint URL returned HTML')
            count = 0
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
                count += len(chunk)
            expected = response.headers.get('Content-Length')
            if not count or (expected and count != int(expected)):
                raise ValueError('Incomplete checkpoint download')
        temp.replace(path)
        return str(path)
    finally:
        if temp and temp.exists():
            temp.unlink()

def resolve_model(provider, runtime):
    disabled = offline(runtime)
    if disabled:
        os.environ['HF_HUB_OFFLINE'] = '1'
        os.environ['TRANSFORMERS_OFFLINE'] = '1'
    model = runtime['model']
    path = Path(model).expanduser()
    repo = runtime.get('repo_id', REPOS[provider])
    is_hub = model == repo or model in REPOS.values()
    # Existing prepared/custom directories are preserved. required_files can
    # explicitly detect incomplete local installations without overwriting edits.
    required = list(runtime.get('required_files', []))
    pipeline = path / 'pipeline.json'
    if pipeline.is_file():
        spec = json.loads(pipeline.read_text(encoding='utf-8'))
        for ref in spec.get('args', {}).get('models', {}).values():
            if isinstance(ref, str) and ref.startswith('ckpts/'):
                required.extend([ref + '.json', ref + '.safetensors'])
    complete = path.is_dir() and all((path / f).is_file() and (path / f).stat().st_size for f in required)
    if complete and any(any(path.rglob(ext)) for ext in ('*.safetensors', '*.pth', '*.pt')):
        return str(path.resolve())
    from huggingface_hub import snapshot_download
    kwargs = dict(repo_id=model if is_hub else repo, revision=runtime.get('revision'), local_files_only=disabled)
    if not is_hub:
        kwargs['local_dir'] = str(path.resolve())
    return snapshot_download(**kwargs)
