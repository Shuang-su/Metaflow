"""Verify the retired public host has no remaining Caddy public listener."""
import json
import os
from pathlib import Path
import subprocess
import unittest


@unittest.skipUnless(os.environ.get('CADDY_BIN'),'CADDY_BIN required for actual config acceptance')
class CaddyBoundaryTests(unittest.TestCase):
    def test_analysis_only_binds_loopback(self):
        path=Path(__file__).resolve().parents[1]/'ops/Caddyfile'
        result=json.loads(subprocess.check_output([os.environ['CADDY_BIN'],'adapt','--config',str(path),'--adapter','caddyfile'],stderr=subprocess.DEVNULL))
        servers=result['apps']['http']['servers']
        self.assertEqual(len(servers),1)
        self.assertEqual(next(iter(servers.values()))['listen'],['127.0.0.1:8080'])
        self.assertNotIn('dashboard.metaflow.shuang-su.com',json.dumps(result))


if __name__=='__main__':unittest.main()
