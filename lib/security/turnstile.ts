const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileResponse = {
  success: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

export async function verifyTurnstileToken(input: {
  token: string;
  remoteIp?: string;
  expectedAction: string;
}) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { success: false as const, message: "Turnstile 服务端密钥未配置" };
  if (!input.token || input.token.length > 2048) {
    return { success: false as const, message: "请完成人机验证" };
  }

  const body = new URLSearchParams({
    secret,
    response: input.token,
    idempotency_key: crypto.randomUUID(),
  });
  if (input.remoteIp) body.set("remoteip", input.remoteIp);

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) return { success: false as const, message: "人机验证服务暂时不可用" };
    const result = await response.json() as TurnstileResponse;
    if (!result.success || result.action !== input.expectedAction) {
      return {
        success: false as const,
        message: result["error-codes"]?.includes("timeout-or-duplicate")
          ? "人机验证已过期，请重试"
          : "人机验证失败，请重试",
      };
    }
    return { success: true as const };
  } catch (error) {
    console.error("Turnstile Siteverify 请求失败", error);
    return { success: false as const, message: "人机验证服务暂时不可用" };
  }
}
