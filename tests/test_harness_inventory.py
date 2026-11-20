import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MCP_NAMES = {
    "agent-browser",
    "anysearch",
    "codegraph",
    "context7",
    "disk-forensics",
    "forensics-utils",
    "frida-game-hacking",
    "ghidra-mcp",
    "github",
    "log-analyzer",
    "markitdown",
    "mem-forensics",
    "network-forensics",
    "windows-forensics",
}
SERVER_PLUGINS = {
    "quota",
    "caveman",
    "goal",
    "ponytail",
    "superpowers",
    "rtk",
    "opencode-dir",
    "opencode-mcp-manager",
    "opencode-pty",
    "vilao-provider",
    "llmgate-provider",
    "prompt-attachment-guard",
}
CLI_PLUGINS = {
    "quota",
    "goal",
    "opencode-mcp-manager",
    "vilao-provider",
    "opencode-component-updater",
    "opencode-mini-session",
}


def read_json(path):
    return json.loads((ROOT / path).read_text())


def plugin_names(entries):
    names = set()
    for entry in entries:
        spec = entry["package"] if isinstance(entry, dict) else entry
        if not spec.startswith("./plugins/"):
            raise AssertionError(f"plugin is not a portable local directory: {spec}")
        path = ROOT / spec
        if not path.is_dir():
            raise AssertionError(f"plugin directory is missing: {spec}")
        names.add(path.name)
    return names


class HarnessInventoryTests(unittest.TestCase):
    def test_native_v2_mcp_inventory(self):
        config = read_json("opencode.json")
        servers = config["mcp"]["servers"]
        self.assertEqual(set(servers), MCP_NAMES)
        self.assertTrue(servers["frida-game-hacking"]["disabled"])
        self.assertFalse(servers["codegraph"]["codemode"])
        self.assertEqual(servers["github"]["oauth"], False)
        for name, server in servers.items():
            with self.subTest(name=name):
                self.assertNotIn("enabled", server)
                if "timeout" in server:
                    self.assertIsInstance(server["timeout"], dict)

    def test_native_v2_plugin_inventories(self):
        self.assertEqual(plugin_names(read_json("opencode.json")["plugins"]), SERVER_PLUGINS)
        self.assertEqual(plugin_names(read_json("cli.json")["plugins"]), CLI_PLUGINS)

    def test_server_plugin_entrypoints_exist_before_install(self):
        for name in SERVER_PLUGINS:
            with self.subTest(name=name):
                plugin = ROOT / "plugins" / name
                package_file = plugin / "package.json"
                package = json.loads(package_file.read_text()) if package_file.is_file() else {}
                exports = package.get("exports", {})
                entry = exports.get("./server", exports.get(".")) if isinstance(exports, dict) else exports
                if isinstance(entry, dict):
                    entry = entry.get("import", entry.get("default"))
                if entry:
                    self.assertTrue((plugin / entry).is_file(), f"{name}: missing {entry}")
                else:
                    self.assertTrue(
                        any((plugin / f"server.{extension}").is_file() for extension in ("js", "ts", "tsx")),
                        f"{name}: no V2 server entrypoint",
                    )

    def test_installed_components_are_in_updater_inventory(self):
        manifest = read_json("component-updater/components.json.tmpl")["components"]
        expected = {f"mcp.{name}" for name in MCP_NAMES}
        expected |= {f"plugin.{name}" for name in SERVER_PLUGINS | CLI_PLUGINS}
        expected |= {"plugin.ctf-skills", "plugin.reverse-skill", "plugin.taste-skill"}
        self.assertEqual(set(manifest), expected)

    def test_user_skill_and_external_skill_have_portable_sources(self):
        for name in ("ctf-writeup-blog-publish", "cli-anything-drawio"):
            with self.subTest(name=name):
                self.assertTrue((ROOT / "skills" / name / "SKILL.md").is_file())
        config = read_json("opencode.json")
        scoped = read_json("plugins/ctf-skills/ctf-skills.json")
        self.assertNotIn("{env:HOME}/.config/opencode/plugins/ctf-skills/skills", config["skills"])
        self.assertIn("{env:HOME}/.config/opencode/plugins/ctf-skills/skills", scoped["skills"])
        self.assertIn("{env:HOME}/.config/opencode/plugins/reverse-skill/skills", config["skills"])
        self.assertIn("{env:HOME}/.config/opencode/plugins/taste-skill/skills", config["skills"])

    def test_skill_bootstrap_pins_configured_skill_providers(self):
        bootstrap = (ROOT / "scripts/bootstrap-skills.py").read_text()
        provenance = json.loads((ROOT / "plugins/taste-skill/.component-updater-provenance.json").read_text())
        self.assertIn("taste-skill", bootstrap)
        self.assertIn(provenance["commit"], bootstrap)

    def test_old_components_are_removed(self):
        for name in (
            "mcps/cloakbrowser",
            "mcps/headroom-ctl",
            "plugins/headroom",
            "plugins/headroom-ctl",
            "plugins/opencode-md-table-formatter",
            "skills/windows-disk-forensics",
        ):
            with self.subTest(name=name):
                self.assertFalse((ROOT / name).exists())

    def test_machine_secrets_are_ignored(self):
        ignore = (ROOT / ".gitignore").read_text()
        self.assertIn("secrets.env", ignore)
        self.assertIn("secrets/", ignore)
        self.assertIn("opencode-secrets.env", (ROOT / "install.sh").read_text())

    def test_env_example_declares_all_configured_environment_secrets(self):
        config = read_json("opencode.json")
        env_names = set()
        for provider in config["providers"].values():
            settings = provider.get("settings", {})
            for value in settings.values():
                if isinstance(value, str) and value.startswith("{env:"):
                    env_names.add(value[5:-1])
        env_example = (ROOT / ".env.example").read_text()
        for name in env_names:
            with self.subTest(name=name):
                self.assertRegex(env_example, rf"(?m)^export {name}=", msg=f"missing {name}")

    def test_env_example_declares_mcp_environment_secrets(self):
        config = read_json("opencode.json")
        env_names = set()
        for server in config["mcp"]["servers"].values():
            for name in re.findall(r"\{env:([^}]+)\}", json.dumps(server)):
                if name != "HOME":
                    env_names.add(name)
        env_example = (ROOT / ".env.example").read_text()
        for name in env_names:
            with self.subTest(name=name):
                self.assertRegex(env_example, rf"(?m)^#? ?export {name}=", msg=f"missing {name}")

    def test_component_updaters_do_not_pin_machine_python_paths(self):
        for script in (ROOT / "mcps").glob("*/component-updater"):
            with self.subTest(script=script.relative_to(ROOT)):
                self.assertFalse("/usr/sbin/python3." in script.read_text(), str(script))

    def test_component_updaters_do_not_pin_machine_source_paths(self):
        for script in (ROOT / "plugins").glob("*/component-updater"):
            with self.subTest(script=script.relative_to(ROOT)):
                self.assertNotIn("Documents/Opencode/opencode-mcp-manager", script.read_text())

    def test_mcp_manager_payload_has_no_debug_logging(self):
        for path in (ROOT / "plugins/opencode-mcp-manager/dist").glob("*.js"):
            with self.subTest(path=path.name):
                text = path.read_text()
                self.assertNotIn("/tmp/rpc.log", text)
                self.assertNotIn("APPLYDEBUG", text)

    def test_mcp_manager_updater_has_no_gh_cli_dependency(self):
        updater = (ROOT / "plugins/opencode-mcp-manager/component-updater").read_text()
        self.assertNotIn('run("gh",', updater)
        self.assertIn("api.github.com", updater)

    def test_rtk_hook_has_no_shared_debug_log(self):
        self.assertNotIn("/tmp/rtk-hook.log", (ROOT / "plugins/rtk/server.ts").read_text())

    def test_secret_scan_allows_only_known_upstream_path_examples(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "scripts").mkdir()
            shutil.copy2(ROOT / "scripts/verify-no-secrets.sh", root / "scripts")
            example = root / "plugins/quota/dist/lib/home-dir-display.js"
            example.parent.mkdir(parents=True)
            example.write_text(" * (C:\\Users\\Alice) is an example\n")
            command = ["bash", str(root / "scripts/verify-no-secrets.sh")]
            result = subprocess.run(command, cwd=root, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            (root / "private.txt").write_text("C:\\Users\\PrivateUser\\file\n")
            result = subprocess.run(command, cwd=root, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
