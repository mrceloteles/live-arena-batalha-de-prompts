---
name: aalpy-state-inference
description: Infer and validate a finite-state model of an authorized black-box application using AALpy. Use for observable workflows such as registration, waiting, rounds, results, resets, and error transitions. Do not use this skill to infer open-ended semantic scoring or to claim identity with private source code.
---

# AALpy State Inference

Use this skill as an independent lane. It may consume an adapter supplied by the project and produces its own DOT model and JSON evidence. It must not depend on Promptfoo or another skill.

## Boundary

- Model only observable states, actions, outputs, timers, and errors.
- Treat free-text score generation as an external output; leave its semantic fidelity to an LLM evaluation lane.
- Interact only through the normal application interface available for the task. Do not bypass access controls, rate limits, or protections.
- Never equate a sampled equivalence oracle with universal proof. State the alphabet, reset mechanism, query budget, seed, and observed scope.

## Required adapter

Use a Python adapter file exporting `create_adapter()`. The returned object must implement:

- `actions() -> list[str]`: finite input alphabet.
- `reset() -> None`: return the system to a reproducible initial state.
- `step(action: str) -> JSON-serializable output`: perform one action and return a normalized observable.
- Optional `close() -> None`.

Normalize volatile values such as timestamps, UUIDs, and request identifiers inside the adapter. Do not erase fields that distinguish meaningful states.

Read [references/adapter-contract.md](references/adapter-contract.md) when creating or reviewing an adapter.

## Workflow

1. Confirm that reset is safe and reproducible.
2. List the finite action alphabet and observable output projection.
3. Validate the adapter directly with at least one reset and every action.
4. Install the pinned dependency from `requirements.txt` in an isolated environment.
5. Run:

   ```bash
   python scripts/infer_mealy.py --adapter path/to/adapter.py --output-dir research/automata/run-name
   ```

6. Inspect `model.dot` and `run.json`. Re-run with a larger query budget only when the previous run found unstable or incomplete transitions.
7. Compare the learned model with explicit human journeys and preserve any counterexample traces.

## Output contract

Report:

- adapter path and target;
- actions and normalized observables;
- AALpy version, seed, query budget, and reset probability;
- learned state count;
- output artifact paths;
- known nondeterminism and uncovered transitions;
- a precise claim of observed conformance, never “100% identical” unless the domain is finite, deterministic, fully bounded, and exhaustively proven.
