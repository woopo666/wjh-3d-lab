import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from unittest.mock import Mock
from weight_downloads import ensure_file, resolve_model

class Downloads(unittest.TestCase):
    def test_cached_and_offline(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder)/'weight.pth'
            with self.assertRaises(FileNotFoundError): ensure_file(p, 'unused', True)
            p.write_bytes(b'checkpoint')
            with patch('urllib.request.urlopen') as request:
                self.assertEqual(ensure_file(p, 'unused'), str(p))
                request.assert_not_called()

    def test_atomic_download(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder)/'weight.pth'
            response = io.BytesIO(b'checkpoint');response.headers = {'Content-Length': '10'}
            with patch('urllib.request.urlopen', return_value=response): ensure_file(p, 'unused')
            self.assertEqual(p.read_bytes(), b'checkpoint')

    def test_truncated_download_not_installed(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder)/'weight.pth'
            response = io.BytesIO(b'bad');response.headers = {'Content-Length': '10'}
            with patch('urllib.request.urlopen', return_value=response), self.assertRaises(ValueError): ensure_file(p, 'unused')
            self.assertEqual(list(Path(folder).iterdir()), [])

    def test_preserve_local_custom_weights(self):
        with tempfile.TemporaryDirectory() as folder:
            (Path(folder)/'custom.pth').write_bytes(b'checkpoint')
            self.assertEqual(resolve_model('trellis2', {'model': folder}), str(Path(folder).resolve()))

    def test_missing_model_uses_official_repo(self):
        with tempfile.TemporaryDirectory() as folder:
            hub = Mock()
            hub.snapshot_download.return_value = folder
            with patch.dict('sys.modules', {'huggingface_hub': hub}):
                resolve_model('trellis2', {'model': folder})
            self.assertEqual(hub.snapshot_download.call_args.kwargs['repo_id'], 'microsoft/TRELLIS.2-4B')
            self.assertFalse(hub.snapshot_download.call_args.kwargs['local_files_only'])

    def test_partial_pipeline_downloads_missing_weights(self):
        with tempfile.TemporaryDirectory() as folder:
            p = Path(folder)
            (p/'custom.pth').write_bytes(b'present')
            (p/'pipeline.json').write_text('{"args":{"models":{"shape":"ckpts/missing"}}}')
            hub = Mock()
            with patch.dict('sys.modules', {'huggingface_hub': hub}), patch.dict('os.environ', {}, clear=True):
                resolve_model('trellis2', {'model': folder, 'offline': True})
            self.assertTrue(hub.snapshot_download.call_args.kwargs['local_files_only'])
