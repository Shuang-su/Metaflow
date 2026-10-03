import hashlib
import hmac
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ops'))
import publish_server as publisher
from snapshot import utcnow


class PublisherTests(unittest.TestCase):
    def test_publication_is_signed_and_receipt_requires_matching_generation(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);(root/'snapshots').mkdir()
            config=root/'publisher.json';secret='a'*64
            config.write_text(json.dumps({'secret':secret}));config.chmod(0o600)
            values={'cpu_pct':None,'memory_pct':25,'disk_pct':30};at=utcnow()
            data={'schema_version':1,'kind':'server','generated_at':at,'history_window_hours':24,
                'sample_interval_seconds':60,'current':values,'history':[dict(values,at=at)]}
            (root/'snapshots/server.json').write_text(json.dumps(data))
            class Response:
                status=200
                generation=at
                def __enter__(self):return self
                def __exit__(self,*args):pass
                def read(self,size):return json.dumps({'accepted':True,'generated_at':self.generation}).encode()
            response=Response()
            with patch.object(publisher,'STATE',root),patch.object(publisher,'CONFIG',config),patch.object(publisher.urllib.request,'build_opener') as factory:
                factory.return_value.open.return_value=response
                publisher.publish()
                request=factory.return_value.open.call_args[0][0]
                stamp=request.get_header('X-metaflow-time')
                signature=hmac.new(secret.encode(),stamp.encode()+b'\n'+request.data,hashlib.sha256).hexdigest()
                self.assertEqual(request.get_header('X-metaflow-signature'),signature)
                self.assertEqual(request.full_url,publisher.ENDPOINT)
                self.assertEqual(json.loads(request.data),data)
                self.assertEqual(factory.call_args[0],(publisher.NoRedirect,))
                receipt=(root/'publish-receipt.json').read_bytes()
                response.generation='2000-01-01T00:00:00Z'
                with self.assertRaises(RuntimeError):publisher.publish()
                self.assertEqual((root/'publish-receipt.json').read_bytes(),receipt)
                config.chmod(0o644)
                with self.assertRaises(RuntimeError):publisher.publish()

    def test_redirects_cannot_forward_the_upload_signature(self):
        self.assertIsNone(publisher.NoRedirect().redirect_request(None,None,307,'redirect',{},'https://example.invalid'))


if __name__=='__main__':unittest.main()
