import { describe, expect, it, vi } from "vitest";

import { marked } from "marked";

import { renderMarkdownToSafeHtml } from "@/lib/markdown";

describe("markdown", () => {
  it("空内容应返回空字符串", () => {
    // 为什么这样测：覆盖空输入分支，避免调用 markdown 解析器造成不必要开销。
    expect(renderMarkdownToSafeHtml("")).toBe("");
  });

  it("当 marked.parse 返回非字符串时应安全回退", () => {
    // 为什么这样测：marked.parse 在 async 或异常配置下可能返回非 string；这里确保我们不会把未知对象当 HTML 注入到页面。
    const spy = vi.spyOn(marked, "parse").mockReturnValue({} as unknown as string);
    try {
      expect(renderMarkdownToSafeHtml("# hi")).toBe("");
    } finally {
      spy.mockRestore();
    }
  });

  it("应渲染标题与链接，并强制 a 标签安全属性", () => {
    const html = renderMarkdownToSafeHtml("# 标题\n\n[Link](https://example.com)");

    expect(html).toContain("<h1");
    expect(html).toContain("标题");
    expect(html).toContain('href="https://example.com"');

    // 为什么要断言 rel/target：避免钓鱼页面通过 window.opener 反制、并减少 SEO 垃圾链接风险
    expect(html).toContain('rel="nofollow noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it("应保留代码块结构（pre/code）", () => {
    const html = renderMarkdownToSafeHtml("```js\nconsole.log(1)\n```");

    expect(html).toContain("<pre");
    expect(html).toContain("<code");
    expect(html).toContain("console.log(1)");
  });

  it("应移除危险标签（script）", () => {
    const html = renderMarkdownToSafeHtml('hello<script>alert("x")</script>');

    expect(html).not.toContain("<script");
    // sanitize-html 的 discard 模式会移除标签但可能保留文本内容；此处重点验证“不会形成可执行脚本”
  });

  it("应拒绝 javascript: scheme 的链接（移除 href）", () => {
    const html = renderMarkdownToSafeHtml("[x](javascript:alert(1))");

    expect(html).toContain(">x</a>");
    expect(html).not.toContain('href="javascript:');
  });

  it("img 仅允许 http/https，其他 scheme 应被移除", () => {
    const html = renderMarkdownToSafeHtml('<img src="data:text/plain,evil" alt="x" />');

    expect(html).toContain("<img");
    expect(html).not.toContain("data:text/plain");
  });

  it("应安全渲染商品视频并强制使用播放器控件", () => {
    const html = renderMarkdownToSafeHtml('<video autoplay src="/api/product-media/product-media/0195eb17-2db8-7f93-b950-7259b29c5a10.mp4"></video>');

    expect(html).toContain("<video");
    expect(html).toContain('src="/api/product-media/product-media/0195eb17-2db8-7f93-b950-7259b29c5a10.mp4"');
    expect(html).toMatch(/<video[^>]*\scontrols(?:\s|>)/);
    expect(html).toContain('preload="metadata"');
    expect(html).not.toContain("autoplay");
  });

  it("视频应拒绝 javascript scheme", () => {
    const html = renderMarkdownToSafeHtml('<video controls src="javascript:alert(1)"></video>');
    expect(html).toContain("<video");
    expect(html).not.toContain("javascript:");
  });

  it("应仅保留编辑器支持的字号与颜色类名", () => {
    const html = renderMarkdownToSafeHtml('<span class="md-text-xl md-text-blue evil-class">重点文字</span>');

    expect(html).toContain('class="md-text-xl md-text-blue"');
    expect(html).not.toContain("evil-class");
  });

  it("应让 Markdown 图片可以通过鼠标和键盘打开大图", () => {
    const html = renderMarkdownToSafeHtml("![商品细节](https://example.com/detail.webp)");

    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="查看大图：商品细节"');
  });
});
