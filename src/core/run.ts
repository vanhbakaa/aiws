import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { addTerminal, getProjectByName, updateTerminal, updateTerminalAccount } from "./projects.js";
import { getProvider } from "./providers.js";
import { buildIsolatedEnv, buildProjectEnv, providerConfigDir } from "./isolation.js";
import { getAccountById, getAccountsForProvider, getDefaultAccount, nextAccount } from "./accounts.js";
import { defaultShell } from "./exec.js";
import { encodeProjectDir, latestTranscriptFile } from "./sessionContext.js";
import { t, getLocale } from "./i18n.js";
import { loadWorkspace } from "./storage.js";
import { writeHandoff, writeHandoffFromMsgs } from "./handoff.js";
import { prepareNativeCarry, extractMessages, synthForTarget } from "./nativeHandoff.js";
import { spawnInherit } from "./spawn.js";
import type { AiAccount, Project, Provider, Terminal } from "./types.js";

export interface LaunchSpec {
  cmd: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
  terminal: Terminal;
  providerId: string;
  projectId: string;
  projectName: string;
  configDir: string;
  accountLabel?: string;
  mode: "run" | "switch";
  note?: string; // cảnh báo hiển thị cho user (vd oauth switch không mang được phiên)
}

/** Tên terminal tự đặt (MVP): "<provider> <n>". Sau này thay bằng session summary. */
function autoName(providerId: string, existingSameProvider: number): string {
  return `${providerId} ${existingSameProvider + 1}`;
}

/** args = launchCmd (bỏ phần lệnh) + flag session (bắt đầu mới hoặc resume). */
function buildArgs(provider: Provider, sessionId: string | undefined, resume: boolean): string[] {
  const args = provider.launchCmd.slice(1);
  if (!sessionId) return [...args];
  if (resume && provider.resumeFlag) return [...args, provider.resumeFlag, sessionId];
  if (!resume && provider.sessionIdFlag) return [...args, provider.sessionIdFlag, sessionId];
  return [...args];
}

function requireExistingDir(project: Project): void {
  if (!fs.existsSync(project.path)) {
    throw new Error(`Thư mục project không tồn tại: ${project.path}`);
  }
}

/**
 * Copy transcript của phiên ĐANG CHẠY từ oldDir sang newDir (cùng cwd) để `--resume` mang được
 * hội thoại qua config-dir tài khoản khác (oauth mỗi account 1 dir). Trả session-id để resume,
 * hoặc null nếu chưa có transcript nào để mang.
 */
function carryTranscript(oldDir: string, newDir: string, cwd: string): string | null {
  const latest = latestTranscriptFile(oldDir, cwd);
  if (!latest) return null;
  const id = path.basename(latest, ".jsonl");
  const destDir = path.join(newDir, "projects", encodeProjectDir(cwd));
  const dest = path.join(destDir, `${id}.jsonl`);
  try {
    fs.mkdirSync(destDir, { recursive: true });
    // Khi hội thoại đã chia sẻ (junction), old & new trỏ CÙNG file → khỏi copy (tránh lỗi same-file).
    if (fs.existsSync(dest) && fs.realpathSync(dest) === fs.realpathSync(latest)) return id;
    fs.copyFileSync(latest, dest);
    return id;
  } catch {
    return null;
  }
}

/**
 * Chuẩn bị chạy MỚI một provider trong project: chọn account (chỉ định/mặc định),
 * tạo terminal (auto-name, gán session-id), dựng env cô lập. KHÔNG spawn.
 */
export function prepareRun(
  projectName: string,
  providerId: string,
  opts?: { accountLabel?: string },
): LaunchSpec {
  const project = getProjectByName(projectName);
  if (!project) throw new Error(`Không tìm thấy project "${projectName}"`);

  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Không có provider "${providerId}"`);

  const cmd = provider.launchCmd[0];
  if (!cmd) throw new Error(`Provider "${providerId}" cấu hình sai: launchCmd rỗng`);

  requireExistingDir(project);

  let account: AiAccount | undefined;
  if (provider.hasAccounts) {
    if (opts?.accountLabel) {
      account = getAccountsForProvider(providerId).find((a) => a.label === opts.accountLabel);
      if (!account) throw new Error(`Không có account "${opts.accountLabel}" cho provider "${providerId}"`);
    } else {
      account = getDefaultAccount(providerId);
    }
    // Bỏ "direct": provider có account thì BẮT BUỘC chọn được account. GUI hỏi thêm tài khoản
    // (đặt tên) trước khi mở terminal nên nhánh này chỉ chạy khi gọi sai từ CLI/test.
    if (!account) {
      throw new Error(t("errNoAccountYet", { provider: providerId }));
    }
  }

  const { env, configDir } = buildIsolatedEnv(project, provider, account);

  // Chuyển hội thoại chéo-provider: ưu tiên NẠP NATIVE (tổng hợp session cho provider đích rồi
  // resume), fallback SOFT-HANDOFF (xuất .aiws-handoff.md để AI đọc). Tắt bằng carryConversation:false.
  let sessionId: string | undefined = provider.sessionIdFlag ? randomUUID() : undefined;
  let args = buildArgs(provider, sessionId, false);
  let note: string | undefined;
  if (loadWorkspace().carryConversation !== false) {
    const en = getLocale() === "en";
    // CÙNG provider (claude): trạng thái project của claude nằm trong .claude.json theo config-dir,
    // KHÔNG chia sẻ qua junction — nên transcript được share vẫn không hiện trong /resume ở tab mới.
    // Thay vào đó RESUME thẳng phiên GẦN NHẤT của project (theo id transcript mới nhất), như khi
    // switch account. latestTranscriptFile chỉ có với claude (đọc projects/<enc>/) → codex bỏ qua.
    // Dùng --continue (KHÔNG --resume <id>): --resume mở đúng 1 phiên → nếu phiên đó đang mở ở tab
    // khác/khoá thì claude huỷ ("Resume cancelled"). --continue nối tiếp hội thoại gần nhất, không
    // picker, không khoá. latestTranscriptFile chỉ có với claude (projects/<enc>/) → codex bỏ qua.
    const ownLatest = provider.continueFlag ? latestTranscriptFile(configDir, project.path) : null;
    if (ownLatest) {
      sessionId = undefined; // --continue tự chọn phiên mới nhất
      args = [...provider.launchCmd.slice(1), provider.continueFlag as string];
      note = en ? "Continuing your latest conversation." : "Đang tiếp tục hội thoại gần nhất.";
    } else {
      const native = prepareNativeCarry(project, providerId, configDir);
      if (native) {
        sessionId = native.sessionId;
        args = [...provider.launchCmd.slice(1), ...native.resumeArgs];
        note = en
          ? `Loaded ${native.count} messages from ${native.from} (native resume).`
          : `Đã nạp ${native.count} tin nhắn từ ${native.from} (session native).`;
      } else {
        const h = writeHandoff(project, providerId);
        if (h)
          note = en
            ? `Saved ${h.count} msgs from ${h.from} to ${h.file} — ask the AI to read it.`
            : `Đã lưu ${h.count} tin nhắn từ ${h.from} vào ${h.file} — nhờ AI đọc để tiếp.`;
      }
    }
  }

  const sameProvider = project.terminals.filter((t) => t.providerId === providerId).length;
  const terminal: Terminal = {
    id: randomUUID(),
    name: autoName(providerId, sameProvider),
    providerId,
    aiAccountId: account?.id,
    sessionId,
  };
  addTerminal(project.id, terminal);

  return {
    cmd,
    args,
    env,
    cwd: project.path,
    terminal,
    providerId,
    projectId: project.id,
    projectName: project.name,
    configDir,
    accountLabel: account?.label,
    mode: "run",
    note,
  };
}

/**
 * Chuẩn bị mở SHELL thuần trong project (không AI): shell của HĐH + env cô lập chung của
 * project (mọi CLI tool). Không account, không session, không config-dir provider.
 */
export function prepareShell(projectName: string): LaunchSpec {
  const project = getProjectByName(projectName);
  if (!project) throw new Error(`Không tìm thấy project "${projectName}"`);
  requireExistingDir(project);

  const { cmd, args } = defaultShell();
  const sameProvider = project.terminals.filter((t) => t.providerId === "shell").length;
  const terminal: Terminal = {
    id: randomUUID(),
    name: autoName("shell", sameProvider),
    providerId: "shell",
    sessionId: undefined,
  };
  addTerminal(project.id, terminal);

  return {
    cmd,
    args,
    env: buildProjectEnv(project),
    cwd: project.path,
    terminal,
    providerId: "shell",
    projectId: project.id,
    projectName: project.name,
    configDir: "", // shell không có config-dir provider
    mode: "run",
  };
}

/** Tìm terminal trong project theo tên hoặc số thứ tự (1-based); báo lỗi rõ nếu mơ hồ. */
function resolveTerminal(project: Project, ref?: string): Terminal {
  const ts = project.terminals;
  if (ts.length === 0) {
    throw new Error(`Project "${project.name}" chưa có terminal. Chạy: aiws run ${project.name} <provider>`);
  }
  if (ref === undefined) {
    if (ts.length === 1) return ts[0];
    const list = ts.map((t, i) => `  ${i + 1}. ${t.name}`).join("\n");
    throw new Error(`Project có ${ts.length} terminal, hãy chỉ định (tên hoặc số):\n${list}`);
  }
  const n = Number(ref);
  if (Number.isInteger(n) && n >= 1 && n <= ts.length) return ts[n - 1];
  const byName = ts.find((t) => t.name === ref);
  if (byName) return byName;
  throw new Error(`Không tìm thấy terminal "${ref}" trong project "${project.name}"`);
}

/**
 * Chuẩn bị HOT-SWITCH account cho một terminal: đổi sang account cụ thể (theo id / label) hoặc
 * account kế tiếp, dựng env cô lập, và MANG hội thoại đang chạy sang tài khoản mới.
 *
 * - env-based (api_key/…): config-dir dùng chung → session vốn ở đó, chỉ đổi auth (env).
 * - oauth_login (mỗi account 1 config-dir global): COPY transcript phiên đang chạy sang dir mới
 *   rồi `--resume` → hội thoại theo được qua tài khoản khác (không còn mất chat khi switch).
 * - Đổi sang account KHÁC LOẠI (provider khác): xem prepareProviderSwitch (Phase D). Bỏ "direct".
 */
export function prepareSwitch(
  projectName: string,
  terminalRef?: string,
  opts?: { toAccountId?: string; toLabel?: string },
): LaunchSpec {
  const project = getProjectByName(projectName);
  if (!project) throw new Error(`Không tìm thấy project "${projectName}"`);

  const terminal = resolveTerminal(project, terminalRef);
  const provider = getProvider(terminal.providerId);
  if (!provider) throw new Error(`Provider "${terminal.providerId}" của terminal không còn trong registry`);
  if (!provider.hasAccounts) throw new Error(`Provider "${provider.id}" không dùng account (không cần switch)`);

  // Chọn account đích (bỏ "direct": luôn phải là một account).
  let target: AiAccount;
  if (opts?.toAccountId) {
    const found = getAccountById(opts.toAccountId);
    if (!found) throw new Error(`Không tìm thấy account id "${opts.toAccountId}"`);
    target = found;
  } else {
    const accts = getAccountsForProvider(provider.id);
    if (accts.length === 0) throw new Error(`Chưa có account cho "${provider.id}". Thêm account trước khi switch.`);
    if (opts?.toLabel) {
      const found = accts.find((a) => a.label === opts.toLabel);
      if (!found) throw new Error(`Không có account "${opts.toLabel}" cho provider "${provider.id}"`);
      target = found;
    } else {
      if (accts.length < 2) throw new Error(`Cần ≥2 account để luân phiên (hiện có ${accts.length}).`);
      const next = nextAccount(provider.id, terminal.aiAccountId);
      if (!next) throw new Error(`Không chọn được account để switch`);
      target = next;
    }
  }

  // Đổi KHÁC LOẠI (provider khác) → nhánh riêng (native-carry). Phase D thay bằng cài đặt đầy đủ.
  if (target.providerId !== provider.id) {
    return prepareProviderSwitch(project, terminal, target);
  }

  requireExistingDir(project);
  updateTerminalAccount(project.id, terminal.id, target.id);

  const cmd = provider.launchCmd[0];
  if (!cmd) throw new Error(`Provider "${provider.id}" cấu hình sai: launchCmd rỗng`);

  const current = terminal.aiAccountId ? getAccountById(terminal.aiAccountId) : undefined;
  const oldConfigDir = providerConfigDir(project, provider, current);
  const { env, configDir } = buildIsolatedEnv(project, provider, target);

  const label = target.label;

  // Xác định session để resume + mang hội thoại nếu đổi config-dir (oauth).
  let resumeId: string | undefined = terminal.sessionId;
  let carriedNote: string | undefined;
  if (oldConfigDir === configDir) {
    // Cùng dir (env-based / cùng account) → resume phiên mới nhất (chuẩn hơn id aiws đặt nếu có).
    const latest = latestTranscriptFile(oldConfigDir, project.path);
    if (latest) resumeId = path.basename(latest, ".jsonl");
  } else {
    // Khác dir (oauth): mang chat đang làm sang; nếu không có gì để mang thì DÙNG lịch sử sẵn có
    // của tài khoản đích (vd quay lại "trực tiếp" đã có chat cũ) — chỉ mở mới khi dir đích trống.
    const carried = carryTranscript(oldConfigDir, configDir, project.path);
    if (carried) {
      resumeId = carried;
      carriedNote = t("noteCarried", { label });
    } else {
      const own = latestTranscriptFile(configDir, project.path);
      resumeId = own ? path.basename(own, ".jsonl") : undefined;
    }
  }
  const updated: Terminal = { ...terminal, aiAccountId: target.id, sessionId: resumeId ?? terminal.sessionId };
  return {
    cmd,
    args: buildArgs(provider, resumeId, resumeId !== undefined),
    env,
    cwd: project.path,
    terminal: updated,
    providerId: provider.id,
    projectId: project.id,
    projectName: project.name,
    configDir,
    accountLabel: target.label,
    mode: "switch",
    note: carriedNote ?? (resumeId === undefined ? t("noteNewSession", { label }) : undefined),
  };
}

/**
 * Đổi terminal sang account KHÁC LOẠI (provider khác): relaunch bằng CLI của provider đích và NẠP
 * NATIVE toàn bộ hội thoại đang làm (tổng hợp session native cho đích rồi resume). KHÔNG phải tóm
 * tắt — AI mới nhận nguyên văn hội thoại và nói tiếp. Giới hạn: trạng thái tool-call/diff/reasoning
 * nội bộ không chuyển được giữa 2 CLI. Không tổng hợp được (vd codex thiếu template) → ném lỗi để
 * fallback cùng loại (hướng 2 người dùng đã chấp nhận).
 */
function prepareProviderSwitch(project: Project, terminal: Terminal, target: AiAccount): LaunchSpec {
  requireExistingDir(project);

  const srcProvider = getProvider(terminal.providerId);
  const targetProvider = getProvider(target.providerId);
  if (!srcProvider || !targetProvider) throw new Error(t("crossTypeOnly"));
  const cmd = targetProvider.launchCmd[0];
  if (!cmd) throw new Error(`Provider "${target.providerId}" cấu hình sai: launchCmd rỗng`);

  // 1. Trích hội thoại đang làm từ dir của account nguồn (đúng cwd project này).
  const srcAccount = terminal.aiAccountId ? getAccountById(terminal.aiAccountId) : undefined;
  const srcConfigDir = providerConfigDir(project, srcProvider, srcAccount);
  const msgs = extractMessages(srcProvider.id, srcConfigDir, project.path);

  // 2. Dựng env cô lập cho account đích (tạo dir global của nó nếu chưa có).
  const { env, configDir } = buildIsolatedEnv(project, targetProvider, target);

  // 3. Ưu tiên NẠP NATIVE (AI mới nói tiếp nguyên văn). Không tổng hợp được (vd codex đích chưa từng
  //    chạy → thiếu template) mà VẪN có hội thoại → fallback soft-handoff (.aiws-handoff.md) + phiên
  //    mới. Không có hội thoại → phiên mới sạch. (KHÔNG ném crossTypeOnly để không chặn switch một
  //    cách khó hiểu — thao tác luôn hoàn tất, chỉ khác mức mang được ngữ cảnh.)
  const carry = synthForTarget(project, target.providerId, configDir, msgs);
  let args: string[];
  let sessionId: string | undefined;
  let note: string;
  if (carry) {
    args = [...targetProvider.launchCmd.slice(1), ...carry.resumeArgs];
    sessionId = carry.sessionId;
    note = t("noteCarriedNative", { count: carry.count, from: srcProvider.id, label: target.label });
  } else {
    sessionId = targetProvider.sessionIdFlag ? randomUUID() : undefined;
    args = buildArgs(targetProvider, sessionId, false);
    const h = msgs.length ? writeHandoffFromMsgs(project, srcProvider.id, msgs) : null;
    note = h ? t("noteHandoff", { count: h.count, from: h.from, file: h.file }) : t("switchedFresh", { label: target.label });
  }

  // Lưu CẢ providerId (không chỉ account): lần switch sau đọc từ store, nếu providerId cũ còn đó sẽ
  // định tuyến bằng provider sai → đọc config-dir rỗng → mất hội thoại.
  updateTerminal(project.id, terminal.id, { providerId: target.providerId, aiAccountId: target.id, sessionId });

  const updated: Terminal = { ...terminal, providerId: target.providerId, aiAccountId: target.id, sessionId };
  return {
    cmd,
    args,
    env,
    cwd: project.path,
    terminal: updated,
    providerId: target.providerId,
    projectId: project.id,
    projectName: project.name,
    configDir,
    accountLabel: target.label,
    mode: "switch",
    note,
  };
}

/** Spawn provider inline (kế thừa stdio của terminal hiện tại). Trả về exit code. */
export function launchInline(spec: LaunchSpec): Promise<number> {
  return spawnInherit(spec.cmd, spec.args, {
    env: spec.env,
    cwd: spec.cwd,
    onMissing: () => {
      console.error(`\n✗ Chưa cài "${spec.cmd}" (provider "${spec.providerId}") hoặc không có trong PATH.`);
      console.error(`  → Cài provider rồi thử lại: aiws run ${spec.projectName} ${spec.providerId}`);
    },
  });
}
