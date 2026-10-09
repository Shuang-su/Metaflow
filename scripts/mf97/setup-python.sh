#!/bin/sh
set -eu
python=${1:?Usage: sh scripts/mf97/setup-python.sh /absolute/python3.11}
if [ ! -x "$python" ]; then printf '%s\n' 'Provide an existing native Python 3.11–3.12 interpreter.' >&2; exit 1; fi
project=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
tools="$project/.codex-work/tools/mf97"
environment="$tools/open3d-0.19.0"
if [ -e "$environment" ]; then printf '%s\n' 'Environment already exists; inspect it without overwriting.' >&2; exit 1; fi
mkdir -p "$tools" "$project/.codex-work/cache/pip"
available_kib=$(df -Pk "$tools" | awk 'END {print $4}')
if [ "$available_kib" -lt 23068672 ]; then printf '%s\n' 'Keep 20 GiB free plus a 2 GiB environment estimate.' >&2; exit 1; fi
"$python" -c 'import platform,sys; assert platform.machine()=="arm64" and (3,11)<=sys.version_info[:2]<=(3,12), "Native arm64 Python 3.11–3.12 required"'
"$python" -m venv "$environment"
"$environment/bin/python" -m pip install --only-binary=:all: --cache-dir "$project/.codex-work/cache/pip" -r "$project/mf97-viewer-trial/scripts/ground-python-requirements.txt"
PYTHONDONTWRITEBYTECODE=1 "$environment/bin/python" -c 'import open3d; assert open3d.__version__=="0.19.0"; print(open3d.__version__)'
node "$project/scripts/mf97/configure-assets.mjs" --python "$environment/bin/python"
