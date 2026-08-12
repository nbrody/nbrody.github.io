# flashBeam outputs

`results.db` is a SQLite database of every solution the searches have found.
Rows are written by `runner.py` the moment a solution is discovered (so they
survive a stopped or crashed run) and are deduplicated on
`(script, variant, word)`.

Table `solutions`:

| column      | meaning                                                        |
|-------------|----------------------------------------------------------------|
| found_at    | ISO timestamp of discovery                                     |
| script      | which search found it (e.g. `benoist.py`)                      |
| variant     | group configuration, e.g. `t=9` for longReidGroup; else empty  |
| word        | the group word in the search's own letter notation             |
| word_length | number of letters in the word                                  |
| score       | the search's score for the node (lower = better), if available |
| matrix      | the resulting matrix/state, as the search formats it           |
| params      | JSON of the run parameters used (beam width, t, …)             |
| extra       | `target` for PU2-style target hits recorded at end of run      |

Browse it in the web UI (Results button), or directly:

    sqlite3 results.db "SELECT found_at, script, variant, word FROM solutions"
