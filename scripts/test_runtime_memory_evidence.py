"""Real CLI failures must preserve partial evidence and unrelated port owners."""

import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


class RuntimeMemoryFailures(unittest.TestCase):
    def setUp(self):
        self.jar = ROOT / "backend/target/hld-backend-0.1.0-SNAPSHOT.jar"
        self.fixtures = ROOT / "backend/target/performance-evidence.json"
        self.assertTrue(self.jar.is_file(), "Package Java before these checks")
        self.assertTrue(self.fixtures.is_file(), "Run opt-in Java evidence before these checks")

    def command(self, port, output, fixtures=None):
        return [sys.executable, str(ROOT / "scripts/runtime-memory-evidence.py"),
                "--jar", str(self.jar), "--fixtures", str(fixtures or self.fixtures),
                "--rounds", "1", "--port", str(port), "--output", str(output)]

    def test_occupied_listener_remains_owned_and_report_is_incomplete(self):
        with tempfile.TemporaryDirectory(prefix="hld-memory-failure-") as temporary:
            output = Path(temporary) / "evidence.json"
            with socket.socket() as owner:
                owner.bind(("127.0.0.1", 0))
                owner.listen(2)
                port = owner.getsockname()[1]
                result = subprocess.run(self.command(port, output), capture_output=True, text=True, timeout=15)
                self.assertNotEqual(result.returncode, 0, result.stdout)
                self.assertFalse(json.loads(output.read_text())["complete"])
                with socket.create_connection(("127.0.0.1", port), timeout=2):
                    connection, _ = owner.accept()
                    connection.close()

    def test_healthy_java_with_wrong_expected_events_fails_and_releases_port(self):
        with tempfile.TemporaryDirectory(prefix="hld-memory-failure-") as temporary:
            folder = Path(temporary)
            fixtures = json.loads(self.fixtures.read_text())
            next(f for f in fixtures["fixtures"] if f["id"] == "flow-max-count")["eventCount"] += 1
            modified = folder / "fixtures.json"
            modified.write_text(json.dumps(fixtures))
            with socket.socket() as reservation:
                reservation.bind(("127.0.0.1", 0))
                port = reservation.getsockname()[1]
            output = folder / "evidence.json"
            result = subprocess.run(self.command(port, output, modified), capture_output=True, text=True, timeout=75)
            self.assertNotEqual(result.returncode, 0, result.stdout)
            evidence = json.loads(output.read_text())
            self.assertFalse(evidence["complete"])
            self.assertEqual(evidence["failure"], "Event count differs")
            self.assertTrue(evidence["ownedProcess"]["pid"])
            self.assertEqual(evidence["cleanup"], {"ownedProcessStopped": True, "portReleased": True})
            with socket.socket() as probe:
                probe.settimeout(2)
                self.assertNotEqual(probe.connect_ex(("127.0.0.1", port)), 0)


if __name__ == "__main__":
    unittest.main()
