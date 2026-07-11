import { getCloudflareContext } from "@opennextjs/cloudflare";
import { renderEmailTemplate, renderVerificationCodeBlock } from "@/lib/email/template";

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
