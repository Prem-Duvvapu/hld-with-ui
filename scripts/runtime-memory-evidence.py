#!/usr/bin/env python3
"""Record a bounded real-HTTP exercise of an owned Java process on Linux.

This is a laboratory heap configuration and sampled process evidence, not production sizing.
Generate backend/target/performance-evidence.json with the opt-in Java suite first.
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import platform
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("packaged_runtime", ROOT / "scripts/packaged-runtime-smoke.py")
SMOKE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SMOKE)
check = SMOKE.check
FIXTURES = ("flow-max-count", "cache-max-cold-gets", "cache-max-escaped-update-read", "limiter-max-count")


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def source_hash():
    digest = hashlib.sha256()
    backend = ROOT / "backend"
    paths = [backend / "pom.xml", *(p for p in (backend / "src/main").rglob("*") if p.is_file())]
    for path in sorted(paths):
        digest.update(path.relative_to(backend).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def start_ticks(pid):
    return Path(f"/proc/{pid}/stat").read_text().split(") ", 1)[1].split()[19]


def read_process(pid):
    values = {}
    for line in Path(f"/proc/{pid}/status").read_text().splitlines():
        key, _, value = line.partition(":")
        if key in {"VmRSS", "VmHWM"}:
            values[key + "Bytes"] = int(value.split()[0]) * 1024
        elif key == "Threads":
            values["threads"] = int(value.strip())
    check(len(values) == 3, "Missing Linux process memory/thread counters")
    return {"monotonicNs": time.monotonic_ns(), **values}


class ProcessSampler:
    def __init__(self, process, evidence):
        self.evidence = evidence
        self.process = process
        self.start_ticks = start_ticks(process.pid)
        self.samples = []
        self.errors = []
        self.stopped = threading.Event()
        self.thread = threading.Thread(target=self.poll, name="owned-java-memory-sampler", daemon=True)

    def poll(self):
        while not self.stopped.is_set():
            try:
                check(self.process.poll() is None and start_ticks(self.process.pid) == self.start_ticks, "Owned Java identity changed")
                self.samples.append(read_process(self.process.pid))
            except (OSError, RuntimeError, ValueError) as error:
                self.errors.append(str(error))
                return
            self.stopped.wait(0.02)

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_):
        self.stopped.set()
        self.thread.join(timeout=2)
        self.evidence["processSamples"] = list(self.samples)
        self.evidence["samplerErrors"] = list(self.errors)
        check(not self.thread.is_alive(), "Memory sampler did not stop")


def diagnostic(process, phase, command="GC.heap_info"):
    check(process.poll() is None, "Owned Java exited before diagnostic")
    result = subprocess.run(["jcmd", str(process.pid), command], capture_output=True, text=True, timeout=10)
    check(result.returncode == 0, f"Owned JVM diagnostic failed: {result.stderr}")
    return {"phase": phase, "command": command, "monotonicNs": time.monotonic_ns(),
            "process": read_process(process.pid), "output": result.stdout}


def request(base, path, body=None, barrier=None):
    if barrier is not None:
        barrier.wait(timeout=10)
    started = time.monotonic_ns()
    try:
        response = urlopen(Request(base + path, data=body, headers={"Content-Type": "application/json"}), timeout=15)
    except HTTPError as error:
        response = error
    with response:
        raw = response.read(SMOKE.MAX_RESPONSE_BYTES + 1)
        check(len(raw) <= SMOKE.MAX_RESPONSE_BYTES, "Response exceeded laboratory read bound")
        finished = time.monotonic_ns()
        check(response.headers.get_content_type() == "application/json", "Response must be JSON")
        value = json.loads(raw)
        return {"status": response.status, "responseBytes": len(raw),
                "roundTripAndBodyNs": finished - started,
                "retryAfter": response.headers.get("Retry-After"),
                "canonicalResponseSha256": sha256(canonical(value))}, value


def isolated_environment():
    environment = os.environ.copy()
    for key in list(environment):
        if key.startswith(("HLD_", "SPRING_", "SERVER_")) or key in {"PORT", "BACKEND_PORT", "JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "_JAVA_OPTIONS"}:
            environment.pop(key)
    return environment


@contextmanager
def owned_java(jar, port, folder, log, evidence, args):
    shutil.copyfile(jar, folder / "app.jar")
    evidence["executedJarSha256"] = sha256((folder / "app.jar").read_bytes())
    check(evidence["executedJarSha256"] == evidence["jarSha256"], "Jar changed while copying")
    environment = isolated_environment()
    environment["PORT"] = str(port)
    process = subprocess.Popen(["java", "-Xms32m", "-Xmx128m", "-jar", "app.jar"],
                               cwd=folder, env=environment, stdout=log, stderr=subprocess.STDOUT)
    try:
        base = f"http://127.0.0.1:{port}"
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            check(process.poll() is None, "Owned Java exited during startup")
            try:
                check(SMOKE.api(base, "/api/v1/health", timeout=2) == {"status": "ready", "service": "hld-with-ui"}, "Wrong health identity")
                break
            except (URLError, TimeoutError, ConnectionError):
                time.sleep(0.2)
        else:
            raise RuntimeError("Owned Java did not become ready within 60 seconds")
        yield process, base
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        evidence["cleanup"] = {"ownedProcessStopped": process.poll() is not None, "portReleased": False}
        with socket.socket() as probe:
            probe.settimeout(2)
            evidence["cleanup"]["portReleased"] = probe.connect_ex(("127.0.0.1", port)) != 0
        checkpoint(args, evidence)
        check(evidence["cleanup"]["portReleased"], "Owned Java port was not released")


def verify_result(fixture, sample, value, expected_digest=None):
    check(sample["status"] == 200, f"Expected successful {fixture['id']}, got {sample['status']}")
    check(value["status"] == fixture["status"], "Simulation status differs from Java fixture")
    check(value["modelVersion"] == fixture["modelVersion"], "Model version differs")
    check(len(value["events"]) == fixture["eventCount"], "Event count differs")
    check(len(value["outcomes"]) == fixture["outcomeCount"], "Outcome count differs")
    check(sample["responseBytes"] == fixture["responseBytes"], "Whole-response byte count differs")
    expected_metrics = {
        "flow-max-count": {"completed": 100},
        "cache-max-cold-gets": {"totalGets": 100, "originReads": 100, "cacheHits": 0},
        "cache-max-escaped-update-read": {"totalGets": 50, "originReads": 50, "cacheHits": 0},
        "limiter-max-count": {"total": 500, "allowed": 5, "rejected": 495},
    }
    for key, expected in expected_metrics[fixture["id"]].items():
        check(value["metrics"][key] == expected, f"Meaningful {fixture['id']} metric differs: {key}")
    if expected_digest:
        check(sample["canonicalResponseSha256"] == expected_digest, "Concurrent HTTP result differs from reference")


def measure(args, fixtures_report, jar, folder, log):
    by_id = {f["id"]: f for f in fixtures_report["fixtures"]}
    selected = [by_id[key] for key in FIXTURES]
    result = {"schemaVersion": "1.0", "complete": False, "revision": args.revision,
              "startedAtUtc": datetime.now(timezone.utc).isoformat(),
              "jarSha256": sha256(jar.read_bytes()), "applicationSourceSha256": source_hash(),
              "fixtureReportSha256": sha256(Path(args.fixtures).read_bytes()),
              "measurementSourceSha256": sha256(Path(__file__).read_bytes()),
              "environment": {"platform": platform.platform(), "logicalCpus": os.cpu_count(),
                              "java": subprocess.run(["java", "-version"], capture_output=True, text=True, check=True, timeout=10, env=isolated_environment()).stderr,
                              "python": platform.python_version()},
              "method": {"heapArguments": ["-Xms32m", "-Xmx128m"], "rounds": args.rounds,
                         "simultaneousClientSimulationRequests": 2, "samplingIntervalMs": 20,
                         "explicitAdmissionRetriesMax": 3, "retryAfterDelaySeconds": 1,
                         "scope": "Local direct HTTP with default guards, bounded request/response reads. Process RSS/HWM include native memory; heap_info is a diagnostic snapshot, not peak used heap. jcmd attach and harness checks affect the exercise. No production capacity, throughput, sustained-load, leak-freedom or slow-client claim."},
              "fixtures": [], "requests": [], "diagnostics": []}
    checkpoint(args, result)
    with owned_java(jar, args.port, folder, log, result, args) as (process, base):
        with ProcessSampler(process, result) as sampler:
            result["ownedProcess"] = {"pid": process.pid, "linuxStartTicks": start_ticks(process.pid)}
            checkpoint(args, result, sampler)
            result["diagnostics"].append(diagnostic(process, "ready"))
            result["diagnostics"].append(diagnostic(process, "flags", "VM.flags"))
            references = {}
            for fixture in selected:
                body = json.dumps(fixture["input"], separators=(",", ":")).encode("utf-8")
                check(len(body) <= 262_144, "Fixture exceeds default request guard")
                sample, value = request(base, endpoint(fixture), body)
                verify_result(fixture, sample, value)
                references[fixture["id"]] = sample["canonicalResponseSha256"]
                result["fixtures"].append({"id": fixture["id"], "requestBytes": len(body),
                                           "canonicalInputSha256": sha256(canonical(fixture["input"])),
                                           "reference": sample})
            result["diagnostics"].append(diagnostic(process, "after-references"))
            checkpoint(args, result, sampler)
            with ThreadPoolExecutor(max_workers=3) as executor:
                for round_index in range(args.rounds):
                    for fixture in selected:
                        body = json.dumps(fixture["input"], separators=(",", ":")).encode("utf-8")
                        barrier = threading.Barrier(3)
                        futures = [executor.submit(request, base, endpoint(fixture), body, barrier) for _ in range(2)]
                        reading = executor.submit(request, base, "/api/v1/topics/cache-aside", None, barrier)
                        completed = [future.result(timeout=20) for future in futures]
                        # Drain both responses before explicit admission retries; record every result.
                        for sample, value in completed:
                            sample.update({"round": round_index + 1, "fixture": fixture["id"]})
                            result["requests"].append(sample)
                            if sample["status"] == 503:
                                for attempt in range(1, 4):
                                    check(value["code"] == "simulation_busy" and sample["retryAfter"] == "1", "Unexpected admission rejection")
                                    time.sleep(1)  # Respect Retry-After in this laboratory client only.
                                    sample, value = request(base, endpoint(fixture), body)
                                    sample.update({"round": round_index + 1, "fixture": fixture["id"], "explicitRetry": attempt})
                                    result["requests"].append(sample)
                                    if sample["status"] != 503:
                                        break
                            verify_result(fixture, sample, value, references[fixture["id"]])
                        sample, lesson = reading.result(timeout=20)
                        check(sample["status"] == 200 and lesson["lessonMarkdown"] == (ROOT / "content/topics/cache-aside/lesson.md").read_text(), "Reading content differs during exercise")
                        sample.update({"round": round_index + 1, "fixture": "concurrent-lesson-get"})
                        result["requests"].append(sample)
                    checkpoint(args, result, sampler)
                    if (round_index + 1) % 5 == 0:
                        result["diagnostics"].append(diagnostic(process, f"after-round-{round_index + 1}"))
            rejected, error = request(base, endpoint(selected[0]), b" " * 262_145)
            check(rejected["status"] == 413 and error["code"] == "request_too_large", "Request guard did not reject oversized body")
            check(set(error) == {"code", "message", "fieldErrors", "timestamp"}, "Oversized-body error shape differs")
            result["negativeRequest"] = rejected
            sample, value = request(base, endpoint(selected[0]), json.dumps(selected[0]["input"]).encode())
            verify_result(selected[0], sample, value, references[selected[0]["id"]])
            result["recoveryRequest"] = sample
            result["diagnostics"].append(diagnostic(process, "after-exercise"))
            check(process.poll() is None, "Owned Java exited during exercise")
        check(not sampler.errors and sampler.samples, f"Memory sampler failed: {sampler.errors}")
        result["processSamples"] = sampler.samples
        result["processSummary"] = {"sampleCount": len(sampler.samples),
                                    "maxSampledRssBytes": max(s["VmRSSBytes"] for s in sampler.samples),
                                    "lifetimeReportedRssHighWaterBytes": max(s["VmHWMBytes"] for s in sampler.samples),
                                    "maxSampledThreads": max(s["threads"] for s in sampler.samples)}
    result["httpCheckCount"] = len(result["requests"]) + len(result["fixtures"]) + 2
    result["completedAtUtc"] = datetime.now(timezone.utc).isoformat()
    result["complete"] = True
    checkpoint(args, result)
    return result


def checkpoint(args, result, sampler=None):
    if sampler is not None:
        result["processSamples"] = list(sampler.samples)
        result["samplerErrors"] = list(sampler.errors)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n")


def endpoint(fixture):
    model = "request-flow" if fixture["id"].startswith("flow-") else "cache-aside" if fixture["id"].startswith("cache-") else "distributed-rate-limiter"
    return f"/api/v1/simulations/{model}/runs"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--jar", default="backend/target/hld-backend-0.1.0-SNAPSHOT.jar")
    parser.add_argument("--fixtures", default="backend/target/performance-evidence.json")
    parser.add_argument("--output", default="backend/target/runtime-memory-evidence.json")
    parser.add_argument("--port", type=int, default=18680)
    parser.add_argument("--rounds", type=int, default=20)
    parser.add_argument("--revision", default="working-tree")
    args = parser.parse_args()
    checkpoint(args, {"schemaVersion": "1.0", "complete": False, "revision": args.revision})
    check(platform.system() == "Linux" and Path("/proc/self/status").is_file(), "Linux /proc is required")
    check(shutil.which("jcmd"), "JDK jcmd is required")
    check(1 <= args.port <= 65535 and 1 <= args.rounds <= 50, "Port/rounds out of range")
    SMOKE.check_port_available(args.port)
    jar = Path(args.jar).resolve(strict=True)
    fixtures_report = json.loads(Path(args.fixtures).read_text())
    check(fixtures_report["schemaVersion"] == "1.0" and fixtures_report["environment"]["applicationSourceSha256"] == source_hash(), "Fixture report does not match current application sources")
    check(fixtures_report["environment"]["measurementSourceSha256"] == sha256((ROOT / "backend/src/test/java/com/hld/performance/SimulationPerformanceEvidenceTest.java").read_bytes()), "Fixture factory differs from current measurement source")
    with tempfile.TemporaryDirectory(prefix="hld-memory-") as temporary:
        folder = Path(temporary)
        with (folder / "server.log").open("w+") as log:
            try:
                result = measure(args, fixtures_report, jar, folder, log)
            except Exception as error:
                partial = json.loads(Path(args.output).read_text())
                partial.update({"complete": False, "failure": str(error)})
                checkpoint(args, partial)
                log.flush()
                print("\n".join((folder / "server.log").read_text().splitlines()[-40:]))
                raise
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n")
    print(f"PASS bounded memory exercise: {len(result['requests'])} recorded requests; {result['processSummary']}; cleanup verified; report={output}")


if __name__ == "__main__":
    main()
