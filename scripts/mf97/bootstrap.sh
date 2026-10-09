#!/bin/sh
# New checkout only. No model downloads, no changes to another project.
set -eu
target=${1:?Usage: sh scripts/mf97/bootstrap.sh /absolute/new/Metaflow}
case "$target" in /*) ;; *) printf '%s\n' 'Use an absolute new directory.' >&2; exit 1 ;; esac
if [ -e "$target" ]; then printf '%s\n' 'Target already exists; inspect it without overwriting.' >&2; exit 1; fi
if [ "$(uname -s)" != Darwin ] || [ "$(uname -m)" != arm64 ]; then
    printf '%s\n' 'This bootstrap pins the native macOS arm64 runtime.' >&2; exit 1
fi
git lfs version >/dev/null
parent=$(dirname "$target")
mkdir -p "$parent"
reserve_kib=20971520
profile=${MF97_BOOTSTRAP_PROFILE:-mac-studio}
if [ "$profile" = local ]; then reserve_kib=5242880; fi
available_kib=$(df -Pk "$parent" | awk 'END { print $4 }')
if [ "$available_kib" -lt $((reserve_kib + 2097152)) ]; then
    printf '%s\n' 'Insufficient space for the configured reserve plus runtime/dependencies.' >&2; exit 1
fi
GIT_LFS_SKIP_SMUDGE=1 git clone --filter=blob:none --no-checkout --single-branch --no-tags \
    --branch codex/mf97-navigation https://github.com/Shuang-su/Metaflow.git "$target"
cd "$target"
git lfs install --local --skip-smudge
git sparse-checkout set --cone metaflow-viewer mf79-viewer-trial mf97-viewer-trial supersplat-v2.32.5 docs metadata scripts analytics
GIT_LFS_SKIP_SMUDGE=1 git checkout codex/mf97-navigation
if [ -n "${MF97_EXPECT_COMMIT:-}" ] && [ "$(git rev-parse HEAD)" != "$MF97_EXPECT_COMMIT" ]; then
    printf '%s\n' 'Branch SHA differs from the requested checkpoint; preserve the checkout for inspection.' >&2; exit 1
fi
exclude=$(git rev-parse --git-path info/exclude)
printf '\n.codex-work/\n' >> "$exclude"
tools="$target/.codex-work/tools/mf97"
mkdir -p "$tools" "$target/.codex-work/config" "$target/.codex-work/cache/npm"
archive=node-v22.23.3-darwin-arm64.tar.gz
expected=23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53
curl --fail --location --retry 2 "https://nodejs.org/dist/v22.23.3/SHASUMS256.txt" --output "$tools/SHASUMS256.txt"
published=$(awk -v name="$archive" '$2 == name {print $1}' "$tools/SHASUMS256.txt")
if [ "$published" != "$expected" ]; then printf '%s\n' 'Official Node checksum differs; stop.' >&2; exit 1; fi
curl --fail --location --retry 2 "https://nodejs.org/dist/v22.23.3/$archive" --output "$tools/$archive.part"
actual=$(shasum -a 256 "$tools/$archive.part" | awk '{print $1}')
if [ "$actual" != "$expected" ]; then printf '%s\n' 'Node archive checksum differs; preserve the partial download.' >&2; exit 1; fi
mv "$tools/$archive.part" "$tools/$archive"
tar -xzf "$tools/$archive" -C "$tools"
runtime="$tools/node-v22.23.3-darwin-arm64/bin"
PATH="$runtime:$PATH"
export PATH
node scripts/mf97/configure-assets.mjs --profile "$profile"
for package in metaflow-viewer supersplat-v2.32.5 mf79-viewer-trial mf97-viewer-trial; do
    npm ci --prefix "$package" --cache "$target/.codex-work/cache/npm" --no-audit --no-fund
done
node -e 'const fs=require("fs");if(fs.existsSync("data"))throw Error("Unexpected data checkout");console.log("Code checkout ready; no data directory was materialized.")'
git status --short --branch
printf '%s\n' "Node: $runtime/node" 'Configure existing scene folders, import selected caches, then run npm run doctor.'
