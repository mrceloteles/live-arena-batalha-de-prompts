# Adapter contract

The adapter is the only target-specific component.

```python
class Adapter:
    def actions(self):
        return ["register", "start", "submit", "advance", "reset"]

    def reset(self):
        # Establish a clean, reproducible room using a permitted interface.
        ...

    def step(self, action):
        # Execute one action and return a normalized JSON-compatible observable.
        ...

    def close(self):
        ...

def create_adapter():
    return Adapter()
```

## Normalization rules

- Convert objects to stable dictionaries with sorted keys.
- Replace only volatile identifiers with stable placeholders.
- Bucket continuous time only when exact time is not part of the state contract.
- Preserve status codes, phases, round numbers, registration counts, score readiness, winner readiness, and reset behavior.
- Return a distinct observable for rejected or timed-out actions.

The `reset()` operation must not be included in `actions()`; AALpy invokes it between queries through the SUL lifecycle.

