#!/usr/bin/env bash
# Builds the static site and publishes ./out to the gh-pages branch of `origin`.
# Usage: npm run deploy            (project site at https://<user>.github.io/<repo>/)
#        BASE_PATH= npm run deploy (custom domain such as lazylab.com, served from /)
set -euo pipefail

repo_url=$(git remote get-url origin)
repo_name=$(basename -s .git "$repo_url")
base_path=${BASE_PATH-/$repo_name}

npm test
NEXT_PUBLIC_BASE_PATH="$base_path" npm run build
touch out/.nojekyll
if [ -n "${CNAME:-}" ]; then echo "$CNAME" > out/CNAME; fi

cd out
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" commit -q -m "Deploy $(git -C .. rev-parse --short HEAD)"
git push -f -q "$repo_url" gh-pages
rm -rf .git
echo "Published to gh-pages (base path: '${base_path}')"
