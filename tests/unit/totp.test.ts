import { describe, expect, it } from "vitest";
import { createTotp, generateRecoveryCodes, verifyTotp } from "@/lib/security/totp";

describe("TOTP", () => {
  it("matches the RFC 6238 SHA-1 test vector with six digits", async () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(await createTotp(secret, 59_000)).toBe("287082");
  });

  it("accepts an adjacent 30-second window for small clock drift", async () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const originalNow = Date.now;
    Date.now = () => 90_000;
    try {
      expect(await verifyTotp(secret, await createTotp(secret, 60_000))).toBe(true);
      expect(await verifyTotp(secret, "000000")).toBe(false);
    } finally {
      Date.now = originalNow;
    }
  });

  it("creates ten unique, human-readable recovery codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes.every((code) => /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code))).toBe(true);
  });
});
