import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth-utils";
import { renderMarkdownToSafeHtml } from "@/lib/markdown";

const MAX_MARKDOWN_LENGTH = 100_000;

export async function POST(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ success: false, message: "需要管理员权限" }, { status: 401 });
  }

  try {
    const body = await request.json() as { markdown?: unknown };
    if (typeof body.markdown !== "string") {
      return NextResponse.json({ success: false, message: "Markdown 内容无效" }, { status: 400 });
    }
    if (body.markdown.length > MAX_MARKDOWN_LENGTH) {
      return NextResponse.json({ success: false, message: "Markdown 内容过长" }, { status: 400 });
    }
    return NextResponse.json({ success: true, html: renderMarkdownToSafeHtml(body.markdown) });
  } catch {
    return NextResponse.json({ success: false, message: "预览生成失败" }, { status: 400 });
  }
}
