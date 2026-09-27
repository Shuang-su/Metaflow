import importlib.util
import json
import os
from pathlib import Path
import runpy
import sys
import tempfile
import unittest
from unittest.mock import patch

STATUS=Path(__file__).resolve().parents[1]/'status'
spec=importlib.util.spec_from_file_location('monitor',STATUS/'scripts/monitor.py')
monitor=importlib.util.module_from_spec(spec);spec.loader.exec_module(monitor)


class StatusActivationTests(unittest.TestCase):
    def test_business_activation_does_not_open_full_server_cutover_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            original=Path.cwd();os.chdir(directory)
            try:
                Path('.upptimerc.yml').write_text((STATUS/'.upptimerc.yml').read_text())
                Path('deployment-state.json').write_text('{"dashboard_live":false}')
                with patch.dict(sys.modules,{'monitor':monitor}),patch.object(monitor,'check',return_value={'http_ok':True,'fresh':True}):
                    with patch.object(sys,'argv',['activate.py','--business-only']):
                        runpy.run_path(str(STATUS/'scripts/activate.py'),run_name='__main__')
                    state=json.loads(Path('deployment-state.json').read_text())
                    self.assertFalse(state['dashboard_live'])
                    self.assertNotIn('server',state['active_checks'])
                    self.assertIn('analytics7',state['active_checks'])
                    with patch.object(sys,'argv',['activate.py']):
                        runpy.run_path(str(STATUS/'scripts/activate.py'),run_name='__main__')
                    self.assertTrue(json.loads(Path('deployment-state.json').read_text())['dashboard_live'])
                    config=Path('.upptimerc.yml').read_text()
                    self.assertEqual(config.count('slug: analytics7'),1)
                    self.assertEqual(config.count('slug: server'),1)
                before=Path('deployment-state.json').read_bytes()
                with patch.dict(sys.modules,{'monitor':monitor}),patch.object(monitor,'check',return_value={'http_ok':True,'fresh':False}),patch.object(sys,'argv',['activate.py']):
                    with self.assertRaises(SystemExit):runpy.run_path(str(STATUS/'scripts/activate.py'),run_name='__main__')
                self.assertEqual(Path('deployment-state.json').read_bytes(),before)
            finally:os.chdir(original)


if __name__=='__main__':unittest.main()
