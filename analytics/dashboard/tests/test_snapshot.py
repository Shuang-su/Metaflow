import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('snapshot',Path(__file__).resolve().parents[1]/'ops/snapshot.py')
snapshot=importlib.util.module_from_spec(spec);spec.loader.exec_module(snapshot)


class SnapshotTests(unittest.TestCase):
    def sample(self):
        at=snapshot.utcnow()
        values={'cpu_pct':None,'memory_pct':35.2,'disk_pct':40.0}
        return {'schema_version':1,'kind':'server','generated_at':at,'history_window_hours':24,
            'sample_interval_seconds':60,'current':values,'history':[dict(values,at=at)]}

    def test_private_fields_and_invalid_percentages_are_rejected(self):
        data=self.sample();snapshot.validate_server(data)
        for field in ('hostname','ip','password','session_id','error_message'):
            bad=copy.deepcopy(data);bad['history'][0][field]='not public'
            with self.assertRaises(ValueError):snapshot.validate_server(bad)
        for value in (float('nan'),float('inf'),-1,101,True):
            bad=copy.deepcopy(data);bad['history'][0]['cpu_pct']=value
            with self.assertRaises(ValueError):snapshot.validate_server(bad)

    def test_replace_failure_keeps_last_good_and_removes_temporary_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'server.json';old=self.sample();snapshot.atomic_json(path,old)
            before=path.read_bytes()
            with patch.object(snapshot.os,'replace',side_effect=OSError('injected')):
                with self.assertRaises(OSError):snapshot.atomic_json(path,self.sample())
            self.assertEqual(before,path.read_bytes())
            self.assertEqual([p.name for p in Path(directory).iterdir()],['server.json'])

    def test_non_json_values_never_replace_public_snapshot(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'server.json';snapshot.atomic_json(path,self.sample())
            before=path.read_bytes()
            with self.assertRaises(ValueError):snapshot.atomic_json(path,{'cpu':float('nan')})
            self.assertEqual(before,path.read_bytes())

    def test_sampler_uses_available_memory_and_handles_first_cpu_sample(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);proc=root/'proc';proc.mkdir();private=root/'private';private.mkdir()
            (proc/'stat').write_text('cpu  100 0 100 700 100 0 0 0 0 0\n')
            (proc/'meminfo').write_text('MemTotal: 1000 kB\nMemAvailable: 700 kB\nMemFree: 10 kB\n')
            snapshot.server(root/'api',private,proc)
            data=json.loads((root/'api/server.json').read_text());self.assertIsNone(data['current']['cpu_pct'])
            self.assertEqual(data['current']['memory_pct'],30)
            self.assertNotIn('total',data);self.assertEqual(len(data['history']),1)


if __name__=='__main__':unittest.main()
