import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export function countPasswordCharacterClasses(password: string) {
  return [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
}

export const strongPasswordSchema = z.string()
  .min(PASSWORD_MIN_LENGTH, `密码至少 ${PASSWORD_MIN_LENGTH} 个字符`)
  .max(PASSWORD_MAX_LENGTH, `密码不能超过 ${PASSWORD_MAX_LENGTH} 个字符`)
  .refine((password) => countPasswordCharacterClasses(password) >= 3, {
    message: "密码需包含大写字母、小写字母、数字、特殊字符中的至少 3 类",
  });

function normalizeIdentityPart(value: string) {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export function passwordContainsIdentity(password: string, input: { email: string; name: string }) {
  const normalizedPassword = normalizeIdentityPart(password);
  const emailLocal = normalizeIdentityPart(input.email.split("@")[0] || "");
  const name = normalizeIdentityPart(input.name);
  return (emailLocal.length >= 3 && normalizedPassword.includes(emailLocal)) ||
    (name.length >= 2 && normalizedPassword.includes(name));
}
