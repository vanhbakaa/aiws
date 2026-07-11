import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { t, getLocale, setLocale } from "./i18n.js";

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aiws-i18n-"));
  process.env.AIWS_HOME = tmp;
});

afterEach(() => {
  setLocale("vi"); // reset state module giữa các test
  delete process.env.AIWS_HOME;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("i18n", () => {
  it("đổi vi ⇄ en và nội suy tham số", () => {
    setLocale("vi");
    expect(getLocale()).toBe("vi");
    expect(t("default")).toBe("mặc định");
    expect(t("scopeCounts", { g: 2, p: 1 })).toBe("2 chung · 1 riêng");

    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(t("default")).toBe("default");
    expect(t("scopeCounts", { g: 2, p: 1 })).toBe("2 global · 1 project");
  });

  it("lưu locale vào config.json để nhớ giữa các phiên", () => {
    setLocale("en");
    const cfg = JSON.parse(fs.readFileSync(path.join(tmp, "config.json"), "utf8"));
    expect(cfg.locale).toBe("en");
  });
});
