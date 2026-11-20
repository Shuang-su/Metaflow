#!/usr/bin/env python3
"""Exact public voice runtime through the existing protected Companion publisher."""
from pathlib import Path, PurePosixPath
import argparse, base64, hashlib, importlib.util, json, lzma, os, re, subprocess, sys, urllib.error

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / 'scripts/companion-reliability-release.py'
engine_bytes = ENGINE.read_bytes()
if hashlib.sha1(b'blob ' + str(len(engine_bytes)).encode() + b'\0' + engine_bytes).hexdigest() != 'f6b3bdf653f771752639d4deb7fd23681091bd02':
    raise RuntimeError('Previously validated publisher changed; review required')
spec = importlib.util.spec_from_file_location('approved_companion_publisher', ENGINE)
engine = importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)
RELEASE_DIR = ROOT / 'releases/companion/2026-11-21-voice-playback'
EXPECTED_PACKED = 'c23be673422e28c6da567da7254e146708e21ce89dce60d9b69aedb9e03ee0f6'
EXPECTED_JSON = 'c1997117217e9b562da1dc766ec36f3764abfe655f320fb8de20570eba16c83b'
EXPECTED_SOURCE = '752ed6af836677ed271550b18fd16e5ae496d701'
EXPECTED_FILES = 73
BASE_DEPLOY = '6afc6be90e78b612de2a968d'
BASE_SOURCE = '8886f8c707d244469763949814f19a5f09a2a039'
BASE_RELEASE = 'companion-2026-11-17-motion-feedback'
RELEASE = 'companion-2026-11-21-voice-playback'

def manifest():
    packed = base64.b64decode((RELEASE_DIR / 'runtime.xz.b64').read_text().strip(), validate=True)
    if engine.sha(packed) != EXPECTED_PACKED:
        raise ValueError('Voice release payload changed')
    raw = lzma.decompress(packed, memlimit=64 * 1024 * 1024)
    if len(raw) > 2_000_000 or engine.sha(raw) != EXPECTED_JSON:
        raise ValueError('Voice release manifest changed')
    m = json.loads(raw)
    if m['sourceRef'] != EXPECTED_SOURCE or m['release'] != RELEASE:
        raise ValueError('Unexpected voice candidate identity')
    if m['baseOrigin'] != 'https://' + BASE_DEPLOY + '--' + engine.TARGET or m['baseSourceRef'] != BASE_SOURCE or m['baseRelease'] != BASE_RELEASE:
        raise ValueError('Unexpected production baseline')
    if not re.fullmatch('[0-9a-f]{40}', EXPECTED_SOURCE) or not re.fullmatch('[0-9a-f]{64}', m['candidateArtifactSha256']):
        raise ValueError('Candidate provenance incomplete')
    if not isinstance(m['candidateArtifact'], int) or m['candidateArtifact'] <= 0:
        raise ValueError('Candidate artifact is not identified')
    names = [engine.path_ok(row['path']) for row in m['files']]
    if len(names) != EXPECTED_FILES or len(set(names)) != len(names) or not 60 <= len(names) <= 100:
        raise ValueError('Unexpected candidate file set')
    for row in m['files']:
        name = row['path']
        if PurePosixPath(name).as_posix() != name or '\x00' in name or any(part.startswith('.') for part in PurePosixPath(name).parts):
            raise ValueError('Unsafe runtime path')
        if name.startswith(('docs/', 'tests/', 'scripts/')) or name.endswith(('.py', '.zip', '.tar', '.bundle')) or '.test.' in name or '.e2e.' in name:
            raise ValueError('Private or development file in runtime')
        if type(row['bytes']) is not int or not 0 < row['bytes'] <= 60_000_000 or not re.fullmatch('[0-9a-f]{64}', row['sha256']):
            raise ValueError('Invalid runtime integrity entry')
    if set(m['patches']) or not {'_headers', '_redirects', 'release.json'} <= set(m['inline']) or not set(m['inline']) <= set(names):
        raise ValueError('Unexpected inline scope')
    assets = {row['path']: {'bytes': row['bytes'], 'sha256': row['sha256']} for row in m['files'] if row['path'].startswith(('assets/', 'vendor/'))}
    if assets != m['unchangedAssets'] or sum(name.endswith('.vrma') for name in assets) != 7:
        raise ValueError('Original model, motion or vendor bytes changed')
    return m

def browser(root, label):
    keep = {'PATH', 'HOME', 'TMPDIR', 'RUNNER_TEMP', 'BROWSER_MODULE_DIR', 'EVIDENCE_DIR', 'PLAYWRIGHT_BROWSERS_PATH', 'LANG'}
    subprocess.run(['node', 'scripts/verify-companion-voice.mjs', root, label], env={key: value for key, value in os.environ.items() if key in keep}, check=True, timeout=540)

def record(data):
    if data['status'] in ['published-http-and-browser-verified', 'already-published-and-verified']:
        data.update(outputFilesVerified=EXPECTED_FILES, servedFilesVerified=EXPECTED_FILES - 2, routingConfigurationsVerified=2)
    data['checkedAtUtc'] = engine.datetime.datetime.now(engine.datetime.timezone.utc).isoformat()
    (ROOT / 'companion-voice-publication.json').write_text(json.dumps(data, indent=2) + '\n')
    print('PUBLICATION_RESULT', json.dumps(data), flush=True)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['build', 'verify', 'publish'])
    args = parser.parse_args()
    try:
        m = manifest()
        engine.BASE = m['baseOrigin']
        engine.SITE = ROOT / 'companion-voice-site'
        engine.browser = browser
        engine.record = record
        if args.action == 'build':
            engine.build(m)
        elif args.action == 'verify':
            engine.verify_site(m)
            print('EXACT_VOICE_RUNTIME_VERIFIED')
        else:
            engine.publish(m)
    except urllib.error.HTTPError as error:
        print('VOICE_RELEASE_FAILED_HTTP', error.code, 'No response body or credential logged.', file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        print('VOICE_RELEASE_FAILED', str(error), file=sys.stderr)
        sys.exit(1)
