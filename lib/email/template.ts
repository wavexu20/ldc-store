export type EmailTone = "info" | "success" | "warning";

export interface EmailTemplateInput {
  brandName: string;
  preheader: string;
  eyebrow?: string;
  title: string;
  greeting?: string;
  intro: string;
  contentHtml: string;
  notice?: string;
  noticeTone?: EmailTone;
  action?: { label: string; url: string };
  footerNote?: string;
}

export function escapeEmailHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char] || char);
}

function safeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function noticeColors(tone: EmailTone) {
  if (tone === "success") return { background: "#ecfdf5", border: "#a7f3d0", text: "#065f46" };
  if (tone === "warning") return { background: "#fffbeb", border: "#fde68a", text: "#92400e" };
  return { background: "#eef2ff", border: "#c7d2fe", text: "#3730a3" };
}

export function renderEmailTemplate(input: EmailTemplateInput) {
  const brandName = escapeEmailHtml(input.brandName);
  const preheader = escapeEmailHtml(input.preheader);
  const title = escapeEmailHtml(input.title);
  const greeting = input.greeting ? escapeEmailHtml(input.greeting) : "";
  const intro = escapeEmailHtml(input.intro);
  const eyebrow = escapeEmailHtml(input.eyebrow || "ACCOUNT NOTIFICATION");
  const footerNote = escapeEmailHtml(input.footerNote || "This is an automated service email. Please do not reply directly.");
  const actionUrl = input.action ? safeHttpUrl(input.action.url) : null;
  const colors = noticeColors(input.noticeTone || "info");
  const notice = input.notice ? escapeEmailHtml(input.notice) : null;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${title}</title>
  <style>@media only screen and (max-width:620px){.email-shell{width:100%!important}.email-pad{padding-left:22px!important;padding-right:22px!important}.email-title{font-size:25px!important}.code-value{font-size:30px!important;letter-spacing:7px!important}}</style>
</head>
<body style="margin:0;padding:0;background:#eef2ff;color:#0f172a;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',Arial,sans-serif;-webkit-font-smoothing:antialiased">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${preheader}&#847; &#847; &#847; &#847; &#847;</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#eef2ff">
    <tr><td align="center" style="padding:32px 14px">
      <table role="presentation" class="email-shell" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px">
        <tr><td style="padding:0 8px 18px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td style="vertical-align:middle">
              <span style="display:inline-block;vertical-align:middle;width:36px;height:36px;line-height:36px;border-radius:10px;background:#6366f1;color:#ffffff;text-align:center;font-size:12px;font-weight:800;letter-spacing:-.3px">G3D</span>
              <span style="display:inline-block;vertical-align:middle;margin-left:10px;color:#312e81;font-size:17px;font-weight:700;letter-spacing:-.2px">${brandName}</span>
            </td>
            <td align="right" style="color:#6366f1;font-size:11px;font-weight:700;letter-spacing:1.2px">SECURE MESSAGE</td>
          </tr></table>
        </td></tr>
        <tr><td style="border-radius:20px;background:#ffffff;box-shadow:0 16px 40px rgba(49,46,129,.10);overflow:hidden">
          <div style="height:6px;background:#6366f1;font-size:0;line-height:0">&nbsp;</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
            <tr><td class="email-pad" style="padding:38px 42px 12px">
              <div style="margin-bottom:12px;color:#6366f1;font-size:11px;line-height:16px;font-weight:800;letter-spacing:1.5px">${eyebrow}</div>
              <h1 class="email-title" style="margin:0;color:#0f172a;font-size:29px;line-height:1.28;font-weight:750;letter-spacing:-.6px">${title}</h1>
            </td></tr>
            <tr><td class="email-pad" style="padding:12px 42px 38px">
              ${greeting ? `<p style="margin:0 0 14px;color:#334155;font-size:16px;line-height:1.7">${greeting}</p>` : ""}
              <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.75">${intro}</p>
              ${input.contentHtml}
              ${notice ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px"><tr><td style="padding:14px 16px;border:1px solid ${colors.border};border-radius:12px;background:${colors.background};color:${colors.text};font-size:13px;line-height:1.65"><strong style="display:block;margin-bottom:2px">Security notice / 安全提示</strong>${notice}</td></tr></table>` : ""}
              ${input.action && actionUrl ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px"><tr><td style="border-radius:10px;background:#6366f1"><a href="${escapeEmailHtml(actionUrl)}" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">${escapeEmailHtml(input.action.label)}</a></td></tr></table>` : ""}
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:22px 28px 0;color:#64748b;font-size:12px;line-height:1.7">
          <div style="margin-bottom:4px;color:#475569;font-weight:600">${brandName} · game3dtech.com</div>
          <div>${footerNote}</div>
          <div style="margin-top:8px;color:#94a3b8">© ${new Date().getUTCFullYear()} ${brandName}</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderVerificationCodeBlock(code: string) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:24px 16px;border:1px solid #c7d2fe;border-radius:14px;background:#f5f7ff"><div style="margin-bottom:8px;color:#64748b;font-size:11px;font-weight:700;letter-spacing:1.2px">VERIFICATION CODE / 验证码</div><div class="code-value" style="color:#4338ca;font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:36px;line-height:1.25;font-weight:800;letter-spacing:9px">${escapeEmailHtml(code)}</div><div style="margin-top:10px;color:#64748b;font-size:12px;line-height:1.5">Valid for 10 minutes · 10 分钟内有效</div></td></tr></table>`;
}
