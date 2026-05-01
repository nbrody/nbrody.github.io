import Lake
open Lake DSL

package «BorelHarishChandra» where
  -- Update this with `lake update` when you intentionally move Mathlib forward.

require mathlib from git
  "https://github.com/leanprover-community/mathlib4.git" @ "master"

@[default_target]
lean_lib «BorelHarishChandra» where
