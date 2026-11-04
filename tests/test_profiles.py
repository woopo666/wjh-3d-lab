import unittest
from production_profiles import normalize,legacy_body
class Profiles(unittest.TestCase):
 def test_role_does_not_determine_provider(self):
  for role in ['guardian','demon','player']:
   self.assertEqual(normalize(role=role)['geometry']['provider'],'imported')
 def test_body_style_independent(self):
  self.assertEqual(legacy_body(normalize(style='chibi')),'chibi')
  self.assertEqual(legacy_body(normalize(morphology='prone',style='mascot')),'prone')
 def test_no_silent_provider_fallback(self):
  self.assertTrue(normalize(geometry='hunyuan3d-2.1')['capabilities']['generate'])
  self.assertTrue(normalize(surface='tl1-transfer')['capabilities']['experimental'])
  self.assertFalse(normalize(geometry='pixal3d')['capabilities']['generate'])
 def test_static_projection_rejected(self):
  with self.assertRaises(ValueError):normalize(category='weapon',morphology='static')
  p=normalize(category='weapon',morphology='static',surface='native',geometry='hunyuan3d-2.1')
  self.assertTrue(p['capabilities']['postprocess'])
