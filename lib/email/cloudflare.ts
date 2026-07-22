import { getCloudflareContext } from "@opennextjs/cloudflare";
import { escapeEmailHtml, renderEmailTemplate, renderVerificationCodeBlock } from "@/lib/email/template";

type EmailAddress = string | { email: string; name?: string };
type EmailSendBinding = {
  send(message: {
    from: EmailAddress;
    to: EmailAddress | EmailAddress[];
    subject: string;
    html?: string;
    text?: string;
  }): Promise<{ messageId?: string }>;
};

function getEmailEnv() {
  const { env } = getCloudflareContext();
  return env as unknown as {
    EMAIL?: EmailSendBinding;
    EMAIL_FROM?: string;
    NEXT_PUBLIC_SITE_NAME?: string;
    EMAIL_BRAND_NAME?: string;
    AUTH_URL?: string;
  };
}

export async function sendVerificationEmail(input: {
  to: string;
  name?: string | null;
  code: string;
}) {
  const env = getEmailEnv();
  const binding = env.EMAIL;
  const from = env.EMAIL_FROM || process.env.EMAIL_FROM;
  const siteName = env.EMAIL_BRAND_NAME || process.env.EMAIL_BRAND_NAME || env.NEXT_PUBLIC_SITE_NAME || process.env.NEXT_PUBLIC_SITE_NAME || "Game3DTech";
  const siteUrl = env.AUTH_URL || process.env.AUTH_URL || "https://game3dtech.com";
  if (!binding) throw new Error("Cloudflare EMAIL send binding 未配置");
  if (!from) throw new Error("EMAIL_FROM 未配置");

  return binding.send({
    from: { email: from, name: siteName },
    to: input.to,
    subject: `[${siteName}] ${input.code} 是你的邮箱验证码`,
    text: `${input.name || "你好"}，\n\n你的 ${siteName} 邮箱验证码是：${input.code}\n验证码 10 分钟内有效。\n\n如果不是你本人发起的操作，请忽略本邮件，也不要向任何人提供验证码。\n\n访问商城：${siteUrl}\n${siteName} · game3dtech.com`,
    html: renderEmailTemplate({
      brandName: siteName,
      preheader: `${input.code} 是你的 ${siteName} 邮箱验证码，10 分钟内有效。`,
      eyebrow: "EMAIL VERIFICATION · 邮箱验证",
      title: "验证你的邮箱地址",
      greeting: `你好，${input.name || "用户"}`,
      intro: `你正在验证用于 ${siteName} 账号通知的邮箱地址。请输入下面的验证码完成验证。`,
      contentHtml: renderVerificationCodeBlock(input.code),
      notice: "如果不是你本人发起的操作，请忽略本邮件，也不要向任何人提供验证码。我们的工作人员不会索要此验证码。",
      noticeTone: "warning",
      action: { label: "访问 Game3DTech", url: siteUrl },
      footerNote: "这是一封自动发送的服务邮件，请勿直接回复。",
    }),
  });
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name?: string | null;
  code: string;
}) {
  const env = getEmailEnv();
  const binding = env.EMAIL;
  const from = env.EMAIL_FROM || process.env.EMAIL_FROM;
  const siteName = env.EMAIL_BRAND_NAME || process.env.EMAIL_BRAND_NAME || env.NEXT_PUBLIC_SITE_NAME || process.env.NEXT_PUBLIC_SITE_NAME || "Game3DTech";
  const siteUrl = env.AUTH_URL || process.env.AUTH_URL || "https://game3dtech.com";
  if (!binding) throw new Error("Cloudflare EMAIL send binding 未配置");
  if (!from) throw new Error("EMAIL_FROM 未配置");
  return binding.send({
    from: { email: from, name: siteName },
    to: input.to,
    subject: `[${siteName}] ${input.code} 是你的密码重置验证码`,
    text: `${input.name || "你好"}，\n\n你的 ${siteName} 密码重置验证码是：${input.code}\n验证码 10 分钟内有效。\n\n如果不是你本人发起的操作，请立即检查账号安全设置。\n\n${siteName} · game3dtech.com`,
    html: renderEmailTemplate({
      brandName: siteName,
      preheader: `${input.code} 是你的 ${siteName} 密码重置验证码，10 分钟内有效。`,
      eyebrow: "PASSWORD RESET · 密码重置",
      title: "重置你的账号密码",
      greeting: `你好，${input.name || "用户"}`,
      intro: `请输入下面的验证码以重置 ${siteName} 账号密码。`,
      contentHtml: renderVerificationCodeBlock(input.code),
      notice: "如果不是你本人发起的操作，请忽略本邮件，并在必要时检查已关联的登录方式。",
      noticeTone: "warning",
      action: { label: "访问 Game3DTech", url: siteUrl },
      footerNote: "这是一封自动发送的安全邮件，请勿直接回复。",
    }),
  });
}

function renderOrderSummary(input: { orderNo: string; productName: string; amount: string }) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e4e4e7;border-radius:12px;background:#fafafa"><tr><td style="padding:18px 20px"><div style="color:#71717a;font-size:11px;font-weight:700;letter-spacing:1.1px">ORDER / 订单</div><div style="margin-top:8px;color:#18181b;font-size:16px;font-weight:700">${escapeEmailHtml(input.productName)}</div><div style="margin-top:10px;color:#52525b;font-size:13px;line-height:1.8"><strong>订单号：</strong>${escapeEmailHtml(input.orderNo)}<br><strong>应付金额：</strong>¥${escapeEmailHtml(input.amount)} CNY</div></td></tr></table>`;
}

export async function sendGuestOrderCreatedEmail(input: {
  to: string;
  orderNo: string;
  productName: string;
  amount: string;
  accessUrl: string;
}) {
  const env = getEmailEnv();
  const binding = env.EMAIL;
  const from = env.EMAIL_FROM || process.env.EMAIL_FROM;
  const siteName = env.EMAIL_BRAND_NAME || process.env.EMAIL_BRAND_NAME || env.NEXT_PUBLIC_SITE_NAME || process.env.NEXT_PUBLIC_SITE_NAME || "Game3DTech";
  if (!binding) throw new Error("Cloudflare EMAIL send binding 未配置");
  if (!from) throw new Error("EMAIL_FROM 未配置");

  return binding.send({
    from: { email: from, name: siteName },
    to: input.to,
    subject: `[${siteName}] 订单 ${input.orderNo} 已创建`,
    text: `你的订单已创建。\n\n商品：${input.productName}\n订单号：${input.orderNo}\n应付金额：¥${input.amount} CNY\n\n继续支付或查询订单：${input.accessUrl}\n\n请勿转发该链接，它包含订单访问凭证。`,
    html: renderEmailTemplate({
      brandName: siteName,
      preheader: `订单 ${input.orderNo} 已创建，可继续支付或查询状态。`,
      eyebrow: "ORDER CREATED · 订单已创建",
      title: "你的订单已保留",
      intro: "无需注册账号。请在订单有效期内完成支付，支付状态和发货内容可通过下方安全链接查询。",
      contentHtml: renderOrderSummary(input),
      notice: "订单访问链接包含私密凭证，请勿转发给他人。订单过期或主动取消后，锁定库存会自动释放。",
      noticeTone: "warning",
      action: { label: "继续支付或查询订单", url: input.accessUrl },
      footerNote: "这是一封自动发送的订单服务邮件，请勿直接回复。",
    }),
  });
}

export async function sendGuestOrderDeliveryEmail(input: {
  to: string;
  orderNo: string;
  productName: string;
  cards: string[];
  orderUrl: string;
}) {
  const env = getEmailEnv();
  const binding = env.EMAIL;
  const from = env.EMAIL_FROM || process.env.EMAIL_FROM;
  const siteName = env.EMAIL_BRAND_NAME || process.env.EMAIL_BRAND_NAME || env.NEXT_PUBLIC_SITE_NAME || process.env.NEXT_PUBLIC_SITE_NAME || "Game3DTech";
  if (!binding) throw new Error("Cloudflare EMAIL send binding 未配置");
  if (!from) throw new Error("EMAIL_FROM 未配置");
  const cardLines = input.cards.map((card) => escapeEmailHtml(card));
  const cardsHtml = cardLines.map((card) => `<div style="padding:11px 13px;border:1px solid #e4e4e7;border-radius:9px;background:#fafafa;color:#18181b;font-family:'SFMono-Regular',Consolas,monospace;font-size:13px;line-height:1.55;word-break:break-all">${card}</div>`).join('<div style="height:8px"></div>');

  return binding.send({
    from: { email: from, name: siteName },
    to: input.to,
    subject: `[${siteName}] 订单 ${input.orderNo} 已发货`,
    text: `订单已发货。\n\n商品：${input.productName}\n订单号：${input.orderNo}\n\n发货内容：\n${input.cards.join("\n")}\n\n订单详情：${input.orderUrl}\n\n卡密属于敏感信息，请妥善保存。`,
    html: renderEmailTemplate({
      brandName: siteName,
      preheader: `订单 ${input.orderNo} 已发货，请及时保存交付内容。`,
      eyebrow: "ORDER DELIVERED · 订单已发货",
      title: "交付内容已准备好",
      intro: `${input.productName} 已完成发货，请及时复制并妥善保存以下内容。`,
      contentHtml: `<div style="margin-bottom:12px;color:#71717a;font-size:11px;font-weight:700;letter-spacing:1.1px">DELIVERY / 发货内容</div>${cardsHtml}`,
      notice: "卡密和兑换信息属于敏感内容。请勿在公开群聊、截图或不可信网页中泄露。",
      noticeTone: "warning",
      action: { label: "查看订单状态", url: input.orderUrl },
      footerNote: "这是一封自动发送的发货通知，请勿直接回复。",
    }),
  });
}
