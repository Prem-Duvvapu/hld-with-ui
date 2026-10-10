#!/usr/bin/env python3
"""Exercise packaged content and API behavior with no checkout mounted at runtime."""

import argparse
from contextlib import contextmanager
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen
import uuid


ROOT = Path(__file__).resolve().parent.parent
MAX_RESPONSE_BYTES = 5 * 1024 * 1024


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def source_json(relative):
    return json.loads((ROOT / "content" / relative).read_text(encoding="utf-8"))


def api(base, path, data=None, expected=200, timeout=10):
    body = None if data is None else json.dumps(data).encode("utf-8")
    request = Request(base + path, data=body, headers={"Content-Type": "application/json"})
    try:
        response = urlopen(request, timeout=timeout)
    except HTTPError as error:
        response = error
    with response:
        raw = response.read(MAX_RESPONSE_BYTES + 1)
        check(len(raw) <= MAX_RESPONSE_BYTES, f"Unbounded smoke response: {path}")
        check(response.status == expected, f"{path}: expected {expected}, got {response.status}")
        check(response.headers.get_content_type() == "application/json", f"{path}: expected JSON")
        return json.loads(raw)


def normalized(value):
    """Java omits null optional fields and fills omitted walkthroughs with an empty list."""
    if isinstance(value, dict):
        return {key: normalized(item) for key, item in value.items()
                if item is not None and not (key == "walkthroughs" and item == [])}
    if isinstance(value, list):
        return [normalized(item) for item in value]
    return value


def verify(base):
    catalog = source_json("catalog.json")
    published = [entry for entry in catalog if entry["status"] == "published"]
    topics = sorted((entry for entry in published if entry["kind"] == "topic"), key=lambda entry: (entry["order"], entry["id"]))
    cases = sorted((entry for entry in published if entry["kind"] == "case-study"), key=lambda entry: (entry["order"], entry["id"]))
    delivered = api(base, "/api/v1/topics")
    check([entry["id"] for entry in delivered] == [entry["id"] for entry in topics], "Published topic discovery differs from catalog")
    for entry in topics:
        detail = api(base, f"/api/v1/topics/{quote(entry['id'], safe='')}")
        check(detail["topic"]["contentVersion"] == entry["contentVersion"], f"Old topic: {entry['id']}")
        check(normalized(detail["topic"]) == normalized(entry), f"Topic metadata differs: {entry['id']}")
        check(detail["lessonMarkdown"] == (ROOT / "content" / entry["lessonPath"]).read_text(encoding="utf-8"), f"Lesson bytes differ: {entry['id']}")
        check(normalized(detail["questions"]) == normalized(source_json(entry["questionsPath"])), f"Question content differs: {entry['id']}")
        checkpoints = source_json(entry["checkpointsPath"]) if "checkpointsPath" in entry else []
        check(normalized(detail["checkpoints"]) == normalized(checkpoints), f"Checkpoint content differs: {entry['id']}")
        print(f"PASS packaged topic {entry['id']} content={entry['contentVersion']}", flush=True)
        for model_id in entry["simulationIds"]:
            path = f"/api/v1/simulations/{quote(model_id, safe='')}"
            descriptor = api(base, path)
            result = api(base, path + "/runs", descriptor["presets"][0]["input"])
            check(result["status"] == "completed", f"Baseline did not complete: {model_id}")
            check(result["modelVersion"] == descriptor["modelVersion"], f"Model version mismatch: {model_id}")
            if model_id == "request-flow":
                check(result["metrics"]["completed"] == 6 and result["metrics"]["meanLatencyMs"] == 200, "Request-flow hand fixture changed")
            print(f"PASS packaged simulation {model_id} model={result['modelVersion']}", flush=True)
        for estimator_id in entry["estimatorIds"]:
            path = f"/api/v1/estimators/{quote(estimator_id, safe='')}"
            descriptor = api(base, path)
            result = api(base, path + "/calculations", descriptor["presets"][0]["input"])
            check(result["status"] == "estimated" and result["estimatorId"] == estimator_id, f"Estimator unavailable: {estimator_id}")
            print(f"PASS packaged estimator {estimator_id}", flush=True)
    check([entry["id"] for entry in api(base, "/api/v1/case-studies")] == [entry["id"] for entry in cases], "Case publication differs from catalog")
    for entry in catalog:
        if entry["kind"] != "case-study" or entry["status"] == "planned":
            continue
        authored = source_json(entry["workshopPath"])
        detail = api(base, f"/api/v1/case-studies/{quote(entry['id'], safe='')}")
        check(detail["entry"]["status"] == entry["status"], "Case publication changed")
        check(normalized(detail["entry"]) == normalized(entry), "Case metadata differs")
        check(detail["workshop"]["contentVersion"] == authored["contentVersion"] == entry["contentVersion"], "Workshop version differs")
        check([stage["id"] for stage in detail["workshop"]["stages"]] == [stage["id"] for stage in authored["stages"]], "Workshop stages missing")
        check(normalized(detail["workshop"]) == normalized(authored), "Workshop content differs")
        print(f"PASS packaged case {entry['id']} status={entry['status']} stages={len(authored['stages'])}", flush=True)
    by_id = {entry["id"]: entry for entry in catalog}
    for authored in source_json("learning-paths.json"):
        path = api(base, f"/api/v1/learning-paths/{quote(authored['id'], safe='')}")
        check([step["moduleId"] for step in path["steps"]] == [step["moduleId"] for step in authored["steps"]], "Path steps differ")
        for step in path["steps"]:
            check(step["available"] == (by_id[step["moduleId"]]["status"] == "published"), "Unavailable path step advertised")
        check([entry["id"] for entry in path["optionalModules"]] == [module_id for module_id in authored["optionalModuleIds"] if by_id[module_id]["status"] == "published"], "Optional path modules differ")
        print(f"PASS packaged learning path {authored['id']}", flush=True)
    search = api(base, "/api/v1/search?q=cache")
    check(search["results"] and all(hit["entry"]["status"] == "published" for hit in search["results"]), "Published search missing or leaked a draft")
    problem = api(base, "/api/v1/case-studies/unknown", expected=404)
    check(set(problem) == {"code", "message", "fieldErrors", "timestamp"} and problem["code"] == "not_found", "Unknown case error differs")
    print("PASS packaged discovery, search, path availability and structured 404", flush=True)


def stop_container(container, log):
    try:
        try:
            subprocess.run(["docker", "logs", container], stdout=log, stderr=subprocess.STDOUT, timeout=10)
        except (subprocess.TimeoutExpired, OSError) as error:
            print(f"Could not collect owned container logs: {error}", file=sys.stderr)
    finally:
        # Diagnostics must never prevent removal, even if docker run timed out after creation.
        result = subprocess.run(["docker", "rm", "--force", container], capture_output=True, text=True, timeout=15)
        check(result.returncode == 0 or "No such container" in result.stderr,
              f"Could not remove owned container {container}: {result.stderr}")


@contextmanager
def runtime(args, folder, log):
    process = None
    container = None
    try:
        if args.jar:
            jar = Path(args.jar).resolve(strict=True)
            shutil.copyfile(jar, folder / "app.jar")
            environment = os.environ.copy()
            # Isolate the smoke from the contributor's app-specific overrides.
            for key in list(environment):
                if key.startswith(("HLD_", "SPRING_", "SERVER_")) or key in {"PORT", "BACKEND_PORT", "JAVA_TOOL_OPTIONS", "JDK_JAVA_OPTIONS", "_JAVA_OPTIONS"}:
                    environment.pop(key)
            environment["PORT"] = str(args.port)
            process = subprocess.Popen(["java", "-jar", "app.jar"], cwd=folder, env=environment, stdout=log, stderr=subprocess.STDOUT)
        else:
            name = "hld-runtime-" + uuid.uuid4().hex[:12]
            container = name  # Track ownership even when the launch command fails or times out.
            subprocess.run(["docker", "run", "--detach", "--name", name,
                                        "--publish", f"127.0.0.1:{args.port}:8080", "--memory", "512m", "--cpus", "1",
                                        "--env", "PORT=8080", args.image], check=True, capture_output=True, text=True, timeout=30)
        base = f"http://127.0.0.1:{args.port}"
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if process is not None:
                check(process.poll() is None, "Packaged Java process exited during startup")
            else:
                state = subprocess.run(["docker", "inspect", "--format", "{{.State.Running}}", container], check=True, capture_output=True, text=True, timeout=min(10, max(0.1, deadline - time.monotonic())))
                check(state.stdout.strip() == "true", "Container exited during startup")
            try:
                check(api(base, "/api/v1/health", timeout=min(10, max(0.1, deadline - time.monotonic()))) == {"status": "ready", "service": "hld-with-ui"}, "Health identity differs")
                break
            except (URLError, TimeoutError, ConnectionError):
                time.sleep(0.2)  # Startup polling only; no simulator timing.
        else:
            raise RuntimeError("Packaged runtime did not become ready within 60 seconds")
        yield base
    finally:
        if container is not None:
            stop_container(container, log)
        if process is not None:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
        # A successful HTTP check alone must not hide a process/port leak.
        with socket.socket() as probe:
            probe.settimeout(2)
            check(probe.connect_ex(("127.0.0.1", args.port)) != 0, "Owned runtime port still occupied after cleanup")


def check_port_available(port):
    with socket.socket() as probe:
        # Permit reuse after an owned server closes active connections (TCP TIME_WAIT).
        # Listening port owners still prevent this bind; never stop an unrelated process.
        probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        probe.bind(("127.0.0.1", port))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--jar", help="Built executable Spring Boot jar")
    source.add_argument("--image", help="Existing Docker image, built from backend/Dockerfile")
    parser.add_argument("--port", type=int, default=18480)
    args = parser.parse_args()
    check(1 <= args.port <= 65535, "Port must be 1–65535")
    check_port_available(args.port)  # Refuse occupied listeners before launching anything.
    with tempfile.TemporaryDirectory(prefix="hld-runtime-") as temporary:
        folder = Path(temporary)
        with (folder / "server.log").open("w+", encoding="utf-8") as log:
            try:
                with runtime(args, folder, log) as base:
                    verify(base)
            except Exception:
                log.flush()
                print("\nRuntime log tail:")
                print("\n".join((folder / "server.log").read_text(encoding="utf-8").splitlines()[-40:]))
                raise
    print("PASS runtime cleanup: owned process/container stopped and port released", flush=True)


if __name__ == "__main__":
    main()
