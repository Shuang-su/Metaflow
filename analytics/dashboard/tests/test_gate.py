import importlib.util
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ops'))
from analysisctl import continuous
from datetime import datetime,timezone


class ObservationGateTests(unittest.TestCase):
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
