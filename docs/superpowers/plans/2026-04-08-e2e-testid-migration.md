# E2E data-testid Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all CSS class selectors in E2E tests with `data-testid` attributes, add those attributes to React components, and create a Claude rule to prevent future drift.

**Architecture:** Add `data-testid` props to ~30 React components on their root elements. Update all 8 E2E test files to use `[data-testid="name"]` selectors. Fix the `chat-container` → `app-layout` rename that broke 9 tests. Add a Claude rule for ongoing selector sync.

**Tech Stack:** React (JSX), Playwright, TypeScript

---

### Task 1: Add data-testid attributes to layout components

**Files:**
- Modify: `frontend/src/components/ChatContainer.tsx:277` — root div
- Modify: `frontend/src/components/ChatContainer.tsx:288` — app-header
- Modify: `frontend/src/components/ChatContainer.tsx:289` — sidebar-toggle button
- Modify: `frontend/src/components/ChatContainer.tsx:311` — chat-content div
- Modify: `frontend/src/components/ChatContainer.tsx:239,247` — start-screen div
- Modify: `frontend/src/components/ChatContainer.tsx:250,269` — start-btn button
- Modify: `frontend/src/components/ChatContainer.tsx:270` — session-done-banner
- Modify: `frontend/src/components/ChatContainer.tsx:286` — main-area div

- [ ] **Step 1: Add data-testid to ChatContainer root div (app-layout → chat-container testid)**

Open `frontend/src/components/ChatContainer.tsx`. Find the root div (~line 277):

```tsx
<div className={`app-layout${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
```

Add `data-testid="chat-container"`:

```tsx
<div data-testid="chat-container" className={`app-layout${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
```

- [ ] **Step 2: Add data-testid to app-header**

Find `<header className="app-header">` (~line 288):

```tsx
<header data-testid="app-header" className="app-header">
```

- [ ] **Step 3: Add data-testid to sidebar-toggle**

Find `<button className="sidebar-toggle">` (~line 289):

```tsx
<button data-testid="sidebar-toggle" className="sidebar-toggle">
```

- [ ] **Step 4: Add data-testid to chat-content**

Find `<div className="chat-content">` (~line 311):

```tsx
<div data-testid="chat-content" className="chat-content">
```

- [ ] **Step 5: Add data-testid to start-screen divs**

Find both `<div className="start-screen">` occurrences (~lines 239, 247):

```tsx
<div data-testid="start-screen" className="start-screen">
```

- [ ] **Step 6: Add data-testid to start-btn buttons**

Find both `<button className="start-btn">` (~lines 250, 269):

```tsx
<button data-testid="start-btn" className="start-btn">
```

- [ ] **Step 7: Add data-testid to session-done-banner**

Find `<div className="session-done-banner">` (~line 270):

```tsx
<div data-testid="session-done-banner" className="session-done-banner">
```

- [ ] **Step 8: Add data-testid to main-area**

Find `<div className="main-area">` (~line 286):

```tsx
<div data-testid="main-area" className="main-area">
```

- [ ] **Step 9: Run tsc to verify no type errors**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: No errors (data-testid is a valid HTML attribute)

- [ ] **Step 10: Commit**

```bash
git add frontend/src/components/ChatContainer.tsx
git commit -m "feat: add data-testid to ChatContainer layout elements"
```

---

### Task 2: Add data-testid to SessionSidebar component

**Files:**
- Modify: `frontend/src/components/SessionSidebar.tsx`

- [ ] **Step 1: Add data-testid to all sidebar elements**

Open `frontend/src/components/SessionSidebar.tsx`. Add `data-testid` to each element that E2E tests reference:

| Element | Class | data-testid |
|---------|-------|-------------|
| sidebar overlay | `sidebar-overlay` | `sidebar-overlay` |
| aside root | `session-sidebar` | `session-sidebar` |
| close button | `sidebar-close` | `sidebar-close` |
| new session button | `sidebar-new-btn` | `sidebar-new-btn` |
| empty state | `sidebar-empty` | `sidebar-empty` |
| each session item | `sidebar-session-item` | `sidebar-session-item` |
| session title | `sidebar-session-title` | `sidebar-session-title` |
| session meta | `sidebar-session-meta` | `sidebar-session-meta` |

For each element, add `data-testid="<name>"` alongside the existing `className`. Example for root aside:

```tsx
<aside data-testid="session-sidebar" className={`session-sidebar ${isOpen ? 'open' : ''}`}>
```

- [ ] **Step 2: Run tsc**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/SessionSidebar.tsx
git commit -m "feat: add data-testid to SessionSidebar elements"
```

---

### Task 3: Add data-testid to message components

**Files:**
- Modify: `frontend/src/components/MessageList.tsx`
- Modify: `frontend/src/components/AssistantMessage.tsx`
- Modify: `frontend/src/components/AskMessage.tsx`
- Modify: `frontend/src/components/UserMessage.tsx`

- [ ] **Step 1: Add data-testid to MessageList**

Find `<div className="message-list">` in `MessageList.tsx`:

```tsx
<div data-testid="message-list" className="message-list">
```

- [ ] **Step 2: Add data-testid to AssistantMessage**

Find `<div className="message assistant-message">` in `AssistantMessage.tsx`:

```tsx
<div data-testid="assistant-message" className="message assistant-message">
```

- [ ] **Step 3: Add data-testid to AskMessage**

Find `<div className={`message ask-message ...`}>` in `AskMessage.tsx`. Add testid:

```tsx
<div data-testid="ask-message" className={`message ask-message ${message.answered ? 'answered' : ''}`}>
```

Also find `<button className="submit-btn">`:

```tsx
<button data-testid="submit-btn" className="submit-btn">
```

- [ ] **Step 4: Add data-testid to UserMessage**

Find `<div className="message user-message">` in `UserMessage.tsx`:

```tsx
<div data-testid="user-message" className="message user-message">
```

- [ ] **Step 5: Run tsc**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/MessageList.tsx frontend/src/components/AssistantMessage.tsx frontend/src/components/AskMessage.tsx frontend/src/components/UserMessage.tsx
git commit -m "feat: add data-testid to message components"
```

---

### Task 4: Add data-testid to display widgets

**Files:**
- Modify: `frontend/src/components/display/CopyableBlock.tsx`
- Modify: `frontend/src/components/display/FinalResult.tsx`
- Modify: `frontend/src/components/display/MetricBars.tsx`
- Modify: `frontend/src/components/display/DataTable.tsx`
- Modify: `frontend/src/components/display/TimerWidget.tsx`
- Modify: `frontend/src/components/display/QuoteHighlight.tsx`
- Modify: `frontend/src/components/display/Comparison.tsx`
- Modify: `frontend/src/components/display/ProgressBar.tsx`
- Modify: `frontend/src/components/display/CategoryList.tsx`

- [ ] **Step 1: Add data-testid to each display widget**

For each widget, add `data-testid` matching the widget class name on the root `<div>`. Pattern:

```tsx
// Before:
<div className="widget widget-final-result">

// After:
<div data-testid="widget-final-result" className="widget widget-final-result">
```

Apply to all 9 display widgets listed above. Also add `data-testid="copy-btn"` to the copy button in CopyableBlock and `data-testid="copyable-content"` to its content div.

- [ ] **Step 2: Run tsc**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/display/
git commit -m "feat: add data-testid to display widgets"
```

---

### Task 5: Add data-testid to input widgets

**Files:**
- Modify: `frontend/src/components/input/SingleSelect.tsx`
- Modify: `frontend/src/components/input/MultiSelect.tsx`
- Modify: `frontend/src/components/input/FreeText.tsx`
- Modify: `frontend/src/components/input/RankPriorities.tsx`
- Modify: `frontend/src/components/input/SliderScale.tsx`
- Modify: `frontend/src/components/input/Matrix2x2.tsx`
- Modify: `frontend/src/components/input/TagInput.tsx`

- [ ] **Step 1: Add data-testid to each input widget**

Same pattern as display widgets:

```tsx
// Before:
<div className="widget widget-slider-scale">

// After:
<div data-testid="widget-slider-scale" className="widget widget-slider-scale">
```

Apply to all 7 input widgets. Also add for elements tested in E2E:
- `data-testid="option"` on `.option` elements in SingleSelect
- `data-testid="slider-label-min"` and `data-testid="slider-label-max"` on SliderScale labels
- `data-testid="tag"` on `.tag` elements in TagInput

- [ ] **Step 2: Run tsc**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/input/
git commit -m "feat: add data-testid to input widgets"
```

---

### Task 6: Add data-testid to admin components

**Files:**
- Modify: `frontend/src/pages/AdminPage.tsx`
- Modify: `frontend/src/components/admin/AppList.tsx`
- Modify: `frontend/src/components/admin/AppEditor.tsx`
- Modify: `frontend/src/components/admin/SessionList.tsx`
- Modify: `frontend/src/components/admin/SessionViewer.tsx`
- Modify: `frontend/src/components/admin/EnvironmentReference.tsx`
- Modify: `frontend/src/components/admin/VersionHistory.tsx`

- [ ] **Step 1: Add data-testid to admin elements referenced in E2E tests**

Selectors used in `admin-ui-live.spec.ts` and `multi-user-admin.spec.ts`:

| Element | data-testid |
|---------|-------------|
| Admin page root | `admin-page` |
| Admin layout | `admin-layout` |
| Admin header | `admin-header` |
| Admin tab | `admin-tab` |
| App list | `app-list` |
| App list item | `app-list-item` |
| App editor | `app-editor` |
| App name display | `admin-app-name` |
| Create app button | `btn-create-app` |
| Create app submit | `btn-create-app-submit` |
| App create form | `app-create-form` |
| App form input | `app-form-input` |
| App form slug preview | `app-form-slug-preview` |
| App form error | `app-form-error` |
| Menu trigger | `admin-menu-trigger` |
| Menu dropdown | `admin-menu-dropdown` |
| Menu item | `admin-menu-item` |
| Rename input | `admin-rename-input` |
| Editor prompt | `app-editor-prompt` |
| Editor env reference | `app-editor-env-reference` |
| Editor version history | `app-editor-version-history` |
| Admin empty state | `admin-empty` |
| Session list | `session-list` |
| Session item | `session-item` |
| Session viewer | `session-viewer` |
| Status badge | `status-badge` |

Add `data-testid` to each element alongside existing `className`.

- [ ] **Step 2: Run tsc**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/AdminPage.tsx frontend/src/components/admin/
git commit -m "feat: add data-testid to admin components"
```

---

### Task 7: Migrate E2E tests — sidebar-visual.spec.ts (fixes 7 of 9 broken tests)

**Files:**
- Modify: `e2e/tests/sidebar-visual.spec.ts`

- [ ] **Step 1: Replace all CSS selectors with data-testid selectors**

Open `e2e/tests/sidebar-visual.spec.ts`. Apply find-and-replace for every CSS selector:

| Old | New |
|-----|-----|
| `.chat-container` | `[data-testid="chat-container"]` |
| `.start-screen` | `[data-testid="start-screen"]` |
| `.start-btn` | `[data-testid="start-btn"]` |
| `.sidebar-toggle` | `[data-testid="sidebar-toggle"]` |
| `.session-sidebar` | `[data-testid="session-sidebar"]` |
| `.sidebar-close` | `[data-testid="sidebar-close"]` |
| `.sidebar-empty` | `[data-testid="sidebar-empty"]` |
| `.sidebar-new-btn` | `[data-testid="sidebar-new-btn"]` |
| `.sidebar-session-item` | `[data-testid="sidebar-session-item"]` |
| `.sidebar-session-title` | `[data-testid="sidebar-session-title"]` |
| `.sidebar-session-meta` | `[data-testid="sidebar-session-meta"]` |
| `.app-header` | `[data-testid="app-header"]` |
| `.ask-message` | `[data-testid="ask-message"]` |
| `.assistant-message` | `[data-testid="assistant-message"]` |
| `.option` | `[data-testid="option"]` |
| `.submit-btn` | `[data-testid="submit-btn"]` |
| `.message-list` | `[data-testid="message-list"]` |
| `.readonly-banner` | `[data-testid="readonly-banner"]` |
| `.widget-final-result` | `[data-testid="widget-final-result"]` |
| `.widget-slider-scale` | `[data-testid="widget-slider-scale"]` |

- [ ] **Step 2: Commit**

```bash
git add e2e/tests/sidebar-visual.spec.ts
git commit -m "fix: migrate sidebar-visual E2E selectors to data-testid"
```

---

### Task 8: Migrate E2E tests — responsive-widgets.spec.ts (fixes 1 of 9 broken tests)

**Files:**
- Modify: `e2e/tests/responsive-widgets.spec.ts`

- [ ] **Step 1: Replace all CSS selectors with data-testid**

| Old | New |
|-----|-----|
| `.chat-container` | `[data-testid="chat-container"]` |
| `.start-btn` | `[data-testid="start-btn"]` |
| `.ask-message` | `[data-testid="ask-message"]` |
| `.option` | `[data-testid="option"]` |
| `.submit-btn` | `[data-testid="submit-btn"]` |
| `.widget-category-list` | `[data-testid="widget-category-list"]` |
| `.widget-comparison` | `[data-testid="widget-comparison"]` |
| `.widget-data-table` | `[data-testid="widget-data-table"]` |
| `.widget-final-result` | `[data-testid="widget-final-result"]` |
| `.widget-metric-bars` | `[data-testid="widget-metric-bars"]` |
| `.widget-progress` | `[data-testid="widget-progress"]` |

- [ ] **Step 2: Commit**

```bash
git add e2e/tests/responsive-widgets.spec.ts
git commit -m "fix: migrate responsive-widgets E2E selectors to data-testid"
```

---

### Task 9: Migrate E2E tests — remaining 6 files

**Files:**
- Modify: `e2e/tests/ask-flow.spec.ts`
- Modify: `e2e/tests/workshop-flow.spec.ts`
- Modify: `e2e/tests/session-sidebar.spec.ts`
- Modify: `e2e/tests/multi-user-admin.spec.ts`
- Modify: `e2e/tests/real-backend.spec.ts`
- Modify: `e2e/tests/admin-ui-live.spec.ts`

- [ ] **Step 1: Replace all CSS selectors in ask-flow.spec.ts**

Same pattern — every `.class-name` selector becomes `[data-testid="class-name"]`. Full list for this file:

`.ask-message`, `.copy-btn`, `.copyable-content`, `.input-area`, `.session-done-banner`, `.slider-label-max`, `.slider-label-min`, `.start-btn`, `.submit-btn`, `.tag`, `.widget-category-list`, `.widget-comparison`, `.widget-copyable`, `.widget-data-table`, `.widget-final-result`, `.widget-metric-bars`, `.widget-progress`, `.widget-quote-highlight`, `.widget-slider-scale`, `.widget-timer`

- [ ] **Step 2: Replace all CSS selectors in workshop-flow.spec.ts**

`.ask-message`, `.assistant-message`, `.start-btn`, `.submit-btn`

- [ ] **Step 3: Replace all CSS selectors in session-sidebar.spec.ts**

`.ask-message`, `.assistant-message`, `.message-list`, `.option`, `.readonly-banner`, `.session-sidebar`, `.sidebar-close`, `.sidebar-empty`, `.sidebar-new-btn`, `.sidebar-overlay`, `.sidebar-session-item`, `.sidebar-session-title`, `.sidebar-toggle`, `.start-btn`, `.start-screen`, `.submit-btn`, `.widget-final-result`, `.widget-slider-scale`

- [ ] **Step 4: Replace all CSS selectors in multi-user-admin.spec.ts**

`.admin-empty`, `.admin-header`, `.admin-layout`, `.admin-page`, `.chat-container`, `.session-item`, `.session-list`, `.session-viewer`, `.status-badge`

Also update the mixed selector on line 72-73:

```ts
// Before:
await page1.waitForSelector('.chat-container, .start-screen, .start-btn')

// After:
await page1.waitForSelector('[data-testid="chat-container"], [data-testid="start-screen"], [data-testid="start-btn"]')
```

- [ ] **Step 5: Replace all CSS selectors in real-backend.spec.ts**

`.admin-page`, `.chat-container`, `.session-item`, `.session-list`, `.session-viewer`, `.start-btn`

- [ ] **Step 6: Replace all CSS selectors in admin-ui-live.spec.ts**

`.admin-app-name`, `.admin-menu-dropdown`, `.admin-menu-item`, `.admin-menu-item--danger`, `.admin-menu-trigger`, `.admin-page`, `.app-create-form`, `.app-editor`, `.app-editor-env-reference`, `.app-editor-prompt`, `.app-editor-version-history`, `.app-form-error`, `.app-form-input`, `.app-form-slug-preview`, `.app-list`, `.app-list-item`, `.btn-create-app`, `.btn-create-app-submit`

- [ ] **Step 7: Run tsc on e2e tests**

Run: `cd e2e && npx tsc --noEmit` (or `npx playwright test --list` to verify test discovery)
Expected: All tests discovered, no syntax errors

- [ ] **Step 8: Commit**

```bash
git add e2e/tests/
git commit -m "fix: migrate remaining E2E test selectors to data-testid"
```

---

### Task 10: Add also `data-testid` for elements only in input-area and input widgets

**Files:**
- Modify: `frontend/src/components/ChatContainer.tsx` — input-area (if it exists as a distinct element)

- [ ] **Step 1: Check and add any missing data-testid**

Grep all E2E tests for `data-testid=` selectors that don't yet have a matching attribute in the component code. For each missing one, add it to the correct component.

Key ones to verify:
- `input-area` — find the element with `.input-area` class, add `data-testid="input-area"`
- `readonly-banner` — if element doesn't exist anymore, no action needed (tests assert `.not.toBeVisible()`)

Run: `grep -roh 'data-testid="[^"]*"' e2e/tests/ | sort -u` to get full list, then verify each exists in components.

- [ ] **Step 2: Run tsc**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit (if any changes)**

```bash
git add frontend/src/
git commit -m "fix: add missing data-testid attributes for E2E coverage"
```

---

### Task 11: Add Claude rule for E2E selector sync

**Files:**
- Create: `.claude/rules/e2e-selector-sync.md`

- [ ] **Step 1: Create the rule file**

```markdown
# E2E Selector Sync

When changing or removing CSS classes, HTML structure, or `data-testid` attributes in frontend components:

1. Grep `e2e/tests/` for selectors that reference the changed elements
2. Update affected E2E tests in the same commit
3. If removing an element entirely, remove or update the E2E test that asserts on it

Convention: E2E tests use `[data-testid="name"]` selectors, never CSS class selectors. When adding new testable elements, add `data-testid` to the component and use `[data-testid="..."]` in the test.
```

- [ ] **Step 2: Commit**

```bash
git add .claude/rules/e2e-selector-sync.md
git commit -m "docs: add Claude rule for E2E selector sync"
```

---

### Task 12: Verify all E2E tests pass with mock server

**Files:** None (verification only)

- [ ] **Step 1: Run E2E tests locally**

Run: `cd e2e && npx playwright test --reporter=list`
Expected: All tests pass (or only fail on tests that require real backend)

- [ ] **Step 2: If any test fails, fix the selector mismatch**

Check error messages — if a test waits for a `data-testid` that wasn't added to a component, add it. Re-run until green.

- [ ] **Step 3: Run frontend unit tests to confirm no regressions**

Run: `cd frontend && npx vitest run`
Expected: 174/174 pass (data-testid attributes don't affect unit tests)

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve remaining E2E selector mismatches"
```
