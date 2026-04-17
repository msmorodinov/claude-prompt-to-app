# Plan Lifecycle

## Plan location

All plans live in `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md` — the superpowers default. No dual-save, no `.claude/plans/current.md`.

## After merging a feature branch (MANDATORY)

When a feature branch is merged (locally or via PR), immediately:

1. **Update plan status** in `docs/superpowers/plans/<plan-file>.md`:
   - Add `**Status:** DONE` and `**Completed:** YYYY-MM-DD` to the header section

2. **Delete merged branch** (if merge was local):
   ```bash
   git branch -d feature/<branch-name>
   ```

## Plan status values

| Status | Meaning |
|--------|---------|
| `PLAN (awaiting approval)` | Written, not yet approved |
| `APPROVED` | User approved, ready for implementation |
| `IN PROGRESS` | Currently being implemented |
| `DONE` | Merged and complete |
| `ABANDONED` | Discarded (Option 4 in finishing skill) |

## Integration with superpowers

This rule fills the gap between `superpowers:finishing-a-development-branch` (which handles git) and plan tracking (which superpowers doesn't manage). Execute these steps as part of finishing-a-development-branch Options 1, 2, and 4.
