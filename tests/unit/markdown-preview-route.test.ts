import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
}));

vi.mock("@/lib/auth-utils", () => ({
  requireAdmin: () => mocks.requireAdmin(),
}));

import { POST } from "@/app/api/admin/markdown-preview/route";

const request = (body: unknown) => new Request("https://game3dtech.com/api/admin/markdown-preview", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

beforeEach(() => {
  mocks.requireAdmin.mockReset();
  mocks.requireAdmin.mockResolvedValue({ user: { id: "admin", role: "admin" } });
});

describe("admin markdown preview route", () => {
  it("requires an administrator", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("unauthorized"));

    const response = await POST(request({ markdown: "# 标题" }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ success: false, message: "需要管理员权限" });
  });

  it("renders sanitized Markdown for the live preview", async () => {
    const response = await POST(request({ markdown: "## 标题\n\n<script>alert(1)</script>" }));
    const result = await response.json() as { success: boolean; html: string };

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.html).toContain("<h2");
    expect(result.html).not.toContain("<script");
  });

  it("rejects invalid input", async () => {
    const response = await POST(request({ markdown: 123 }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, message: "Markdown 内容无效" });
  });

  it("rejects oversized content", async () => {
    const response = await POST(request({ markdown: "a".repeat(100_001) }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ success: false, message: "Markdown 内容过长" });
  });
});
