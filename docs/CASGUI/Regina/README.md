# Regina GUI

A browser front end for [Regina](https://regina-normal.github.io/) 7.4.1. Regina's
C++ engine (with SnapPea, libnormaliz, GMP and libxml2) is compiled to
WebAssembly and runs in a Web Worker, so the page works as static files on
GitHub Pages.

## Layout

- `index.html`, `style.css`, `js/app.js`: the page.
- `js/engine.js`, `js/worker.js`: runs the wasm engine off the main thread.
  Stop terminates the worker and starts a new one, since Regina can't be
  interrupted mid-computation.
- `js/census.js`: census lookups. Regina normally uses a key-value database;
  here the gzipped `isosig name` lists in `data/census/` are fetched and
  matched by exact isomorphism signature, as `Census::lookup()` does.
- `js/diagram.js`: draws a link from its PD code. It lays out the planar map
  barycentrically, with a hidden vertex in each face, then smooths it while
  checking that it stays planar and each crossing stays a proper X. If that
  check fails, the page says the drawing may be inaccurate.
- `js/dualgraph.js`: the face pairing graph.
- `engine/bindings.cpp`: the JS API. Each function is stateless: it takes an
  isomorphism signature (or `Link::sig(false, false)`, which keeps chirality
  and orientation) and returns JSON.
- `wasm/`: build output. `data/sample.rga` is Regina's own sample file.

## Rebuilding the engine

Everything except the bindings goes in `~/.cache/regina-wasm` (override with `WORK=`):

```sh
cd ~/.cache/regina-wasm
git clone --depth 1 https://github.com/emscripten-core/emsdk.git && (cd emsdk && ./emsdk install latest && ./emsdk activate latest)
git clone --depth 1 --branch regina-7.4.1 https://github.com/regina-normal/regina.git
# GMP 6.3.0 (gmplib.org or ftp.gnu.org) and libxml2 2.13, installed into ./prefix:
source emsdk/emsdk_env.sh
(cd gmp-6.3.0 && emconfigure ./configure --host=wasm32-unknown-emscripten --build=$(./config.guess) \
   CC_FOR_BUILD=/usr/bin/cc HOST_CC=/usr/bin/cc --disable-assembly --enable-cxx --disable-shared \
   --prefix=$PWD/../prefix && emmake make -j10 install)
(cd libxml2-2.13.5 && mkdir build && cd build && emcmake cmake .. -DCMAKE_INSTALL_PREFIX=$PWD/../../prefix \
   -DBUILD_SHARED_LIBS=OFF -DLIBXML2_WITH_PYTHON=OFF -DLIBXML2_WITH_ICONV=OFF -DLIBXML2_WITH_LZMA=OFF \
   -DLIBXML2_WITH_ZLIB=OFF -DLIBXML2_WITH_HTTP=OFF -DLIBXML2_WITH_THREADS=OFF -DLIBXML2_WITH_TESTS=OFF \
   -DLIBXML2_WITH_PROGRAMS=OFF && emmake make -j10 install)
```

Then, from `engine/`:

```sh
./build.sh            # compiles the engine (about a minute) and links
./build.sh bindings   # after editing bindings.cpp only
```

`build.sh` compiles the engine sources directly (Regina's CMake insists on a
census database and Python). It's single-threaded wasm: the bindings never
pass a progress tracker, which is what would make Regina start threads.
