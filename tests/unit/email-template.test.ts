import { describe, expect, it } from "vitest";
import { renderEmailTemplate, renderVerificationCodeBlock } from "@/lib/email/template";

describe("transactional email template", () => {
  it("renders a responsive branded verification email", () => {
    const html = renderEmailTemplate({
      brandName: "Game3DTech",
      preheader: "Your code is 123456",
      title: "验证你的邮箱地址",
      greeting: "你好，测试用户",
      intro: "请输入验证码完成验证。",
      contentHtml: renderVerificationCodeBlock("123456"),
      notice: "不要向任何人提供验证码。",
      noticeTone: "warning",
      action: { label: "访问商城", url: "https://game3dtech.com" },
    });

    expect(html).toContain("Game3DTech");
    expect(html).toContain("123456");
    expect(html).toContain("Valid for 10 minutes");
    expect(html).toContain("@media only screen and (max-width:620px)");
    expect(html).toContain("role=\"presentation\"");
    expect(html).toContain("https://game3dtech.com/");
  });

  it("escapes user-controlled copy and rejects unsafe action URLs", () => {
    const html = renderEmailTemplate({
      brandName: "<script>alert(1)</script>",
      preheader: "preview",
      title: "title",
      greeting: "<img src=x onerror=alert(1)>",
      intro: "safe",
      contentHtml: renderVerificationCodeBlock("<123>"),
      action: { label: "click", url: "javascript:alert(1)" },
    });

    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;123&gt;");
  });
});
