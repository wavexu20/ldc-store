"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Inbox, Loader2, MessageCircle, RefreshCw, Send, UserRound } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SupportConversationDto, SupportMessageDto } from "@/lib/support/types";
import { cn } from "@/lib/utils";

type InboxResponse = {
  conversations: SupportConversationDto[];
  messages: SupportMessageDto[];
  token: string;
};

export function SupportInbox() {
  const [conversations, setConversations] = useState<SupportConversationDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessageDto[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (conversationId?: string) => {
    setLoading(true);
    try {
      const query = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : "";
      const response = await fetch(`/api/admin/support${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("load");
      const data = (await response.json()) as InboxResponse;
      setConversations(data.conversations);
      setMessages(data.messages);

      const nextSelected = conversationId || data.conversations[0]?.id || null;
      if (!conversationId && nextSelected) {
        setSelectedId(nextSelected);
        setLoading(false);
        await load(nextSelected);
        return;
      }
      setSelectedId(nextSelected);
      socketRef.current?.close();
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/support/ws?token=${encodeURIComponent(data.token)}`);
      socketRef.current = socket;
      socket.onopen = () => {
        setConnected(true);
        socket.send(JSON.stringify({ type: "read" }));
      };
      socket.onclose = () => setConnected(false);
      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as { type: string; conversationId?: string; message?: SupportMessageDto; conversation?: SupportConversationDto };
        if (payload.type !== "message" || !payload.message || !payload.conversationId) return;
        const incoming = payload.message;
        setConversations((current) => {
          const exists = current.some((item) => item.id === payload.conversationId);
          const base = exists ? current : payload.conversation ? [payload.conversation, ...current] : current;
          return base.map((item) => item.id === payload.conversationId
            ? { ...item, lastMessage: incoming.content, unreadAdmin: item.id === nextSelected ? 0 : Number(item.unreadAdmin || 0) + (incoming.senderType === "visitor" ? 1 : 0), updatedAt: incoming.createdAt }
            : item).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        });
        if (payload.conversationId === nextSelected) {
          setMessages((current) => current.some((item) => item.id === incoming.id) ? current : [...current, incoming]);
          socket.send(JSON.stringify({ type: "read" }));
        }
      };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return () => socketRef.current?.close();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send() {
    const content = draft.trim();
    if (!content || socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ type: "message", content }));
    setDraft("");
  }

  async function toggleStatus() {
    const selected = conversations.find((item) => item.id === selectedId);
    if (!selected) return;
    const status = selected.status === "open" ? "closed" : "open";
    await fetch("/api/admin/support", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: selected.id, status }),
    });
    setConversations((current) => current.map((item) => item.id === selected.id ? { ...item, status } : item));
  }

  const selected = conversations.find((item) => item.id === selectedId);

  return (
    <div className="grid min-h-[680px] overflow-hidden rounded-2xl border bg-card lg:grid-cols-[320px_1fr]">
      <aside className="border-b lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between border-b p-4">
          <div className="flex items-center gap-2 font-semibold"><Inbox className="size-4" />会话</div>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => load(selectedId || undefined)} aria-label="刷新会话"><RefreshCw className="size-4" /></Button>
        </div>
        <div className="max-h-64 overflow-y-auto lg:max-h-[620px]">
          {conversations.length === 0 && !loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">暂无客服会话</div>
          ) : null}
          {conversations.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => load(item.id)}
              className={cn("flex w-full cursor-pointer gap-3 border-b p-4 text-left transition-colors hover:bg-muted/60", selectedId === item.id && "bg-muted")}
            >
              <Avatar className="size-10"><AvatarFallback><UserRound className="size-4" /></AvatarFallback></Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-medium">{item.visitorName || item.visitorEmail || "访客"}</div>
                  {item.unreadAdmin > 0 ? <Badge className="h-5 min-w-5 justify-center px-1.5">{item.unreadAdmin}</Badge> : null}
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{item.lastMessage || "新会话"}</div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-h-[520px] flex-col">
        {selected ? (
          <>
            <header className="flex items-center justify-between border-b px-5 py-3">
              <div>
                <div className="font-semibold">{selected.visitorName || selected.visitorEmail || "访客"}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn("size-2 rounded-full", connected ? "bg-emerald-500" : "bg-amber-500")} />
                  {connected ? "实时连接" : "连接中"}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={toggleStatus}>
                {selected.status === "open" ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
                {selected.status === "open" ? "结束会话" : "重新打开"}
              </Button>
            </header>
            <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-5">
              {messages.map((message) => {
                const mine = message.senderType === "admin";
                return (
                  <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[75%] rounded-2xl px-4 py-2.5 text-sm", mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md border bg-background")}>
                      <div className="whitespace-pre-wrap break-words">{message.content}</div>
                      <div className={cn("mt-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
            <div className="border-t p-3">
              <div className="flex items-end gap-2 rounded-xl border p-2 focus-within:ring-2 focus-within:ring-ring/20">
                <Textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 2000))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} placeholder="输入回复…" className="min-h-14 resize-none border-0 shadow-none focus-visible:ring-0" />
                <Button size="icon" onClick={send} disabled={!draft.trim() || !connected || selected.status === "closed"}><Send className="size-4" /></Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            {loading ? <Loader2 className="size-6 animate-spin" /> : <MessageCircle className="size-10" />}
            <div className="mt-3 text-sm">选择一个会话开始回复</div>
          </div>
        )}
      </section>
    </div>
  );
}
