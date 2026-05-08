import Lake
open Lake DSL

package «LeanProjects» where
  -- Update this with `lake update` when intentionally moving Mathlib forward.

require mathlib from git
  "https://github.com/leanprover-community/mathlib4.git" @ "master"

@[default_target]
lean_lib «BorelHarishChandra» where
  srcDir := "BHC"

@[default_target]
lean_lib «Golg» where
  srcDir := "Golg"
