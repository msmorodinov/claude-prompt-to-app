# E2E Selector Sync

When changing or removing CSS classes, HTML structure, or `data-testid` attributes in frontend components:

1. Grep `e2e/tests/` for selectors that reference the changed elements
2. Update affected E2E tests in the same commit
3. If removing an element entirely, remove or update the E2E test that asserts on it

Convention: E2E tests use `[data-testid="name"]` selectors, never CSS class selectors. When adding new testable elements, add `data-testid` to the component and use `[data-testid="..."]` in the test.

## Default State Changes

When changing default component state (e.g. sidebar open/closed, panel visibility, initial selections):

1. Grep `e2e/tests/` for interactions with that component (toggle clicks, visibility assertions)
2. Verify test logic matches new default — a toggle click that used to "open" now "closes" if default flipped
3. Check viewport-dependent defaults: sidebar is open on desktop (>=1024px), closed on mobile (<1024px)

## Hardcoded URLs

E2E tests must use relative paths (`page.goto('/admin')`) so they respect playwright's `baseURL`. Never hardcode `localhost:PORT` in test files.