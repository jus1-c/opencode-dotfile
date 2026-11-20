#!/usr/bin/env python3
"""Restore the pinned Linux x86-64 RTK release with its published checksum."""

import base64
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VERSION = "1.2.0"
URL = "https://github.com/rtk-ai/rtk/releases/download/v1.2.0/rtk-x86_64-unknown-linux-musl.tar.gz"
SHA256 = "70fee7b4a548c43dde94c77e2335550981b0bc2fb013691d8c8109b5bd0eda37"
PLAN = "bootstrap"


def bootstrap_dir() -> Path:
    path = Path(os.environ.get("OPENCODE_BOOTSTRAP_DIR", "/tmp/opencode"))
    path.mkdir(parents=True, exist_ok=True)
    return path


def install_rtk(target: Path) -> None:
    binary = target / "bin/rtk"
    if binary.is_file():
        print("rtk: existing binary retained")
        return
    if (target / "bin").exists():
        raise FileExistsError("rtk: refusing to replace the existing bin directory")

    with tempfile.TemporaryDirectory(prefix="opencode-bootstrap-", dir=bootstrap_dir()) as temporary:
        stage = Path(temporary)
        manifest = stage / "manifest.json"
        integrity = base64.b64encode(bytes.fromhex(SHA256)).decode()
        env = os.environ | {
            "OPENCODE_UPDATER_TARGET": str(target),
            "OPENCODE_UPDATER_STAGE": str(stage),
            "OPENCODE_UPDATER_MANIFEST": str(manifest),
            "OPENCODE_UPDATER_PLAN_SHA256": PLAN,
            "OPENCODE_UPDATER_LATEST": VERSION,
            "OPENCODE_UPDATER_ARTIFACT_URL": URL,
            "OPENCODE_UPDATER_ARTIFACT_INTEGRITY": "sha256-" + integrity,
        }
        for action in ("update", "healthcheck"):
            subprocess.run([sys.executable, str(target / "component-updater"), action], env=env, check=True)
        plan = json.loads(manifest.read_text())
        if (
            plan.get("schemaVersion") != 2
            or plan.get("planSha256") != PLAN
            or set(plan.get("paths", [])) != {"bin", "server.ts"}
        ):
            raise ValueError("rtk: staged payload does not match the bootstrap plan")
        if (target / "bin").exists():
            raise FileExistsError("rtk: refusing to replace the existing bin directory")
        with tempfile.TemporaryDirectory(prefix=".bootstrap-", dir=target) as local:
            staged_bin = Path(local) / "bin"
            shutil.copytree(stage / "bin", staged_bin)
            if (target / "bin").exists() or (target / "bin").is_symlink():
                raise FileExistsError("rtk: refusing to replace the existing bin directory")
            os.rename(staged_bin, target / "bin")
    print(f"rtk: restored {VERSION}")


def main() -> None:
    if platform.system() != "Linux" or platform.machine() not in ("x86_64", "amd64"):
        raise SystemExit("Install RTK separately on platforms other than Linux x86-64")
    install_rtk(ROOT / "plugins" / "rtk")


if __name__ == "__main__":
    main()
