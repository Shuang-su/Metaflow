#!/usr/bin/env python3
"""Immutable browser-only handoff; build has no deployment credentials."""
from pathlib import Path, PurePosixPath
from concurrent.futures import ThreadPoolExecutor
import argparse, base64, datetime, hashlib, io, json, lzma, os, shutil
import subprocess, sys, tarfile, time, urllib.error, urllib.parse, urllib.request, zipfile

ROOT = Path(__file__).resolve().parents[1]
PAYLOAD = ROOT / 'releases/companion/2026-11-16-motion-library'
TARGET = 'polite-semolina-b478fc.netlify.app'
ORIGIN = 'https://' + TARGET
SOURCE = 'f1a476f7a6fa4d60ad16bd8d401eed4433704eff'
BASE_SOURCE = 'd5785c9b87079f6c4b9a2c16978e0d5cdd2f418a'
BASE_ORIGIN = 'https://6af9bce566091757a2aea7c8--' + TARGET
PACKED_SHA = 'bf5e8b5b3d19547e6b9e0d3905ef0b5dc35757847848bd8a9db0fa103371f383'
MANIFEST_SHA = '89cc7c2fbc84a4e1f52583f4fa545e6a2a3ea127dea8f6f1e85324e137a5f991'
SITE = ROOT / 'companion-motion-site'
TOKEN = os.environ.get('NETLIFY_AUTH_TOKEN', '')
# Netlify consumes these two files; it deliberately does not serve their URLs.
# These are the exact bytes of the verified 15.1 artifact, not guessed responses.
BASE_CONFIG = {
    '_headers': b'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(self), microphone=(), geolocation=()\n/assets/*.gz\n  Content-Type: application/gzip\n',
    '_redirects': b'/about /about.html 200\n',
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe_path(name):
    p = PurePosixPath(name)
    if not name or p.is_absolute() or '..' in p.parts or '\\' in name:
        raise ValueError('Unsafe release path')
    return p


def manifest():
    text = ''.join((PAYLOAD / f'runtime-manifest.xz.{n:02}.b64').read_text().strip() for n in (1, 2))
    packed = base64.b64decode(text, validate=True)
    if sha(packed) != PACKED_SHA:
        raise ValueError('Release transfer digest mismatch')
    raw = lzma.decompress(packed, memlimit=256 * 1024 * 1024)
    if len(raw) != 82940 or sha(raw) != MANIFEST_SHA:
        raise ValueError('Release manifest mismatch')
    m = json.loads(raw)
    if m['sourceRef'] != SOURCE or m['baseOrigin'] != BASE_ORIGIN or len(m['files']) != 68:
        raise ValueError('Unapproved release identity')
    names = [r['path'] for r in m['files']]
    if len(set(names)) != len(names):
        raise ValueError('Duplicate manifest path')
    for n in names:
        safe_path(n)
    if any(n.startswith(('.git/', 'tests/', 'docs/')) or n.endswith(('.py', '.zip', '.tar')) for n in names):
        raise ValueError('Private/build-only content in browser handoff')
    expected_motions = {'assets/motions/' + r['file']['member'] for r in m['motions']}
    actual_motions = {n for n in names if n.endswith('.vrma')}
    if expected_motions != actual_motions or len(actual_motions) != 7:
        raise ValueError('Incorrect redistributable motion set')
    return m


class RestrictedRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, hosts):
        self.hosts = set(hosts)

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        u = urllib.parse.urlsplit(newurl)
        if u.scheme != 'https' or u.hostname not in self.hosts:
            raise ValueError('Unapproved asset redirect')
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download(url, limit, hosts=None):
    u = urllib.parse.urlsplit(url)
    hosts = hosts or {u.hostname}
    if u.scheme != 'https' or u.hostname not in hosts:
        raise ValueError('Unapproved source origin')
    opener = urllib.request.build_opener(RestrictedRedirect(hosts))
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'MetaFlow-public-motion-inspection/1.0', 'Cache-Control': 'no-cache'})
            with opener.open(req, timeout=45) as response:
                if response.status != 200:
                    raise RuntimeError('Asset HTTP status not 200')
                data = response.read(limit + 1)
            if len(data) > limit:
                raise ValueError('Asset exceeds budget: ' + u.path)
            return data
        except urllib.error.HTTPError as error:
            if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                raise RuntimeError(f'Public asset HTTP {error.code}: {u.hostname}{u.path}') from None
            time.sleep(attempt + 1)
        except (TimeoutError, urllib.error.URLError):
            if attempt == 2:
                raise
            time.sleep(attempt + 1)


def check_file(data, row):
    if len(data) != row['bytes'] or sha(data) != row['sha256']:
        raise ValueError('Tested artifact mismatch: ' + row['path'])


def baseline(name, limit):
    return BASE_CONFIG[name] if name in BASE_CONFIG else download(BASE_ORIGIN + '/' + urllib.parse.quote(name, safe='/'), limit)


def build():
    m = manifest()
    stage = ROOT / 'companion-motion-site.staging'
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir()
    try:
        special = {}
        for item in m['motions']:
            a, f = item['archive'], item['file']
            safe_path(f['member'])
            data = download(a['url'], a['size'], {'downloads.vrp.moe'})
            if len(data) != a['size'] or sha(data) != a['sha256']:
                raise ValueError('Original motion archive hash mismatch')
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                entry = z.getinfo(f['member'])
                if entry.file_size != f['bytes'] or entry.file_size > 8 * 1024 * 1024:
                    raise ValueError('Original motion member size mismatch')
                special['assets/motions/' + f['member']] = z.read(entry)
        lib = m['adapter']
        data = download(lib['url'], 5 * 1024 * 1024, {'registry.npmjs.org'})
        algorithm, digest = lib['integrity'].split('-', 1)
        if algorithm != 'sha512' or base64.b64encode(hashlib.sha512(data).digest()).decode() != digest:
            raise ValueError('Official animation adapter integrity mismatch')
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as tar:
            for dest, member in [('vendor/three-vrm-animation.module.min.js', 'package/lib/three-vrm-animation.module.min.js'), ('vendor/three-vrm-animation.LICENSE.txt', 'package/LICENSE')]:
                special[dest] = tar.extractfile(member).read()

        def restore(row):
            name = row['path']
            if row['source'] == 'baseline':
                data = baseline(name, row['bytes'])
            elif row['source'] == 'delta':
                change = m['changes'][name]
                before = baseline(name, 8 * 1024 * 1024) if change['hasBase'] else b''
                if sha(before) != change['baseSha256']:
                    raise ValueError('Immutable baseline changed: ' + name)
                lines = before.decode('utf-8').splitlines(keepends=True)
                end = 0
                for start, stop, replacement in change['ops']:
                    if not 0 <= end <= start <= stop <= len(lines) or not isinstance(replacement, str):
                        raise ValueError('Invalid release delta')
                    end = stop
                for start, stop, replacement in reversed(change['ops']):
                    lines[start:stop] = [replacement]
                data = ''.join(lines).encode('utf-8')
            else:
                data = special[name]
            check_file(data, row)
            out = stage / name
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(data)

        with ThreadPoolExecutor(max_workers=6) as pool:
            list(pool.map(restore, m['files']))
        check_site(stage, m)
        if SITE.exists():
            shutil.rmtree(SITE)
        stage.rename(SITE)
        record = {'status': 'exact-tested-runtime-reconstructed', 'sourceRef': SOURCE, 'files': len(m['files']), 'manifestSha256': MANIFEST_SHA, 'candidateArtifact': m['artifactId'], 'candidateArtifactSha256': m['artifactSha256'], 'published': False}
        (ROOT / 'companion-motion-build.json').write_text(json.dumps(record, indent=2) + '\n')
        print('EXACT_TESTED_RUNTIME_READY', json.dumps(record), flush=True)
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise


def check_site(root, m):
    actual = {p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file()}
    expected = {r['path'] for r in m['files']}
    if actual != expected:
        raise ValueError('Output file set differs from tested artifact')
    for r in m['files']:
        p = root / r['path']
        if p.is_symlink():
            raise ValueError('Symlink in release')
        check_file(p.read_bytes(), r)
    release = json.loads((root / 'release.json').read_text())
    if release.get('gitRef') != SOURCE or release.get('motionCatalogue') != {'total': 16, 'bundled': 7, 'localImport': 8, 'originalSourceRequired': 1}:
        raise ValueError('Unapproved motion catalogue')


def api(path, data=None, method=None):
    payload = json.dumps(data).encode() if isinstance(data, dict) else data
    req = urllib.request.Request('https://api.netlify.com/api/v1/' + path, data=payload, method=method,
        headers={'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' if isinstance(data, dict) else 'application/octet-stream', 'User-Agent': 'MetaFlow-approved-companion-release/2.0'})
    with urllib.request.urlopen(req, timeout=60) as response:
        raw = response.read(4_000_000)
        return json.loads(raw) if raw else {}


def public(root, path, limit=2_000_000):
    return download(root.rstrip('/') + '/' + urllib.parse.quote(path, safe='/') + '?release=' + SOURCE, limit)


def smoke(root, m):
    # All 66 served files are byte-verified; two Netlify configuration files are
    # verified at build/upload and by their applied HTTP behavior, not fake URLs.
    def verify(row):
        check_file(public(root, row['path'], row['bytes']), row)
    rows = [r for r in m['files'] if r['path'] not in BASE_CONFIG]
    if len(rows) != 66:
        raise ValueError('Unexpected served resource count')
    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(verify, rows))
    request = urllib.request.Request(root.rstrip('/') + '/?release=' + SOURCE, headers={'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=30) as response:
        for key, value in [('X-Content-Type-Options', 'nosniff'), ('Referrer-Policy', 'strict-origin-when-cross-origin'), ('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), window-management=(self)')]:
            if response.headers.get(key) != value:
                raise RuntimeError('Expected routing header not applied: ' + key)
    about = next(r for r in m['files'] if r['path'] == 'about.html')
    check_file(public(root, 'about', about['bytes']), about)
    print('REMOTE_BYTES_AND_ROUTING_VERIFIED', root, len(rows), flush=True)


def browser_smoke(root, label):
    keep = {'PATH', 'HOME', 'TMPDIR', 'RUNNER_TEMP', 'BROWSER_MODULE_DIR', 'EVIDENCE_DIR', 'PLAYWRIGHT_BROWSERS_PATH', 'LANG', 'LC_ALL'}
    env = {k: v for k, v in os.environ.items() if k in keep}
    if not env.get('BROWSER_MODULE_DIR'):
        raise RuntimeError('Browser publication check is mandatory')
    subprocess.run(['node', 'scripts/verify-companion-motion-release.mjs', root, label], env=env, check=True, timeout=420)


def save_record(record):
    record['checkedAtUtc'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    (ROOT / 'companion-motion-publication.json').write_text(json.dumps(record, indent=2) + '\n')
    print('PUBLICATION_RESULT', json.dumps(record), flush=True)


def publish():
    m = manifest()
    check_site(SITE, m)
    if not TOKEN:
        raise RuntimeError('PUBLISH_BLOCKED: existing protected Netlify credential unavailable')
    site = api('sites/' + TARGET)
    if site.get('name') != 'polite-semolina-b478fc' or not any(urllib.parse.urlsplit(site.get(k, '') or '').hostname == TARGET for k in ['url', 'ssl_url']):
        raise RuntimeError('Exact existing companion target mismatch')
    sid = site['id']
    old = site.get('published_deploy') or {}
    old_id = old.get('id')
    if not old_id or old.get('locked'):
        raise RuntimeError('Missing baseline or locked deployment; protection is unchanged')
    previous = json.loads(public(ORIGIN, 'release.json'))
    if previous.get('gitRef') == SOURCE:
        smoke(ORIGIN, m)
        browser_smoke(ORIGIN, 'production')
        save_record({'status': 'already-published-and-verified', 'url': ORIGIN, 'deployId': old_id, 'sourceRef': SOURCE, 'release': m['release']})
        return
    if previous.get('gitRef') != BASE_SOURCE or previous.get('release') != 'companion-2026-11-15.1' or sha(public(ORIGIN, 'app.js')) != m['changes']['app.js']['baseSha256']:
        raise RuntimeError('Production changed from approved baseline; no overwrite')
    files, by_hash = {}, {}
    for r in m['files']:
        name = r['path']
        data = (SITE / name).read_bytes()
        digest = hashlib.sha1(data).hexdigest()
        files['/' + name] = digest
        by_hash.setdefault(digest, (name, data))
    draft = api('sites/' + sid + '/deploys', {'files': files, 'draft': True, 'title': 'Approved full Persona catalogue / native idle / display calibration ' + SOURCE[:10]}, 'POST')
    did = draft['id']
    print('DRAFT_CREATED', did, 'PREVIOUS', old_id, flush=True)
    for digest in draft.get('required', []):
        if digest not in by_hash:
            raise RuntimeError('Unexpected required asset digest')
        name, data = by_hash[digest]
        api('deploys/' + did + '/files/' + urllib.parse.quote(name, safe='/'), data, 'PUT')
    for _ in range(60):
        draft = api('deploys/' + did)
        if draft.get('state') == 'ready':
            break
        if draft.get('state') == 'error':
            raise RuntimeError('Netlify draft processing failed')
        time.sleep(2)
    else:
        raise RuntimeError('Draft timeout; production not promoted')
    preview = draft.get('deploy_ssl_url') or draft.get('deploy_url')
    if not preview or urllib.parse.urlsplit(preview).hostname != did + '--' + TARGET:
        raise RuntimeError('Unexpected preview host')
    smoke(preview, m)
    browser_smoke(preview, 'preview')
    if (api('sites/' + sid).get('published_deploy') or {}).get('id') != old_id:
        raise RuntimeError('Concurrent deployment; draft not promoted')
    api('sites/' + sid + '/deploys/' + did + '/restore', {}, 'POST')
    try:
        for attempt in range(4):
            try:
                smoke(ORIGIN, m)
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(3)
        browser_smoke(ORIGIN, 'production')
    except Exception:
        rollback = (api('sites/' + sid).get('published_deploy') or {}).get('id') == did
        if rollback:
            api('sites/' + sid + '/deploys/' + old_id + '/restore', {}, 'POST')
        save_record({'status': 'production-verification-failed', 'failedDeployId': did, 'previousDeployId': old_id, 'rollbackPerformed': rollback, 'sourceRef': SOURCE})
        raise
    save_record({'status': 'published-http-and-browser-verified', 'url': ORIGIN, 'preview': preview, 'deployId': did, 'previousDeployId': old_id, 'sourceRepository': m['sourceRepository'], 'sourceRef': SOURCE, 'release': m['release'], 'filesVerified': len(m['files']), 'httpFilesVerified': 66, 'routingConfigurationsVerified': 2, 'candidateArtifact': m['artifactId'], 'candidateArtifactSha256': m['artifactSha256'], 'manifestSha256': MANIFEST_SHA, 'motionCatalogue': {'total': 16, 'bundled': 7, 'localImport': 8, 'originalSourceRequired': 1}})


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('action', choices=['build', 'verify', 'publish'])
    args = p.parse_args()
    try:
        if args.action == 'build':
            build()
        elif args.action == 'verify':
            check_site(SITE, manifest())
            print('ALL_68_TESTED_FILES_VERIFIED')
        else:
            publish()
    except urllib.error.HTTPError as e:
        print('RELEASE_FAILED_HTTP', e.code, 'No response body or credential logged.', file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print('RELEASE_FAILED', str(e), file=sys.stderr)
        sys.exit(1)
