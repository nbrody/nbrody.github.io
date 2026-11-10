#!/usr/bin/env bash
# Build Regina's engine + our bindings to WebAssembly.
#
# Expects (in $WORK, default ~/.cache/regina-wasm):
#   emsdk/          emscripten SDK (./emsdk install latest && ./emsdk activate latest)
#   regina/         git clone --branch regina-7.4.1 https://github.com/regina-normal/regina
#   prefix/         GMP 6.3 (--enable-cxx --disable-assembly) and libxml2 built with emscripten
# Output: ../wasm/regina.js + regina.wasm, and ../data/census/*.zsig
#
# Usage: ./build.sh            (incremental: only recompiles changed engine files)
#        ./build.sh bindings   (relink after editing bindings.cpp only)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="${WORK:-$HOME/.cache/regina-wasm}"
REGINA="$WORK/regina"
PREFIX="$WORK/prefix"
OBJ="$WORK/obj"
OUT="$HERE/../wasm"

source "$WORK/emsdk/emsdk_env.sh" >/dev/null 2>&1

CXXFLAGS=(-std=c++20 -O2 -DNDEBUG -fwasm-exceptions
  -I"$HERE" -I"$REGINA/engine" -I"$PREFIX/include" -I"$PREFIX/include/libxml2"
  -sUSE_ZLIB=1 -include iterator -include algorithm
  -Wno-deprecated-declarations -Wno-unused-command-line-argument)

mkdir -p "$OBJ" "$OUT"

if [[ "${1:-}" != "bindings" ]]; then
  # No key-value store: census lookups happen in JS, so CensusDB::lookup is a no-op.
  sed -i '' 's/^ *#error "No key-value store library was detected!"/  \/\/ (wasm build: no key-value store)/' "$REGINA/engine/census/census-impl.h"
  python3 "$HERE/collect-sources.py" "$REGINA/engine" > "$WORK/sources.txt"
  cat > "$WORK/compile_one.sh" <<EOS
#!/usr/bin/env bash
src="\$1"; rel="\${src#$REGINA/engine/}"; o="$OBJ/\${rel//\//_}.o"
if [[ ! -f "\$o" || "\$src" -nt "\$o" || "$HERE/regina-config.h" -nt "\$o" ]]; then
  em++ ${CXXFLAGS[*]} -c "\$src" -o "\$o" 2>>"$WORK/compile-errors.log" || { echo "FAILED: \$rel" >&2; exit 1; }
fi
EOS
  chmod +x "$WORK/compile_one.sh"
  : > "$WORK/compile-errors.log"
  xargs -P "${JOBS:-10}" -n 1 "$WORK/compile_one.sh" < "$WORK/sources.txt" || { grep -m 30 "error:" "$WORK/compile-errors.log"; exit 1; }
fi

em++ "${CXXFLAGS[@]}" -c "$HERE/bindings.cpp" -o "$OBJ/_bindings.o"

em++ -O2 -fwasm-exceptions -sUSE_ZLIB=1 "$OBJ"/*.o "$PREFIX/lib/libxml2.a" "$PREFIX/lib/libgmpxx.a" "$PREFIX/lib/libgmp.a" \
  -lembind \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createRegina \
  -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=64MB -sMAXIMUM_MEMORY=4GB \
  -sSTACK_SIZE=8MB \
  -o "$OUT/regina.js"

mkdir -p "$HERE/../data/census"
cp "$REGINA"/engine/data/census/*.zsig "$HERE/../data/census/"
ls -la "$OUT"
