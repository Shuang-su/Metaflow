#!/usr/bin/env python3
"""Restore an MF-89 app DB backup in a disposable, network-isolated container."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time
import uuid
from snapshot import utcnow


def verify(directory):
    directory=Path(directory).resolve()
    if directory.stat().st_mode & 0o077:raise RuntimeError('Backup directory must be private')
    manifest=json.loads((directory/'manifest.json').read_text())
    for relative,expected in manifest['files'].items():
        source=(directory/relative).resolve()
        if directory not in source.parents or hashlib.sha256(source.read_bytes()).hexdigest()!=expected:
            raise RuntimeError('Backup integrity check failed')
    image=manifest['db_image']
    # Use the captured exact image content, even if the old configuration used a tag.
    containers=json.loads((directory/'containers.private.json').read_text())
    image=containers['db']['Image']
    name='mf89-restore-'+uuid.uuid4().hex[:12]
    data=directory/(name+'-data');data.mkdir(mode=0o700)
    def run(args,**kwargs):return subprocess.run(['docker']+args,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=300,**kwargs)
    created=False
    try:
        run(['run','-d','--name',name,'--network=none','--memory=160m','--cpus=0.5',
             '--security-opt=no-new-privileges','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=restorecheck',
             '-v',str(data)+':/var/lib/postgresql/data',image,'-c','shared_buffers=16MB','-c','max_connections=10'])
        created=True
        for _ in range(30):
            ready=subprocess.run(['docker','exec',name,'pg_isready','-q','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            if ready.returncode==0:break
            time.sleep(2)
        else:raise RuntimeError('Isolated database did not become ready')
        with (directory/'metabase.dump').open('rb') as dump:
            run(['exec','-i',name,'pg_restore','--exit-on-error','--no-owner','--no-acl','-U','postgres','-d','restorecheck'],stdin=dump)
        sql="select json_build_object('cards',(select count(*) from report_card),'dashboards',(select count(*) from report_dashboard),'users',(select count(*) from core_user),'databases',(select count(*) from metabase_database));"
        restored=json.loads(run(['exec',name,'psql','-XAt','-U','postgres','-d','restorecheck','-c',sql]).stdout)
        if restored!=manifest['counts']:raise RuntimeError('Restored object counts differ')
        manifest['restore_verified']=True;manifest['restore_verified_at']=utcnow()
        (directory/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
        print('Isolated PostgreSQL restore and object counts verified. Offsite copy and patched application health remain separate checks.')
    finally:
        if created:
            # Only this newly-created disposable test container; no production volume operation.
            subprocess.run(['docker','rm','-f',name],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
        # Keep the restricted test directory as evidence. No automatic data-directory deletion.


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('backup');args=parser.parse_args()
    try:verify(args.backup)
    except Exception as error:
        print('Restore check incomplete: '+type(error).__name__);raise SystemExit(1)
