#!/usr/bin/env bash
# Tests, builds and publishes the static site to the gh-pages branch of `origin`.
# Served at https://lazylab.com/ (custom domain → root path). Override with
# DOMAIN=example.com, or DOMAIN= BASE_PATH=/repo for a github.io project site.
set -euo pipefail

domain=${DOMAIN-lazylab.com}
base_path=${BASE_PATH-}
repo_url=$(git remote get-url origin)

npm test
NEXT_PUBLIC_BASE_PATH="$base_path" npm run build
touch out/.nojekyll
if [ -n "$domain" ]; then echo "$domain" > out/CNAME; fi

cd out
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C .. config user.name)" -c user.email="$(git -C .. config user.email)" \
  commit -q -m "Deploy $(git -C .. rev-parse --short HEAD)"
git -c http.postBuffer=524288000 push -f -q "$repo_url" gh-pages
rm -rf .git
echo "Published to gh-pages${domain:+ for https://$domain/}"
