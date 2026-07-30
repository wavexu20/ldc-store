import { SupportInbox } from "./support-inbox";

export const dynamic = "force-dynamic";

export default function SupportPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">在线客服</h1>
        <p className="text-sm text-muted-foreground">实时接收访客消息、回复并管理会话</p>
      </div>
      <SupportInbox />
    </div>
  );
}
