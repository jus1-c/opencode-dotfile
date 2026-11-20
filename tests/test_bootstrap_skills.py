import importlib.util
import json
import subprocess
import tempfile
import unittest
from unittest import mock
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BOOTSTRAP = ROOT / "scripts/bootstrap-skills.py"


def load_bootstrap():
    spec = importlib.util.spec_from_file_location("bootstrap_skills", BOOTSTRAP)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class BootstrapSkillsTests(unittest.TestCase):
    def test_copy_failure_does_not_leave_installed_skills(self):
        module = load_bootstrap()
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            revision = "a" * 40
            (target / ".component-updater-provenance.json").write_text(json.dumps({"commit": revision}))
            (target / "component-updater").write_text(
                "import json, os, pathlib, sys\n"
                "stage=pathlib.Path(os.environ['OPENCODE_UPDATER_STAGE'])\n"
                "if sys.argv[1]=='update':\n"
                " (stage/'skills').mkdir()\n"
                " (stage/'.component-updater-provenance.json').write_text(json.dumps({'commit':os.environ['OPENCODE_UPDATER_SOURCE_COMMIT']}))\n"
                " pathlib.Path(os.environ['OPENCODE_UPDATER_MANIFEST']).write_text(json.dumps({'schemaVersion':2,'planSha256':'bootstrap','paths':['skills','.component-updater-provenance.json']}))\n"
            )
            def fail_copy(source, destination, **kwargs):
                Path(destination).mkdir()
                raise OSError("simulated copy failure")
            with mock.patch.object(module.shutil, "copytree", side_effect=fail_copy):
                with self.assertRaises(OSError):
                    module.install_script_skill(target, revision)
            self.assertFalse((target / "skills").exists())

    def test_bootstrap_includes_taste_skill_payload(self):
        module = load_bootstrap()
        self.assertIn("taste-skill", module.SCRIPT_SKILLS)

    def test_bootstrap_script_exists(self):
        self.assertTrue(BOOTSTRAP.is_file())

    def test_script_payload_is_staged_and_existing_files_are_preserved(self):
        if not BOOTSTRAP.exists():
            self.skipTest("bootstrap script not written yet")
        module = load_bootstrap()
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            revision = "a" * 40
            (target / ".component-updater-provenance.json").write_text(
                json.dumps({"commit": revision})
            )
            (target / "component-updater").write_text(
                "import json, os, pathlib, sys\n"
                "stage = pathlib.Path(os.environ['OPENCODE_UPDATER_STAGE'])\n"
                "if sys.argv[1] == 'update':\n"
                "    (stage / 'skills').mkdir()\n"
                "    (stage / 'skills' / 'SKILL.md').write_text('installed')\n"
                "    (stage / '.component-updater-provenance.json').write_text("
                "json.dumps({'commit': os.environ['OPENCODE_UPDATER_SOURCE_COMMIT']}))\n"
                "    pathlib.Path(os.environ['OPENCODE_UPDATER_MANIFEST']).write_text(json.dumps("
                "{'schemaVersion': 2, 'planSha256': os.environ['OPENCODE_UPDATER_PLAN_SHA256'], "
                "'paths': ['skills', '.component-updater-provenance.json']}))\n"
                "elif sys.argv[1] == 'healthcheck':\n"
                "    assert (stage / 'skills' / 'SKILL.md').read_text() == 'installed'\n"
            )
            module.install_script_skill(target, revision)
            skill = target / "skills/SKILL.md"
            self.assertEqual(skill.read_text(), "installed")
            skill.write_text("user data")
            module.install_script_skill(target, revision)
            self.assertEqual(skill.read_text(), "user data")

    def test_script_payload_crosses_filesystems_without_partial_install(self):
        module = load_bootstrap()
        with tempfile.TemporaryDirectory(dir="/tmp/opencode") as source_directory, tempfile.TemporaryDirectory(dir=ROOT) as target_directory:
            target = Path(target_directory)
            revision = "c" * 40
            (target / ".component-updater-provenance.json").write_text(json.dumps({"commit": revision}))
            (target / "component-updater").write_text(
                "import json, os, pathlib, sys\n"
                "stage = pathlib.Path(os.environ['OPENCODE_UPDATER_STAGE'])\n"
                "if sys.argv[1] == 'update':\n"
                "    (stage / 'skills').mkdir()\n"
                "    (stage / 'skills/SKILL.md').write_text('cross-device')\n"
                "    (stage / '.component-updater-provenance.json').write_text(json.dumps({'commit': os.environ['OPENCODE_UPDATER_SOURCE_COMMIT']}))\n"
                "    pathlib.Path(os.environ['OPENCODE_UPDATER_MANIFEST']).write_text(json.dumps({'schemaVersion': 2, 'planSha256': os.environ['OPENCODE_UPDATER_PLAN_SHA256'], 'paths': ['skills', '.component-updater-provenance.json']}))\n"
                "elif sys.argv[1] == 'healthcheck': pass\n"
            )
            module.install_script_skill(target, revision)
            self.assertEqual((target / "skills/SKILL.md").read_text(), "cross-device")

    def test_failed_script_leaves_no_partial_payload(self):
        if not BOOTSTRAP.exists():
            self.skipTest("bootstrap script not written yet")
        module = load_bootstrap()
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            revision = "b" * 40
            provenance = target / ".component-updater-provenance.json"
            provenance.write_text(json.dumps({"commit": revision}))
            (target / "component-updater").write_text("raise SystemExit(7)\n")
            with self.assertRaises(subprocess.CalledProcessError):
                module.install_script_skill(target, revision)
            self.assertFalse((target / "skills").exists())
            self.assertEqual(json.loads(provenance.read_text())["commit"], revision)

    def test_git_skill_uses_exact_commit_and_preserves_checkout(self):
        if not BOOTSTRAP.exists():
            self.skipTest("bootstrap script not written yet")
        module = load_bootstrap()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            source.mkdir()
            subprocess.run(["git", "init", "--quiet", str(source)], check=True)
            subprocess.run(["git", "-C", str(source), "config", "user.name", "Test"], check=True)
            subprocess.run(["git", "-C", str(source), "config", "user.email", "test@example.invalid"], check=True)
            (source / "SKILL.md").write_text("pinned")
            subprocess.run(["git", "-C", str(source), "add", "SKILL.md"], check=True)
            subprocess.run(["git", "-C", str(source), "commit", "--quiet", "-m", "skill"], check=True)
            revision = subprocess.check_output(
                ["git", "-C", str(source), "rev-parse", "HEAD"], text=True
            ).strip()
            target = root / "target"
            target.mkdir()
            module.install_git_skill(target, str(source), revision)
            self.assertEqual((target / "repo/SKILL.md").read_text(), "pinned")
            (target / "repo/local.txt").write_text("user data")
            module.install_git_skill(target, str(source), revision)
            self.assertEqual((target / "repo/local.txt").read_text(), "user data")


if __name__ == "__main__":
    unittest.main()
