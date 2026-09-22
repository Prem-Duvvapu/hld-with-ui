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

The root launcher is for Linux/WSL and accepts `BACKEND_PORT` and `FRONTEND_PORT`. It starts only this repository's two services and stops both when interrupted. Run it after installing frontend dependencies with `npm ci --prefix frontend`.

## Contribution boundaries

- Work from the canonical catalog and contracts; do not hand-maintain competing module lists.
- Keep Java behavior and React rendering consistent. Every advertised simulation needs real executed behavior and semantic fixtures.
- Make concepts easy to understand, explain to a teammate, and discuss in an interview. Use [the learning standard](docs/LEARNING_STANDARD.md).
- Add sources and original explanations to lessons. Keep example assumptions and model limits visible.
- Update docs, roadmap evidence, and tests with behavior changes. Record consequential design decisions in `docs/decisions/` when that directory is established.
- Keep secrets, generated files, IDE metadata, and unrelated user files out of PRs.
