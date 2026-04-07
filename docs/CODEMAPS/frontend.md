# Frontend Codemap

<!-- Generated: 2026-04-05 | Files scanned: 8 | Token estimate: ~850 -->

**Last Updated:** 2026-04-05
**Language:** TypeScript + React 19 + Vite
**Entry Points:** src/main.tsx → src/App.tsx

## Page Tree

```
App.tsx (Router)
├── / (ChatPage)
│   ├── AppSelector (dropdown)
│   ├── ChatContainer
│   │   ├── MessageList (messages + scrolling)
│   │   │   ├── AssistantMessage (display widgets)
│   │   │   │   └── WidgetRenderer
│   │   │   │       ├── TextWidget
│   │   │   │       ├── SectionHeaderWidget
│   │   │   │       ├── DataTableWidget
│   │   │   │       ├── ComparisonWidget
│   │   │   │       ├── CategoryListWidget
│   │   │   │       ├── QuoteHighlightWidget
│   │   │   │       ├── MetricBarsWidget
│   │   │   │       ├── CopyableWidget
│   │   │   │       ├── ProgressWidget
│   │   │   │       ├── FinalResultWidget
│   │   │   │       └── TimerWidget (countdown)
│   │   │   ├── AskMessage (form)
│   │   │   │   ├── SingleSelect (radio)
│   │   │   │   ├── MultiSelect (checkbox)
│   │   │   │   ├── FreeText (textarea/input)
│   │   │   │   ├── RankPriorities (drag-drop)
│   │   │   │   ├── SliderScale (1-10)
│   │   │   │   ├── Matrix2x2 (clickable grid)
│   │   │   │   └── TagInput (Enter to add)
│   │   │   └── UserMessage (answer recap)
│   │   ├── InputArea (main text input)
│   │   └── SessionSidebar (past sessions)
│   │       └── SessionCard (clickable history)
│   └── [read-only mode overlay]
│
└── /admin (AdminPage)
    ├── SessionList
    │   └── SessionCard (select to view)
    ├── SessionViewer (read-only SSE stream)
    ├── AppList
    │   └── AppCard (click to edit)
    ├── AppEditor
    │   ├── Form (slug, title, subtitle, body)
    │   ├── EnvironmentReference (side panel)
    │   │   ├── Widget catalog
    │   │   └── Tool reference
    │   └── VersionHistory
    │       └── VersionDiff (side-by-side)
    └── AdminHeader (breadcrumb)
```

## Component Hierarchy & Responsibilities

### Pages

| Component | File | Purpose |
|-----------|------|---------|
| ChatPage | pages/ChatPage.tsx | Main chat UI, session lifecycle |
| AdminPage | pages/AdminPage.tsx | Admin dashboard router |

### Chat Components

| Component | File | Purpose |
|-----------|------|---------|
| ChatContainer | components/ChatContainer.tsx | Main layout (chat + sidebar) |
| MessageList | components/MessageList.tsx | Renders messages, scrolling, loading state |
| AssistantMessage | components/AssistantMessage.tsx | Claude message wrapper |
| AskMessage | components/AskMessage.tsx | Form (questions + submit button) |
| UserMessage | components/UserMessage.tsx | User answer recap |
| WidgetRenderer | components/WidgetRenderer.tsx | Dispatcher: type → component |
| InputArea | components/InputArea.tsx | Text input, send button |
| AppSelector | components/AppSelector.tsx | App dropdown (start/switch) |
| SessionSidebar | components/SessionSidebar.tsx | Past session list |

### Display Widgets (show)

| Component | File | Type | Purpose |
|-----------|------|------|---------|
| TextWidget | components/display/TextWidget.tsx | text | Markdown-rendered commentary |
| SectionHeaderWidget | components/display/SectionHeader.tsx | section_header | Phase/section title |
| DataTableWidget | components/display/DataTable.tsx | data_table | Table + highlights |
| ComparisonWidget | components/display/Comparison.tsx | comparison | Side-by-side diff |
| CategoryListWidget | components/display/CategoryList.tsx | category_list | Grouped items + styles |
| QuoteHighlightWidget | components/display/QuoteHighlight.tsx | quote_highlight | Key quote |
| MetricBarsWidget | components/display/MetricBars.tsx | metric_bars | Scored metrics |
| CopyableWidget | components/display/CopyableBlock.tsx | copyable | Copy-to-clipboard |
| ProgressWidget | components/display/ProgressBar.tsx | progress | Progress indicator |
| FinalResultWidget | components/display/FinalResult.tsx | final_result | Accent result display |
| TimerWidget | components/display/TimerWidget.tsx | timer | Countdown timer |

### Input Widgets (ask)

| Component | File | Type | Purpose |
|-----------|------|------|---------|
| SingleSelectWidget | components/input/SingleSelect.tsx | single_select | Radio buttons |
| MultiSelectWidget | components/input/MultiSelect.tsx | multi_select | Checkboxes |
| FreeTextWidget | components/input/FreeText.tsx | free_text | Textarea/input |
| RankPrioritiesWidget | components/input/RankPriorities.tsx | rank_priorities | Drag-drop ranking |
| SliderScaleWidget | components/input/SliderScale.tsx | slider_scale | Scale 1-10 |
| Matrix2x2Widget | components/input/Matrix2x2.tsx | matrix_2x2 | Clickable 2x2 grid |
| TagInputWidget | components/input/TagInput.tsx | tag_input | Tag entry (Enter) |

### Admin Components

| Component | File | Purpose |
|-----------|------|---------|
| SessionList | components/admin/SessionList.tsx | List all sessions |
| SessionViewer | components/admin/SessionViewer.tsx | View session (read-only SSE) |
| AppList | components/admin/AppList.tsx | List all apps |
| AppEditor | components/admin/AppEditor.tsx | Create/edit app |
| VersionHistory | components/admin/VersionHistory.tsx | App version timeline |
| VersionDiff | components/admin/VersionDiff.tsx | Diff view (side-by-side) |
| EnvironmentReference | components/admin/EnvironmentReference.tsx | Widget + tool catalog |

## State Management (Hooks)

### useSSE()

```typescript
// hooks/useSSE.ts
function useSSE(sessionId: string, enabled: boolean) {
  // 1. Connect to GET /stream (EventSource)
  // 2. Listen for event types:
  //    - assistant_message: push {blocks} → dispatch action
  //    - ask_message: push {id, questions} → dispatch action
  //    - user_message: push {answers} → dispatch action
  //    - research_start/done: push {label} → dispatch action
  //    - stream_delta: push {text} → append to current message
  //    - done: close stream
  //    - error: show error, close stream
  // 3. Reconnect on disconnect (exponential backoff)
  // 4. Cleanup on unmount

  const { addMessage, updateLastMessage, setError, setDone } = useChat()

  useEffect(() => {
    if (!enabled) return
    const es = new EventSource(`/stream?session_id=${sessionId}`)

    es.addEventListener('assistant_message', (e) => {
      const { blocks } = JSON.parse(e.data)
      addMessage({ role: 'assistant', blocks })
    })

    es.addEventListener('ask_message', (e) => {
      const { id, preamble, questions } = JSON.parse(e.data)
      addMessage({ role: 'assistant', ask_id: id, preamble, questions })
    })

    // ... other event handlers ...

    return () => es.close()
  }, [sessionId, enabled])
}
```

### useChat()

```typescript
// hooks/useChat.ts
function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [appId, setAppId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // dispatch actions:
  const addMessage = (msg: Message) => setMessages(prev => [...prev, msg])
  const updateLastMessage = (update: Partial<Message>) => { ... }
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView()

  // send message
  const sendMessage = async (text: string) => {
    setIsLoading(true)
    try {
      const { session_id } = await startChat(text, sessionId)
      setSessionId(session_id)
      addMessage({ role: 'user', text })
    } catch (err) {
      setError(String(err))
    } finally {
      setIsLoading(false)
    }
  }

  // submit form (ask)
  const submitAnswers = async (askId: string, answers: Record<string, unknown>) => {
    try {
      await submitAnswers(sessionId, askId, answers)
      // Server will push user_message event via SSE
    } catch (err) {
      setError(String(err))
    }
  }

  return { messages, sessionId, appId, isLoading, error, sendMessage, submitAnswers, ... }
}
```

## API Clients

### api.ts — Chat API

```typescript
// Core request helper
async function request<T>(path: string, options?: RequestInit): Promise<T>
  // Adds X-User-Id, X-User-Display-Name headers

// Chat
async function startChat(message: string, sessionId?: string): Promise<{ session_id: string }>
  // POST /chat

async function submitAnswers(sessionId: string, askId: string, answers: Record<string, unknown>): Promise<void>
  // POST /answers

async function createSession(appId?: number): Promise<{ session_id: string }>
  // POST /sessions/create

async function loadSession(sessionId: string): Promise<HistoryEntry[]>
  // GET /sessions/{id}

async function listSessions(): Promise<SessionInfo[]>
  // GET /sessions

async function listApps(): Promise<AppInfo[]>
  // GET /apps

async function getConfig(): Promise<{ title: string; subtitle?: string }>
  // GET /config

async function getEnvironment(): Promise<EnvironmentInfo>
  // GET /api/environment (widget + tool catalog)
```

### api-admin.ts — Admin API

```typescript
// Sessions
async function listSessionsAdmin(): Promise<AdminSessionInfo[]>
  // GET /admin/sessions

async function getHistoryAdmin(sessionId: string): Promise<HistoryEntry[]>
  // GET /admin/sessions/{id}/history

// Apps
async function listAppsAdmin(): Promise<AppMetadata[]>
  // GET /admin/apps

async function createAdminApp(data: CreateAppRequest): Promise<AppMetadata>
  // POST /admin/apps

async function getAdminApp(appId: number): Promise<AppDetail>
  // GET /admin/apps/{id}

async function updateAdminApp(appId: number, data: UpdateAppRequest): Promise<AppMetadata>
  // PUT /admin/apps/{id}

async function listVersionsAdmin(appId: number): Promise<VersionInfo[]>
  // GET /admin/apps/{id}/versions

async function getVersionAdmin(appId: number, versionId: number): Promise<VersionDetail>
  // GET /admin/apps/{id}/versions/{vid}

async function validatePrompt(body: string): Promise<ValidationResult>
  // POST /admin/validate (optional backend endpoint)
```

## Type Definitions (types.ts)

### Display Widgets

```typescript
export type DisplayWidget =
  | TextWidget           // content: string
  | SectionHeaderWidget  // title, subtitle?
  | DataTableWidget      // columns, rows, highlights
  | ComparisonWidget     // left {label, content}, right {...}
  | CategoryListWidget   // categories [{label, items, style?}]
  | QuoteHighlightWidget // quote, attribution?, source?, note?
  | MetricBarsWidget     // metrics [{label, value, max, unit?}]
  | CopyableWidget       // content
  | ProgressWidget       // label, percent
  | FinalResultWidget    // content (accented)
  | TimerWidget          // seconds, label?
```

### Input Widgets

```typescript
export type InputWidget =
  | SingleSelectQuestion   // options: string[]
  | MultiSelectQuestion    // options: string[]
  | FreeTextQuestion       // placeholder?
  | RankPrioritiesQuestion // items: string[]
  | SliderScaleQuestion    // min?, max?, default?
  | Matrix2x2Question      // rows: string[], cols: string[]
  | TagInputQuestion       // placeholder?

export interface Question {
  id: string
  label: string
  type: InputWidget['type']
  required?: boolean
}
```

### SSE Events

```typescript
export interface Message {
  id?: string
  role: 'user' | 'assistant'
  text?: string
  blocks?: DisplayWidget[]
  ask_id?: string
  preamble?: string
  questions?: Question[]
  answers?: Record<string, unknown>
}

export interface SSEEvent {
  event: 'assistant_message' | 'ask_message' | 'user_message' | 'research_start' | 'research_done' | 'stream_delta' | 'done' | 'error'
  data: Record<string, unknown>
}
```

## Local Storage & Session Storage

| Key | Storage | Purpose |
|-----|---------|---------|
| `user_id` | localStorage | Anonymous user ID (UUID, created once) |
| `session_id` | sessionStorage | Current session (reset on tab close) |
| `display_name` | localStorage | Optional user display name (admin) |
| `theme` | localStorage | Light/dark mode (optional) |

## Styling

- **global.css** — Base theme (dark: bg `#08080a`, surface `#121215`, accent `#e8c46c`)
- **admin.css** — Admin dashboard styles
- **Fonts:** Playfair Display (h1-h3), DM Sans (body), JetBrains Mono (code/labels)

## Build & Dev

```bash
# Development
npm run dev -- --port 4920

# Build
npm run build

# Lint
npm run lint

# Type check
tsc -b

# Test
npm test (via vitest, fixtures in __tests__/)
```

## Testing Files

- `__tests__/widgets.test.tsx` — Widget rendering
- `__tests__/hooks.test.ts` — useSSE, useChat
- `__tests__/components.test.tsx` — Component integration
