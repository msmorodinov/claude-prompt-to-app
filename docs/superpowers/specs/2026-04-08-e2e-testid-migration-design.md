# E2E Test Stabilization: data-testid Migration

**Date:** 2026-04-08
**Status:** APPROVED

## Problem

E2E tests broke because CSS class `chat-container` was renamed to `app-layout` in commit `2877ec1` (Apr 6) but E2E tests weren't updated. 9 tests fail in CI. Root cause: tests use CSS class selectors which are fragile — any styling refactor breaks them silently.

## Solution

Three-part fix:

### 1. Replace all CSS selectors with data-testid in E2E tests

Audit every E2E test file in `e2e/tests/`. Replace all CSS class selectors (`.class-name`) with `[data-testid="name"]` selectors. Format: flat, descriptive (`chat-container`, `sidebar-toggle`, `session-list`).

Affected files:
- `sidebar-visual.spec.ts`
- `responsive-widgets.spec.ts`
- `real-backend.spec.ts`
- `multi-user-admin.spec.ts`
- `ask-flow.spec.ts`
- `workshop-flow.spec.ts`
- `session-sidebar.spec.ts`

### 2. Add data-testid attributes to components

For every CSS selector replaced in step 1, add the corresponding `data-testid` attribute to the React component. No testid is added without a test that uses it.

### 3. Claude rule for selector sync

New file `.claude/rules/e2e-selector-sync.md`:

> When changing or removing CSS classes, HTML structure, or `data-testid` attributes in frontend components, check `e2e/tests/` for selectors that reference the changed elements. Update affected E2E tests in the same commit.

### 4. Remove tests for deleted features

If any test verifies functionality that no longer exists (e.g., read-only session mode removed in `4312a6e`), remove that test case rather than fixing its selectors.

## Out of scope

- E2E tests in pre-commit hooks (too slow)
- New E2E test cases
- Changes to unit tests (they use React Testing Library, not CSS selectors)
