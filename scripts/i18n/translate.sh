#!/usr/bin/env bash
# Regenerates machine translations. Needs Python 3 and ~3 GB of free disk for models (kept outside
# the repo in $LAZYLAB_MT_DIR, default ~/.cache/lazylab-mt). Only new or changed text is translated.
set -euo pipefail
cd "$(dirname "$0")/../.."
MT=${LAZYLAB_MT_DIR:-$HOME/.cache/lazylab-mt}
LANGS=$(node -e 'const s=require("fs").readFileSync("src/i18n/languages.ts","utf8");console.log([...s.matchAll(/code: "([^"]+)", name: "[^"]+", machine: true/g)].map(m=>m[1]).join(" "))')
argos_code() { case "$1" in pt-BR) echo pb ;; zh-Hans) echo zh ;; zh-Hant) echo zt ;; *) echo "$1" ;; esac; }

mkdir -p "$MT/models"
[ -x "$MT/venv/bin/python" ] || { python3 -m venv "$MT/venv"; "$MT/venv/bin/pip" install -q ctranslate2 sentencepiece subword-nmt sacremoses; }
[ -f "$MT/index.json" ] || curl -sL https://raw.githubusercontent.com/argosopentech/argospm-index/main/index.json -o "$MT/index.json"
for code in $LANGS; do
  m=$(argos_code "$code")
  [ -d "$MT/models/$m" ] && continue
  url=$("$MT/venv/bin/python" -c "import json,sys;print(next(p['links'][0] for p in json.load(open(sys.argv[1])) if p['from_code']=='en' and p['to_code']==sys.argv[2]))" "$MT/index.json" "$m")
  echo "downloading $code model…"
  curl -sL "$url" -o "$MT/models/$m.zip" && rm -rf "$MT/models/tmp" && unzip -q "$MT/models/$m.zip" -d "$MT/models/tmp" && mv "$MT/models/tmp/$(ls "$MT/models/tmp")" "$MT/models/$m" && rm -rf "$MT/models/tmp" "$MT/models/$m.zip"
done
npx tsx scripts/i18n/extract.ts
"$MT/venv/bin/python" scripts/i18n/translate.py --models "$MT/models" $LANGS
node scripts/i18n/repair.mjs
