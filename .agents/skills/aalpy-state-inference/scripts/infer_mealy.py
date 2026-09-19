#!/usr/bin/env python3
import argparse
import hashlib
import importlib.metadata
import importlib.util
import json
import random
from pathlib import Path

from aalpy.base import SUL
from aalpy.learning_algs import run_Lstar
from aalpy.oracles import RandomWalkEqOracle
from aalpy.utils import save_automaton_to_file


def load_adapter(path):
    resolved = Path(path).resolve()
    spec = importlib.util.spec_from_file_location("aalpy_target_adapter", resolved)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load adapter: {resolved}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    factory = getattr(module, "create_adapter", None)
    if not callable(factory):
        raise TypeError("Adapter module must export create_adapter()")
    return resolved, factory()


def stable_output(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


class AdapterSUL(SUL):
    def __init__(self, adapter):
        super().__init__()
        self.adapter = adapter

    def pre(self):
        self.adapter.reset()

    def post(self):
        return None

    def step(self, letter):
        if letter is None:
            return stable_output({"status": "initial"})
        return stable_output(self.adapter.step(letter))


def main():
    parser = argparse.ArgumentParser(description="Infer a Mealy machine from a black-box adapter.")
    parser.add_argument("--adapter", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--steps", type=int, default=5000)
    parser.add_argument("--reset-probability", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=20260904)
    args = parser.parse_args()

    if args.steps < 1:
        parser.error("--steps must be positive")
    if not 0 < args.reset_probability <= 1:
        parser.error("--reset-probability must be in (0, 1]")

    random.seed(args.seed)
    adapter_path, adapter = load_adapter(args.adapter)
    actions = list(adapter.actions())
    if not actions or len(actions) != len(set(actions)) or not all(isinstance(x, str) and x for x in actions):
        raise ValueError("actions() must return unique non-empty strings")

    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    sul = AdapterSUL(adapter)
    oracle = RandomWalkEqOracle(
        actions,
        sul,
        num_steps=args.steps,
        reset_prob=args.reset_probability,
        reset_after_cex=True,
    )

    try:
        model = run_Lstar(
            actions,
            sul,
            oracle,
            automaton_type="mealy",
            cache_and_non_det_check=True,
            print_level=2,
        )
        save_automaton_to_file(model, str(output_dir / "model"), file_type="dot")
        metadata = {
            "adapter": str(adapter_path),
            "adapter_sha256": hashlib.sha256(adapter_path.read_bytes()).hexdigest(),
            "actions": actions,
            "aalpy_version": importlib.metadata.version("aalpy"),
            "seed": args.seed,
            "query_budget_steps": args.steps,
            "reset_probability": args.reset_probability,
            "state_count": len(model.states),
            "claim": "sampled black-box state-model inference; not universal source-code equivalence",
        }
        (output_dir / "run.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    finally:
        close = getattr(adapter, "close", None)
        if callable(close):
            close()


if __name__ == "__main__":
    main()
