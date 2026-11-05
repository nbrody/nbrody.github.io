#!/bin/bash
set -euo pipefail
# Run from any directory: build.sh /path/to/PathTracerGLSL /path/to/nbrody.github.io/docs
tracer=${1:?PathTracerGLSL checkout required}
docs=${2:?site docs directory required}
tracer=$(cd "$tracer" && pwd)
docs=$(cd "$docs" && pwd)
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
rsync -a --exclude node_modules --exclude .git --exclude test-data --exclude renders --exclude dist --exclude docs "$tracer/" "$tmp/"
cp -R "$tracer/node_modules" "$tmp/node_modules"
patch -d "$tmp" -p1 < "$here/public-build.patch"
cp "$docs/topology/assets/poincare-ui.css" "$tmp/public/studio/poincare-ui.css"
cp "$docs/topology/assets/poincare-ui.js" "$tmp/public/studio/poincare-ui.js"
(cd "$tmp" && PATH_TRACER_SITE_DOCS="$docs/" npm run build)
echo "Built at $tmp/dist; copying into $docs/GeometryofLinearGroups/assets/path-tracer"
mkdir -p "$docs/GeometryofLinearGroups/assets/path-tracer"
rsync -a --delete "$tmp/dist/" "$docs/GeometryofLinearGroups/assets/path-tracer/"
