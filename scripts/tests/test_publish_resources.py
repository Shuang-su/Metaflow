"""MF-81 generator behavior and approved publication contract."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import generate_index as g

class PublicationTests(unittest.TestCase):
    def test_webp_discovery_preserves_existing_jpg_png_choice(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/'cover-4096.webp').write_bytes(b'webp')
            self.assertEqual(g.find_thumbnail_file(root).name,'cover-4096.webp')
            (root/'a.jpg').write_bytes(b'jpg')
            (root/'b.png').write_bytes(b'png')
            self.assertEqual(g.find_thumbnail_file(root).name,'a.jpg')

    def test_named_cat_capture_is_discovered_at_approved_depth(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);folder=root/'Animals/Cats/mangzhong/2609160002';folder.mkdir(parents=True)
            (folder/'scene.sog').write_bytes(b'model')
            (folder/'cover-4096.webp').write_bytes(b'webp')
            with patch.object(g,'DATA_DIR',root):
                resources=g.scan_data_directory()
            self.assertEqual(len(resources),1)
            r=resources[0]
            self.assertEqual(r['id'],'mangzhong-2609160002')
            self.assertEqual(r['route'],'/animals/cats/mangzhong/2609160002')
            self.assertEqual(r['meta']['date'],'2026-09-16')
            self.assertIsNone(r['meta']['device'])
            self.assertEqual(r['files']['thumbnail'],'Animals/Cats/mangzhong/2609160002/cover-4096.webp')

    def test_published_batch_contract(self):
        index=json.loads((g.DATA_DIR/'index.json').read_text())
        self.assertEqual(len(index['resources']),99)
        acg=[r for r in index['resources'] if r['route'].startswith('/acg/sztuccf260919/')]
        cats=[r for r in index['resources'] if r['route'].startswith('/animals/cats/mangzhong/')]
        self.assertEqual(len(acg),9);self.assertEqual(len(cats),3)
        for r in acg+cats:
            self.assertTrue(r['files']['thumbnail'].endswith('/cover-4096.webp'))
            self.assertIsNone(r['meta']['device'])
            self.assertNotIn('tags',r)
        for r in acg:
            self.assertIsNone(r['meta']['date'])
            self.assertEqual(len(r['aliases']),1)
            settings=json.loads((g.DATA_DIR/r['files']['settings']).read_text())
            self.assertEqual(settings['environmentUrl'],'/data/'+r['files']['environment'])
        self.assertEqual(len({r['id'] for r in acg+cats}),12)
        routes={}
        for r in index['resources']:
            for route in [r['route']]+r.get('aliases',[]):
                normalized=route.lower().replace('_','').replace('-','')
                if normalized in routes:
                    self.assertEqual(routes[normalized],r['route'],route)
                routes[normalized]=r['route']

if __name__=='__main__':unittest.main()
