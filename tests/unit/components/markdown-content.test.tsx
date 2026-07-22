import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownContent } from "@/components/store/markdown-content";

describe("MarkdownContent", () => {
  it("opens a lightbox when a Markdown image is clicked", () => {
    render(
      <MarkdownContent
        html={'<p><img src="https://example.com/detail.webp" alt="商品细节" role="button" tabindex="0"></p>'}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "商品细节" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "商品细节" })).toHaveAttribute(
      "src",
      "https://example.com/detail.webp"
    );
  });

  it("opens a lightbox from the keyboard", () => {
    render(
      <MarkdownContent
        html={'<img src="https://example.com/keyboard.webp" alt="键盘预览" role="button" tabindex="0">'}
      />
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "键盘预览" }), { key: "Enter" });

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
