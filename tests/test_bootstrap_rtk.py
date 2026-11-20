import importlib.util
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BOOTSTRAP = ROOT / "scripts/bootstrap-rtk.py"


class BootstrapRtkTests(unittest.TestCase):
    def test_rtk_installer_exists(self):
        self.assertTrue(BOOTSTRAP.is_file())

    def test_stages_binary_and_preserves_existing_binary(self):
        if not BOOTSTRAP.exists():
            self.skipTest("RTK bootstrap not written yet")
        spec = importlib.util.spec_from_file_location("bootstrap_rtk", BOOTSTRAP)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory)
            (target / "component-updater").write_text(
                "import json, os, pathlib, sys\n"
                "stage = pathlib.Path(os.environ['OPENCODE_UPDATER_STAGE'])\n"
                "if sys.argv[1] == 'update':\n"
                "    (stage / 'bin').mkdir()\n"
                "    (stage / 'bin/rtk').write_text('installed')\n"
                "    pathlib.Path(os.environ['OPENCODE_UPDATER_MANIFEST']).write_text(json.dumps("
                "{'schemaVersion': 2, 'planSha256': os.environ['OPENCODE_UPDATER_PLAN_SHA256'], "
                "'paths': ['bin', 'server.ts']}))\n"
                "elif sys.argv[1] == 'healthcheck':\n"
                "    assert (stage / 'bin/rtk').read_text() == 'installed'\n"
            )
            module.install_rtk(target)
            binary = target / "bin/rtk"
            self.assertEqual(binary.read_text(), "installed")
            binary.write_text("user data")
            module.install_rtk(target)
            self.assertEqual(binary.read_text(), "user data")


if __name__ == "__main__":
    unittest.main()
