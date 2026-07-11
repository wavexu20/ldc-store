import { getCloudflareContext } from "@opennextjs/cloudflare";

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

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char] || char);
}

function getEmailEnv() {
  const { env } = getCloudflareContext();
  return env as unknown as {
    EMAIL?: EmailSendBinding;
    EMAIL_FROM?: string;
    NEXT_PUBLIC_SITE_NAME?: string;
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
  const siteName = env.NEXT_PUBLIC_SITE_NAME || process.env.NEXT_PUBLIC_SITE_NAME || "LDC Store";
  if (!binding) throw new Error("Cloudflare EMAIL send binding 未配置");
  if (!from) throw new Error("EMAIL_FROM 未配置");

  const safeSiteName = escapeHtml(siteName);
  const safeName = escapeHtml(input.name || "用户");
  const safeCode = escapeHtml(input.code);
  return binding.send({
    from: { email: from, name: siteName },
    to: input.to,
    subject: `${siteName} 邮箱验证码：${input.code}`,
    text: `${input.name || "你好"}，你的 ${siteName} 邮箱验证码是 ${input.code}，10 分钟内有效。若非本人操作，请忽略本邮件。`,
    html: `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b"><div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;padding:32px"><h1 style="font-size:22px;margin:0 0 18px">${safeSiteName}</h1><p>你好，${safeName}：</p><p>你的邮箱验证码是：</p><div style="font-size:34px;font-weight:700;letter-spacing:8px;padding:20px 0;color:#4f46e5">${safeCode}</div><p style="color:#71717a;font-size:14px">验证码 10 分钟内有效。若非本人操作，请忽略本邮件。</p></div></body></html>`,
  });
}
