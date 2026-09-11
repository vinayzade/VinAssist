"""
Runs a local PostgreSQL 16 with pgvector for development, on a fixed port.

Why: the machine's PostgreSQL 15 install has no pgvector build, and the RAG
module needs the `vector` extension. The `pgserver` package (already a dev
dependency) bundles PostgreSQL 16 + pgvector; this script drives its
binaries directly so the port is stable and DATABASE_URL never changes.

    python scripts/dev_db.py            # init if needed, start, print the URL
    python scripts/dev_db.py --stop
    python scripts/dev_db.py --status

Data lives in backend/.pgdata-dev (git-ignored). Default port 54329.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

import pgserver

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / ".pgdata-dev"
LOG_FILE = DATA_DIR / "server.log"
BIN = Path(pgserver.__file__).parent / "pginstall" / "bin"
HOST = "127.0.0.1"
PORT = int(os.environ.get("DEV_DB_PORT", "54329"))
DB_NAME = "smartassist"


def _exe(name: str) -> str:
    path = BIN / (name + (".exe" if os.name == "nt" else ""))
    if not path.exists():
        sys.exit(f"{path} not found; is pgserver installed in this venv?")
    return str(path)


def _run(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(list(args), capture_output=True, text=True, check=check)


def _psql(sql: str, database: str = "postgres") -> str:
    result = _run(_exe("psql"), "-h", HOST, "-p", str(PORT), "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-tAc", sql)
    return result.stdout.strip()


def is_running() -> bool:
    result = _run(_exe("pg_ctl"), "-D", str(DATA_DIR), "status", check=False)
    return result.returncode == 0


def start() -> str:
    if not (DATA_DIR / "PG_VERSION").exists():
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        print("Initialising data directory...")
        _run(_exe("initdb"), "-D", str(DATA_DIR), "-U", "postgres", "--auth=trust", "-E", "UTF8")
    if not is_running():
        print(f"Starting PostgreSQL on {HOST}:{PORT}...")
        # No captured pipes: the postgres child would inherit them and keep
        # this call blocked forever after pg_ctl itself has returned.
        flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        subprocess.run(
            [
                _exe("pg_ctl"), "-D", str(DATA_DIR), "-w", "-o", f'-h "{HOST}" -p {PORT}',
                "-l", str(LOG_FILE), "start",
            ],
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            creationflags=flags, check=True, timeout=60,
        )
        for _ in range(20):
            try:
                _psql("SELECT 1")
                break
            except subprocess.CalledProcessError:
                time.sleep(0.5)
    if _psql(f"SELECT 1 FROM pg_database WHERE datname = '{DB_NAME}'") != "1":
        _psql(f'CREATE DATABASE "{DB_NAME}"')
    _psql("CREATE EXTENSION IF NOT EXISTS vector", database=DB_NAME)
    version = _psql("SHOW server_version")
    url = f"postgresql+asyncpg://postgres:@{HOST}:{PORT}/{DB_NAME}"
    print(f"PostgreSQL {version} with pgvector is running.")
    print(f"DATABASE_URL={url}")
    return url


def stop() -> None:
    if is_running():
        _run(_exe("pg_ctl"), "-D", str(DATA_DIR), "-m", "fast", "stop")
        print("stopped")
    else:
        print("not running")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--stop", action="store_true")
    parser.add_argument("--status", action="store_true")
    args = parser.parse_args()
    if args.stop:
        stop()
    elif args.status:
        print("running" if is_running() else "not running")
    else:
        start()
