#!/usr/bin/env python3
"""Launch the app. Auto-creates venv and installs deps on first run.

Usage:
    python run.py          # Real Claude mode (requires Claude Max subscription)
    python run.py --mock   # Mock mode (no Claude needed)
"""

import os
import shutil
import signal
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
VENV = os.path.join(ROOT, ".venv")
PY = os.path.join(VENV, "Scripts" if sys.platform == "win32" else "bin", "python")
FRONTEND = os.path.join(ROOT, "frontend")


def log(msg):
    print(f"  {msg}")


def setup():
    if sys.version_info < (3, 11):
        sys.exit(f"  Python 3.11+ required (got {'.'.join(map(str, sys.version_info[:3]))})")
    if not shutil.which("npm"):
        sys.exit("  npm not found — install Node.js first: https://nodejs.org")

    if not os.path.exists(PY):
        log("Creating .venv...")
        subprocess.check_call([sys.executable, "-m", "venv", VENV])

    log("Checking Python deps...")
    subprocess.check_call(
        [PY, "-m", "pip", "install", "-q", "-r", "backend/requirements.txt"],
        cwd=ROOT, stdout=subprocess.DEVNULL,
    )

    if not os.path.exists(os.path.join(FRONTEND, "node_modules")):
        log("Installing frontend deps...")
        subprocess.check_call(["npm", "install"], cwd=FRONTEND)


def main():
    mock = "--mock" in sys.argv
    print()
    setup()

    procs = []
    if mock:
        procs.append(subprocess.Popen(
            [PY, "-m", "e2e.fixtures.mock_server", "--port", "4910"], cwd=ROOT,
        ))
    else:
        procs.append(subprocess.Popen([PY, "-m", "backend.server"], cwd=ROOT))

    procs.append(subprocess.Popen(
        ["npm", "run", "dev", "--", "--port", "4920"], cwd=FRONTEND,
    ))

    print()
    log(f"Mode:     {'mock' if mock else 'claude'}")
    log("Backend:  http://localhost:4910")
    log("Frontend: http://localhost:4920")
    print()

    def stop(*_):
        for p in procs:
            p.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)

    while all(p.poll() is None for p in procs):
        time.sleep(0.5)
    stop()


if __name__ == "__main__":
    main()
