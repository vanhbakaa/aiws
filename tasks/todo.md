# TODO: AI Terminal Workspace (`aiws`)

## Phase 1: Foundation

### Task 1: Node/TS project (cross-platform) ✅
**Acceptance:**
- [x] package.json (bin `aiws`), tsconfig, commander, vitest; `aiws --version` chạy Win & macOS
- [x] Cấu trúc `src/core` (lib) + `src/cli`
- [x] File branding `src/core/branding.ts` để user tự đặt tên phần mềm
**Verification:** `npm run build`, `node dist/cli/index.js --version`
**Deps:** None · **Scope:** S

### Task 2: Data model + storage ✅
**Acceptance:**
- [x] Type `Workspace/Provider/AiAccount/Project/Terminal/Service`
- [x] Đọc/ghi `~/.aiws/config.json`; `os.homedir()` cho path đa OS; tạo nếu chưa có
**Verification:** `npm test` round-trip load/save
**Deps:** 1 · **Scope:** M

### Task 3: Project CRUD + `open <dir>` ✅
**Acceptance:**
- [x] `aiws project add/list/remove`
- [x] `aiws open <dir>` / `aiws .` → tạo project từ folder (tên mặc định = tên folder)
**Verification:** `npm test` + thử tay
**Deps:** 2 · **Scope:** M

> **Checkpoint:** ✅ 9 test xanh, build sạch, `open`/`project` chạy đúng.

## Phase 2: Isolation + inline launch

### Task 4: Isolation engine ✅
**Acceptance:**
- [x] Sinh env cô lập cho project/terminal (`~/.aiws/profiles/<proj>/<provider>/`)
**Verification:** `npm test` env map đúng path đa OS
**Deps:** 2 · **Scope:** M

### Task 5: Provider registry + presets ✅
**Acceptance:**
- [x] Provider model (launchCmd, resumeCmd, isolationEnv, authMethods, supportsSkills/mcp, hasAccounts)
- [x] Ship preset `claude`, `codex`, `ollama`; config.providers ghi đè theo id
**Verification:** `npm test` load 3 preset
**Deps:** 2 · **Scope:** M

### Task 6: Inline launcher + terminal auto-name ✅
**Acceptance:**
- [x] `aiws run <project> [provider]` set env cô lập rồi chạy inline (spawn stdio inherit)
- [x] Tạo Terminal có id + tên tự đặt (MVP slug "<provider> n")
- [x] resolveCommand (PATH+PATHEXT) → báo "chưa cài" đáng tin; không dùng shell:true
**Verification:** `npm test` + e2e thật với Claude (CLAUDE_CONFIG_DIR cô lập, exit 0)
**Deps:** 4,5 · **Scope:** M

> **Checkpoint:** ✅ 21 test xanh. E2E xác nhận Claude ghi config vào profile riêng project (cô lập thật). Bonus: fix đọc config có BOM.

## Phase 3: AI account pool + hot-switch

### Task 7: Pool AI account (đủ auth method) ✅
**Acceptance:**
- [x] `aiws ai-account add/list/remove/default` — nhiều account per provider (secrets.json riêng)
- [x] Đủ auth_method: oauth_login, api_key, cloud, local, custom_base_url
- [x] resolveAccountEnv map method → env đúng theo provider (ANTHROPIC_API_KEY/BASE_URL, env cloud...)
**Verification:** `npm test` (10 test accounts) + e2e
**Deps:** 5 · **Scope:** M

### Task 8: `aiws switch` (relaunch + resume) ✅
**Acceptance:**
- [x] Đổi active AI account (luân phiên hoặc --to) → relaunch + resume đúng session
- [x] INVARIANT: env-based auth dùng chung config-dir → giữ session khi switch (verify e2e)
- [x] `aiws run` gán --session-id; oauth dùng config-dir riêng (caveat cross-account)
**Verification:** `npm test` + e2e: run(work=KEY_A) → switch(personal=KEY_B) → dir GIỐNG nhau
**Deps:** 6,7 · **Scope:** M

### Task 9 (deferred): auto-detect limit ⏸
**Acceptance:**
- [ ] Dò tín hiệu rate-limit từ output/exit provider → tự gọi switch
**Verification:** Thử tay mô phỏng limit
**Deps:** 8 · **Scope:** M — *hoãn theo kế hoạch (manual trước)*

> **Checkpoint:** ✅ switch account giữa chừng → giữ config-dir/session (env-based auth). 37 test xanh.
> ⚠️ Caveat: oauth_login (subscription) dùng dir riêng per account → cross-account session-sharing cần verify với login thật (junction/shared projects/) — ghi nhận cho sau.

## Phase 4: Skills & MCP theo scope

### Task 10: Materialize layer global/project khi launch ✅
**Acceptance:**
- [x] materialize(projectId, provider, configDir): skill=junction vào `$CONFIG_DIR/skills/`, MCP=`claude mcp add --scope user` (idempotent qua `claude mcp get`)
- [x] effective = global + project; chạy khi run & switch, in summary line
**Verification:** `npm test` (materializeSkills) + e2e Claude thật
**Deps:** 6 · **Scope:** M

### Task 11: `aiws skill add/list/remove --scope global|project` ✅
**Acceptance:**
- [x] Registry skill; CLI add(--path/--scope/--project)/list/remove
**Verification:** `npm test` (3) + smoke CLI
**Deps:** 10 · **Scope:** M

### Task 12: `aiws mcp add/list/remove --scope global|project` ✅
**Acceptance:**
- [x] Registry MCP (transport/env/args); CLI add/list/remove; `--` cho flag của lệnh
**Verification:** `npm test` (2) + smoke CLI + e2e
**Deps:** 10 · **Scope:** M

> **Checkpoint:** ✅ E2E Claude thật: A thấy [global+project], B chỉ thấy [global] — cả skill lẫn MCP. 45 test xanh.

## Phase 5: Môi trường CLI cô lập per project (MỌI tool)

### Task 13: CliTool registry + buildProjectEnv ✅
**Acceptance:**
- [x] Preset gh/git/aws/gcloud/docker/kubectl/npm (env config-dir); config-driven qua config.cliTools
- [x] buildProjectEnv(project): set env config-dir mọi tool vào `profiles/<proj>/tools/<tool>` (dir|file kind)
- [x] buildIsolatedEnv (provider) thừa hưởng buildProjectEnv → Claude gọi gh/aws đều cô lập
**Verification:** `npm test` (tools.test)
**Deps:** 4 · **Scope:** M

### Task 14: `aiws exec` / `aiws shell` / `aiws tool list` ✅
**Acceptance:**
- [x] `aiws exec <project> [-- ] <cmd>` chạy lệnh trong env cô lập (passthrough flag + strip `--`)
- [x] `aiws shell <project>` mở shell cô lập; `aiws tool list` liệt kê
- [x] Refactor spawn dùng chung `spawn.ts` (spawnInherit)
**Verification:** `npm test` + e2e git thật
**Deps:** 13 · **Scope:** M

> **Checkpoint:** ✅ E2E git thật: A=alice / B=bob cô lập, git config THẬT vẫn rỗng (không đụng). 52 test xanh.

## Phase 6: TUI

### Task 15: TUI core — terminal nhúng (pty+xterm→ink) ✅
**Acceptance:**
- [x] `aiws tui <project>` chạy Claude thật nhúng sống trong khung (node-pty + xterm-headless → ink)
- [x] Forward input, resize, exit, Ctrl+Q; parse màu/cursor (bufferToRows)
- [x] Robustness máy yếu: drop-frame + FPS cap chỉnh qua `AIWS_TUI_FPS`
**Verification:** compile + smoke (class thật) + user test tương tác (mượt, không trễ)
**Deps:** 3 · **Scope:** M (stack: @lydell/node-pty prebuilt, @xterm/headless, ink)

### Task 16: Tab đa nhiệm + layout 3 cột ✅
**Acceptance:**
- [x] SessionManager (nhiều PtySession = nhiều tab); TabBar; cột Projects (trái) + terminal (giữa) + Context (phải) + keybar
- [x] Phím: Ctrl+T tab mới, Ctrl+W đóng, Alt+1–9 chuyển, Ctrl+Q thoát
- [ ] (chuyển Task 17) mở project KHÁC từ panel / project-picker
**Verification:** compile + smoke SessionManager (mở/switch/close/render) + user test tương tác
**Deps:** 15 · **Scope:** M

### Task 17: Wire actions + panel phải sống ✅
**Acceptance:**
- [x] Panel phải dữ liệu THẬT: account, provider, skills g·p, mcp g·p
- [x] Ctrl+S hot-switch account; Ctrl+B ẩn/hiện cột phải; status line
- [x] Model/effort THẬT (aiws truyền `--model/--effort`, hiện trên panel) — `aiws tui -m -e`
- [x] Mở project KHÁC trong TUI: Ctrl+P focus panel trái, ↑↓/jk chọn, ⏎ mở, Esc thoát
- [x] %context: đọc transcript `.jsonl` của Claude (encode path verify khớp thật), poll 2s, fallback "—"
**Verification:** compile + 65 test (gồm sessionContext) + user test tương tác
**Deps:** 16 · **Scope:** M
> ⚠️ %context: PATH encoding đã verify khớp Claude; FORMAT field (message.usage) là giả định — user chat 1 phiên thật để xác nhận số đúng, sai thì chỉnh parser.

> **Checkpoint:** ✅ TUI đa nhiệm + đổi account + mở project + model/effort + %context (chờ verify format).

## Phase 7: Polish, install & docs

### Task 18: Hardening + validate
**Acceptance:**
- [ ] File permission chặt `~/.aiws/`; validate config; lỗi rõ ràng
**Verification:** `npm test` + config hỏng
**Deps:** 14 · **Scope:** S

### Task 19: Publish npm + docs
**Acceptance:**
- [ ] Đóng gói npm package, `npm install -g aiws` chạy được (thử `npm pack` + install local)
- [ ] README + hướng dẫn thêm provider/service
**Verification:** `npm pack` rồi install từ tarball trên máy sạch/mô phỏng
**Deps:** 17 · **Scope:** M

> **Checkpoint:** cài & dùng dễ như Claude CLI.
