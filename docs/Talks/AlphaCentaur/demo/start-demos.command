#!/bin/zsh
# Starts the live demos for the AlphaCentaur talk: each Alpha editor on its own,
# on a fixed port, opened on the matching folder here. The talk's slides embed
# them (http://127.0.0.1:<port>/). Double-click, or run in a terminal; close
# the window (or press Ctrl-C) to stop them all.
#
#   AlphaTeX       8795  paper/
#   AlphaMarkdown  8833  notes/
#   AlphaNote      8834  ink/
#   AlphaPy        8835  notebooks/
#   AlphaLibrary   8836  library/
#   AlphaPresent   8786  (the slide editor; decks live in the browser)
#
# Needs alphaCentaur at ~/Dropbox/Code/private/alphaCentaur (or set
# ALPHACENTAUR_DIR), Node 20+, TeX Live with latexmk and synctex, and
# alphaCentaur's .venv for AlphaPy.
demo="${0:A:h}"
app="${ALPHACENTAUR_DIR:-$HOME/Dropbox/Code/private/alphaCentaur}"
# Let the talk show the editors in frames (they refuse every other site).
export ALPHA_FRAME_ANCESTORS="https://nbrody.github.io http://localhost:* http://127.0.0.1:*"

pids=()
start() {  # name port command…
  local name=$1 port=$2; shift 2
  if lsof -nP -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then
    print "  $name: port $port is already in use; stop that first (the slide expects this port)."
    return
  fi
  ( cd "$app" && exec "$@" ) >"/tmp/alpha-demo-$port.log" 2>&1 &
  pids+=($!)
  print "  $name  http://127.0.0.1:$port/"
}

print "Starting the AlphaCentaur demos…"
start AlphaTeX      8795 node latex/server.mjs "$demo/paper" --port 8795
start AlphaMarkdown 8833 node markdown/server.mjs "$demo/notes" --port 8833
start AlphaNote     8834 node ink/server.mjs "$demo/ink" --port 8834
start AlphaPy       8835 node python/server.mjs "$demo/notebooks" --port 8835
start AlphaLibrary  8836 node library/server.mjs "$demo/library" --port 8836
start AlphaPresent  8786 python3 presentations/serve.py 8786
print "Logs: /tmp/alpha-demo-<port>.log. Ctrl-C or close this window to stop."

trap 'print "\nStopping…"; kill $pids 2>/dev/null; exit 0' INT TERM HUP
wait
