"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Minimize2, Send, UserRound, Wifi, WifiOff, X } from "lucide-react";

import { useI18n } from "@/components/i18n-provider";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SupportMessageDto } from "@/lib/support/types";
import { cn } from "@/lib/utils";

type SessionResponse = {
  conversation: { id: string; unreadVisitor: number };
  messages: SupportMessageDto[];
  token: string;
};

export function SupportWidget({
  siteName,
  placement = "store",
}: {
  siteName: string;
  placement?: "store" | "auth";
}) {
  const { locale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [agentOnline, setAgentOnline] = useState(false);
  const [messages, setMessages] = useState<SupportMessageDto[]>([]);
  const [draft, setDraft] = useState("");
  const [unread, setUnread] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(open);
  const mountedRef = useRef(true);
  openRef.current = open;

  const connect = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/support/session", { cache: "no-store" });
      if (!response.ok) throw new Error("session");
      const data = (await response.json()) as SessionResponse;
      setMessages(data.messages);
      setUnread(data.conversation.unreadVisitor || 0);

      socketRef.current?.close();
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${protocol}//${window.location.host}/api/support/ws?token=${encodeURIComponent(data.token)}`);
      socketRef.current = socket;
      socket.onopen = () => {
        setConnected(true);
        if (openRef.current) socket.send(JSON.stringify({ type: "read" }));
      };
      socket.onmessage = (event) => {
        const payload = JSON.parse(event.data) as { type: string; message?: SupportMessageDto; online?: boolean };
        if (payload.type === "presence") setAgentOnline(Boolean(payload.online));
        if (payload.type === "message" && payload.message) {
          setMessages((current) => current.some((item) => item.id === payload.message!.id) ? current : [...current, payload.message!]);
          if (!openRef.current && payload.message.senderType === "admin") setUnread((value) => value + 1);
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (mountedRef.current) reconnectRef.current = setTimeout(connect, 3000);
      };
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !socketRef.current) connect();
    if (open) {
      setUnread(0);
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "read" }));
      }
    }
  }, [connect, open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => () => {
    mountedRef.current = false;
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    socketRef.current?.close();
  }, []);

  function sendMessage() {
    const content = draft.trim();
    if (!content || socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ type: "message", content }));
    setDraft("");
  }

  return (
    <div
      className={cn(
        "fixed right-4 z-[80] sm:right-6",
        open
          ? "bottom-5 sm:bottom-8"
          : placement === "auth"
            ? "bottom-5 sm:bottom-6"
            : "bottom-36 sm:bottom-28",
      )}
    >
      {open ? (
        <section
          aria-label={t("supportChat")}
          className="flex h-[min(680px,calc(100dvh-24px))] w-[min(390px,calc(100vw-24px))] flex-col overflow-hidden rounded-3xl border bg-background shadow-2xl"
        >
          <header className="relative overflow-hidden border-b bg-gradient-to-br from-blue-600 to-indigo-600 px-5 pb-5 pt-4 text-white">
            <div className="absolute inset-0 opacity-15 [background-image:radial-gradient(circle_at_20%_20%,white_0_1px,transparent_1px)] [background-size:18px_18px]" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MessageCircle className="size-4" />
                {t("supportChat")}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="size-8 text-white hover:bg-white/15 hover:text-white" onClick={() => setOpen(false)} aria-label={t("minimizeChat")}>
                  <Minimize2 className="size-4" />
                </Button>
                <Button variant="ghost" size="icon" className="size-8 text-white hover:bg-white/15 hover:text-white" onClick={() => setOpen(false)} aria-label={t("closeChat")}>
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <div className="relative mt-5 flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur">
                <UserRound className="size-6" />
              </div>
              <div>
                <div className="font-semibold">{t("supportQuestion")}</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-blue-100">
                  <span className={cn("size-2 rounded-full", agentOnline ? "bg-emerald-300" : "bg-amber-300")} />
                  {!connected ? t("supportConnecting") : agentOnline ? t("supportOnline") : t("supportAway")}
                </div>
              </div>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4" aria-live="polite">
            <div className="flex items-end gap-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white"><MessageCircle className="size-4" /></div>
              <div className="max-w-[82%] rounded-2xl rounded-bl-md bg-muted px-4 py-3 text-sm leading-relaxed">
                {t("supportWelcome", { site: siteName })}
              </div>
            </div>
            {messages.map((message) => {
              const mine = message.senderType === "visitor";
              return (
                <div key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed", mine ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md bg-muted")}>
                    <div className="whitespace-pre-wrap break-words">{message.content}</div>
                    <div className={cn("mt-1 text-[10px]", mine ? "text-blue-100" : "text-muted-foreground")}>
                      {new Date(message.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              );
            })}
            {loading ? <div className="text-center text-xs text-muted-foreground">{t("loading")}</div> : null}
            <div ref={bottomRef} />
          </div>

          <div className="border-t bg-background p-3">
            <div className="rounded-2xl border bg-background p-2 shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, 2000))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={t("supportPlaceholder")}
                className="min-h-16 resize-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0"
              />
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {connected ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
                  {connected ? t("realtimeConnected") : t("realtimeDisconnected")}
                </div>
                <Button size="icon" className="size-9 rounded-xl" onClick={sendMessage} disabled={!draft.trim() || !connected} aria-label={t("sendMessage")}>
                  <Send className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("openSupport")}
          className="relative flex size-14 cursor-pointer items-center justify-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/25 transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:size-16"
        >
          <MessageCircle className="size-6 sm:size-7" />
          {unread > 0 ? <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-semibold text-white ring-2 ring-background">{Math.min(unread, 99)}</span> : null}
        </button>
      )}
    </div>
  );
}
