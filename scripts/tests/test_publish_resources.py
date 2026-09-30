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
        self.assertEqual(len(index['resources']),100)
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

    def test_szcaf15_tribbie_publication_contract(self):
        index=json.loads((g.DATA_DIR/'index.json').read_text())
        event=[r for r in index['resources'] if r['category']==['acg','szcaf15']]
        self.assertEqual(len(event),25)
        r=next(r for r in event if r['id']=='szcaf15-a001c0190')
        self.assertEqual(r['title'],'崩坏：星穹铁道 缇宝')
        self.assertEqual(r['titleEn'],'Tribbie / Tribios')
        self.assertEqual(r['route'],'/acg/szcaf15/honkai_star_rail-tribbie')
        self.assertEqual(r['aliases'],['/acg/szcaf15/tribbie','/acg/szcaf15/tribios'])
        self.assertIsNone(r['meta']['device'])
        self.assertEqual(r['meta']['date'],'2026-07-26')
        self.assertNotIn('tags',r)
        self.assertEqual(r['version'],{'addedIn':'5.20.1','updatedIn':'5.20.1'})
        self.assertEqual(r['viewer']['syntheticAnimation'],'figure8')
        self.assertEqual(r['viewer']['animationFirstExitMode'],'orbit')
        self.assertNotIn('voxelCoordinateSpace',r['viewer'])
        folder='ACG/SZCAF15/A001C0190_260726_PQWJ/'
        for key,name in [('model','scene.sog'),('environment','environment.compressed.ply'),
                         ('settings','settings.json'),('thumbnail','cover-4096.webp'),('voxel','walk.voxel.json')]:
            self.assertEqual(r['files'][key],folder+name)
            self.assertTrue((g.DATA_DIR/r['files'][key]).is_file())

if __name__=='__main__':unittest.main()
