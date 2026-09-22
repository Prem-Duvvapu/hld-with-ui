#!/usr/bin/env bash
set -Eeuo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
backend_dir="$project_root/backend"
frontend_dir="$project_root/frontend"

if [[ ! -f "$backend_dir/pom.xml" || ! -f "$frontend_dir/package.json" ]]; then
  printf '%s\n' \
    'HLD with UI is still in the planning phase.' \
    'start.sh needs backend/pom.xml and frontend/package.json.' \
    'Build the P0-01 foundation described in docs/FIRST_CONTRIBUTION.md first.' >&2
  exit 1
fi

for command_name in java npm setsid; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  fi
done

if [[ -x "$backend_dir/mvnw" ]]; then
  maven_command="./mvnw"
elif command -v mvn >/dev/null 2>&1; then
  maven_command="mvn"
else
  printf '%s\n' 'Maven Wrapper or mvn is required to start the backend.' >&2
  exit 1
fi

if [[ ! -d "$frontend_dir/node_modules" ]]; then
  printf '%s\n' 'Frontend dependencies are missing. Run: npm ci --prefix frontend' >&2
  exit 1
fi

backend_port="${BACKEND_PORT:-8080}"
frontend_port="${FRONTEND_PORT:-5173}"
for port in "$backend_port" "$frontend_port"; do
  if [[ ! "$port" =~ ^[1-9][0-9]*$ ]] || (( port > 65535 )); then
    printf 'Invalid port: %s. Use an integer from 1 to 65535.\n' "$port" >&2
    exit 1
  fi
done
if [[ "$backend_port" == "$frontend_port" ]]; then
  printf '%s\n' 'BACKEND_PORT and FRONTEND_PORT must be different.' >&2
  exit 1
fi

export BACKEND_PORT="$backend_port" FRONTEND_PORT="$frontend_port"
export SERVER_PORT="$backend_port"
backend_pid=""
frontend_pid=""

cleanup() {
  trap - EXIT INT TERM
  for child_pid in "$frontend_pid" "$backend_pid"; do
    if [[ -n "$child_pid" ]]; then
      kill -TERM -- "-$child_pid" 2>/dev/null || true
    fi
  done
  for child_pid in "$frontend_pid" "$backend_pid"; do
    if [[ -n "$child_pid" ]]; then
      wait "$child_pid" 2>/dev/null || true
    fi
  done
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

printf 'Backend:  http://localhost:%s\n' "$backend_port"
printf 'Frontend: http://localhost:%s\n' "$frontend_port"
printf '%s\n' 'Press Ctrl+C to stop both.'

# Separate process groups let cleanup stop only the services launched here.
setsid bash -c 'cd "$1" && exec "$2" spring-boot:run' _ "$backend_dir" "$maven_command" &
backend_pid=$!
setsid bash -c 'cd "$1" && exec npm run dev -- --host 127.0.0.1 --port "$2" --strictPort' _ "$frontend_dir" "$frontend_port" &
frontend_pid=$!

if wait -n "$backend_pid" "$frontend_pid"; then
  printf '%s\n' 'A service stopped; shutting down the other service.' >&2
  exit 1
else
  exit $?
fi
