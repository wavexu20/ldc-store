import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { and, asc, desc, eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db, supportConversations, supportMessages, users } from "@/lib/db";
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
  const existingGuestId = cookieStore.get("support_guest_id")?.value;
  let guestId = existingGuestId;
  let shouldSetGuestCookie = false;
  if (!guestId) {
    guestId = crypto.randomUUID();
    shouldSetGuestCookie = true;
  }

  const guestKey = `guest:${guestId}`;
  const accountKey = user?.id ? `user:${user.id}` : null;
  const [persistedUser] = user?.id
    ? await db.select({ id: users.id }).from(users).where(eq(users.id, user.id)).limit(1)
    : [];

  let conversation = accountKey
    ? await db.query.supportConversations.findFirst({
        where: and(eq(supportConversations.visitorKey, accountKey), eq(supportConversations.status, "open")),
        orderBy: [desc(supportConversations.updatedAt)],
      })
    : await db.query.supportConversations.findFirst({
        where: and(eq(supportConversations.visitorKey, guestKey), eq(supportConversations.status, "open")),
        orderBy: [desc(supportConversations.updatedAt)],
      });

  // A visitor may start a conversation before registering. On the first authenticated
  // request from the same browser, preserve that history and attach it to the account.
  if (accountKey && existingGuestId) {
    const guestConversation = await db.query.supportConversations.findFirst({
      where: and(eq(supportConversations.visitorKey, `guest:${existingGuestId}`), eq(supportConversations.status, "open")),
      orderBy: [desc(supportConversations.updatedAt)],
    });

    if (guestConversation && conversation && guestConversation.id !== conversation.id) {
      await db.update(supportMessages)
        .set({ conversationId: conversation.id })
        .where(eq(supportMessages.conversationId, guestConversation.id));
      const guestIsNewer = guestConversation.updatedAt > conversation.updatedAt;
      await db.update(supportConversations).set({
        userId: persistedUser?.id || null,
        visitorName: user?.name || conversation.visitorName,
        visitorEmail: user?.email || conversation.visitorEmail,
        lastMessage: guestIsNewer ? guestConversation.lastMessage : conversation.lastMessage,
        unreadAdmin: conversation.unreadAdmin + guestConversation.unreadAdmin,
        unreadVisitor: conversation.unreadVisitor + guestConversation.unreadVisitor,
        updatedAt: guestIsNewer ? guestConversation.updatedAt : conversation.updatedAt,
      }).where(eq(supportConversations.id, conversation.id));
      await db.delete(supportConversations).where(eq(supportConversations.id, guestConversation.id));
      conversation = await db.query.supportConversations.findFirst({ where: eq(supportConversations.id, conversation.id) });
    } else if (guestConversation && !conversation) {
      await db.update(supportConversations).set({
        visitorKey: accountKey,
        userId: persistedUser?.id || null,
        visitorName: user?.name || guestConversation.visitorName,
        visitorEmail: user?.email || guestConversation.visitorEmail,
        updatedAt: new Date(),
      }).where(eq(supportConversations.id, guestConversation.id));
      conversation = await db.query.supportConversations.findFirst({ where: eq(supportConversations.id, guestConversation.id) });
    }
  }

  if (conversation && accountKey) {
    await db.update(supportConversations).set({
      userId: persistedUser?.id || null,
      visitorName: user?.name || conversation.visitorName,
      visitorEmail: user?.email || conversation.visitorEmail,
    }).where(eq(supportConversations.id, conversation.id));
  }

  if (!conversation) {
    const now = new Date();
    const id = crypto.randomUUID();
    await db.insert(supportConversations).values({
      id,
      visitorKey: accountKey || guestKey,
      // Environment-backed administrator sessions may not have a users row. The stable
      // account visitorKey still binds those conversations without violating the FK.
      userId: persistedUser?.id || null,
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
  const response = NextResponse.json({
    conversation,
    messages,
    token,
    identity: user?.id
      ? { type: "account", accountId: user.id, name: user.name, email: user.email }
      : { type: "guest", guestId },
  });
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
