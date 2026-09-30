#!/usr/bin/env bash
# Smoke-tests ./start.sh with the real services (Maven Wrapper + Vite dev server):
#   1. start, wait for Java health through the frontend proxy, open a real route,
#      press Ctrl+C, and verify every launched process and port is released;
#   2. with the frontend port already taken by an unrelated process, verify the
#      launcher fails clearly, stops the backend it started, and leaves the
#      unrelated process running.
# Requires installed frontend dependencies (npm ci --prefix frontend), Java, curl,
# setsid, and python3.
set -Eeuo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
backend_port="${SMOKE_BACKEND_PORT:-18180}"
frontend_port="${SMOKE_FRONTEND_PORT:-15173}"
ready_timeout="${SMOKE_READY_TIMEOUT:-240}"
work_dir="$(mktemp -d)"
launcher_pid=""
blocker_pid=""

cleanup() {
  trap - EXIT INT TERM
  if [[ -n "$launcher_pid" ]] && kill -0 "$launcher_pid" 2>/dev/null; then
    kill -TERM "$launcher_pid" 2>/dev/null || true
    wait "$launcher_pid" 2>/dev/null || true
  fi
  if [[ -n "$blocker_pid" ]]; then
    kill "$blocker_pid" 2>/dev/null || true
    wait "$blocker_pid" 2>/dev/null || true
  fi
  rm -rf -- "$work_dir"
}
trap cleanup EXIT INT TERM

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  [[ -f "$work_dir/start.log" ]] && sed -n '1,80p' "$work_dir/start.log" >&2
  exit 1
}

descendants() {
  local child
  for child in $(ps -o pid= --ppid "$1" 2>/dev/null); do
    printf '%s\n' "$child"
    descendants "$child"
  done
}

port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

wait_for_exit() {
  local pid="$1" limit="$2" deadline=$((SECONDS + $2))
  while kill -0 "$pid" 2>/dev/null; do
    local state
    state="$(ps -o stat= -p "$pid" 2>/dev/null || true)"
    [[ "$state" == Z* ]] && break
    (( SECONDS < deadline )) || fail "process $pid still running after ${limit}s"
    sleep 0.2
  done
}

start_launcher() {
  # A separate session lets this script signal the launcher the way a terminal
  # would. Bash starts background jobs with SIGINT ignored, and an ignored signal
  # cannot be trapped, so restore the default disposition before exec, as an
  # interactive terminal would give the foreground launcher.
  BACKEND_PORT="$backend_port" FRONTEND_PORT="$frontend_port" \
    setsid python3 -c 'import os, signal, sys
signal.signal(signal.SIGINT, signal.SIG_DFL)
os.execv(sys.argv[1], sys.argv[1:])' "$repo_dir/start.sh" > "$work_dir/start.log" 2>&1 &
  launcher_pid=$!
}

for port in "$backend_port" "$frontend_port"; do
  port_open "$port" && fail "port $port is already in use before the smoke test"
done

printf 'Scenario 1: start, use, and interrupt the launcher\n'
start_launcher
deadline=$((SECONDS + ready_timeout))
until curl -fsS -m 5 "http://127.0.0.1:$frontend_port/api/v1/health" > "$work_dir/health.json" 2>/dev/null; do
  kill -0 "$launcher_pid" 2>/dev/null || fail "start.sh exited before becoming ready"
  (( SECONDS < deadline )) || fail "no proxied health response within ${ready_timeout}s"
  sleep 1
done
grep -q '"status":"ready"' "$work_dir/health.json" || fail "unexpected health body: $(cat "$work_dir/health.json")"
route_status="$(curl -s -o "$work_dir/route.html" -w '%{http_code}' "http://127.0.0.1:$frontend_port/topics/cache-aside")"
[[ "$route_status" == 200 ]] && grep -q 'id="root"' "$work_dir/route.html" \
  || fail "deep link /topics/cache-aside returned $route_status"
topics="$(curl -fsS "http://127.0.0.1:$frontend_port/api/v1/topics")"
[[ "$topics" == *'"id":"cache-aside"'* ]] || fail "topic list through the proxy lacks cache-aside"

mapfile -t owned < <(descendants "$launcher_pid")
(( ${#owned[@]} >= 2 )) || fail "expected backend and frontend processes, found ${#owned[@]}"
printf '  ready; %s descendant processes; sending Ctrl+C (SIGINT)\n' "${#owned[@]}"

kill -INT "$launcher_pid"
wait_for_exit "$launcher_pid" 30
set +e
wait "$launcher_pid"
status=$?
set -e
launcher_pid=""
(( status == 130 )) || fail "expected exit 130 after Ctrl+C, got $status"
for pid in "${owned[@]}"; do
  kill -0 "$pid" 2>/dev/null && fail "process $pid ($(ps -o comm= -p "$pid")) survived shutdown"
done
for port in "$backend_port" "$frontend_port"; do
  port_open "$port" && fail "port $port still accepts connections after shutdown"
done
printf '  PASS: exit 130, all %s processes stopped, both ports released\n' "${#owned[@]}"

printf 'Scenario 2: frontend port already in use\n'
python3 -m http.server "$frontend_port" --bind 127.0.0.1 > /dev/null 2>&1 &
blocker_pid=$!
deadline=$((SECONDS + 10))
until port_open "$frontend_port"; do
  (( SECONDS < deadline )) || fail "could not occupy port $frontend_port"
  sleep 0.1
done

start_launcher
wait_for_exit "$launcher_pid" "$ready_timeout"
set +e
wait "$launcher_pid"
status=$?
set -e
launcher_pid=""
(( status != 0 )) || fail "start.sh succeeded although port $frontend_port was taken"
grep -q "$frontend_port is in use\|already in use" "$work_dir/start.log" \
  || fail "the output does not explain the occupied port"
kill -0 "$blocker_pid" 2>/dev/null || fail "start.sh stopped an unrelated process on port $frontend_port"
port_open "$backend_port" && fail "the backend on port $backend_port kept running after the failed start"
printf '  PASS: exit %s, occupied port reported, backend stopped, unrelated process untouched\n' "$status"

printf 'start.sh smoke test passed\n'
