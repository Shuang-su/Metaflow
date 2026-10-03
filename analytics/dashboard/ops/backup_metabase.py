#!/usr/bin/env python3
"""Create a restricted backup on the server. Copy it OFF the server before any cutover."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from snapshot import utcnow


def capture(directory):
    directory=Path(directory)
    if not directory.is_absolute():
        raise RuntimeError('Backup destination must be absolute')
    directory=directory.resolve()
    if any(p in directory.parts for p in ('.codex-work','tmp','public','public-dashboard')):
        raise RuntimeError('Use a restricted backup location, never a cache or public path')
    directory.mkdir(parents=True,exist_ok=False);os.chmod(str(directory),0o700)
    os.umask(0o077)
    def inspect(name):
        return json.loads(subprocess.check_output(['docker','inspect',name],universal_newlines=True))[0]
    app=inspect('metaflow-metabase');db=inspect('metaflow-metabase-db')
    env=dict(item.split('=',1) for item in app['Config']['Env'] if '=' in item)
    if not env.get('MB_ENCRYPTION_SECRET_KEY'):
        raise RuntimeError('Missing encryption key; backup is not complete')
    with (directory/'metabase.dump').open('wb') as output:
        subprocess.run(['docker','exec','metaflow-metabase-db','pg_dump','-Fc','--no-owner','--no-acl',
            '-U',env['MB_DB_USER'],'-d',env['MB_DB_DBNAME']],stdout=output,stderr=subprocess.PIPE,check=True,timeout=300)
    # Exact runtime environment and mounts are intentionally private; never print or commit these files.
    (directory/'containers.private.json').write_text(json.dumps({'app':app,'db':db}))
    base=Path('/opt/metaflow-metabase')
    for relative in ('docker-compose.recovered.yml','.env','metabase-admin.env','caddy/Caddyfile'):
        source=base/relative
        if source.is_file():
            target=directory/relative;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(str(source),str(target));os.chmod(str(target),0o600)
    sql="select json_build_object('cards',(select count(*) from report_card),'dashboards',(select count(*) from report_dashboard),'users',(select count(*) from core_user),'databases',(select count(*) from metabase_database));"
    counts=subprocess.check_output(['docker','exec','metaflow-metabase-db','psql','-XAt','-v','ON_ERROR_STOP=1','-U',env['MB_DB_USER'],'-d',env['MB_DB_DBNAME'],'-c',sql],universal_newlines=True)
    manifest={'captured_at':utcnow(),'app_image':app['Config']['Image'],'db_image':db['Config']['Image'],
        'counts':json.loads(counts),'files':{},'offsite_verified':False,'restore_verified':False}
    for path in directory.rglob('*'):
        if path.is_file():manifest['files'][str(path.relative_to(directory))]=hashlib.sha256(path.read_bytes()).hexdigest()
    (directory/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('Backup captured in restricted directory; offsite copy and isolated restore verification are still REQUIRED.')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('destination');args=parser.parse_args()
    try:capture(args.destination)
    except Exception as error:
        print('Backup incomplete: '+type(error).__name__,file=sys.stderr);sys.exit(1)
