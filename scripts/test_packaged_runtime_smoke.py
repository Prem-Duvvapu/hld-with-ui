"""Real jar/port integration checks plus mocked Docker harness failure checks."""

import argparse
import json
import importlib.util
import io
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import URLError
import zipfile


ROOT = Path(__file__).resolve().parent.parent
JAR = ROOT / "backend/target/hld-backend-0.1.0-SNAPSHOT.jar"
SMOKE = ROOT / "scripts/packaged-runtime-smoke.py"
spec = importlib.util.spec_from_file_location("runtime_smoke", SMOKE)
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


class PackagedRuntimeFailures(unittest.TestCase):
    def test_readiness_retries_transient_connection_failures_then_cleans_its_container(self):
        for failure in (ConnectionResetError("starting"), TimeoutError("starting"), URLError("starting")):
            args = argparse.Namespace(jar=None, image="hld-test-image", port=free_port())
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as folder, patch.object(
                smoke.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "true\n", "")
            ) as run, patch.object(smoke, "api", side_effect=[
                failure, {"status": "ready", "service": "hld-with-ui"}
            ]) as api, patch.object(smoke.time, "sleep"), patch.object(smoke, "stop_container") as stop:
                with smoke.runtime(args, Path(folder), io.StringIO()) as base:
                    self.assertEqual(base, f"http://127.0.0.1:{args.port}")
                self.assertEqual(api.call_count, 2)
                launch = run.call_args_list[0].args[0]
                name = launch[launch.index("--name") + 1]
                self.assertEqual(stop.call_args.args[0], name)
                self.assertEqual(len(run.call_args_list), 3)  # Launch, two alive checks.

    def test_readiness_rejects_an_unexpected_health_identity_and_cleans_its_container(self):
        args = argparse.Namespace(jar=None, image="hld-test-image", port=free_port())
        with tempfile.TemporaryDirectory() as folder, patch.object(
            smoke.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "true\n", "")
        ) as run, patch.object(smoke, "api", return_value={"status": "ready", "service": "other"}) as api, patch.object(
            smoke, "stop_container"
        ) as stop:
            with self.assertRaisesRegex(RuntimeError, "Health identity differs"):
                with smoke.runtime(args, Path(folder), io.StringIO()):
                    self.fail("An unexpected service must never pass readiness")
            self.assertEqual(api.call_count, 1)
            launch = run.call_args_list[0].args[0]
            self.assertEqual(stop.call_args.args[0], launch[launch.index("--name") + 1])

    def test_closed_server_connections_do_not_block_a_subsequent_launch(self):
        with socket.socket() as listener:
            listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            listener.bind(("127.0.0.1", 0))
            listener.listen()
            port = listener.getsockname()[1]
            with socket.create_connection(("127.0.0.1", port), timeout=2) as client:
                connection, _ = listener.accept()
                with connection:
                    connection.shutdown(socket.SHUT_WR)  # Server actively closes first.
                    self.assertEqual(client.recv(1), b"")
        # No listening owner remains, although the server-side TCP tuple can be TIME_WAIT.
        smoke.check_port_available(port)

    def test_failed_log_collection_still_removes_only_the_owned_container(self):
        name = "hld-runtime-owned-test"
        for failure in [subprocess.TimeoutExpired(["docker", "logs", name], 10), OSError("log failure")]:
            with self.subTest(failure=failure), patch.object(smoke.subprocess, "run", side_effect=[
                failure, subprocess.CompletedProcess(["docker", "rm", "--force", name], 0, "", "")
            ]) as run, patch("sys.stderr", new_callable=io.StringIO):
                smoke.stop_container(name, io.StringIO())
                self.assertEqual(run.call_args_list[1].args[0], ["docker", "rm", "--force", name])

    def test_occupied_port_fails_without_disturbing_its_owner(self):
        for reuse in (0, 1):
            with self.subTest(reuse=reuse), socket.socket() as listener:
                listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, reuse)
                listener.bind(("127.0.0.1", 0))
                listener.listen()
                port = listener.getsockname()[1]
                result = subprocess.run(
                    [sys.executable, str(SMOKE), "--jar", str(JAR), "--port", str(port)],
                    capture_output=True, text=True, timeout=15,
                )
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Address already in use", result.stderr)
                self.assertNotIn("PASS", result.stdout)
                # The unrelated listener still accepts connections after the rejected launch.
                with socket.create_connection(("127.0.0.1", port), timeout=2):
                    connection, _ = listener.accept()
                    connection.close()

    def test_a_healthy_but_mismatched_artifact_fails_and_releases_its_port(self):
        self.assertTrue(JAR.is_file(), "Package the Java backend before running integration checks")
        with tempfile.TemporaryDirectory(prefix="hld-wrong-artifact-") as temporary:
            wrong = Path(temporary) / "old.jar"
            resource = "BOOT-INF/classes/content/catalog.json"
            with zipfile.ZipFile(JAR) as original, zipfile.ZipFile(wrong, "w") as mutated:
                self.assertIn(resource, original.namelist())
                for info in original.infolist():
                    data = original.read(info.filename)
                    if info.filename == resource:
                        entries = json.loads(data)
                        # A valid different version lets startup succeed, then fails real content comparison.
                        entries[0]["contentVersion"] = "9.9.9"
                        data = json.dumps(entries).encode("utf-8")
                    mutated.writestr(info, data)  # Preserve stored nested jars for the Boot loader.
            port = free_port()
            result = subprocess.run(
                [sys.executable, str(SMOKE), "--jar", str(wrong), "--port", str(port)],
                capture_output=True, text=True, timeout=90,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Old topic: request-flow", result.stderr)
            self.assertNotIn("PASS runtime cleanup", result.stdout)
            with socket.socket() as probe:
                self.assertNotEqual(probe.connect_ex(("127.0.0.1", port)), 0)


if __name__ == "__main__":
    unittest.main()
