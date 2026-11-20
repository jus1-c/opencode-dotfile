#!/usr/bin/env python3
"""Restore the pinned skill payloads without replacing existing installations."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PLAN = "bootstrap"
SCRIPT_SKILLS = {
    "ctf-skills": "20d182d9377f0467830f314bb0f843cae4dbf55e",
    "taste-skill": "f6b76575f949707b4e3c37cd86cb44b0b98643e8",
}
REVERSE_REMOTE = "https://github.com/zhaoxuya520/reverse-skill.git"
REVERSE_COMMIT = "9c28c6ca1062a1a076e28baf40f241dbb4cf5dc2"


def bootstrap_dir() -> Path:
    path = Path(os.environ.get("OPENCODE_BOOTSTRAP_DIR", "/tmp/opencode"))
    path.mkdir(parents=True, exist_ok=True)
    return path


def install_script_skill(target: Path, revision: str) -> None:
    skills = target / "skills"
    if skills.exists():
        print(f"{target.name}: existing skills retained")
        return
    provenance = target / ".component-updater-provenance.json"
    if json.loads(provenance.read_text()).get("commit") != revision:
        raise ValueError(f"{target.name}: installed provenance differs from bootstrap pin")

    with tempfile.TemporaryDirectory(prefix="opencode-bootstrap-", dir=bootstrap_dir()) as temporary:
        stage = Path(temporary)
        manifest = stage / "manifest.json"
        env = os.environ | {
            "OPENCODE_UPDATER_TARGET": str(target),
            "OPENCODE_UPDATER_STAGE": str(stage),
            "OPENCODE_UPDATER_MANIFEST": str(manifest),
            "OPENCODE_UPDATER_PLAN_SHA256": PLAN,
            "OPENCODE_UPDATER_SOURCE_COMMIT": revision,
            "OPENCODE_UPDATER_LATEST": revision,
        }
        adapter = target / "component-updater"
        for action in ("update", "healthcheck"):
            subprocess.run([sys.executable, str(adapter), action], env=env, check=True)

        metadata = json.loads((stage / ".component-updater-provenance.json").read_text())
        plan = json.loads(manifest.read_text())
        if (
            metadata.get("commit") != revision
            or plan.get("schemaVersion") != 2
            or plan.get("planSha256") != PLAN
            or set(plan.get("paths", [])) != {"skills", ".component-updater-provenance.json"}
        ):
            raise ValueError(f"{target.name}: staged payload does not match its pin")
        if skills.exists():
            raise FileExistsError(f"{target.name}: refusing to replace existing skills")
        with tempfile.TemporaryDirectory(prefix=".bootstrap-", dir=target) as local:
            staged_skills = Path(local) / "skills"
            shutil.copytree(stage / "skills", staged_skills)
            if skills.exists() or skills.is_symlink():
                raise FileExistsError(f"{target.name}: refusing to replace existing skills")
            os.rename(staged_skills, skills)
    print(f"{target.name}: restored {revision[:12]}")


def install_git_skill(target: Path, remote: str, revision: str) -> None:
    checkout = target / "repo"
    if checkout.exists():
        if not (checkout / ".git").exists():
            raise ValueError(f"{target.name}: existing checkout is not a Git repository")
        print(f"{target.name}: existing checkout retained")
        return
    with tempfile.TemporaryDirectory(prefix="opencode-bootstrap-", dir=bootstrap_dir()) as temporary:
        staged = Path(temporary) / "repo"
        subprocess.run(["git", "init", "--quiet", str(staged)], check=True)
        subprocess.run(["git", "-C", str(staged), "remote", "add", "origin", remote], check=True)
        subprocess.run(["git", "-C", str(staged), "fetch", "--quiet", "--depth", "1", "origin", revision], check=True)
        subprocess.run(["git", "-C", str(staged), "checkout", "--quiet", "--detach", "FETCH_HEAD"], check=True)
        actual = subprocess.check_output(["git", "-C", str(staged), "rev-parse", "HEAD"], text=True).strip()
        if actual != revision:
            raise ValueError(f"{target.name}: fetched commit differs from bootstrap pin")
        if checkout.exists():
            raise FileExistsError(f"{target.name}: refusing to replace existing checkout")
        with tempfile.TemporaryDirectory(prefix=".bootstrap-", dir=target) as local:
            local_checkout = Path(local) / "repo"
            shutil.copytree(staged, local_checkout, symlinks=True)
            if checkout.exists() or checkout.is_symlink():
                raise FileExistsError(f"{target.name}: refusing to replace existing checkout")
            os.rename(local_checkout, checkout)
    print(f"{target.name}: restored {revision[:12]}")


def main() -> None:
    for name, revision in SCRIPT_SKILLS.items():
        install_script_skill(ROOT / "plugins" / name, revision)
    install_git_skill(ROOT / "plugins" / "reverse-skill", REVERSE_REMOTE, REVERSE_COMMIT)


if __name__ == "__main__":
    main()
