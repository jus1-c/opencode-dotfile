import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class InstallerTests(unittest.TestCase):
    def make_fixture(self, root):
        repo = root / "repo"
        repo.mkdir()
        for name in ("install.sh", "opencode.json", "cli.json", ".env.example"):
            shutil.copy2(ROOT / name, repo / name)
        manifest = repo / "component-updater"
        manifest.mkdir()
        shutil.copy2(ROOT / "component-updater/components.json.tmpl", manifest)
        for name in (
            "goal", "opencode-dir", "opencode-md-table-formatter", "opencode-pty",
            "ponytail", "llmgate-provider", "quota", "opencode-mini-session",
            "opencode-mcp-manager", "vilao-provider", "opencode-component-updater",
        ):
            (repo / "plugins" / name).mkdir(parents=True)
        for name in ("cloakbrowser", "agent-browser"):
            (repo / "mcps" / name / "runtime").mkdir(parents=True)
        (repo / "scripts").mkdir()
        for name in ("bootstrap-skills.py", "bootstrap-rtk.py"):
            (repo / "scripts" / name).write_text("print('mock bootstrap')\n")
        fake = root / "bin"
        fake.mkdir()
        stub = (
            "#!/bin/sh\n"
            "case \"$(basename \"$0\")\" in\n"
            "  uv) [ \"$1 $2\" != 'tool list' ] || echo 'headroom-ai 1.0' ;;\n"
            "  go) while [ \"$#\" -gt 0 ]; do "
            "if [ \"$1\" = '-o' ]; then shift; : > \"$1\"; break; fi; shift; done ;;\n"
            "esac\n"
            "exit 0\n"
        )
        for name in ("git", "node", "npm", "uv", "rg", "go", "bun", "opencode"):
            command = fake / name
            command.write_text(stub)
            command.chmod(0o755)
        return repo, fake

    def test_frida_overlay_does_not_modify_tracked_config(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo, fake = self.make_fixture(root)
            home = root / "home"
            home.mkdir()
            before = (repo / "opencode.json").read_bytes()
            env = os.environ | {
                "HOME": str(home),
                "PATH": f"{fake}:/usr/bin:/bin",
                "SKIP": "ghidra-mcp",
                "FRIDA_PYTHON": "/example/python.exe",
            }
            env.pop("XDG_CONFIG_HOME", None)
            result = subprocess.run(
                ["/bin/bash", str(repo / "install.sh")], cwd=repo, env=env,
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual((repo / "opencode.json").read_bytes(), before)
            overlay = json.loads((repo / "opencode.jsonc").read_text())
            self.assertFalse(overlay["mcp"]["servers"]["frida-game-hacking"]["disabled"])
            self.assertTrue((home / ".config/opencode").is_symlink())
            self.assertFalse((repo / "secrets.env").exists())
            self.assertTrue((home / ".config/opencode-secrets.env").is_file())
            self.assertEqual((home / ".config/opencode-secrets.env").stat().st_mode & 0o777, 0o600)
            updater_config = repo / "component-updater/components.json"
            self.assertTrue(updater_config.is_symlink())
            self.assertEqual(
                updater_config.resolve(),
                home / ".config/opencode-component-updater/components.json",
            )

    def test_xdg_config_home_controls_installed_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo, fake = self.make_fixture(root)
            home = root / "home"
            xdg = root / "xdg"
            home.mkdir()
            env = os.environ | {
                "HOME": str(home),
                "PATH": f"{fake}:/usr/bin:/bin",
                "XDG_CONFIG_HOME": str(xdg),
                "SKIP": "ghidra-mcp",
            }
            env.pop("OPENCODE_CONFIG_DIR", None)
            result = subprocess.run(
                ["/bin/bash", str(repo / "install.sh")], cwd=repo, env=env,
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual((xdg / "opencode").resolve(), repo)
            self.assertTrue((xdg / "opencode-secrets.env").is_file())
            self.assertTrue((repo / "component-updater/components.json").is_symlink())
            self.assertTrue((xdg / "opencode-component-updater/components.json").is_file())
            overlay = json.loads((repo / "opencode.jsonc").read_text())
            self.assertIn(str(xdg / "opencode"), overlay["mcp"]["servers"]["log-analyzer"]["command"][0])
            self.assertNotIn("{env:HOME}/.config/opencode", json.dumps(overlay))
            self.assertIn("./plugins/quota", overlay["plugins"])

    def test_existing_updater_config_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo, fake = self.make_fixture(root)
            home = root / "home"
            config_home = home / ".config"
            updater = config_home / "opencode-component-updater"
            updater.mkdir(parents=True)
            config = updater / "components.json"
            original = {"schemaVersion": 2, "components": {"plugin.custom": {"enabled": False}}}
            config.write_text(json.dumps(original))
            home.mkdir(exist_ok=True)
            env = os.environ | {
                "HOME": str(home),
                "PATH": f"{fake}:/usr/bin:/bin",
                "SKIP": "ghidra-mcp",
            }
            result = subprocess.run(
                ["/bin/bash", str(repo / "install.sh")], cwd=repo, env=env,
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(json.loads(config.read_text()), original)

    def test_legacy_updater_config_is_migrated_without_overwriting(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo, fake = self.make_fixture(root)
            old = repo / "component-updater/components.json"
            original = '{"schemaVersion":2,"components":{"plugin.custom":{"enabled":false}}}\n'
            old.write_text(original)
            home = root / "home"
            home.mkdir()
            env = {"HOME": str(home), "PATH": f"{fake}:/usr/bin:/bin", "SKIP": "ghidra-mcp"}
            result = subprocess.run(["/bin/bash", str(repo / "install.sh")], cwd=repo, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(old.read_text(), original)
            self.assertEqual((home / ".config/opencode-component-updater/components.json").read_text(), original)

    def test_legacy_secrets_are_protected_and_copied(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo, fake = self.make_fixture(root)
            old = repo / "secrets.env"
            old.write_text("export TOKEN=legacy\n")
            old.chmod(0o644)
            home = root / "home"
            home.mkdir()
            env = {"HOME": str(home), "PATH": f"{fake}:/usr/bin:/bin", "SKIP": "ghidra-mcp"}
            result = subprocess.run(["/bin/bash", str(repo / "install.sh")], cwd=repo, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(old.stat().st_mode & 0o777, 0o600)
            self.assertEqual((home / ".config/opencode-secrets.env").read_text(), old.read_text())

    def test_existing_secrets_file_is_restricted_on_reinstall(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo, fake = self.make_fixture(root)
            home = root / "home"
            secrets = home / ".config/opencode-secrets.env"
            secrets.parent.mkdir(parents=True)
            secrets.write_text("export TOKEN=secret\n")
            secrets.chmod(0o644)
            env = os.environ | {"HOME": str(home), "PATH": f"{fake}:/usr/bin:/bin", "SKIP": "ghidra-mcp"}
            result = subprocess.run(["/bin/bash", str(repo / "install.sh")], cwd=repo, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(secrets.stat().st_mode & 0o777, 0o600)

    def test_secrets_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo, fake = self.make_fixture(root)
            home = root / "home"
            home.mkdir()
            secrets = home / ".config/opencode-secrets.env"
            secrets.parent.mkdir(parents=True)
            secrets.symlink_to(root / "missing-secrets")
            env = os.environ | {"HOME": str(home), "PATH": f"{fake}:/usr/bin:/bin", "SKIP": "ghidra-mcp"}
            result = subprocess.run(["/bin/bash", str(repo / "install.sh")], cwd=repo, env=env, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertTrue(secrets.is_symlink())

    def test_regular_repo_updater_config_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo, fake = self.make_fixture(root)
            repo_config = repo / "component-updater/components.json"
            original = '{"schemaVersion": 2, "components": {"plugin.custom": {}}}\n'
            repo_config.write_text(original)
            home = root / "home"
            home.mkdir()
            env = os.environ | {
                "HOME": str(home),
                "PATH": f"{fake}:/usr/bin:/bin",
                "SKIP": "ghidra-mcp",
            }
            result = subprocess.run(
                ["/bin/bash", str(repo / "install.sh")], cwd=repo, env=env,
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(repo_config.read_text(), original)
            self.assertEqual((home / ".config/opencode-component-updater/components.json").read_text(), original)

    def test_existing_venv_is_synced_instead_of_retained_unchecked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo, fake = self.make_fixture(root)
            mcp = repo / "mcps/example"
            mcp.mkdir(parents=True)
            (mcp / "requirements.lock").write_text("# test lock\n")
            (mcp / "component-updater").write_text('PYTHON = "python3"\n')
            venv_python = mcp / ".venv/bin/python"
            venv_python.parent.mkdir(parents=True)
            venv_python.write_text("#!/bin/sh\n")
            venv_python.chmod(0o755)
            uv_log = root / "uv.log"
            (fake / "uv").write_text(
                "#!/bin/sh\n"
                "if [ \"$1 $2\" = 'pip sync' ]; then echo synced >> \"$UV_LOG\"; fi\n"
                "exit 0\n"
            )
            (fake / "uv").chmod(0o755)
            home = root / "home"
            home.mkdir()
            env = os.environ | {
                "HOME": str(home),
                "PATH": f"{fake}:/usr/bin:/bin",
                "SKIP": "ghidra-mcp",
                "UV_LOG": str(uv_log),
            }
            result = subprocess.run(
                ["/bin/bash", str(repo / "install.sh")], cwd=repo, env=env,
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(uv_log.read_text().splitlines(), ["synced"])

    def test_updater_config_path_is_exported_for_installed_binary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo, fake = self.make_fixture(root)
            home = root / "home"
            home.mkdir()
            env = os.environ | {"HOME": str(home), "PATH": f"{fake}:/usr/bin:/bin"}
            env["SKIP"] = "ghidra-mcp"
            result = subprocess.run(
                ["/bin/bash", str(repo / "install.sh")], cwd=repo, env=env,
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            updater_config = repo / "component-updater/components.json"
            self.assertTrue(updater_config.is_symlink())
            self.assertTrue((home / ".config/opencode-component-updater/components.json").is_file())

    def test_missing_prerequisite_leaves_existing_config_untouched(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo, _ = self.make_fixture(root)
            home = root / "home"
            config = home / ".config/opencode"
            config.mkdir(parents=True)
            (config / "keep").write_text("user data")
            fake = root / "missing-bin"
            fake.mkdir()
            (fake / "dirname").symlink_to(shutil.which("dirname"))
            env = {"HOME": str(home), "PATH": str(fake)}
            result = subprocess.run(
                ["/bin/bash", str(repo / "install.sh")], cwd=repo, env=env,
                capture_output=True, text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual((config / "keep").read_text(), "user data")
            self.assertFalse(config.is_symlink())

    def test_existing_config_is_not_moved_or_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo, fake = self.make_fixture(root)
            home = root / "home"
            config = home / ".config/opencode"
            config.mkdir(parents=True)
            (config / "keep").write_text("user data")
            result = subprocess.run(
                ["/bin/bash", str(repo / "install.sh")], cwd=repo,
                env={"HOME": str(home), "PATH": f"{fake}:/usr/bin:/bin"},
                capture_output=True, text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual((config / "keep").read_text(), "user data")
            self.assertFalse(list(config.parent.glob("opencode.bak-*")))


if __name__ == "__main__":
    unittest.main()
