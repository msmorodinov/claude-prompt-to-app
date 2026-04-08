# E2E Selector Sync

When changing or removing CSS classes, HTML structure, or `data-testid` attributes in frontend components:

1. Grep `e2e/tests/` for selectors that reference the changed elements
2. Update affected E2E tests in the same commit
3. If removing an element entirely, remove or update the E2E test that asserts on it

Convention: E2E tests use `[data-testid="name"]` selectors, never CSS class selectors. When adding new testable elements, add `data-testid` to the component and use `[data-testid="..."]` in the test.