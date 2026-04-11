# Documentation Maintenance

## CLAUDE.md Project Structure

When you add, remove, or rename a file in `backend/`, `frontend/src/`, or `e2e/`:

1. Update the **Project Structure** tree in `CLAUDE.md` to reflect the change
2. Keep the same formatting style: `│   ├── filename.ext  # Brief description`
3. Maintain alphabetical order within each directory section

Do NOT update for:
- Files inside `node_modules/`, `.venv/`, `dist/`, `__pycache__/`
- Lock files (`package-lock.json`)
- TypeScript config files (`tsconfig.*.json`, `vite-env.d.ts`)
- Test files inside `__tests__/` (the directory is listed, individual tests are not)

## docs/ Directory

- `docs/CONTRIBUTING.md` — update when development workflow changes
- `docs/RUNBOOK.md` — update when deployment or operations procedures change
- `docs/CODEMAPS/` — regenerate periodically via `/update-codemaps`
- `docs/superpowers/plans/` — plan archive; update `Status:` per plan-lifecycle.md after merge

## When NOT to update docs

- Purely internal refactors that don't change file boundaries
- Bug fixes within existing files
- Style/formatting changes
