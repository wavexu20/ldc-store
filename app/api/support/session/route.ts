import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db, supportConversations, supportMessages } from "@/lib/db";
import { createSupportToken } from "@/lib/support/token";

export const dynamic = "force-dynamic";

function authSecret(): string {
  const value = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not configured");
  return value;
}

export async function GET() {
  const session = await auth();
  const user = session?.user as { id?: string; name?: string | null; email?: string | null } | undefined;
  const cookieStore = await cookies();
  let guestId = cookieStore.get("support_guest_id")?.value;
  let shouldSetGuestCookie = false;
  if (!guestId) {
    guestId = crypto.randomUUID();
    shouldSetGuestCookie = true;
  }

  const visitorKey = user?.id ? `user:${user.id}` : `guest:${guestId}`;
  let conversation = await db.query.supportConversations.findFirst({
    where: and(eq(supportConversations.visitorKey, visitorKey), eq(supportConversations.status, "open")),
    orderBy: [desc(supportConversations.updatedAt)],
  });

  if (!conversation) {
    const now = new Date();
    const id = crypto.randomUUID();
    await db.insert(supportConversations).values({
      id,
      visitorKey,
      // Some administrator sessions are environment-backed and do not have a users row.
      // visitorKey still preserves identity without risking a foreign-key failure.
      userId: null,
      visitorName: user?.name || null,
      visitorEmail: user?.email || null,
      createdAt: now,
      updatedAt: now,
    });
    conversation = await db.query.supportConversations.findFirst({ where: eq(supportConversations.id, id) });
  }

  if (!conversation) return NextResponse.json({ error: "Unable to create support session" }, { status: 500 });

  const messages = await db.query.supportMessages.findMany({
    where: eq(supportMessages.conversationId, conversation.id),
    orderBy: [asc(supportMessages.createdAt)],
    limit: 100,
  });
  await db.update(supportConversations).set({ unreadVisitor: 0 }).where(eq(supportConversations.id, conversation.id));

  const actorId = user?.id || guestId;
  const token = await createSupportToken(
    { conversationId: conversation.id, role: "visitor", actorId },
    authSecret()
  );
  const response = NextResponse.json({ conversation, messages, token });
  if (shouldSetGuestCookie) {
    response.cookies.set("support_guest_id", guestId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return response;
}
