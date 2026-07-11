import { describe, it, expect } from "vitest";
import { SessionManager } from "./sessionManager.js";

// Tab giả tối thiểu để test riêng logic close() (không spawn PTY thật).
function fakeTab(id: string): any {
  return { id, session: { kill() {} }, projectName: "p", providerId: "claude" };
}

describe("SessionManager.close — giữ đúng tab active", () => {
  it("đóng tab bên TRÁI tab active → vẫn ở đúng tab đang xem", () => {
    const mgr = new SessionManager();
    (mgr.tabs as unknown[]).push(fakeTab("A"), fakeTab("B"), fakeTab("C"), fakeTab("D"));
    mgr.active = 1; // đang xem B
    mgr.close("A");
    expect(mgr.tabs.map((t) => t.id)).toEqual(["B", "C", "D"]);
    expect(mgr.activeTab?.id).toBe("B"); // không nhảy sang C
  });

  it("đóng chính tab active (đang ở cuối) → lùi về tab trước", () => {
    const mgr = new SessionManager();
    (mgr.tabs as unknown[]).push(fakeTab("A"), fakeTab("B"));
    mgr.active = 1;
    mgr.close("B");
    expect(mgr.activeTab?.id).toBe("A");
  });

  it("đóng tab bên PHẢI tab active → active không đổi", () => {
    const mgr = new SessionManager();
    (mgr.tabs as unknown[]).push(fakeTab("A"), fakeTab("B"), fakeTab("C"));
    mgr.active = 0; // đang xem A
    mgr.close("C");
    expect(mgr.activeTab?.id).toBe("A");
  });
});
