import { describe, expect, it } from "vitest";
import { createTotp, generateRecoveryCodes, verifyTotp } from "@/lib/security/totp";

describe("TOTP", () => {
  it("matches the RFC 6238 SHA-1 test vector with six digits", async () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(await createTotp(secret, 59_000)).toBe("287082");
  });

  it("accepts either adjacent 30-second window for small clock drift", async () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const currentTimestamp = 90_000;
    expect(await verifyTotp(secret, await createTotp(secret, 60_000), currentTimestamp)).toBe(true);
    expect(await verifyTotp(secret, await createTotp(secret, 120_000), currentTimestamp)).toBe(true);
    expect(await verifyTotp(secret, await createTotp(secret, 30_000), currentTimestamp)).toBe(false);
    expect(await verifyTotp(secret, "000000", currentTimestamp)).toBe(false);
  });

  it("creates ten unique, human-readable recovery codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code))).toBe(true);
  });
});
