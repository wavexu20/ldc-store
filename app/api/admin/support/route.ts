import { NextResponse } from "next/server";
import { asc, desc, eq } from "drizzle-orm";

import { requireAdmin } from "@/lib/auth-utils";
import { db, supportConversations, supportMessages } from "@/lib/db";
import { createSupportToken } from "@/lib/support/token";

export const dynamic = "force-dynamic";

function authSecret(): string {
  const value = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not configured");
  return value;
}

export async function GET(request: Request) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const conversationId = url.searchParams.get("conversationId");
  const conversationRows = await db.query.supportConversations.findMany({
    orderBy: [desc(supportConversations.updatedAt)],
    limit: 100,
  });
  const conversations = conversationRows.map(({ visitorKey, ...conversation }) => ({
    ...conversation,
    identityType: visitorKey.startsWith("user:") ? "account" as const : "guest" as const,
    accountId: visitorKey.startsWith("user:") ? visitorKey.slice(5) : null,
  }));
  const selected = conversationId || conversations[0]?.id || "admin-inbox";
  const messages = conversationId
    ? await db.query.supportMessages.findMany({
        where: eq(supportMessages.conversationId, conversationId),
        orderBy: [asc(supportMessages.createdAt)],
        limit: 200,
      })
    : [];
  if (conversationId) {
    await db.update(supportConversations).set({ unreadAdmin: 0 }).where(eq(supportConversations.id, conversationId));
  }
  const token = await createSupportToken(
    { conversationId: selected, role: "admin", actorId: admin.user.id },
    authSecret()
  );
  return NextResponse.json({ conversations, messages, token });
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as { conversationId?: string; status?: "open" | "closed" };
  if (!body.conversationId || !["open", "closed"].includes(body.status || "")) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  await db.update(supportConversations)
    .set({ status: body.status!, updatedAt: new Date() })
    .where(eq(supportConversations.id, body.conversationId));
  return NextResponse.json({ success: true });
}
