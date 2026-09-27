"""Actual Caddy routing/concurrency acceptance; supply the verified CADDY_BIN."""
import concurrent.futures
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request


@unittest.skipUnless(os.environ.get('CADDY_BIN'),'CADDY_BIN required for actual proxy acceptance')
class CaddyBoundaryTests(unittest.TestCase):
    def test_static_only_public_routes_and_finite_concurrency(self):
        with tempfile.TemporaryDirectory(prefix='mf89-caddy-') as directory:
            root=Path(directory);public=root/'public';(public/'current/assets').mkdir(parents=True)
            (public/'api/public/v1/analytics').mkdir(parents=True)
            (public/'current/index.html').write_text('<h1>test fixture</h1>')
            (public/'current/assets/app.js').write_text('/* static acceptance fixture */')
            (public/'private.json').write_text('never public')
            payload=b'{"contract_fixture":true}\n'
            for file in ('analytics/7d.json','analytics/30d.json','server.json'):
                (public/'api/public/v1'/file).write_bytes(payload)
            with socket.socket() as sock:
                sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
            source=(Path(__file__).resolve().parents[1]/'ops/Caddyfile').read_text()
            # Keep the entire real public route block; omit other hosts/listeners.
            config=source.split('# The public listener')[0].replace('dashboard.metaflow.shuang-su.com {','http://127.0.0.1:'+str(port)+' {').replace('/data/public-dashboard',str(public))
            config='{\n admin off\n auto_https off\n}\n'+config
            path=root/'Caddyfile';path.write_text(config)
            log=(root/'caddy.log').open('w')
            proc=subprocess.Popen([os.environ['CADDY_BIN'],'run','--config',str(path),'--adapter','caddyfile'],stdout=log,stderr=log)
            base='http://127.0.0.1:'+str(port)
            def request(path,method='GET'):
                try:
                    with urllib.request.urlopen(urllib.request.Request(base+path,method=method),timeout=3) as response:return response.status,response.read(),dict(response.headers)
                except urllib.error.HTTPError as error:return error.code,error.read(),dict(error.headers)
            try:
                for _ in range(40):
                    try:
                        if request('/')[0]==200:break
                    except urllib.error.URLError:pass
                    time.sleep(.1)
                self.assertEqual(request('/')[0],200)
                for forbidden in ('/api/health','/api/session','/api/database','/dashboard/3','/public/dashboard/test','/auth/login','/private.json','/releases/secret','/api/public/v1/unknown.json'):
                    self.assertEqual(request(forbidden)[0],404,forbidden)
                self.assertEqual(request('/api/public/v1/server.json','POST')[0],405)
                with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                    results=list(pool.map(lambda _:request('/api/public/v1/analytics/7d.json'),range(48)))
                self.assertTrue(all(code==200 and body==payload for code,body,_ in results))
                self.assertTrue(all('max-age=30' in headers['Cache-Control'] for _,_,headers in results))
                self.assertEqual(request('/assets/app.js')[0],200)
                adapted=json.loads(subprocess.check_output([os.environ['CADDY_BIN'],'adapt','--config',str(path),'--adapter','caddyfile'],stderr=subprocess.DEVNULL))
                # No reverse proxy / CGI / FastCGI handler can turn requests into DB calls.
                def handlers(obj):
                    if isinstance(obj,dict):
                        if 'handler' in obj:yield obj['handler']
                        for value in obj.values():yield from handlers(value)
                    elif isinstance(obj,list):
                        for value in obj:yield from handlers(value)
                self.assertTrue(set(handlers(adapted))<={'subroute','static_response','headers','encode','file_server','vars'})
            finally:
                proc.terminate();proc.wait(timeout=10);log.close()


if __name__=='__main__':unittest.main()
