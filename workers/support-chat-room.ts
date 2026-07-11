import { DurableObject } from "cloudflare:workers";
import { verifySupportToken, type SupportTokenPayload } from "@/lib/support/token";

type SupportEnv = {
  AUTH_SECRET?: string;
  DB: D1Database;
};

type SocketAttachment = SupportTokenPayload & {
  windowStartedAt: number;
  sentInWindow: number;
  lastSentAt: number;
};

type IncomingMessage =
  | { type: "message"; content: string }
  | { type: "typing"; active: boolean }
  | { type: "read" };

export class SupportChatRoom extends DurableObject<SupportEnv> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const url = new URL(request.url);
    const secret = this.env.AUTH_SECRET;
    const payload = secret ? await verifySupportToken(url.searchParams.get("token") || "", secret) : null;
    if (!payload) return new Response("Unauthorized", { status: 401 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const now = Date.now();
    server.serializeAttachment({ ...payload, windowStartedAt: now, sentInWindow: 0, lastSentAt: 0 } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(server, [payload.role, `conversation:${payload.conversationId}`]);
    server.send(JSON.stringify({ type: "ready", conversationId: payload.conversationId }));
    if (payload.role === "admin") {
      this.broadcast(payload as SocketAttachment, { type: "presence", online: true }, server);
    } else {
      server.send(JSON.stringify({ type: "presence", online: this.ctx.getWebSockets("admin").length > 0 }));
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== "string") return;
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) return socket.close(1008, "Missing session");

    let message: IncomingMessage;
    try {
      message = JSON.parse(raw) as IncomingMessage;
    } catch {
      return;
    }

    if (message.type === "typing") {
      this.broadcast(attachment, { type: "typing", conversationId: attachment.conversationId, role: attachment.role, active: Boolean(message.active) }, socket);
      return;
    }

    if (message.type === "read") {
      const field = attachment.role === "admin" ? "unread_admin" : "unread_visitor";
      await this.env.DB.prepare(`UPDATE support_conversations SET ${field} = 0 WHERE id = ?`).bind(attachment.conversationId).run();
      this.broadcast(attachment, { type: "read", conversationId: attachment.conversationId, role: attachment.role });
      return;
    }

    if (message.type !== "message") return;
    const content = message.content?.trim();
    if (!content || content.length > 2000) return;

    const now = Date.now();
    if (now - attachment.lastSentAt < 400) return;
    if (now - attachment.windowStartedAt > 60_000) {
      attachment.windowStartedAt = now;
      attachment.sentInWindow = 0;
    }
    if (attachment.sentInWindow >= 30) return;
    attachment.sentInWindow += 1;
    attachment.lastSentAt = now;
    socket.serializeAttachment(attachment);

    const id = crypto.randomUUID();
    const createdAt = Math.floor(now / 1000);
    const senderType = attachment.role;
    await this.env.DB.batch([
      this.env.DB.prepare("INSERT INTO support_messages (id, conversation_id, sender_type, sender_id, content, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, attachment.conversationId, senderType, attachment.actorId, content, createdAt),
      this.env.DB.prepare(
        attachment.role === "admin"
          ? "UPDATE support_conversations SET last_message = ?, unread_visitor = unread_visitor + 1, updated_at = ? WHERE id = ?"
          : "UPDATE support_conversations SET status = 'open', last_message = ?, unread_admin = unread_admin + 1, updated_at = ? WHERE id = ?"
      ).bind(content, createdAt, attachment.conversationId),
    ]);

    const conversationRow = await this.env.DB.prepare(
      "SELECT id, visitor_name AS visitorName, visitor_email AS visitorEmail, status, last_message AS lastMessage, unread_admin AS unreadAdmin, unread_visitor AS unreadVisitor, created_at AS createdAt, updated_at AS updatedAt FROM support_conversations WHERE id = ?"
    ).bind(attachment.conversationId).first();
    const conversation = conversationRow ? {
      ...conversationRow,
      createdAt: new Date(Number(conversationRow.createdAt) * 1000).toISOString(),
      updatedAt: new Date(Number(conversationRow.updatedAt) * 1000).toISOString(),
    } : undefined;

    this.broadcast(attachment, {
      type: "message",
      conversationId: attachment.conversationId,
      conversation,
      message: { id, senderType, senderId: attachment.actorId, content, createdAt: new Date(now).toISOString() },
    });
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (attachment?.role === "admin" && this.ctx.getWebSockets("admin").length <= 1) {
      this.broadcast(attachment, { type: "presence", online: false }, socket);
    }
    socket.close(code, reason);
  }

  private broadcast(source: SocketAttachment, payload: unknown, except?: WebSocket): void {
    const encoded = JSON.stringify(payload);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except) continue;
      const target = socket.deserializeAttachment() as SocketAttachment | null;
      if (target && (target.role === "admin" || target.conversationId === source.conversationId)) {
        try { socket.send(encoded); } catch { /* disconnected */ }
      }
    }
  }
}
