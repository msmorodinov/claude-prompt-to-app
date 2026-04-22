# Plan: App "Instagram Carousel Designer"

**Status:** PLAN (awaiting approval, revision 6)
**Author:** architect
**Date:** 2026-04-21 (revised 2026-04-22)
**Branch target:** `feature/carousel-app`

## Revision history

- **r1** — URL rewriting в `get_session()`; HMAC с `user_id`; migration try/except; render pre-check; `networkidle`.
- **r2** — heavy install вынесен в pre-flight `install-renderer.sh`; `get_session()` берёт `owner_id` сам.
- **r3** — scratchpad = файл `scratchpad.md`; eager `provision_session` при create.
- **r4** — systemd hardening.
- **r5** — bwrap per-Chromium-call; placeholder bwrap для CC CLI.
- **r6** — **S3 (Cloudflare R2) как storage вместо локальной ФС.** Убирает ~30% кода. Плюс все фиксы после codex-review: vendored fonts (убираем `--share-net`), правильные systemd directives совместимые с bwrap, fail-hard migration, CHECK constraint, writable Chromium profile, canonical key validation.

## Motivation

Новый App в платформе forge-simple, который по промпту генерирует Instagram-карусель согласно жёсткой дизайн-системе (`docs/draft_for_gen.pdf`, v1.2 — 1080×1350, 8 шаблонов T1..T8). Агент пишет HTML, рендерит в PNG через Playwright CLI внутри bwrap, показывает превью галереей, принимает правки ("переделай слайд 3"), в финале отдаёт ZIP.

Это первый App, генерирующий **файловые артефакты**. Storage — Cloudflare R2 (S3-совместимый). Per-session префикс `sessions/{uuid}/`. Остальные App смогут переиспользовать инфраструктуру в будущем.

## Goals

1. Пользователь задаёт тему → 8 PNG слайдов в превью-галерее → скачивает ZIP.
2. Адресные правки: "переделай слайд 3" — перегенерировать только этот файл.
3. Нулевая регрессия для остальных App: tools гейтятся по `session.mode == "carousel"`.
4. Storage — R2, presigned URL для `<img>`, no local FS storage.
5. Chromium isolated через bwrap: rendered HTML не имеет сетевого доступа (SSRF prevention), не видит чужие сессии.

### Non-goals
Видео/анимация, Instagram API-публикация, AI-генерация картинок (только эмодзи/CSS/SVG), multi-size variants.

## Architecture overview

```
 Browser                   FastAPI                    Claude CLI (agent)
 ───────                   ───────                    ──────────────────
 ChatPage ──POST /chat───▶ run_agent() ─────────────▶ subprocess
                            │                          │
                            │  MCP tools (new):        │
                            │   write_file      ◀──────┤
                            │   render_html     ◀──────┤
                            │     │                    │
                            │     └─▶ bwrap            │
                            │          playwright      │
                            │          screenshot      │
                            │   list_files     ◀───────┤
                            │   show(image_gallery) ──▶│
                            │   ask(image_select)   ──▶│
                            ▼
                         aioboto3
                            │
                            ▼
                 Cloudflare R2 (S3-compat)
                   Bucket: prompt2app
                   Keys:   {env}/sessions/{sid}/
                             scratchpad.md
                             slide_01.html ... slide_08.html
                             slide_01.png  ... slide_08.png

 Browser <img src=...> ──────presigned GET─────────▶ R2 (CORS allows origin)
 Browser <a href=.../files.zip> ──────────▶ FastAPI streams zip from R2
```

**Render flow в деталях:**
1. `write_file("slide_01.html", html)` → aioboto3 `put_object(Key="prod/sessions/{sid}/slide_01.html", Body=html)`.
2. `render_html("slide_01.html", "slide_01.png")`:
   - backend скачивает HTML из R2 в эфемерный tmpfs `/var/tmp/forge-render/{sid}-{rand}/workspace/slide_01.html`
   - bind-mount шрифтов туда же (`/workspace/fonts/`)
   - bwrap → playwright screenshot → `/workspace/slide_01.png`
   - backend читает `slide_01.png` → `put_object` в R2
   - `rmtree` tmpfs dir
3. `show([{type:"image_gallery", images:[{file:"slide_01.png"}]}])` — backend генерирует presigned URL через `s3_client.generate_presigned_url("get_object", Bucket=..., Key="prod/sessions/{sid}/slide_01.png", ExpiresIn=300)` и переписывает `file → url`.
4. Browser `<img src="https://...r2.cloudflarestorage.com/prompt2app/prod/sessions/...?X-Amz-Signature=...">` — GET напрямую к R2, backend не участвует.

## File-by-file changes

### New — backend
- `backend/storage_r2.py` — aioboto3-обёртка: `put_object(key, body)`, `get_object(key) -> bytes`, `list_prefix(prefix)`, `delete_prefix(prefix)`, `generate_presigned_url(key, expires=300, method="get_object")`, `stream_zip_from_prefix(prefix) -> AsyncIterator[bytes]`. Всё под капотом `aioboto3.Session` + `R2_*` env vars. Key validation: `validate_key_name(name)` — тот же regex что в `write_file`, отсекает path-traversal-like ключи.
- `backend/renderer.py` — `async def render_html(sid, html_key_rel, png_key_rel, viewport=(1080,1350), timeout=35.0)`:
  1. Создаёт эфемерный workspace `/var/tmp/forge-render/{uuid4()}` (на tmpfs через systemd `PrivateTmp=yes` попадёт в изолированный /tmp — но мы используем `/var/tmp` для более долгого life cycle; либо специальный mount-point).
  2. Скачивает HTML из R2 туда.
  3. `build_render_cmd(workspace_dir, html_rel, png_rel)` — см. "bwrap".
  4. Subprocess, timeout, capture stderr на ошибке.
  5. Читает PNG, `put_object` в R2.
  6. `shutil.rmtree(workspace_dir)`.
  Плюс `check_renderer_available()` (lifespan): `bwrap --version`, `playwright chromium --version`, `aioboto3 R2 connectivity test` (head bucket).
- `backend/assets/fonts/Unbounded-Regular.woff2`, `Unbounded-Bold.woff2`, `Unbounded-Black.woff2`, `Montserrat-Regular.woff2`, `Montserrat-Medium.woff2`, `Montserrat-Bold.woff2`, `JetBrainsMono-Regular.woff2`, `JetBrainsMono-Bold.woff2`, `NotoColorEmoji.ttf` — vendored шрифты, скачиваются один раз через `scripts/fetch-fonts.sh`. Коммитим bytes в репо (размер ~3-5 МБ total).
- `backend/personas/carousel-design-system.md` — выжимка дизайн-системы + workflow для агента. Содержит `@font-face` CSS snippet со ссылкой на локальные шрифты в workspace (`file:///workspace/fonts/Unbounded-Bold.woff2`).
- `backend/migrations/0010_carousel_app.py` — см. Migration plan.
- `backend/tests/test_storage_r2.py`, `test_renderer.py`, `test_tools_carousel.py`, `test_files_endpoint.py`.

### New — frontend
- `frontend/src/components/display/ImageGallery.tsx` — grid + lightbox.
- `frontend/src/components/display/FileDownload.tsx` — карточка с именем/размером/кнопкой.
- `frontend/src/components/display/Lightbox.tsx` — минимальный overlay (ESC/click-outside/стрелки), без внешних deps.
- `frontend/src/components/input/ImageSelect.tsx` — grid с radio/checkbox.
- Тесты vitest для всех.

### New — deploy / infra
- `deploy/forge-simple.service` — systemd unit с hardening (см. "systemd unit").
- `deploy/install-renderer.sh` — pre-flight (bwrap, playwright, chromium, noto-color-emoji, копирование unit, применение env-файла).
- `deploy/forge-simple.env.example` — шаблон env с `R2_*` placeholder'ами. Реальный файл `/etc/forge-simple.env` на VPS (chmod 0600, **не в репо**).
- `scripts/fetch-fonts.sh` — одноразовый загрузчик шрифтов в `backend/assets/fonts/`.

### Modified — backend
- `backend/schemas.py` — добавить `image_gallery`, `file_download` в `DISPLAY_WIDGETS`; `image_select` в `INPUT_WIDGETS`.
- `backend/tools.py` — factory для `write_file`, `render_html`, `list_files`. Параметр `include_carousel_tools: bool`.
- `backend/agent.py` — включение tools при `mode=="carousel"`.
- `backend/server.py`:
  - Новые endpoints (см. "REST").
  - Lifespan: `check_renderer_available()` + `storage_r2.ping()`.
  - `POST /sessions/create`: для `mode=="carousel"` вызывать `storage_r2.ensure_scratchpad(sid)` — PUT пустого `scratchpad.md` (ленивый — создать только если нет).
  - Валидация `req_mode` на `server.py:446` — добавить `"carousel"` в allowlist.
- `backend/session.py` — строка 28 (`# normal | app-builder | carousel`), валидация в `SessionState.__post_init__` / `SessionManager.create()`.
- `backend/db.py`:
  - `get_session()` дополнительно тянет `owner_id` из row; после формирования истории — `rewrite_media_urls(history, sid, owner_id)` подставляет свежие presigned URL для виджетов `image_gallery`/`image_select`/`file_download`. No-op для non-carousel сессий.
  - `save_session()` принимает `mode="carousel"`.
- `backend/requirements.txt` — добавить `aioboto3>=12.0.0`, `python-dotenv>=1.0` (опционально).

### Modified — frontend
- `frontend/src/types.ts` — 3 новых widget type.
- `frontend/src/components/WidgetRenderer.tsx` — case для `image_gallery`, `file_download`.
- `frontend/src/components/AskMessage.tsx` (или input-dispatcher) — case для `image_select`.
- `frontend/src/styles/global.css` — `.image-gallery`, `.lightbox-overlay`, `.file-download-card`, `.image-select`.

### Modified — docs
- `CLAUDE.md` — project tree, widget tables, MCP tools list, API endpoints.
- `docs/RUNBOOK.md` — "First-time carousel deploy", "R2 credentials rotation", "Emergency: renderer stuck".

## MCP tools spec

**Гейт:** все 3 доступны только при `session.mode == "carousel"` (паттерн `save_app` из `app-builder` режима).

### `write_file(path: str, content: str) -> str`
Schema: `path` — 1..80 chars, `^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$` (flat namespace); `content` — UTF-8 string, ≤ `MAX_FILE_BYTES=1_000_000` байт.

Валидация (каждая ошибка → `is_error=True`):
1. `Path(path).suffix.lower() in ALLOWED_EXT = {".html", ".png", ".md", ".txt", ".json"}`.
2. Regex match.
3. `len(content.encode("utf-8")) <= MAX_FILE_BYTES`.
4. До PUT: `list_prefix(f"{KEY_PREFIX}sessions/{sid}/")` count ≤ `MAX_FILES=50`, total bytes + content ≤ `MAX_TOTAL_BYTES=20_000_000`. Отказ если overflow.
5. `put_object(Key=f"{KEY_PREFIX}sessions/{sid}/{path}", Body=content.encode(), ContentType=<guess>)`.

Возвращает: `"Wrote slide_01.html (4.2 KB)"`.

**Зачем pre-list на каждый write:** 50 keys — ничтожный листинг (≤50 ms). Даёт честный overflow-check. Альтернатива — держать count в БД, но для MVP лишняя таблица.

### `render_html(input_path: str, output_path: str) -> str`
Schema: `input_path.endswith(".html")`, `output_path.endswith(".png")`, оба — flat-regex.

1. Canonicalize оба имени (regex-match, decode нужно только если кто-то URL-encoded).
2. Pre-check: list_prefix, убедиться что место под +500KB есть (см. lim выше).
3. Скачать HTML из R2 в tmpfs workspace.
4. Bind-mount шрифтов (см. bwrap).
5. Запустить bwrap + playwright screenshot.
6. `asyncio.wait_for(..., timeout=35.0)`.
7. Проверить rc==0, PNG size > 0 и ≤ `MAX_FILE_BYTES`.
8. `put_object` PNG в R2.
9. `rmtree` workspace (finally).

Возвращает: `"Rendered slide_01.html → slide_01.png (142 KB)"` либо tail stderr.

### `list_files() -> str`
`list_prefix(f"{KEY_PREFIX}sessions/{sid}/")` → текстовая таблица для агента:
```
scratchpad.md   (0 bytes, modified ...)
slide_01.html  (4.2 KB, ...)
slide_01.png   (142 KB, ...)
```

### Bundling
**Не MCP tool.** ZIP генерируется on-the-fly на `GET /sessions/{sid}/files.zip` — stream из R2 list+get. Агент вызывает `show([{type:"file_download", filename:"carousel.zip"}])`.

## REST endpoints spec

### `GET /sessions/{session_id}/files` (auth: Bearer, owner или admin)
Возвращает JSON список (прозрачный wrapper над `list_prefix`):
```json
{
  "files": [{"name":"slide_01.png","size":145120,"modified":"..."}, ...],
  "total_size": 180450,
  "count": 16
}
```
(Листинг идёт в обход presigned-URL — endpoint использует service credentials. Ownership-check на уровне endpoint.)

### `GET /sessions/{session_id}/files.zip` (auth: Bearer, owner или admin)
- `StreamingResponse` с async generator, который:
  1. `list_prefix` → фильтр `.png`.
  2. Для каждого — `get_object` stream → zipfile.ZipFile(stream_writer). Используем `zipstream-ng` (async, streaming) либо ручной `zipfile.PyZipFile` с `yield` по chunk-ам.
  3. Лимит: `MAX_ZIP_BYTES=50_000_000` (50 МБ) — hard cap, abort генерации при превышении.
- `Content-Disposition: attachment; filename="carousel-{sid}.zip"`.

**No signed URL.** Потому что:
- ZIP stream требует compute в backend (не прямой download из R2).
- Bearer auth с ownership check — достаточно для `<a href>` (не `<img>`).

### No `GET /sessions/{sid}/files/{path}` endpoint
Удалён из архитектуры. Browser загружает картинки напрямую с R2 по presigned URL из SSE/history payload. Backend не проксирует PNG байты.

### Presigned URL generation (internal helper)
- `storage_r2.generate_presigned_url(key, expires=300)` — aioboto3 `generate_presigned_url("get_object", Params={"Bucket": R2_BUCKET, "Key": key}, ExpiresIn=300)`.
- Вызывается в:
  - push_sse для виджетов `image_gallery`/`image_select`/`file_download` — переписывает `file` в `url`.
  - `db.get_session()` при загрузке истории (тот же `rewrite_media_urls(history, sid, owner_id)` хук, но owner_id нужен только для ownership pre-check; для самой подписи R2 использует service credentials).

**Ownership check в rewrite_media_urls:** если текущий request user ≠ session.owner_id и ≠ admin, функция НЕ генерирует URL (оставляет `file`, фронт показывает broken image placeholder). На практике оба endpoint (`/sessions/{id}`, `/admin/sessions/{id}/history`) уже делают ownership check ДО вызова `get_session()`, так что это паранойя. Но паранойя оправдана.

**Canonicalization:** key генерится как `f"{KEY_PREFIX}sessions/{sid}/{validate_key_name(name)}"`. `validate_key_name` — re-run того же regex что в `write_file`. Signing и verification — обе стороны используют идентичную строку.

## Widget schemas (backend JSON)

```python
# DISPLAY
"image_gallery": {
    "type": "object",
    "properties": {
        "type": {"const": "image_gallery"},
        "title": {"type": "string"},
        "images": {
            "type": "array", "minItems": 1, "maxItems": 20,
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "file": {"type": "string"},          # logical name, backend signs to url
                    "caption": {"type": "string"},
                    "seq": {"type": "integer"},
                },
                "required": ["id", "file"],
            },
        },
    },
    "required": ["type", "images"],
},
"file_download": {
    "type": "object",
    "properties": {
        "type": {"const": "file_download"},
        "kind": {"const": "zip"},
        "label": {"type": "string"},
        "filename": {"type": "string"},
    },
    "required": ["type", "filename"],
},

# INPUT
"image_select": {
    "type": "object",
    "properties": {
        "type": {"const": "image_select"},
        "id": {"type": "string"},
        "label": {"type": "string"},
        "multi": {"type": "boolean"},
        "min_select": {"type": "integer", "minimum": 0},
        "max_select": {"type": "integer", "minimum": 1},
        "images": {"...same as above..."},
    },
    "required": ["type", "id", "label", "images"],
},
```

**URL rewriting (backend только):** frontend получает готовые presigned URL в `url` поле. Не знает о R2, credentials, TTL. При reload history backend генерит свежие URL (TTL всегда актуальный).

## App prompt

Хранится в `prompt_body` версии App в БД (seed через миграцию из `backend/personas/carousel-design-system.md`). Логика versioning уже работает в платформе.

Содержит:
- Workflow (ask → generate → render → gallery → revise → zip).
- Полный JSON дизайн-системы из `docs/draft_for_gen.pdf`.
- CSS snippet с `@font-face` на локальные шрифты в `/workspace/fonts/` (Unbounded, Montserrat, JetBrainsMono).
- 8 template HTML snippets (T1..T8).
- Rules: 1080×1350 без скролла, эмодзи 120-200px, title не полностью акцент, логические имена `slide_NN.*`.

## R2 storage config

**Env vars (в `/etc/forge-simple.env` на VPS, `backend/.env` локально):**
```
R2_ENDPOINT_URL=https://58614ccc597b104444c430b0546b3c31.r2.cloudflarestorage.com
R2_BUCKET=prompt2app
R2_ACCESS_KEY_ID=<scoped-token-key>
R2_SECRET_ACCESS_KEY=<scoped-token-secret>
R2_REGION=auto
R2_KEY_PREFIX=prod/          # dev/ для локальной разработки
R2_PRESIGNED_URL_TTL=300     # 5 минут
```

**Передача в процесс:** systemd unit `EnvironmentFile=/etc/forge-simple.env`. Python подгружает через `os.getenv(...)` (либо `python-dotenv` для локали). Никаких credentials в SQLite/коде.

**Lifecycle rule** (уже настроено пользователем): prefix `sessions/`, expiration 180 дней от создания объекта.

**CORS** (уже настроено): `AllowedOrigins: ["https://prompt2app.novaco.io", "http://localhost:4920"]`, methods `GET, HEAD`.

**Bucket organization:**
- `prod/sessions/{sid}/...` — production
- `dev/sessions/{sid}/...` — local dev
- Префикс контролируется `R2_KEY_PREFIX`. Миграция не нужна — префикс чисто runtime.

## bwrap sandbox for Chromium render

**Зачем:** Chromium — единственная RCE-поверхность (исполняет agent-authored HTML). `--share-net` УДАЛЁН (был SSRF vector — агент мог через HTML `<script>fetch(...)</script>` делать запросы к cloud metadata, localhost, RFC1918). Сейчас Chromium **без сети** — шрифты локальные, external `<img src>` не загружаются.

**Команда (строится в `renderer.py::build_render_cmd`):**
```python
cmd = [
    "bwrap",
    # System libs — read-only
    "--ro-bind", "/usr", "/usr",
    "--ro-bind", "/lib", "/lib",
    "--ro-bind", "/lib64", "/lib64",
    "--ro-bind", "/bin", "/bin",
    "--ro-bind", "/etc/fonts", "/etc/fonts",                    # fontconfig
    "--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf",        # не использовать — нет сети, но на случай если DNS readable требуется
    "--ro-bind", "/etc/ssl", "/etc/ssl",                        # CA certs (не нужны при no-net, но пусть)
    "--ro-bind", "/root/.cache/ms-playwright", "/root/.cache/ms-playwright",
    "--ro-bind", "/opt/forge-simple/.venv", "/opt/forge-simple/.venv",
    "--ro-bind", "/opt/forge-simple/backend/assets/fonts", f"{workspace}/fonts",
    # Standard ephemeral mounts
    "--dev", "/dev",
    "--proc", "/proc",
    "--tmpfs", "/tmp",
    "--tmpfs", "/root/.config",                                  # Chromium profile в tmpfs
    "--tmpfs", "/root/.cache/chromium",                          # Chromium runtime cache
    # EDIT: writable workspace (bind из /var/tmp/forge-render/{uuid})
    "--bind", str(workspace), "/workspace",
    "--chdir", "/workspace",
    # Namespaces (user, pid, uts, ipc, cgroup — НЕ net: сеть отрубаем через --unshare-net)
    "--unshare-user",
    "--unshare-pid",
    "--unshare-uts",
    "--unshare-ipc",
    "--unshare-cgroup-try",     # не во всех kernel работает, try-флаг
    "--unshare-net",            # !! полная изоляция от сети; SSRF невозможен
    "--die-with-parent",
    "--new-session",
    # Реальная команда
    "/opt/forge-simple/.venv/bin/playwright", "screenshot",
    "--viewport-size=1080,1350",
    "--full-page=false",
    # НЕТ --wait-for-load-state=networkidle — сеть выключена, networkidle мгновенен
    f"file:///workspace/{html_rel}",
    f"/workspace/{png_rel}",
]
```

**Ключевые изменения после codex-review:**
- `--unshare-net` вместо `--share-net`: полностью рубим сеть Chromium. **Решает SSRF.** Google Fonts не нужен — шрифты vendored.
- `--tmpfs /root/.config` и `--tmpfs /root/.cache/chromium`: writable профиль Chromium внутри sandbox. **Решает codex issue #4** (`ms-playwright` оставляем ro — он содержит бинарь).
- `--unshare-user`: создаёт user namespace, root внутри sandbox ≠ root host. Дополнительный слой привилегий.
- `--unshare-cgroup-try`: `try`-вариант не падает на старых kernel (ядро VPS Debian 5.x поддерживает, но для защиты).

**Что даёт:**
- Chromium физически не видит: `/home`, другие R2-ключи, sessions SQLite, чужие workspace (каждый render — свой `/var/tmp/forge-render/{uuid}`), network (`--unshare-net`).
- CVE Chromium → максимум компрометирует эфемерный `/workspace` (пустой после каждого render).
- No SSRF via HTML — нет сети.
- Overhead bwrap ≈ 50-100 ms/render.

**Vendored fonts:**
- `backend/assets/fonts/` содержит `.woff2`/`.ttf` с открытыми лицензиями (OFL).
- `scripts/fetch-fonts.sh` одноразово скачивает их с Google Fonts API (при первой настройке dev-окружения).
- HTML в prompt использует:
  ```css
  @font-face {
    font-family: 'Unbounded';
    src: url('file:///workspace/fonts/Unbounded-Bold.woff2') format('woff2');
    font-weight: 700;
  }
  ```
- Эмодзи — `NotoColorEmoji.ttf`, fontconfig подхватит при наличии в workspace fonts.

**Verify (Phase 1 тесты):**
- `test_render_basic` — минимальный HTML → PNG 1080×1350.
- `test_bwrap_no_network` — HTML с `<script>fetch('http://169.254.169.254/')</script>` — fetch падает, рендер всё равно проходит (JS ошибка не ломает скриншот).
- `test_bwrap_workspace_isolated` — HTML с `<iframe src="file:///etc/passwd">` не отображает содержимое (файл недоступен из namespace).
- `test_fonts_rendered` — HTML использует `@font-face`, PNG имеет правильную типографику (сравнение пикселей hash).

## systemd unit — hardening (compatible with bwrap)

**Ключевое после codex-review:** убран `RestrictNamespaces=yes` (блокировал bwrap clone). Заменён на list-form разрешающий нужные namespaces. `SystemCallFilter` расширен.

```ini
[Service]
EnvironmentFile=/etc/forge-simple.env

# Filesystem isolation
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
# Единственные writable пути: SQLite, playwright cache, логи деплоя, /var/tmp (для renderer workspace)
ReadWritePaths=/opt/forge-simple/backend/sessions.db
ReadWritePaths=/opt/forge-simple/backend/sessions.db-journal
ReadWritePaths=/opt/forge-simple/backend/sessions.db-wal
ReadWritePaths=/opt/forge-simple/backend/sessions.db-shm
ReadWritePaths=/opt/forge-simple/deploy/logs
ReadWritePaths=/root/.cache/ms-playwright
ReadWritePaths=/var/tmp/forge-render

# Privilege reduction
NoNewPrivileges=yes
RestrictSUIDSGID=yes
LockPersonality=yes

# Kernel protection
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes

# Namespaces — разрешить user+pid+mount+ipc+uts+cgroup+net (нужны bwrap'у);
# НЕ используем RestrictNamespaces=yes (он бы запретил bwrap clone)
# Вместо этого явный list-form разрешает всё, кроме time namespace
RestrictNamespaces=user pid mount ipc uts cgroup net

RestrictRealtime=yes

# Syscall filter — включаем базовый набор + phase нужные для bwrap/Chromium
# @system-service содержит большинство; @mount и @clone нужны отдельно для unshare/bwrap
SystemCallFilter=@system-service @mount @clone
SystemCallErrorNumber=EPERM
# Chromium нужен V8 JIT — НЕ ставим MemoryDenyWriteExecute

# No PrivateNetwork — нужно для R2 outbound
```

**Не ставим:**
- `MemoryDenyWriteExecute=yes` — Chromium V8 JIT.
- `PrivateNetwork=yes` — backend уходит в R2 через HTTPS.
- `User=forge-simple` — future work, оставляем root. Для компенсации:
  ```ini
  CapabilityBoundingSet=CAP_NET_BIND_SERVICE CAP_SETUID CAP_SETGID CAP_SYS_ADMIN CAP_SYS_CHROOT
  AmbientCapabilities=
  ```
  `CAP_SYS_ADMIN` и `CAP_SYS_CHROOT` нужны bwrap'у. Остальные capabilities (CAP_DAC_OVERRIDE, CAP_NET_RAW и пр.) сбрасываются — мягкий аналог user drop.

**Verify:**
- `systemd-analyze security forge-simple.service` — exposure level ≤ 3.5 (было ~9.5, с `RestrictNamespaces=yes` было бы 2.0, но bwrap не работал бы).
- Фактическая проверка: `systemctl restart forge-simple` → `systemctl status` shows active → debug endpoint вызывает `render_html("test.html", "test.png")` → success.

**Применение:** unit коммитим в `deploy/forge-simple.service`, `install-renderer.sh` копирует в `/etc/systemd/system/`.

## Migration plan

### `backend/migrations/0010_carousel_app.py`

Операции:
1. **Seed App** `slug='carousel-designer'` (type='app', is_active=1, model='opus'):
   ```python
   prompt_path = Path(__file__).parent.parent / "personas" / "carousel-design-system.md"
   if not prompt_path.exists():
       # Fail hard in production; allow override for tests
       if os.getenv("FORGE_ALLOW_STUB_MIGRATIONS") != "1":
           raise RuntimeError(
               f"Required seed file missing: {prompt_path}. "
               f"Commit it before running migration 0010."
           )
       body = "# Instagram Carousel Designer\n\n*Stub for tests only.*\n"
   else:
       body = prompt_path.read_text(encoding="utf-8")
   # INSERT app + version только если slug='carousel-designer' отсутствует
   ```
2. **CHECK constraint на `sessions.mode`** — миграция пересоздаёт `sessions` table через `CREATE TABLE sessions_new ... CHECK (mode IN ('normal', 'app-builder', 'carousel')) ... ; INSERT INTO sessions_new SELECT * FROM sessions ; DROP TABLE sessions ; ALTER TABLE sessions_new RENAME TO sessions`. **НО** SQLite-миграция через table rebuild с CHECK может оказаться сложной (foreign keys, indexes). **Альтернатива:** оставить без CHECK на БД-уровне, жёсткая валидация только в Python (`SessionState.__post_init__`), документировать в комментарии к миграции. **Решение: отложить CHECK в отдельный follow-up.** В `0010` добавить только validation в Python code (через `session.py`). Reviewer flag'ом оставит TODO.
3. `R2_*` env vars — **не в БД**, только в `/etc/forge-simple.env`. Никакого `carousel_signing_key` — он упразднён (R2 использует свои credentials для presigning).

**Idempotency:** SELECT перед INSERT для `apps`. Нет `INSERT OR IGNORE` с fallback stub — миграция падает при отсутствии `.md` файла в prod.

**Порядок в PR:** `backend/personas/carousel-design-system.md` **обязан** быть в одном PR с миграцией. Reviewer проверяет diff.

## Security — defense in depth (layered)

### Слои изоляции

| Слой | Что защищает | Как |
|---|---|---|
| **1. Application (Python)** | Bad key names, size limits | `validate_key_name()` regex, `MAX_*` лимиты, pre-check list_prefix |
| **2. R2 bucket policy** | Cross-session, public access | Bucket private, access только service credentials; TTL lifecycle |
| **3. Kernel (systemd)** | Всё остальное | `ReadWritePaths` (только SQLite+playwright cache+/var/tmp/forge-render); `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateDevices=yes`; namespace list-form |
| **4. bwrap — per-render** | Chromium RCE, SSRF | `--unshare-net` (no network!), `--bind` только эфемерный workspace, vendored fonts |
| **5. Chromium bundled sandbox** | RCE внутри renderer process | multi-process, не ставим `--no-sandbox` |
| **6. Presigned URL** | Auth для `<img>` | R2 SigV4, TTL 300s, ownership проверен до генерации |

### Векторы и митигации

| Vector | Mitigation |
|---|---|
| Path traversal (R2 key `../foo`) | `validate_key_name()` regex `^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$`; key = static prefix + validated name |
| Arbitrary extension | Whitelist `ALLOWED_EXT` в write_file |
| Disk exhaustion (attack) | `MAX_FILES=50`, `MAX_TOTAL_BYTES=20MB`, `MAX_FILE_BYTES=1MB`, `MAX_ZIP_BYTES=50MB`; R2 bucket quota (если настроена) |
| Chromium RCE | bwrap per-call + Chromium bundled sandbox + `--unshare-net` + systemd namespace |
| **SSRF через agent HTML** | `--unshare-net` в bwrap → Chromium без сети вообще. Vendored fonts убирают необходимость internet. |
| Cross-session доступ | Ownership check до генерации presigned URL; R2 key prefix per session |
| Unauth `<img>` | R2 presigned URL (AWS SigV4), TTL 5 мин |
| XSS через stored HTML | HTML не отдаётся браузеру — хранится в R2, рендерится в Chromium headless. Browser получает только PNG. |
| Prompt-injection → tool abuse | Гейт по `mode=="carousel"` |
| R2 credentials leak | `/etc/forge-simple.env` chmod 0600; scoped token только для `prompt2app` bucket; ротация после первого релиза |
| Privilege escalation | `NoNewPrivileges`, `RestrictSUIDSGID`, `CapabilityBoundingSet` |
| Kernel exploit | `ProtectKernelTunables`, `ProtectKernelModules` |

### Закрытое vs открытое

- **Auth fail-closed (codex #5):** dual-path удалён — для картинок только presigned URL, для API-endpoints только Bearer. Одна резолюция на ресурс.
- **Canonicalization (codex #6):** `validate_key_name` применяется в `write_file` и на всех местах где key строится. Один источник правды.
- **Fail-hard migration (codex #7):** `RuntimeError` при отсутствии `.md` в prod.
- **mtime TTL (codex #8):** **не применимо** — TTL теперь в R2 lifecycle (180 дней от создания объекта). При opening старой сессии — UI graceful fallback (placeholder для missing image). Лимит 180д достаточен для юзкейса.
- **Streaming ZIP (codex #10):** `zipstream-ng` или async generator — не BytesIO. `MAX_ZIP_BYTES=50MB` hard cap.

## Risks & mitigations

1. **R2 outage / network issue** → render fails. **Mit:** retry 3 раза с backoff; на permanent fail — user-friendly error "storage unavailable, try later".
2. **Credentials leak** (через логи, прокси, monitor) → злоумышленник получает доступ ко всему bucket. **Mit:** scoped token (read/write только `prompt2app`); ротация после релиза; логи фильтруют `Authorization` header.
3. **Fonts license** — vendored woff2 должны быть OFL. **Mit:** выбираем только OFL-шрифты (Unbounded, Montserrat, JetBrainsMono — все OFL/Apache).
4. **Chromium version drift** между dev и prod. **Mit:** `playwright install chromium` заблокирован на major версию (playwright==X.Y.* в requirements).
5. **bwrap package недоступен на минорном Debian** → install-renderer падает. **Mit:** проверка в pre-flight, fallback: **отказ от установки**, явная ошибка пользователю.
6. **`CapabilityBoundingSet` теряет CAP_SYS_ADMIN → bwrap не работает.** **Mit:** e2e-тест после apply в install-renderer.sh.
7. **R2 lifecycle случайно удаляет active файлы** (180 дней от создания). **Mit:** если проблема возникнет — можно добавить CopyObject при access (refresh created_at), но для MVP 180 дней хватает (одна сессия обычно < 3 мес).
8. **Presigned URL в логах/headers** → можно переиспользовать в течение 300с. **Mit:** логгер не пишет Response body; TTL короткий.
9. **Regression существующих App**. **Mit:** carousel tools гейтятся по `mode`, widget renderer — dispatch по `type`.

## Implementation order (с verify)

**Phase 0 — Skeleton + fonts (45 мин)**
- Ветка `feature/carousel-app`.
- `backend/requirements.txt` + `aioboto3`, `zipstream-ng`.
- `scripts/fetch-fonts.sh` — скачать шрифты (OFL) в `backend/assets/fonts/` один раз, закоммитить bytes.
- **verify:** `ls backend/assets/fonts/` показывает 9+ файлов.

**Phase 1 — R2 client (1ч)**
- `backend/storage_r2.py` с core operations.
- Env setup: `backend/.env` для dev с `R2_KEY_PREFIX=dev/`.
- **verify:** `pytest backend/tests/test_storage_r2.py` — ping bucket, put/get/list/delete key, presigned URL форма валидна, `validate_key_name` режет bad names.

**Phase 2 — Renderer + bwrap (1.5ч)**
- `backend/renderer.py` с `build_render_cmd()` и bwrap-обёрткой.
- `check_renderer_available()` проверяет `bwrap`, `playwright`, R2 ping.
- Тесты: `test_render_basic`, `test_bwrap_no_network`, `test_bwrap_workspace_isolated`, `test_fonts_rendered`.
- **verify:** `pytest backend/tests/test_renderer.py`; в lifespan-логе версии всех трёх (bwrap, playwright, R2).

**Phase 3 — MCP tools (1ч)**
- `write_file`, `render_html`, `list_files` в `tools.py` + гейт `include_carousel_tools`.
- `agent.py` — включение для `mode=="carousel"`.
- Тесты: bad ext, bad regex, size overflow, missing input, success.
- **verify:** `pytest backend/tests/test_tools_carousel.py`.

**Phase 4 — Widgets (2ч)**
- Schemas (3).
- `types.ts` (3).
- React-компоненты + Lightbox + vitest.
- Dispatch в WidgetRenderer/AskMessage.
- **verify:** `vitest run`, `tsc -b --noEmit`, ручной smoke с mock SSE.

**Phase 5 — REST endpoints + URL rewriting (1ч)**
- `GET /sessions/{sid}/files` (listing).
- `GET /sessions/{sid}/files.zip` (streaming).
- `rewrite_media_urls()` в `storage_r2.py` + hook в `db.get_session()` (owner_id берётся из row, presigned URL генерится для carousel widgets).
- Ownership check: request user == session.owner_id OR admin.
- **verify:** `pytest backend/tests/test_files_endpoint.py` — auth, ownership, ZIP содержимое корректно, non-owner получает 403.

**Phase 6 — Migration + seed (45 мин)**
- Сначала `backend/personas/carousel-design-system.md` (включает @font-face CSS snippet, workflow, 8 templates).
- Затем `backend/migrations/0010_carousel_app.py` (fail-hard если .md missing).
- **verify:** удалить `backend/sessions.db`, startup → `SELECT * FROM apps WHERE slug='carousel-designer'`; renaming .md → startup падает с понятной ошибкой.

**Phase 7 — Deploy + hardening + docs (1ч)**
- `deploy/forge-simple.service` (unit с compatible hardening).
- `deploy/install-renderer.sh` (pre-flight: apt install bwrap/fonts, playwright, chromium, `cp unit && systemctl daemon-reload && systemctl restart`).
- `deploy/forge-simple.env.example` (placeholder).
- **Реальный** `/etc/forge-simple.env` на VPS создаётся вручную (instruction в RUNBOOK).
- `chmod 0600` на env file.
- Обновить CLAUDE.md, RUNBOOK.
- **verify:**
  - `bash -n deploy/install-renderer.sh`.
  - На VPS: `systemd-analyze security forge-simple.service` → level ≤ 3.5.
  - Smoke: создать test-session, вызвать `write_file` + `render_html` → PNG в R2 (проверить через `aws s3 ls`).
  - Verify no network из Chromium: test-HTML с `<img src="http://169.254.169.254/">` не вешает рендер.

**Phase 8 — E2E smoke (45 мин)**
- Прод-подобный прогон: ssh на VPS, создать carousel сессию, тема "SaaS для фрилансеров" → 8 слайдов, правка слайда 3, ZIP.
- **verify:** PNG открываются, ZIP распаковывается, presigned URL работают из браузера (check CORS).

**Phase 9 — PR prep**
- Reviewer agent → harness-gap check.
- Print merge command; не мержим без "мержи".

## Out of scope / future

- Dedicated `forge-simple` user + перемиграция прав — отдельный PR.
- E2E Playwright тест полного цикла.
- AI-генерация картинок (DALL-E/Flux) внутри слайдов.
- Multi-size variants (Reels 1080×1920).
- `/admin/storage` dashboard с R2 метриками.
- bwrap wrapper для CC CLI (когда разрешим Bash/Write/Edit).
- CHECK constraint на `sessions.mode` (нужен table rebuild).
- R2 access tag для "active session" → lifecycle ignore (если 180 дней окажется мало).
- CDN layer (Cloudflare) поверх R2 для картинок (уже бесплатно на R2 но можно кастом домен).
