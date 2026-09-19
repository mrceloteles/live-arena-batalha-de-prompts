import json
import subprocess
from pathlib import Path


class LocalClassicAdapter:
    def __init__(self):
        bridge = Path(__file__).with_name("bridge.mjs")
        self.process = subprocess.Popen(
            ["node", str(bridge)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

    def _request(self, payload):
        self.process.stdin.write(json.dumps(payload) + "\n")
        self.process.stdin.flush()
        line = self.process.stdout.readline()
        if not line:
            error = self.process.stderr.read()
            raise RuntimeError(f"bridge stopped: {error}")
        return json.loads(line)

    def actions(self):
        return self._request({"command": "actions"})

    def reset(self):
        return self._request({"command": "reset"})

    def step(self, action):
        return self._request({"command": "step", "action": action})

    def close(self):
        if self.process.poll() is None:
            self.process.terminate()
            self.process.wait(timeout=5)


def create_adapter():
    return LocalClassicAdapter()
