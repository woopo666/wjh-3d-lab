import sys,unittest,tempfile,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pipeline import job_dir,validate_review,sha
class PipelineTests(unittest.TestCase):
 def test_reject_traversal(self):
  for name in ['../a','a/b','a\\b','C:temp','']:
   with self.assertRaises(ValueError):job_dir(name)
 def test_stale_review_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   d=Path(tmp);(d/'review').mkdir();(d/'rigged.glb').write_bytes(b'original')
   (d/'review/report.json').write_text(json.dumps({'failures':[],'errors':[],'rigSha256':sha(d/'rigged.glb')}))
   validate_review(d);(d/'rigged.glb').write_bytes(b'changed')
   with self.assertRaises(ValueError):validate_review(d)
 def test_failed_review_rejected(self):
  with tempfile.TemporaryDirectory() as tmp:
   d=Path(tmp);(d/'review').mkdir();(d/'rigged.glb').write_bytes(b'x');(d/'review/report.json').write_text(json.dumps({'failures':['bad skin']}))
   with self.assertRaises(ValueError):validate_review(d)
