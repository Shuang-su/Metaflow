import importlib.util
from pathlib import Path
import sys
import unittest
from unittest import mock
import tempfile
import json

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ops'))
import analysisctl
from analysisctl import continuous
from datetime import datetime,timezone


class ObservationGateTests(unittest.TestCase):
    def test_pending_os_reboot_cannot_approve_lifecycle(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'security-review.json'
            data={key:True for key in ('host_persistence_reviewed','admins_sessions_keys_reviewed',
                'firewalls_verified','offsite_backup_restore_verified','subscriptions_migrated_or_absent',
                'metabase_patched','external_https_verified')}
            path.write_text(json.dumps(data));path.chmod(0o600)
            with mock.patch.object(analysisctl,'CONFIG',Path(directory)):
                with self.assertRaisesRegex(RuntimeError,'os_security_updates_verified'):
                    analysisctl.review()
                data['os_security_updates_verified']=False
                path.write_text(json.dumps(data))
                with self.assertRaisesRegex(RuntimeError,'os_security_updates_verified'):
                    analysisctl.review()

    def rows(self,seconds=86400,step=60):
        now=2000000000
        return now,[{'at':datetime.fromtimestamp(t,timezone.utc).isoformat(),'ok':True} for t in range(now-seconds,now+1,step)]

    def test_requires_real_duration_and_complete_fresh_history(self):
        now,rows=self.rows()
        self.assertTrue(continuous(rows,86400,180,now))
        self.assertFalse(continuous(rows[1:],86400,180,now))
        self.assertFalse(continuous(rows,86400,180,now+181))
        self.assertFalse(continuous(rows[:500]+rows[510:],86400,180,now))
        rows[300]['ok']=False
        self.assertFalse(continuous(rows,86400,180,now))

    def test_duplicate_or_reversed_observations_cannot_fake_time(self):
        now,rows=self.rows()
        self.assertFalse(continuous(rows+[rows[-1]],86400,180,now))
        self.assertFalse(continuous(rows[::-1],86400,180,now))
        self.assertFalse(continuous([],86400,180,now))


if __name__=='__main__':unittest.main()
