# Contributing to HLD with UI

Use [AGENTS.md](AGENTS.md) for the product, learning, and engineering rules. The [roadmap](docs/ROADMAP.md) identifies the next unblocked work item.

## Branch and pull request workflow

Create a new branch from the latest `main` for every distinct change or work item. Never commit directly to `main`.

```bash
git switch main
git pull --ff-only origin main
git switch -c feat/short-description
```

Use `feat/`, `fix/`, `docs/`, or `chore/` followed by a short descriptive name. Commit the relevant files with a conventional commit message. Keep unrelated files out of the commit. Push the branch and open a pull request targeting `main`.

```bash
git push -u origin feat/short-description
gh pr create --base main --fill
```

The PR describes the problem, user-visible behavior, learning outcome, important design choices, tests actually run, and any remaining limits. Include screenshots or short clips for material UI changes after checking desktop/mobile and both themes. Address review feedback on the same branch. Merge only when required CI checks pass; squash merge a completed PR and delete its branch. Update local `main` before starting the next change.

Do not treat opening a PR or passing a format check as proof that a module works. Use the [quality standard](docs/EXPERIENCE_AND_QUALITY.md) and the specific roadmap acceptance criteria.

## Local checks

Install the locked frontend dependencies, then run the full gate:

```bash
npm ci --prefix frontend
node scripts/validate-plan.mjs
bash -n start.sh
(cd backend && ./mvnw -B verify)
(cd frontend && npm run contracts:check && npm run typecheck && npm run lint && npm run format:check && npm test && npm run build)
```

The default browser command includes the ordinary `chromium` project and an isolated `native-zoom` project. Native zoom uses a minimal test-only extension in a temporary profile and the bundled Chromium channel; it requires the full pinned Chromium installation from the command below. `npm run e2e -- --project=native-zoom` runs only its actual 200% zoom checks. Evidence normally stays in test results; see [HLD-09C-A](docs/work-items/HLD-09C-A.md) for intentional screenshot refreshes.

Browser journeys run the packaged Java backend and the production frontend build on isolated ports (18080 and 14173, overridable with `E2E_BACKEND_PORT` and `E2E_FRONTEND_PORT`) and stop both afterwards. They need the backend jar and Playwright's Chromium:

Finish the backend package and frontend quality gate before starting browser journeys. Do not rebuild the running jar or replace `frontend/dist` while its test servers are active; missing files during a rebuild can make valid pages fail.

```bash
(cd backend && ./mvnw -B package -DskipTests)
(cd frontend && npx playwright install chromium && npm run e2e)
```

`scripts/start-smoke-test.sh` exercises the real launcher: it waits for Java health through the frontend proxy, opens a module route, sends Ctrl+C, and checks that every launched process and both ports are released; then it occupies the frontend port with an unrelated process and checks that the launcher fails clearly, stops its backend, and leaves that process alone. It uses ports 18180 and 15173 (`SMOKE_BACKEND_PORT`, `SMOKE_FRONTEND_PORT`) and needs installed frontend dependencies and `python3`:

```bash
bash scripts/start-smoke-test.sh
```

The root launcher is for Linux/WSL and accepts `BACKEND_PORT` and `FRONTEND_PORT`. It starts only this repository's two services and stops both when interrupted. Run it after installing frontend dependencies with `npm ci --prefix frontend`.

## Packaged runtime checks

After packaging the backend, use Python 3 to exercise the jar from an empty temporary working
directory. The check copies only the executable jar into that directory, compares delivered
content with the canonical checkout, runs each published simulation/estimator baseline,
checks draft visibility and the learning path, then stops its own process and checks port cleanup.

```bash
python3 scripts/packaged-runtime-smoke.py --jar backend/target/hld-backend-0.1.0-SNAPSHOT.jar
python3 -m unittest discover -s scripts -p 'test_packaged_runtime_smoke.py' -v
```

Failure checks reject a healthy but mismatched artifact, preserve an occupied port's owner,
and ensure failed container log collection still attempts removal. The default smoke port is
18480; override with `--port`. The script refuses active listening ports before starting anything; closed TCP connections
can be reused by a subsequent run.

When Docker is available, build the existing deployment image from the repository root and
exercise it without mounted content. The smoke uses a uniquely named local container with
512 MiB memory and one CPU, then removes it. These are test constraints, not production sizing.

```bash
docker build --file backend/Dockerfile --tag hld-runtime:local .
python3 scripts/packaged-runtime-smoke.py --image hld-runtime:local
```

CI's **Packaged runtime** job runs both modes. This proves the checked artifact works; deployed
backend commit/version verification and human learning/accessibility review remain separate gates.

## Contribution boundaries

- Work from the canonical catalog and contracts; do not hand-maintain competing module lists.
- Keep Java behavior and React rendering consistent. Every advertised simulation needs real executed behavior and semantic fixtures.
- Make concepts easy to understand, explain to a teammate, and discuss in an interview. Use [the learning standard](docs/LEARNING_STANDARD.md).
- Add sources and original explanations to lessons. Keep example assumptions and model limits visible.
- Update docs, roadmap evidence, and tests with behavior changes. Record consequential design decisions in `docs/decisions/` when that directory is established.
- Keep secrets, generated files, IDE metadata, and unrelated user files out of PRs.
