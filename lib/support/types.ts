export type SupportMessageDto = {
  id: string;
  conversationId?: string;
  senderType: "visitor" | "admin" | "system";
  senderId: string | null;
  content: string;
  createdAt: string | Date;
};

export type SupportConversationDto = {
  id: string;
  visitorName: string | null;
  visitorEmail: string | null;
  status: "open" | "closed";
  lastMessage: string | null;
  unreadAdmin: number;
  unreadVisitor: number;
  createdAt: string | Date;
  updatedAt: string | Date;
};
