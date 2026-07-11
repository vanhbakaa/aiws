# Implementation Plan: AI Terminal Workspace (`aiws`)

> Tên binary `aiws` (AI WorkSpace) là placeholder — đổi tự do.

## Overview

Terminal workspace **project-centric** cho người dùng AI. Mỗi project chứa **nhiều terminal**,
mỗi terminal chạy một provider (**Claude Code / Codex / Ollama / …**) như CLI bình thường, có
**tên tự đặt** (kiểu tiêu đề đoạn chat AI). Mỗi project cũng giữ **pool tài khoản AI** để
**đổi qua lại né rate-limit mà không gián đoạn** công việc, cùng **credential dịch vụ**
(GitHub, Supabase) tách biệt theo project. Chạy local, **cross-platform (Windows + macOS)**.

Hai cơ chế cốt lõi:
- **Isolation qua env redirection** per project — session/credential không xung đột.
- **Hot-switch account**: tách *account (auth)* khỏi *session (ngữ cảnh)*; khi limit thì swap
  auth rồi **relaunch + resume đúng session** (vd `claude --resume <id>`).

## Architecture Decisions

- **Stack: Node.js + TypeScript.** CLI: `commander`; TUI: `ink` (React-for-terminal, đúng
  thứ Claude Code dùng); PTY nhúng (phase sau): `node-pty`; test: `vitest`. 3 lớp `core`
  (model+storage+isolation+provider registry, có test) → `cli` → `tui`. Path đa OS qua
  `os.homedir()`. Lý do chọn Node: đã cài sẵn (0 setup), phân phối `npm install -g` giống
  hệt Claude CLI.
- **Launch = inline trong terminal hiện tại**, cross-platform: `spawn(cmd, args,
  {stdio:'inherit', env})` rồi propagate exit code (TTY passthrough đầy đủ, chạy cả Win &
  macOS). Không mở cửa sổ mới ở MVP.
- **Provider = pluggable/config-driven.** Ship preset **claude / codex / ollama**; thêm
  provider khác = sửa config, không sửa code. Mỗi provider mô tả: `launch_cmd`, `resume_cmd`,
  env cần cô lập, có hỗ trợ skill/mcp không, có khái niệm account/limit không (Ollama local
  thì không).
- **Tách 2 loại "account":**
  - **AI account** = cách liên kết dịch vụ AI (pool nhiều cái để hot-switch né limit). Hỗ
    trợ **đầy đủ auth method**: `oauth_login` (subscription Claude/Codex), `api_key`
    (Anthropic/OpenAI…), `cloud` (Bedrock/Vertex/Azure), `local` (Ollama), `custom_base_url`
    (proxy/gateway như OpenRouter/LiteLLM). Mỗi method map sang env/config tương ứng.
  - **CLI tool env** = MỌI công cụ dòng lệnh (gh/git/aws/gcloud/docker/kubectl/npm/…) đều có
    môi trường cô lập theo project, qua env config-dir. Config-driven: thêm tool = 1 entry.
- **Isolation độc lập per project:** MCP + dữ liệu/session + mọi CLI tool của project này
  KHÔNG liên quan project khác. Đây là toàn bộ yêu cầu bảo mật (không cần mã hoá thêm).
- **`aiws exec`/`aiws shell`** chạy lệnh/mở terminal trong môi trường cô lập của project;
  `aiws run` (AI provider) cũng thừa hưởng để Claude gọi gh/aws/… đều cô lập.
- **Hot-switch: MVP thủ công** (`aiws switch`, relaunch+resume), **auto-detect limit để task
  phase sau** (đã ghi trong plan cho khỏi quên).
- **Terminal auto-name**: lấy từ session summary của provider nếu có, else slug từ prompt đầu /
  thời gian.
- **Skill & MCP 2 scope: global (mọi project) vs project.**
- **Isolation, KHÔNG mã hoá master-password** (1 máy, không sync). Dựa file permission OS. Tên
  env từng tool (`CLAUDE_CONFIG_DIR`, `GH_CONFIG_DIR`, `HOME`…) **verify khi thực thi**.
- **Storage:** `~/.aiws/` — `config.json` (providers/projects/ai_accounts) + `global/<tool>/`
  (layer toàn cục) + `profiles/<project>/<tool>/` (layer project, chứa session state).
- **Cài đặt dễ như Claude CLI:** publish npm package, `npm install -g aiws`.

## Data Model (nháp)

```
Workspace ~/.aiws/
 ├─ providers[]    Provider   { id, launch_cmd, resume_cmd?, isolation_env[], auth_methods[],
 │                              supports_skills, supports_mcp, has_accounts }
 ├─ ai_accounts[]  AiAccount  { id, provider_id, label, auth_method, auth_ref }   # pool né limit
 │       auth_method ∈ { oauth_login, api_key, cloud(bedrock|vertex|azure), local, custom_base_url }
 └─ projects[]     Project    { id, name, path,
        terminals[]  Terminal { id, name(auto), provider_id, ai_account_id, session_id },
        services[]   Service  { kind: github|supabase|…, name, active, secret_ref } }
Skill/MCP install → scope: "global" | "project(<id>)"
```

## Task List

### Phase 1: Foundation
- [ ] Task 1: Node/TS project (bin `aiws`, commander, vitest), chạy Win & macOS
- [ ] Task 2: Data model + storage `~/.aiws/config.json`
- [ ] Task 3: `aiws project add/list/remove` + `aiws open <dir>` (mở folder thành project)

### Checkpoint: Foundation
- [ ] test xanh, build sạch 2 OS; tạo project từ folder chạy được

### Phase 2: Isolation + inline launch (đa provider)
- [ ] Task 4: Isolation engine (env cô lập per project/terminal)
- [ ] Task 5: Provider registry + preset claude/codex/ollama (launch+resume+env)
- [ ] Task 6: `aiws run <project> <provider>` inline; terminal có id + auto-name

### Checkpoint: Launch
- [ ] Mở ≥2 provider trong 1 project, mỗi cái session riêng, tên tự đặt

### Phase 3: AI account pool + hot-switch (headline)
- [ ] Task 7: Pool AI account per provider: `aiws ai-account add/list`
- [ ] Task 8: `aiws switch [terminal]` — đổi account + relaunch **resume đúng session**
- [ ] Task 9 (sau): auto-detect rate-limit → tự switch (planned, làm sau manual)

### Checkpoint: Hot-switch
- [ ] Đang làm việc, đổi account → tiếp tục đúng ngữ cảnh, không mất phiên

### Phase 4: Skills & MCP theo scope global/project
- [ ] Task 10: Layer global/project khi launch (compose config-dir)
- [ ] Task 11: `aiws skill add/list/remove --scope global|project`
- [ ] Task 12: `aiws mcp add/list/remove --scope global|project`

### Checkpoint: Skills/MCP
- [ ] skill/mcp global thấy mọi project; scope project bị giới hạn đúng

### Phase 5: Môi trường CLI cô lập per project (MỌI tool)
- [ ] Task 13: CliTool registry (gh/git/aws/gcloud/docker/kubectl/npm... config-driven) + buildProjectEnv
- [ ] Task 14: `aiws exec <project> -- <cmd>` + `aiws shell <project>` + `aiws tool list`; provider run thừa hưởng env

### Checkpoint: CLI env
- [ ] Mỗi tool CLI đọc/ghi config theo dir riêng của project; 2 project không đụng nhau

### Phase 6: TUI (ratatui)
- [ ] Task 15: Khung TUI: Projects (trái) + terminals/accounts (phải), điều hướng phím
- [ ] Task 16: Actions: open project, run/switch terminal, hot-switch account, cài skill/mcp
- [ ] Task 17: Live state (account active, provider, limit) + help bar

### Checkpoint: TUI
- [ ] Làm mọi thứ từ TUI

### Phase 7: Polish, install & docs
- [ ] Task 18: Hardening (file perm) + validate config + lỗi rõ ràng
- [ ] Task 19: Install script (curl/PowerShell) + README + hướng dẫn thêm provider

### Checkpoint: Complete
- [ ] Cài & dùng dễ như Claude CLI; đạt hết acceptance

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Provider không cho tách auth khỏi session / không có `--resume` | High | Verify Claude/Codex trước; nếu không, fallback: swap auth rồi mở phiên mới + báo user |
| Cách lưu auth vs session của mỗi provider khác nhau | High | Provider registry mô tả riêng; verify từng cái ở Phase 2/3 |
| Tool không hỗ trợ env override config-dir | High | Fallback `HOME`/`USERPROFILE` riêng per session |
| Inline spawn khác nhau Win vs Unix | Med | `spawn stdio:inherit` + propagate exit; test cả 2 |
| Auto-detect limit khó/khác nhau | Med | Để phase sau (Task 9); MVP thủ công đã đủ giá trị |

## Open Questions
- (Đã chốt) Service credential MVP: GitHub + Supabase, thiết kế extensible thêm sau.
- (Đã chốt) Ollama: chỉ isolation config, không nằm trong luồng hot-switch né limit.
