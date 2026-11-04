import unittest,tempfile,sys,subprocess
from pathlib import Path
import numpy as np
from transfer_surface import load,transfer
class TransferTests(unittest.TestCase):
 def test_identity_bake_preserves_geometry_and_colors(self):
  with tempfile.TemporaryDirectory() as temp:
   d=Path(temp);subprocess.run([sys.executable,'examples/make_sample.py',temp],check=True,capture_output=True)
   result=transfer(d/'source.glb',d/'source.glb',d/'out.glb',size=64)
   self.assertGreater(result['coverage'],.99)
   before=load(d/'source.glb');after=load(d/'out.glb')
   for i in [2,3,4]:np.testing.assert_array_equal(before[i],after[i])
   self.assertLess(np.abs(np.array(before[5]).astype(float)-np.array(after[5]).astype(float)).mean(),10)
 def test_misaligned_donor_rejected(self):
  import trimesh
  with tempfile.TemporaryDirectory() as temp:
   d=Path(temp);subprocess.run([sys.executable,'examples/make_sample.py',temp],check=True,capture_output=True)
   mesh=trimesh.load(d/'source.glb',force='mesh',process=False);mesh.vertices+=20;mesh.export(d/'far.glb')
   with self.assertRaisesRegex(ValueError,'coverage'):transfer(d/'source.glb',d/'far.glb',d/'out.glb',size=32)
