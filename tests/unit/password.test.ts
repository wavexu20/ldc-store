import { describe, expect, it } from "vitest";
import {
  countPasswordCharacterClasses,
  passwordContainsIdentity,
  strongPasswordSchema,
} from "@/lib/validations/password";

describe("registration password policy", () => {
  it("accepts a sufficiently long password with three character classes", () => {
    expect(strongPasswordSchema.safeParse("OceanWave2026").success).toBe(true);
  });

  it("rejects short or low-diversity passwords", () => {
    expect(strongPasswordSchema.safeParse("Abc123!").success).toBe(false);
    expect(strongPasswordSchema.safeParse("onlylowercasepassword").success).toBe(false);
  });

  it("counts character classes", () => {
    expect(countPasswordCharacterClasses("Abc123!")).toBe(4);
  });

  it("rejects passwords containing email local-part or nickname", () => {
    expect(passwordContainsIdentity("Hustwave!2026", {
      email: "hustwave@example.com",
      name: "Alex",
    })).toBe(true);
    expect(passwordContainsIdentity("Alex#Secure2026", {
      email: "someone@example.com",
      name: "Alex",
    })).toBe(true);
  });
});
